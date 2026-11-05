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
}

export interface CompletionResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
}

export class ProviderError extends Error {
  constructor(public code: string, message?: string) {
    super(message ?? code);
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
    if (res.status === 429) throw new ProviderError('provider_rate_limited');
    if (res.status === 401 || res.status === 403) throw new ProviderError('provider_auth_failed');
    if (!res.ok) throw new ProviderError('provider_http_' + res.status);
    return await res.json();
  } catch (e) {
    if (e instanceof ProviderError) throw e;
    if (e instanceof DOMException && e.name === 'AbortError') throw new ProviderError('provider_timeout');
    throw new ProviderError('provider_network_error');
  } finally {
    clearTimeout(timer);
  }
}

async function gemini(cfg: ProviderConfig, req: CompletionRequest): Promise<Omit<CompletionResult, 'latencyMs'>> {
  const key = apiKey(cfg);
  if (!key) throw new ProviderError('provider_not_configured');
  const base = (cfg.base_url ?? 'https://generativelanguage.googleapis.com/v1beta').replace(/\/$/, '');
  const data = (await postJson(
    `${base}/models/${encodeURIComponent(cfg.model)}:generateContent`,
    { 'x-goog-api-key': key },
    {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
      generationConfig: {
        temperature: 0.4,
        maxOutputTokens: req.maxOutputTokens,
        ...(req.json ? { responseMimeType: 'application/json' } : {}),
      },
    },
    cfg.timeout_ms,
  )) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  };
  const cand = data.candidates?.[0];
  if (cand?.finishReason === 'SAFETY') throw new ProviderError('provider_blocked');
  const text = cand?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  if (!text) throw new ProviderError('provider_empty_response');
  return { text, inputTokens: data.usageMetadata?.promptTokenCount ?? 0, outputTokens: data.usageMetadata?.candidatesTokenCount ?? 0 };
}

async function openaiCompatible(cfg: ProviderConfig, req: CompletionRequest): Promise<Omit<CompletionResult, 'latencyMs'>> {
  const key = apiKey(cfg);
  if (!key) throw new ProviderError('provider_not_configured');
  if (!cfg.base_url) throw new ProviderError('provider_not_configured');
  const data = (await postJson(
    `${cfg.base_url.replace(/\/$/, '')}/chat/completions`,
    { Authorization: `Bearer ${key}` },
    {
      model: cfg.model,
      temperature: 0.4,
      max_tokens: req.maxOutputTokens,
      messages: [{ role: 'system', content: req.system }, ...req.messages],
      ...(req.json ? { response_format: { type: 'json_object' } } : {}),
    },
    cfg.timeout_ms,
  )) as { choices?: { message?: { content?: string } }[]; usage?: { prompt_tokens?: number; completion_tokens?: number } };
  const text = data.choices?.[0]?.message?.content ?? '';
  if (!text) throw new ProviderError('provider_empty_response');
  return { text, inputTokens: data.usage?.prompt_tokens ?? 0, outputTokens: data.usage?.completion_tokens ?? 0 };
}

async function ollama(cfg: ProviderConfig, req: CompletionRequest): Promise<Omit<CompletionResult, 'latencyMs'>> {
  if (!cfg.base_url) throw new ProviderError('provider_not_configured');
  const key = apiKey(cfg);
  const data = (await postJson(
    `${cfg.base_url.replace(/\/$/, '')}/api/chat`,
    key ? { Authorization: `Bearer ${key}` } : {},
    {
      model: cfg.model,
      stream: false,
      ...(req.json ? { format: 'json' } : {}),
      options: { temperature: 0.4, num_predict: req.maxOutputTokens },
      messages: [{ role: 'system', content: req.system }, ...req.messages],
    },
    cfg.timeout_ms,
  )) as { message?: { content?: string }; prompt_eval_count?: number; eval_count?: number };
  const text = data.message?.content ?? '';
  if (!text) throw new ProviderError('provider_empty_response');
  return { text, inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 };
}

export async function complete(cfg: ProviderConfig, req: CompletionRequest): Promise<CompletionResult> {
  const started = Date.now();
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
