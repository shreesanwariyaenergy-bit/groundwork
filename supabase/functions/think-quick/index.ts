/**
 * Quick Validate — anonymous, 5-section preliminary report for the public site.
 *   POST { idea, customer?, alternatives?, stage? }  →  { token, report, expires_at, mode }
 *
 * Deployed with verify_jwt = false (visitors are not signed in). Safeguards:
 *  - Feature flag `pillar.think.quick_validate` (off = 503).
 *  - Per-client (hashed IP) and global daily caps via check_anon_rate_limit().
 *  - Anonymous traffic may ONLY use enabled, FREE providers (never paid, even if approved).
 *  - Any AI failure falls back to the clearly labelled guided (non-AI) report.
 *  - The report is stored in think_quick_reports (no API access); only a SHA-256 hash of the
 *    one-time claim token is stored. Unclaimed reports expire after 7 days.
 *  - Usage is logged without prompt or completion text.
 */
import { admin } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/http.ts';
import { approxTokens, complete, ProviderError, type ProviderConfig } from '../_shared/ai.ts';
import { buildQuickGuidedReport, buildQuickPrompt, extractJson, normalizeReport, sanitizeQuickInputs, type ThinkReport } from '../_shared/think.ts';

const SALT = Deno.env.get('QUICK_VALIDATE_SALT') ?? Deno.env.get('SUPABASE_URL') ?? 'groundwork';
const AI_TIMEOUT_MS = 40_000;

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function newToken(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(32));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function clientIp(req: Request): string {
  return (req.headers.get('x-forwarded-for') ?? '').split(',')[0]!.trim()
    || req.headers.get('cf-connecting-ip') || req.headers.get('x-real-ip') || 'unknown';
}

/** Free, enabled providers with headroom under their own per-minute and per-day caps. */
async function freeProviders(): Promise<ProviderConfig[]> {
  const { data: flag } = await admin.from('feature_flags').select('enabled').eq('key', 'think.ai_enabled').maybeSingle();
  if (!flag?.enabled) return [];
  const { data } = await admin.from('ai_provider_configs').select('*').eq('is_enabled', true).eq('is_paid', false).order('priority');
  const out: ProviderConfig[] = [];
  const dayStart = new Date(); dayStart.setUTCHours(0, 0, 0, 0);
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  for (const cfg of (data ?? []) as ProviderConfig[]) {
    const [{ count: perMin }, { count: perDay }] = await Promise.all([
      admin.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('provider_config_id', cfg.id).gte('created_at', minuteAgo),
      admin.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('provider_config_id', cfg.id)
        .gte('created_at', dayStart.toISOString()).in('status', ['success', 'error']),
    ]);
    if ((perMin ?? 0) < cfg.requests_per_minute && (perDay ?? 0) < cfg.daily_request_limit) out.push(cfg);
  }
  return out;
}

async function log(status: string, cfg: ProviderConfig | null, extra: { input_tokens?: number; output_tokens?: number; latency_ms?: number; error_code?: string } = {}) {
  await admin.from('ai_usage_logs').insert({
    user_id: null, provider_config_id: cfg?.id ?? null, provider: cfg?.provider ?? null, model: cfg?.model ?? null,
    feature: 'think_quick', status, input_tokens: extra.input_tokens ?? 0, output_tokens: extra.output_tokens ?? 0,
    estimated_cost_usd: 0, latency_ms: extra.latency_ms ?? null, error_code: extra.error_code ?? null,
  });
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  let body: unknown;
  try { body = await req.json(); } catch { return json(req, 400, { error: 'invalid_body' }); }
  const parsed = sanitizeQuickInputs(body);
  if (!parsed.ok) return json(req, 400, { error: parsed.error });
  const inputs = parsed.inputs;

  const { data: flag } = await admin.from('feature_flags').select('enabled, value').eq('key', 'pillar.think.quick_validate').maybeSingle();
  if (!flag?.enabled) return json(req, 503, { error: 'quick_unavailable' });
  const limits = { per_client_per_day: 3, global_per_day: 200, ...((flag.value ?? {}) as Record<string, number>) };

  const clientHash = await sha256Hex(`${SALT}:${clientIp(req)}`);
  const { data: rl, error: rlErr } = await admin.rpc('check_anon_rate_limit', {
    p_key_hash: clientHash, p_action: 'quick_validate',
    p_per_key: limits.per_client_per_day, p_global: limits.global_per_day, p_window: '1 day',
  });
  if (rlErr) return json(req, 503, { error: 'quick_unavailable' });
  if (rl === 'client_limit') return json(req, 429, { error: 'quick_limit' });
  if (rl === 'global_limit') return json(req, 429, { error: 'quick_busy' });

  // AI first (free providers only), otherwise the guided non-AI report.
  let report: ThinkReport | null = null;
  let used: ProviderConfig | null = null;
  const providers = await freeProviders();
  if (providers.length) {
    const prompt = buildQuickPrompt(inputs);
    for (const cfg of providers.slice(0, 2)) {
      try {
        const res = await complete({ ...cfg, timeout_ms: Math.min(cfg.timeout_ms, AI_TIMEOUT_MS) },
          { system: prompt.system, messages: [{ role: 'user', content: prompt.user }], json: true, maxOutputTokens: 2048 });
        const raw = extractJson(res.text) as { sections?: unknown[] };
        if (!Array.isArray(raw.sections) || raw.sections.length < 3) throw new SyntaxError('incomplete_report');
        report = normalizeReport(raw, { generatedBy: 'ai', kind: 'quick' });
        used = cfg;
        await log('success', cfg, {
          input_tokens: res.inputTokens || approxTokens(prompt.system + prompt.user),
          output_tokens: res.outputTokens || approxTokens(res.text), latency_ms: res.latencyMs,
        });
        break;
      } catch (e) {
        const code = e instanceof ProviderError ? e.code : 'provider_bad_output';
        await log(code === 'provider_rate_limited' ? 'rate_limited' : 'error', cfg, { error_code: code });
      }
    }
  }
  if (!report) {
    report = buildQuickGuidedReport(inputs);
    await log('success', null, { error_code: providers.length ? 'fallback_guided' : 'guided' });
  }

  const token = newToken();
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { error: insErr } = await admin.from('think_quick_reports').insert({
    claim_token_hash: await sha256Hex(token), inputs, report, mode: used ? 'ai' : 'checklist',
    provider: used?.provider ?? null, model: used?.model ?? null, client_hash: clientHash, expires_at: expires,
  });
  if (insErr) {
    console.error(JSON.stringify({ fn: 'think-quick', code: 'store_failed' }));
    // Still return the report; it just cannot be saved to an account later.
    return json(req, 200, { token: null, report, expires_at: null, mode: used ? 'ai' : 'checklist' });
  }
  return json(req, 200, { token, report, expires_at: expires, mode: used ? 'ai' : 'checklist' });
});
