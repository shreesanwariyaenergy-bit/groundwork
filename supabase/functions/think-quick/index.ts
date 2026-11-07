/**
 * Quick Validate — anonymous, FREE 7-parameter assessment for the public site.
 * (Earlier versions returned a 5-section quick report; those stored reports still render.)
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
import { approxTokens, complete, ProviderError } from '../_shared/ai.ts';
import { extractJson, sanitizeQuickInputs, type ThinkReport } from '../_shared/think.ts';
import { ASSESSMENT_PARAMETERS, buildAssessmentPrompt, buildGuidedAssessment, normalizeAssessment } from '../_shared/assessment.ts';
import { diag, logUsage, providersFor, type ProviderChoice } from '../_shared/thinkcore.ts';

const SALT = Deno.env.get('QUICK_VALIDATE_SALT') ?? Deno.env.get('SUPABASE_URL') ?? 'groundwork';
const AI_TIMEOUT_MS = 90_000;

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

  // AI first (FREE providers only for anonymous traffic), otherwise the guided non-AI assessment.
  let report: ThinkReport | null = null;
  let used: ProviderChoice | null = null;
  const providers = await providersFor('assessment', { freeOnly: true });
  if (providers.length) {
    const prompt = buildAssessmentPrompt(inputs);
    for (const choice of providers.slice(0, 2)) {
      try {
        const res = await complete({ ...choice.cfg, timeout_ms: Math.max(choice.cfg.timeout_ms, AI_TIMEOUT_MS) },
          { system: prompt.system, messages: [{ role: 'user', content: prompt.user }], json: true, maxOutputTokens: 8192, model: choice.model, reasoning: 'medium' });
        const raw = extractJson(res.text) as { parameters?: unknown[] };
        if (!Array.isArray(raw.parameters) || raw.parameters.length < ASSESSMENT_PARAMETERS.length - 1) throw new SyntaxError('incomplete_assessment');
        report = normalizeAssessment(raw, { generatedBy: 'ai' });
        used = { ...choice, model: res.model };
        await logUsage({
          user_id: null, feature: 'think_quick', status: 'success', choice: used, latency_ms: res.latencyMs,
          input_tokens: res.inputTokens || approxTokens(prompt.system + prompt.user), output_tokens: res.outputTokens || approxTokens(res.text),
        });
        break;
      } catch (e) {
        const code = e instanceof ProviderError ? e.code : 'provider_bad_output';
        const detail = e instanceof ProviderError ? e.detail : undefined;
        await logUsage({ user_id: null, feature: 'think_quick', status: code === 'provider_rate_limited' ? 'rate_limited' : 'error', choice, error_code: detail ? `${code}: ${detail}` : code });
        diag('think-quick', { provider: choice.cfg.key, model: choice.model, code });
      }
    }
  }
  if (!report) {
    report = buildGuidedAssessment(inputs);
    if (!providers.length) await logUsage({ user_id: null, feature: 'think_quick', status: 'disabled', error_code: 'guided' });
  }

  const token = newToken();
  const expires = new Date(Date.now() + 7 * 24 * 3600 * 1000).toISOString();
  const { error: insErr } = await admin.from('think_quick_reports').insert({
    claim_token_hash: await sha256Hex(token), inputs, report, mode: used ? 'ai' : 'checklist',
    provider: used?.cfg.provider ?? null, model: used?.model ?? null, client_hash: clientHash, expires_at: expires,
  });
  if (insErr) {
    console.error(JSON.stringify({ fn: 'think-quick', code: 'store_failed' }));
    // Still return the report; it just cannot be saved to an account later.
    return json(req, 200, { token: null, report, expires_at: null, mode: used ? 'ai' : 'checklist' });
  }
  return json(req, 200, { token, report, expires_at: expires, mode: used ? 'ai' : 'checklist' });
});
