/**
 * Server-side helpers shared by the Think functions (assessment, quick validate, deep analysis).
 *
 * Cost-control guarantees enforced here:
 *  - AI only runs when `think.ai_enabled` is on and a provider row is enabled.
 *  - Paid providers are eligible only when explicitly approved with a budget that is not exhausted,
 *    and never for anonymous traffic (`freeOnly`).
 *  - NO automatic fallback to a paid provider: if the first eligible provider is free, only free
 *    providers may follow it.
 *  - Usage is logged per feature with token counts and estimated cost — never prompt or output text.
 */
import { admin } from './clients.ts';
import { estimateCost, type ProviderConfig } from './ai.ts';

export type UsageFeature =
  | 'think_quick' | 'think_assessment' | 'think_assessment_regen' | 'think_deep' | 'think_research';
export type ModelFeature = 'assessment' | 'deep' | 'research';

export interface ProviderChoice { cfg: ProviderConfig; model: string }

function startOfDayUtc(): string { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d.toISOString(); }
function startOfMonthUtc(): string { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString(); }

export async function flag<T = Record<string, unknown>>(key: string): Promise<{ enabled: boolean; value: T } | null> {
  const { data } = await admin.from('feature_flags').select('enabled, value').eq('key', key).maybeSingle();
  return data ? { enabled: Boolean(data.enabled), value: (data.value ?? {}) as T } : null;
}

/** Eligible providers for a feature, in priority order, with the per-feature model override applied. */
export async function providersFor(feature: ModelFeature, opts: { freeOnly: boolean }): Promise<ProviderChoice[]> {
  const master = await flag('think.ai_enabled');
  if (!master?.enabled) return [];
  const models = (await flag<Record<string, string | null>>('think.models'))?.value ?? {};
  const override = typeof models[feature] === 'string' && /^[a-z0-9._-]{2,80}$/i.test(models[feature]!) ? models[feature]! : null;

  const { data } = await admin.from('ai_provider_configs').select('*').eq('is_enabled', true).order('priority');
  const out: ProviderChoice[] = [];
  const minuteAgo = new Date(Date.now() - 60_000).toISOString();
  for (const cfg of (data ?? []) as ProviderConfig[]) {
    if (cfg.is_paid) {
      if (opts.freeOnly || !cfg.paid_approved || Number(cfg.monthly_budget_usd) <= 0) continue;
      const { data: spend } = await admin.from('ai_usage_logs').select('estimated_cost_usd')
        .eq('provider_config_id', cfg.id).gte('created_at', startOfMonthUtc()).limit(100000);
      const total = (spend ?? []).reduce((s, r) => s + Number((r as { estimated_cost_usd: number }).estimated_cost_usd), 0);
      if (total >= Number(cfg.monthly_budget_usd)) continue;
    }
    const [{ count: perMin }, { count: perDay }] = await Promise.all([
      admin.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('provider_config_id', cfg.id).gte('created_at', minuteAgo),
      admin.from('ai_usage_logs').select('id', { count: 'exact', head: true }).eq('provider_config_id', cfg.id)
        .gte('created_at', startOfDayUtc()).in('status', ['success', 'error']),
    ]);
    if ((perMin ?? 0) >= cfg.requests_per_minute || (perDay ?? 0) >= cfg.daily_request_limit) continue;
    out.push({ cfg, model: cfg.provider === 'gemini' && override ? override : cfg.model });
  }
  // No automatic paid fallback: after a free provider, only free providers may be tried.
  if (out[0] && !out[0].cfg.is_paid) return out.filter((c) => !c.cfg.is_paid);
  return out.slice(0, 1);
}

export async function logUsage(row: {
  user_id: string | null; feature: UsageFeature; status: 'success' | 'error' | 'quota_blocked' | 'rate_limited' | 'disabled';
  choice?: ProviderChoice | null; input_tokens?: number; output_tokens?: number; latency_ms?: number; error_code?: string;
}) {
  const cfg = row.choice?.cfg ?? null;
  const cost = cfg ? estimateCost(cfg, row.input_tokens ?? 0, row.output_tokens ?? 0) : 0;
  await admin.from('ai_usage_logs').insert({
    user_id: row.user_id, provider_config_id: cfg?.id ?? null, provider: cfg?.provider ?? null, model: row.choice?.model ?? null,
    feature: row.feature, status: row.status, input_tokens: row.input_tokens ?? 0, output_tokens: row.output_tokens ?? 0,
    estimated_cost_usd: cost, latency_ms: row.latency_ms ?? null, error_code: row.error_code ? row.error_code.slice(0, 120) : null,
  });
}

export async function countUsage(filter: { user_id?: string; features: UsageFeature[]; since?: string; statuses?: string[] }): Promise<number> {
  let q = admin.from('ai_usage_logs').select('id', { count: 'exact', head: true })
    .in('feature', filter.features).gte('created_at', filter.since ?? startOfDayUtc());
  if (filter.user_id) q = q.eq('user_id', filter.user_id);
  if (filter.statuses) q = q.in('status', filter.statuses);
  const { count } = await q;
  return count ?? 0;
}

export { startOfDayUtc };

/** Structured, content-free log line for diagnosis (no prompts, outputs, keys or personal data). */
export function diag(fn: string, fields: Record<string, string | number | boolean | null | undefined>) {
  console.log(JSON.stringify({ fn, ...fields }));
}
