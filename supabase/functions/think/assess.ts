/**
 * action: 'assess' — free 7-parameter assessment for a signed-in owner.
 * Uses the enabled provider (free first; paid only if explicitly approved with budget; no automatic
 * paid fallback). When AI is unavailable or fails, saves a clearly labelled guided assessment.
 * Every run creates a NEW analysis row; earlier versions are never overwritten.
 */
import { admin } from '../_shared/clients.ts';
import { json } from '../_shared/http.ts';
import { approxTokens, complete, ProviderError } from '../_shared/ai.ts';
import { extractJson, type ThinkReport } from '../_shared/think.ts';
import { buildAssessmentPrompt, buildGuidedAssessment, normalizeAssessment, ASSESSMENT_PARAMETERS } from '../_shared/assessment.ts';
import { countUsage, diag, flag, logUsage, providersFor, type ProviderChoice } from '../_shared/thinkcore.ts';

const AI_TIMEOUT_MS = 90_000;

interface Project { id: string; title: string; idea: string; context: Record<string, string> | null }

export async function runAssessment(req: Request, userId: string, project: Project, disclosureAcknowledged: boolean): Promise<Response> {
  const limits = (await flag<{ assessments_per_day?: number }>('think.limits'))?.value ?? {};
  const perDay = Number(limits.assessments_per_day ?? 5);
  const { count: prior } = await admin.from('think_analyses').select('id', { count: 'exact', head: true })
    .eq('project_id', project.id).eq('report_kind', 'assessment').eq('status', 'completed');
  const feature = (prior ?? 0) > 0 ? 'think_assessment_regen' : 'think_assessment';

  const providers = await providersFor('assessment', { freeOnly: false });
  if (providers.length && !disclosureAcknowledged) return json(req, 412, { error: 'ai_disclosure_required' });
  if (providers.length && await countUsage({ user_id: userId, features: ['think_assessment', 'think_assessment_regen'], statuses: ['success'] }) >= perDay) {
    await logUsage({ user_id: userId, feature, status: 'quota_blocked' });
    return json(req, 429, { error: 'quota_exceeded' });
  }

  const inputs = { title: project.title, idea: project.idea, context: project.context ?? {} };
  let report: ThinkReport | null = null;
  let used: ProviderChoice | null = null;
  let failure: string | null = null;
  if (providers.length) {
    const prompt = buildAssessmentPrompt(inputs);
    for (const choice of providers.slice(0, 2)) {
      try {
        const res = await complete({ ...choice.cfg, timeout_ms: Math.max(choice.cfg.timeout_ms, AI_TIMEOUT_MS) }, {
          system: prompt.system, messages: [{ role: 'user', content: prompt.user }], json: true, maxOutputTokens: 8192,
          model: choice.model, reasoning: 'medium',
        });
        const raw = extractJson(res.text) as { parameters?: unknown[] };
        if (!Array.isArray(raw.parameters) || raw.parameters.length < ASSESSMENT_PARAMETERS.length - 1) throw new SyntaxError('incomplete_assessment');
        report = normalizeAssessment(raw, { generatedBy: 'ai' });
        used = { ...choice, model: res.model };
        await logUsage({
          user_id: userId, feature, status: 'success', choice: used, latency_ms: res.latencyMs,
          input_tokens: res.inputTokens || approxTokens(prompt.system + prompt.user), output_tokens: res.outputTokens || approxTokens(res.text),
        });
        break;
      } catch (e) {
        failure = e instanceof ProviderError ? e.code : 'provider_bad_output';
        const detail = e instanceof ProviderError ? e.detail : undefined;
        await logUsage({ user_id: userId, feature, status: failure === 'provider_rate_limited' ? 'rate_limited' : 'error', choice, error_code: detail ? `${failure}: ${detail}` : failure });
        diag('think.assess', { provider: choice.cfg.key, model: choice.model, code: failure });
      }
    }
  }
  if (!report) report = buildGuidedAssessment(inputs);

  const { data: analysis, error } = await admin.from('think_analyses').insert({
    project_id: project.id, owner_id: userId, status: 'completed', mode: used ? 'ai' : 'checklist', report_kind: 'assessment',
    provider: used?.cfg.provider ?? null, model: used?.model ?? null,
    input_snapshot: { title: project.title, idea: project.idea, context: project.context }, report, completed_at: new Date().toISOString(),
  }).select('*').single();
  if (error) return json(req, 500, { error: 'save_failed' });
  // Provider failures were already logged above; record guided runs when AI was simply not available.
  if (!used && !providers.length) await logUsage({ user_id: userId, feature, status: 'disabled', error_code: 'guided' });
  await admin.from('think_projects').update({ updated_at: new Date().toISOString() }).eq('id', project.id);
  return json(req, 200, { analysis, fallback: Boolean(providers.length && !used), error_code: used ? null : failure });
}
