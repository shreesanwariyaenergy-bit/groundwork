/**
 * Think edge function.
 *   POST { action: 'analyze' | 'followup' | 'checklist' | 'assess', project_id, question? }
 *   'assess' = free 7-parameter assessment (see ./assess.ts).
 *
 * Cost-control guarantees (see docs/AI_COSTS.md):
 *  - Master switch `think.ai_enabled` must be on; providers ship disabled.
 *  - Paid providers are only eligible when an admin set paid_approved AND a
 *    monthly budget, and this month's estimated spend is under that budget.
 *  - Per-user daily quotas, a global daily cap, and per-provider RPM/daily caps.
 *  - Fallback only moves between ELIGIBLE providers (never silently to paid).
 *  - When AI is unavailable, the client is told so and may explicitly request
 *    the non-AI checklist (`action: 'checklist'`).
 *  - Prompts and completions are never written to ai_usage_logs.
 */
import { admin, requireUser } from '../_shared/clients.ts';
import { runAssessment } from './assess.ts';
import { json, preflight } from '../_shared/http.ts';
import { approxTokens, complete, estimateCost, ProviderError, type ProviderConfig } from '../_shared/ai.ts';
import {
  buildAnalysisPrompt, buildChecklistReport, buildFollowupPrompt, extractJson, normalizeReport,
  THINK_LIMITS, type ThinkContext, type ThinkReport,
} from '../_shared/think.ts';

type Feature = 'think_analysis' | 'think_followup' | 'think_checklist';
const TOTAL_BUDGET_MS = 110_000;

interface Limits { analyses_per_day: number; followups_per_day: number; global_requests_per_day: number; allow_free_fallback: boolean }

async function logUsage(row: {
  user_id: string; feature: Feature; status: string; provider?: ProviderConfig | null;
  input_tokens?: number; output_tokens?: number; cost?: number; latency_ms?: number; error_code?: string;
}) {
  await admin.from('ai_usage_logs').insert({
    user_id: row.user_id,
    provider_config_id: row.provider?.id ?? null,
    provider: row.provider?.provider ?? null,
    model: row.provider?.model ?? null,
    feature: row.feature,
    status: row.status,
    input_tokens: row.input_tokens ?? 0,
    output_tokens: row.output_tokens ?? 0,
    estimated_cost_usd: row.cost ?? 0,
    latency_ms: row.latency_ms ?? null,
    error_code: row.error_code ?? null,
  });
}

function startOfDayUtc(): string {
  const d = new Date();
  d.setUTCHours(0, 0, 0, 0);
  return d.toISOString();
}
function startOfMonthUtc(): string {
  const d = new Date();
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)).toISOString();
}

async function countUsage(filter: { user_id?: string; feature?: Feature; provider_config_id?: string; since: string; statuses?: string[] }) {
  let q = admin.from('ai_usage_logs').select('id', { count: 'exact', head: true }).gte('created_at', filter.since);
  if (filter.user_id) q = q.eq('user_id', filter.user_id);
  if (filter.feature) q = q.eq('feature', filter.feature);
  if (filter.provider_config_id) q = q.eq('provider_config_id', filter.provider_config_id);
  if (filter.statuses) q = q.in('status', filter.statuses);
  const { count } = await q;
  return count ?? 0;
}

/** Providers that may be used right now, in priority order. */
async function eligibleProviders(): Promise<ProviderConfig[]> {
  const { data } = await admin.from('ai_provider_configs').select('*').eq('is_enabled', true).order('priority');
  const out: ProviderConfig[] = [];
  for (const cfg of (data ?? []) as ProviderConfig[]) {
    if (cfg.is_paid) {
      if (!cfg.paid_approved || Number(cfg.monthly_budget_usd) <= 0) continue;
      const { data: spend } = await admin.from('ai_usage_logs').select('estimated_cost_usd')
        .eq('provider_config_id', cfg.id).gte('created_at', startOfMonthUtc()).limit(100000);
      const total = (spend ?? []).reduce((s, r) => s + Number((r as { estimated_cost_usd: number }).estimated_cost_usd), 0);
      if (total >= Number(cfg.monthly_budget_usd)) continue;
    }
    const minuteAgo = new Date(Date.now() - 60_000).toISOString();
    if (await countUsage({ provider_config_id: cfg.id, since: minuteAgo }) >= cfg.requests_per_minute) continue;
    if (await countUsage({ provider_config_id: cfg.id, since: startOfDayUtc(), statuses: ['success', 'error'] }) >= cfg.daily_request_limit) continue;
    out.push(cfg);
  }
  return out;
}

async function runWithProviders(
  providers: ProviderConfig[], allowFallback: boolean, userId: string, feature: Feature,
  build: (cfg: ProviderConfig) => { system: string; messages: { role: 'user' | 'assistant'; content: string }[]; json: boolean; maxOutputTokens: number },
  parse: (text: string) => unknown,
): Promise<{ cfg: ProviderConfig; value: unknown } | { error: string }> {
  const deadline = Date.now() + TOTAL_BUDGET_MS;
  let lastError = 'ai_unavailable';
  const list = allowFallback ? providers : providers.slice(0, 1);
  for (const cfg of list) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) break;
    const req = build(cfg);
    try {
      const res = await complete({ ...cfg, timeout_ms: Math.min(cfg.timeout_ms, remaining) }, req);
      const value = parse(res.text);
      const inTok = res.inputTokens || approxTokens(req.system + req.messages.map((m) => m.content).join(''));
      const outTok = res.outputTokens || approxTokens(res.text);
      await logUsage({ user_id: userId, feature, status: 'success', provider: cfg, input_tokens: inTok, output_tokens: outTok,
        cost: estimateCost(cfg, inTok, outTok), latency_ms: res.latencyMs });
      return { cfg, value };
    } catch (e) {
      const code = e instanceof ProviderError ? e.code : e instanceof SyntaxError || (e as Error).message === 'no_json_in_response' ? 'provider_bad_output' : 'provider_error';
      lastError = code;
      await logUsage({ user_id: userId, feature, status: code === 'provider_rate_limited' ? 'rate_limited' : 'error', provider: cfg, error_code: code });
      console.error(JSON.stringify({ fn: 'think', provider: cfg.key, code }));
    }
  }
  return { error: lastError };
}

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;

  const user = await requireUser(req);
  if (!user) return json(req, 401, { error: 'not_authenticated' });

  let body: { action?: string; project_id?: string; question?: string };
  try {
    body = await req.json();
  } catch {
    return json(req, 400, { error: 'invalid_body' });
  }
  const action = body.action;
  if (action !== 'analyze' && action !== 'followup' && action !== 'checklist' && action !== 'assess') return json(req, 400, { error: 'invalid_action' });
  if (typeof body.project_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.project_id)) return json(req, 400, { error: 'invalid_project' });

  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', user.id).single();
  if (!profile || profile.account_status !== 'active') return json(req, 403, { error: 'account_not_active' });

  // Only the OWNER may run analyses (shared viewers are read-only; also limits cost).
  const { data: project } = await admin.from('think_projects').select('*').eq('id', body.project_id).eq('owner_id', user.id).maybeSingle();
  if (!project) return json(req, 404, { error: 'project_not_found' });
  if ((project.idea as string).trim().length < 30) return json(req, 400, { error: 'idea_too_short' });

  // ---- free 7-parameter assessment ----
  if (action === 'assess') {
    const { data: prefs } = await admin.from('profile_preferences').select('ai_processing_acknowledged_at').eq('user_id', user.id).single();
    return runAssessment(req, user.id, project, Boolean(prefs?.ai_processing_acknowledged_at));
  }

  // ---- checklist: deterministic, no AI, always available ----
  if (action === 'checklist') {
    const report = buildChecklistReport();
    const { data: analysis, error } = await admin.from('think_analyses').insert({
      project_id: project.id, owner_id: user.id, status: 'completed', mode: 'checklist',
      input_snapshot: { title: project.title, idea: project.idea, context: project.context },
      report, completed_at: new Date().toISOString(),
    }).select('*').single();
    if (error) return json(req, 500, { error: 'save_failed' });
    await logUsage({ user_id: user.id, feature: 'think_checklist', status: 'success' });
    return json(req, 200, { analysis });
  }

  // ---- AI paths ----
  const { data: flag } = await admin.from('feature_flags').select('enabled').eq('key', 'think.ai_enabled').maybeSingle();
  const feature: Feature = action === 'analyze' ? 'think_analysis' : 'think_followup';
  if (!flag?.enabled) {
    await logUsage({ user_id: user.id, feature, status: 'disabled' });
    return json(req, 503, { error: 'ai_unavailable' });
  }

  const { data: prefs } = await admin.from('profile_preferences').select('ai_processing_acknowledged_at').eq('user_id', user.id).single();
  if (!prefs?.ai_processing_acknowledged_at) return json(req, 412, { error: 'ai_disclosure_required' });

  const { data: limitsRow } = await admin.from('feature_flags').select('value').eq('key', 'think.limits').maybeSingle();
  const limits: Limits = { analyses_per_day: 3, followups_per_day: 20, global_requests_per_day: 500, allow_free_fallback: true, ...(limitsRow?.value ?? {}) };
  const perUser = action === 'analyze' ? limits.analyses_per_day : limits.followups_per_day;
  const today = startOfDayUtc();
  if (await countUsage({ user_id: user.id, feature, since: today, statuses: ['success'] }) >= perUser) {
    await logUsage({ user_id: user.id, feature, status: 'quota_blocked' });
    return json(req, 429, { error: 'quota_exceeded' });
  }
  if (await countUsage({ since: today, statuses: ['success', 'error'] }) >= limits.global_requests_per_day) {
    await logUsage({ user_id: user.id, feature, status: 'quota_blocked', error_code: 'global_cap' });
    return json(req, 503, { error: 'ai_unavailable' });
  }

  const providers = await eligibleProviders();
  if (providers.length === 0) {
    await logUsage({ user_id: user.id, feature, status: 'disabled', error_code: 'no_eligible_provider' });
    return json(req, 503, { error: 'ai_unavailable' });
  }

  const context = (project.context ?? {}) as ThinkContext;

  if (action === 'analyze') {
    const twoMinAgo = new Date(Date.now() - 120_000).toISOString();
    const { data: running } = await admin.from('think_analyses').select('id').eq('project_id', project.id)
      .eq('status', 'running').gte('created_at', twoMinAgo).limit(1);
    if (running && running.length) return json(req, 409, { error: 'analysis_in_progress' });

    const { data: analysis, error: insErr } = await admin.from('think_analyses').insert({
      project_id: project.id, owner_id: user.id, status: 'running', mode: 'ai',
      input_snapshot: { title: project.title, idea: project.idea, context },
    }).select('id').single();
    if (insErr || !analysis) return json(req, 500, { error: 'save_failed' });

    const result = await runWithProviders(providers, limits.allow_free_fallback, user.id, feature, (cfg) => {
      const p = buildAnalysisPrompt(project.title, (project.idea as string).slice(0, cfg.max_input_chars), context);
      return { system: p.system, messages: [{ role: 'user', content: p.user }], json: true, maxOutputTokens: 8192 };
    }, (text) => {
      const parsed = extractJson(text) as { sections?: unknown[] };
      if (!Array.isArray(parsed.sections) || parsed.sections.length < 10) throw new SyntaxError('incomplete_report');
      return parsed;
    });

    if ('error' in result) {
      await admin.from('think_analyses').update({ status: 'failed', error_code: result.error, completed_at: new Date().toISOString() }).eq('id', analysis.id);
      return json(req, 502, { error: 'ai_unavailable', detail: result.error });
    }
    const report: ThinkReport = normalizeReport(result.value, { generatedBy: 'ai' });
    const { data: saved } = await admin.from('think_analyses').update({
      status: 'completed', report, provider: result.cfg.provider, model: result.cfg.model, completed_at: new Date().toISOString(),
    }).eq('id', analysis.id).select('*').single();
    await admin.from('think_projects').update({ updated_at: new Date().toISOString() }).eq('id', project.id);
    await admin.rpc('notify_user', {
      p_user: user.id, p_type: 'think_report', p_title: 'Your Think report is ready',
      p_body: project.title, p_data: { project_id: project.id, path: `/think/${project.id}` },
    }).then(() => {}, () => {});
    return json(req, 200, { analysis: saved });
  }

  // ---- follow-up question ----
  const question = typeof body.question === 'string' ? body.question.trim() : '';
  if (question.length < 3 || question.length > THINK_LIMITS.followupMaxChars) return json(req, 400, { error: 'invalid_question' });
  const [{ data: latest }, { data: history }] = await Promise.all([
    admin.from('think_analyses').select('id, report').eq('project_id', project.id).eq('status', 'completed')
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    admin.from('think_messages').select('role, content').eq('project_id', project.id).order('created_at', { ascending: false }).limit(10),
  ]);
  const hist = ((history ?? []) as { role: 'user' | 'assistant'; content: string }[]).reverse();

  const result = await runWithProviders(providers, limits.allow_free_fallback, user.id, feature, () => {
    const p = buildFollowupPrompt(project.title, project.idea, (latest?.report ?? null) as ThinkReport | null, hist, question);
    return { system: p.system, messages: p.messages, json: false, maxOutputTokens: 1200 };
  }, (text) => {
    const t = text.trim();
    if (!t) throw new SyntaxError('empty');
    return t.slice(0, 12000);
  });
  if ('error' in result) return json(req, 502, { error: 'ai_unavailable', detail: result.error });

  await admin.from('think_messages').insert({ project_id: project.id, analysis_id: latest?.id ?? null, owner_id: user.id, role: 'user', content: question });
  const { data: answer } = await admin.from('think_messages').insert({
    project_id: project.id, analysis_id: latest?.id ?? null, owner_id: user.id, role: 'assistant',
    content: result.value as string, provider: result.cfg.provider, model: result.cfg.model,
  }).select('*').single();
  return json(req, 200, { message: answer });
});
