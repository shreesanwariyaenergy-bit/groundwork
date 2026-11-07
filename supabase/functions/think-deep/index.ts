/**
 * Groundwork Deep Analysis (paid). Signed-in owners only.
 *   POST { action: 'start', project_id, answers }  → { analysis_id }
 *   POST { action: 'step', analysis_id }           → { status, stage, ... }   (call until status !== 'running')
 *
 * Generation is staged (research → part 1 → part 2 → part 3) so every call stays well inside the
 * platform time limit; progress is stored on the analysis row and any tab can resume it.
 *
 * Access: flag `think.deep_analysis` must be enabled AND the user must hold an available entitlement,
 * which is consumed atomically at start and refunded if generation fails. Entitlements are granted
 * by an admin today (controlled test path). Payments are NOT processed anywhere in this function.
 *
 * Cost control: per-user and global daily caps, per-provider caps (thinkcore), output limits,
 * per-stage timeouts, bounded retries, no automatic paid fallback, usage logged per feature
 * (think_research / think_deep) without any prompt or output text.
 */
import { admin, requireUser } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/http.ts';
import { approxTokens, complete, ProviderError } from '../_shared/ai.ts';
import { extractJson, type ThinkSource } from '../_shared/think.ts';
import { assessmentDigest } from '../_shared/assessment.ts';
import {
  DEEP_SECTIONS, buildDeepPartPrompt, buildResearchPrompt, buildResearchSources, normalizeDeepReport, sanitizeDeepAnswers, summarizeParts,
  type DeepAnswers, type DeepPart, type DeepResearchInfo, type DeepStage,
} from '../_shared/deep.ts';
import { diag, flag, logUsage, providersFor, startOfDayUtc, type ProviderChoice } from '../_shared/thinkcore.ts';

interface DeepFlag { payments_enabled?: boolean; per_user_per_day?: number; global_per_day?: number; research_enabled?: boolean; max_stage_failures?: number }
interface Progress {
  stage: DeepStage;
  failures: number;
  entitlement_id?: string;
  last_error?: string | null;
  research?: DeepResearchInfo;
  notes?: string | null;
  sources?: ThinkSource[];
  parts?: Partial<Record<string, unknown>>;
  /** Provider/model that actually generated the parts. */
  provider_used?: string | null;
  model_used?: string | null;
}
interface Input { answers: DeepAnswers; skipped: string[]; assessment_id: string | null; title: string; idea: string }

const STAGE_TIMEOUT_MS = 125_000;     // one provider call per invocation, under the platform wall-clock limit
const RESEARCH_TIMEOUT_MS = 100_000;
const LOCK_SECONDS = 160;

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const user = await requireUser(req);
  if (!user) return json(req, 401, { error: 'not_authenticated' });

  let body: { action?: string; project_id?: string; analysis_id?: string; answers?: unknown };
  try { body = await req.json(); } catch { return json(req, 400, { error: 'invalid_body' }); }

  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', user.id).single();
  if (!profile || profile.account_status !== 'active') return json(req, 403, { error: 'account_not_active' });

  const deepFlag = await flag<DeepFlag>('think.deep_analysis');
  if (!deepFlag?.enabled) return json(req, 403, { error: 'deep_unavailable' });
  const cfg = deepFlag.value;

  if (body.action === 'start') return start(req, user.id, body, cfg);
  if (body.action === 'step') return step(req, user.id, body.analysis_id, cfg);
  return json(req, 400, { error: 'invalid_action' });
});

async function start(req: Request, userId: string, body: { project_id?: string; answers?: unknown }, cfg: DeepFlag): Promise<Response> {
  if (typeof body.project_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(body.project_id)) return json(req, 400, { error: 'invalid_project' });
  const parsed = sanitizeDeepAnswers(body.answers);
  if (!parsed.ok) return json(req, 400, { error: parsed.error });

  const { data: project } = await admin.from('think_projects').select('id, title, idea').eq('id', body.project_id).eq('owner_id', userId).maybeSingle();
  if (!project) return json(req, 404, { error: 'project_not_found' });
  if ((project.idea as string).trim().length < 30) return json(req, 400, { error: 'idea_too_short' });

  // AI must be available BEFORE consuming access.
  if (!(await providersFor('deep', { freeOnly: false })).length) return json(req, 503, { error: 'ai_unavailable' });
  const { data: prefs } = await admin.from('profile_preferences').select('ai_processing_acknowledged_at').eq('user_id', userId).single();
  if (!prefs?.ai_processing_acknowledged_at) return json(req, 412, { error: 'ai_disclosure_required' });

  const today = startOfDayUtc();
  const [{ count: mine }, { count: all }] = await Promise.all([
    admin.from('think_analyses').select('id', { count: 'exact', head: true }).eq('owner_id', userId).eq('report_kind', 'deep').neq('status', 'failed').gte('created_at', today),
    admin.from('think_analyses').select('id', { count: 'exact', head: true }).eq('report_kind', 'deep').neq('status', 'failed').gte('created_at', today),
  ]);
  if ((mine ?? 0) >= Number(cfg.per_user_per_day ?? 2)) return json(req, 429, { error: 'quota_exceeded' });
  if ((all ?? 0) >= Number(cfg.global_per_day ?? 20)) return json(req, 503, { error: 'deep_busy' });

  const { data: assessment } = await admin.from('think_analyses').select('id').eq('project_id', project.id)
    .eq('report_kind', 'assessment').eq('status', 'completed').order('created_at', { ascending: false }).limit(1).maybeSingle();

  const input: Input = { answers: parsed.answers, skipped: parsed.skipped, assessment_id: assessment?.id ?? null, title: project.title, idea: project.idea };
  const { data: id, error } = await admin.rpc('think_start_deep', { p_user: userId, p_project: project.id, p_input: input });
  if (error) {
    const code = /deep_access_required/.test(error.message) ? 'deep_access_required' : /analysis_in_progress/.test(error.message) ? 'analysis_in_progress' : 'save_failed';
    return json(req, code === 'deep_access_required' ? 402 : code === 'analysis_in_progress' ? 409 : 500, { error: code });
  }
  diag('think-deep', { event: 'start', analysis: id as string });
  return json(req, 200, { analysis_id: id });
}

async function step(req: Request, userId: string, analysisId: unknown, cfg: DeepFlag): Promise<Response> {
  if (typeof analysisId !== 'string' || !/^[0-9a-f-]{36}$/i.test(analysisId)) return json(req, 400, { error: 'invalid_analysis' });
  const { data: row } = await admin.from('think_analyses').select('*').eq('id', analysisId).eq('owner_id', userId).eq('report_kind', 'deep').maybeSingle();
  if (!row) return json(req, 404, { error: 'analysis_not_found' });
  if (row.status !== 'running') return json(req, 200, { status: row.status, stage: (row.progress as Progress | null)?.stage ?? null, error_code: row.error_code });

  const { data: claimed } = await admin.rpc('think_deep_claim', { p_id: analysisId, p_seconds: LOCK_SECONDS });
  if (!claimed) return json(req, 202, { status: 'running', stage: (row.progress as Progress).stage, busy: true });

  const saved = (row.progress ?? {}) as Partial<Progress>;
  const progress: Progress = { ...saved, stage: saved.stage ?? 'research', failures: saved.failures ?? 0, parts: saved.parts ?? {} };
  const input = row.input_snapshot as Input;
  const save = (patch: Record<string, unknown>) => admin.from('think_analyses').update({ ...patch, locked_until: null }).eq('id', analysisId);

  try {
    if (progress.stage === 'research') {
      await runResearch(userId, input, progress, cfg);
      progress.stage = 'part1';
    } else if (progress.stage === 'part1' || progress.stage === 'part2' || progress.stage === 'part3') {
      const part = Number(progress.stage.slice(4)) as DeepPart;
      progress.parts = { ...(progress.parts ?? {}), [part]: await runPart(userId, part, input, progress) };
      if (part < 3) {
        progress.stage = `part${part + 1}` as DeepStage;
      } else {
        return await finish(req, analysisId, row.project_id as string, userId, input, progress, save);
      }
    }
    progress.failures = 0;
    progress.last_error = null;
    await save({ progress });
    return json(req, 200, { status: 'running', stage: progress.stage });
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : e instanceof SyntaxError || (e as Error).message === 'no_json_in_response' ? 'provider_bad_output' : 'stage_failed';
    progress.failures = (progress.failures ?? 0) + 1;
    progress.last_error = code;
    diag('think-deep', { event: 'stage_error', analysis: analysisId, stage: progress.stage, code, failures: progress.failures });
    if (progress.failures > Number(cfg.max_stage_failures ?? 2)) {
      await save({ progress });
      await admin.rpc('think_deep_fail', { p_id: analysisId, p_code: code });
      return json(req, 502, { status: 'failed', stage: progress.stage, error: code, refunded: true });
    }
    await save({ progress });
    return json(req, 502, { status: 'running', stage: progress.stage, error: code, retryable: true });
  }
}

/** One search-grounded call. Research problems degrade the report (clearly labelled), they do not fail it. */
async function runResearch(userId: string, input: Input, progress: Progress, cfg: DeepFlag) {
  const none = (limitation: string) => {
    progress.research = { performed: false, queries: [], limitation, search_suggestions_html: null };
    progress.notes = null;
    progress.sources = [];
  };
  if (cfg.research_enabled === false) return none('Live research is turned off for Deep Analysis.');
  const choices = (await providersFor('research', { freeOnly: false })).filter((c) => c.cfg.provider === 'gemini');
  const choice: ProviderChoice | undefined = choices[0];
  if (!choice) return none('No provider with web search is available.');
  const prompt = buildResearchPrompt({ title: input.title, idea: input.idea, answers: input.answers, skipped: input.skipped, assessmentDigest: '' });
  try {
    const res = await complete({ ...choice.cfg, timeout_ms: RESEARCH_TIMEOUT_MS }, {
      system: prompt.system, messages: [{ role: 'user', content: prompt.user }], json: false, maxOutputTokens: 8192,
      model: choice.model, search: true, reasoning: 'low',
    });
    await logUsage({ user_id: userId, feature: 'think_research', status: 'success', choice: { ...choice, model: res.model }, latency_ms: res.latencyMs,
      input_tokens: res.inputTokens || approxTokens(prompt.system + prompt.user), output_tokens: res.outputTokens || approxTokens(res.text) });
    const g = res.grounding;
    const resolved = await resolveRedirects((g?.chunks ?? []).map((c) => c.web?.uri).filter((u): u is string => Boolean(u)));
    const { notes, sources } = buildResearchSources(res.text, g?.chunks ?? [], g?.supports ?? [], new Date().toISOString().slice(0, 10), resolved);
    progress.notes = sources.length ? notes : null;
    progress.sources = sources;
    progress.research = {
      performed: sources.length > 0,
      queries: (g?.queries ?? []).slice(0, 20),
      limitation: sources.length ? null : 'Web search returned no citable sources for this idea.',
      search_suggestions_html: g?.searchEntryPointHtml ?? null,
    };
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'research_failed';
    const detail = e instanceof ProviderError ? e.detail : undefined;
    await logUsage({ user_id: userId, feature: 'think_research', status: code === 'provider_rate_limited' ? 'rate_limited' : 'error', choice, error_code: detail ? `${code}: ${detail}` : code });
    none(code === 'provider_rate_limited'
      ? 'Live research was unavailable because the search quota was reached. Research-dependent sections are preliminary.'
      : 'Live research could not be completed. Research-dependent sections are preliminary.');
  }
}

/** Resolve grounding redirect links to the publisher URL (short timeout; falls back to the redirect link). */
async function resolveRedirects(urls: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  await Promise.all([...new Set(urls)].slice(0, 25).map(async (u) => {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 4000);
    try {
      const r = await fetch(u, { method: 'GET', redirect: 'manual', signal: ctrl.signal });
      const loc = r.headers.get('location');
      if (loc && /^https?:\/\//i.test(loc)) out[u] = loc;
      await r.body?.cancel();
    } catch { /* keep redirect link */ } finally { clearTimeout(t); }
  }));
  return out;
}

async function runPart(userId: string, part: DeepPart, input: Input, progress: Progress): Promise<unknown> {
  const choice = (await providersFor('deep', { freeOnly: false }))[0];
  if (!choice) throw new ProviderError('ai_unavailable');
  let digest = 'No free assessment available.';
  if (input.assessment_id) {
    const { data } = await admin.from('think_analyses').select('report').eq('id', input.assessment_id).maybeSingle();
    digest = assessmentDigest(data?.report ?? null);
  }
  const prompt = buildDeepPartPrompt(part, {
    title: input.title, idea: input.idea, answers: input.answers, skipped: input.skipped, assessmentDigest: digest,
    researchNotes: progress.notes ?? null, sources: progress.sources ?? [], earlier: part > 1 ? summarizeParts(progress.parts ?? {}) : undefined,
  });
  try {
    const res = await complete({ ...choice.cfg, timeout_ms: STAGE_TIMEOUT_MS }, {
      system: prompt.system, messages: [{ role: 'user', content: prompt.user }], json: true, maxOutputTokens: 16384,
      model: choice.model, reasoning: 'medium',
    });
    const raw = extractJson(res.text) as { sections?: { key?: string }[] };
    const expected = DEEP_SECTIONS.filter((s) => s.part === part).map((s) => s.key);
    const got = (raw.sections ?? []).filter((s) => s && expected.includes(s.key as string)).length;
    if (got < expected.length - 2) throw new SyntaxError('incomplete_part');
    progress.provider_used = choice.cfg.provider;
    progress.model_used = res.model;
    await logUsage({ user_id: userId, feature: 'think_deep', status: 'success', choice: { ...choice, model: res.model }, latency_ms: res.latencyMs,
      input_tokens: res.inputTokens || approxTokens(prompt.system + prompt.user), output_tokens: res.outputTokens || approxTokens(res.text) });
    return raw;
  } catch (e) {
    const code = e instanceof ProviderError ? e.code : 'provider_bad_output';
    const detail = e instanceof ProviderError ? e.detail : undefined;
    await logUsage({ user_id: userId, feature: 'think_deep', status: code === 'provider_rate_limited' ? 'rate_limited' : 'error', choice, error_code: detail ? `${code}: ${detail}` : code });
    throw e;
  }
}

async function finish(
  req: Request, analysisId: string, projectId: string, userId: string, input: Input, progress: Progress,
  save: (patch: Record<string, unknown>) => PromiseLike<unknown>,
): Promise<Response> {
  const report = normalizeDeepReport(progress.parts as Partial<Record<DeepPart, unknown>>, {
    sources: progress.sources ?? [],
    research: progress.research ?? { performed: false, queries: [], limitation: 'Live research did not run.', search_suggestions_html: null },
    answers: input.answers, skipped: input.skipped, basedOn: input.assessment_id,
  });
  progress.stage = 'done';
  // Keep progress small once done: the report holds everything the reader needs.
  const slim = { stage: 'done', failures: 0, entitlement_id: progress.entitlement_id ?? null };
  await save({ status: 'completed', report, progress: slim, provider: progress.provider_used ?? null, model: progress.model_used ?? null, completed_at: new Date().toISOString() });
  await admin.from('think_projects').update({ updated_at: new Date().toISOString() }).eq('id', projectId);
  await admin.rpc('notify_user', {
    p_user: userId, p_type: 'think_report', p_title: 'Your Deep Analysis is ready', p_body: input.title,
    p_data: { project_id: projectId, path: `/think/${projectId}` },
  }).then(() => {}, () => {});
  diag('think-deep', { event: 'completed', analysis: analysisId, research: report.research_performed, sources: report.sources.length });
  return json(req, 200, { status: 'completed', stage: 'done' });
}
