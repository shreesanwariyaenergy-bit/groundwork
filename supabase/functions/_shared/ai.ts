/**
 * Provider-agnostic AI layer.
 *
 * Adding a provider = adding an adapter here + a row in ai_provider_configs.
 * Keys come from Edge Function secrets named by `api_key_env`; they are never
 * stored in the database or sent to clients.
 */

export interface ProviderConfig {
  id: string;
  key: string;
  provider: 'gemini' | 'openai_compatible' | 'ollama';
  label: string;
  model: string;
  base_url: string | null;
  api_key_env: string | null;
  is_paid: boolean;
  paid_approved: boolean;
  timeout_ms: number;
  max_output_tokens: number;
  max_input_chars: number;
  requests_per_minute: number;
  daily_request_limit: number;
  cost_per_1m_input_usd: number;
  cost_per_1m_output_usd: number;
  monthly_budget_usd: number;
}

export interface ChatMessage { role: 'user' | 'assistant'; content: string }

export interface CompletionRequest {
  system: string;
  messages: ChatMessage[];
  json: boolean;
  maxOutputTokens: number;
  /** Override the provider's default model for this call (per-feature model config). */
  model?: string;
  /** Ground the answer with Google Search (Gemini only). Returns sources in `grounding`. */
  search?: boolean;
  /** Reasoning effort for models that support it (Gemini 3 family). */
  reasoning?: 'low' | 'medium' | 'high';
}

export interface GroundingInfo {
  chunks: { web?: { uri?: string; title?: string } }[];
  supports: { segment?: { text?: string; startIndex?: number; endIndex?: number }; groundingChunkIndices?: number[] }[];
  queries: string[];
  searchEntryPointHtml: string | null;
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  /** Includes reasoning ("thinking") tokens, which are billed as output. */
  outputTokens: number;
  latencyMs: number;
  /** Model that actually served the request. */
  model: string;
  grounding?: GroundingInfo;
}

export class ProviderError extends Error {
  /** Short provider diagnostic (status + message, never prompt content), e.g. a quota description. */
  constructor(public code: string, public detail?: string) {
    super(code);
  }
}

function apiKey(cfg: ProviderConfig): string | null {
  if (!cfg.api_key_env) return null;
  return Deno.env.get(cfg.api_key_env) ?? null;
}

async function postJson(url: string, headers: Record<string, string>, body: unknown, timeoutMs: number): Promise<unknown> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
    if (!res.ok) {
      // Provider error bodies describe the failure (status, quota metric, model not found); they never echo the key.
      let detail = '';
      try {
        const b = (await res.json()) as { error?: { status?: string; message?: string } };
        detail = `${b.error?.status ?? ''} ${b.error?.message ?? ''}`.trim().slice(0, 300);
      } catch { /* non-JSON body */ }
      if (res.status === 429) throw new ProviderError('provider_rate_limited', detail);
      if (res.status === 401 || res.status === 403) throw new ProviderError('provider_auth_failed', detail);
      throw new ProviderError('provider_http_' + res.status, detail);
    }
    return await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new ProviderError('provider_timeout');
    throw new ProviderError('provider_network_error');
  } finally {
    clearTimeout(timer);
  }
}

type GeminiResponse = {
  candidates?: {
    content?: { parts?: { text?: string; thought?: boolean }[] };
    finishReason?: string;
    groundingMetadata?: {
      webSearchQueries?: string[];
      groundingChunks?: GroundingInfo['chunks'];
      groundingSupports?: GroundingInfo['supports'];
      searchEntryPoint?: { renderedContent?: string };
    };
  }[];
  usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; thoughtsTokenCount?: number; toolUsePromptTokenCount?: number };
};

/** Back-off before retrying a temporarily overloaded model (tests may shorten via env). */
function retryDelays(): number[] {
  return (Deno.env.get('AI_RETRY_DELAYS_MS') ?? '3000,8000').split(',').map(Number).filter((n) => Number.isFinite(n) && n >= 0);
}

/** Gemini 3+ models: keep the default temperature (Google recommends 1.0) and use thinking levels. */
export function isGemini3Plus(model: string): boolean {
  return /^gemini-([3-9]|\d{2,})/.test(model);
}

async function gemini(cfg: ProviderConfig, req: CompletionRequest): Promise<Omit<CompletionResult, 'latencyMs'>> {
  const key = apiKey(cfg);
  if (!key) throw new ProviderError('provider_not_configured');
  const model = req.model || cfg.model;
  const base = (cfg.base_url ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const modern = isGemini3Plus(model);
  const body = (withThinking: boolean) => ({
    systemInstruction: { parts: [{ text: req.system }] },
    contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
    ...(req.search ? { tools: [{ google_search: {} }] } : {}),
    generationConfig: {
      ...(modern ? {} : { temperature: 0.4 }),
      maxOutputTokens: req.maxOutputTokens,
      // JSON mode is not combined with search grounding (grounding metadata can come back empty).
      ...(req.json && !req.search ? { responseMimeType: 'application/json' } : {}),
      ...(withThinking && modern && req.reasoning ? { thinkingConfig: { thinkingLevel: req.reasoning } } : {}),
    },
  });
  const url = `${base}/models/${encodeURIComponent(model)}:generateContent`;
  // Temporary overload (503/500) is retried on the SAME model only — never another or a paid provider.
  const post = async (b: unknown): Promise<GeminiResponse> => {
    const started = Date.now();
    for (let attempt = 0; ; attempt++) {
      try {
        return (await postJson(url, { 'x-goog-api-key': key }, b, cfg.timeout_ms - (Date.now() - started))) as GeminiResponse;
      } catch (e) {
        const transient = e instanceof ProviderError && (e.code === 'provider_http_503' || e.code === 'provider_http_500');
        const wait = retryDelays()[attempt];
        if (!transient || wait === undefined || Date.now() - started + wait > cfg.timeout_ms * 0.6) throw e;
        await new Promise((r) => setTimeout(r, wait));
      }
    }
  };
  let data: GeminiResponse;
  try {
    data = await post(body(true));
  } catch (e) {
    // If the model rejects the reasoning setting, retry once without it (same model — never a different/paid one).
    if (e instanceof ProviderError && e.code === 'provider_http_400' && modern && req.reasoning && /thinking/i.test(e.detail ?? '')) {
      data = await post(body(false));
    } else throw e;
  }
  const cand = data.candidates?.[0];
  if (cand?.finishReason === 'SAFETY' || cand?.finishReason === 'PROHIBITED_CONTENT') throw new ProviderError('provider_blocked');
  if (cand?.finishReason === 'MAX_TOKENS') throw new ProviderError('provider_truncated');
  const text = cand?.content?.parts?.filter((p) => !p.thought).map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new ProviderError('provider_empty_response', cand?.finishReason);
  const u = data.usageMetadata ?? {};
  const gm = cand?.groundingMetadata;
  return {
    text,
    model,
    inputTokens: (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0),
    outputTokens: (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0),
    ...(req.search ? {
      grounding: {
        chunks: gm?.groundingChunks ?? [],
        supports: gm?.groundingSupports ?? [],
        queries: gm?.webSearchQueries ?? [],
        searchEntryPointHtml: gm?.searchEntryPoint?.renderedContent ?? null,
      },
    } : {}),
  };
}

async function openaiCompatible(cfg: ProviderConfig, req: CompletionRequest): Promise<Omit<CompletionResult, 'latencyMs'>> {
  const key = apiKey(cfg);
  if (!key) throw new ProviderError('provider_not_configured');
  if (!cfg.base_url) throw new ProviderError('provider_not_configured');
  const data = (await postJson(
    `${cfg.base_url.replace(/\/$/, '')}/chat/completions`,
    { Authorization: `Bearer ${key}` },
    {
      model: req.model || cfg.model,
      temperature: 0.4,
      max_tokens: req.maxOutputTokens,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    },
    cfg.timeout_ms,
  )) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new ProviderError('provider_empty_response');
  return { text, model: req.model || cfg.model, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
}

async function ollama(cfg: ProviderConfig, req: CompletionRequest): Promise<Omit<CompletionResult, 'latencyMs'>> {
  if (!cfg.base_url) throw new ProviderError('provider_not_configured');
  const key = apiKey(cfg);
  const data = (await postJson(
    `${cfg.base_url.replace(/\/$/, '')}/api/chat`,
    key ? { Authorization: `Bearer ${key}` } : {},
    {
      model: req.model || cfg.model,
      stream: false,
      ...(req.json ? { format: 'json' } : {}),
      options: { temperature: 0.4, num_predict: req.maxOutputTokens },
      messages: [{ role: 'system', content: req.system }, ...req.messages],
    },
    cfg.timeout_ms,
  )) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
  const text = data.message?.content ?? '';
  if (!text) throw new ProviderError('provider_empty_response');
  return { text, model: req.model || cfg.model, inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 };
}

export async function complete(cfg: ProviderConfig, req: CompletionRequest): Promise<CompletionResult> {
  const started = Date.now();
  // Search grounding is a Gemini feature; other providers never silently "research".
  if (req.search && cfg.provider !== 'gemini') throw new ProviderError('provider_no_search');
  const adapter = cfg.provider === 'gemini' ? gemini : cfg.provider === 'openai_compatible' ? openaiCompatible : ollama;
  const res = await adapter(cfg, { ...req, maxOutputTokens: Math.min(req.maxOutputTokens, cfg.max_output_tokens) });
  return { ...res, latencyMs: Date.now() - started };
}

export function estimateCost(cfg: ProviderConfig, inputTokens: number, outputTokens: number): number {
  return (inputTokens * Number(cfg.cost_per_1m_input_usd) + outputTokens * Number(cfg.cost_per_1m_output_usd)) / 1_000_000;
}

/** Rough token estimate when a provider does not report usage. */
export function approxTokens(text: string): number {
  return Math.ceil(text.length / 4);
}
