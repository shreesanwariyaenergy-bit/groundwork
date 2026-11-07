'use client';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useState } from 'react';
import { AI_DISCLOSURE_GEMINI_FREE, AI_DISCLOSURE_PAID, ERROR_MESSAGES, followupSchema, friendlyError, reportToMarkdown, type ThinkAnalysis, type ThinkMessage } from '@groundwork/shared';
import { Alert, Avatar, Button, Card, EmptyState, ErrorState, Modal, Select, Skeleton, Spinner, Tabs, Textarea } from '@/components/ui';
import { DeepPreview, DeepProgress, DeepQuestions } from '@/components/think/DeepAnalysis';
import { CompareReports, versionLabel } from '@/components/think/CompareReports';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { ConfirmModal } from '@/components/app/PeopleUI';
import { ProjectForm, ReportView } from '@/components/app/ThinkUI';
import { getBrowserClient } from '@/lib/supabase/client';

function download(name: string, text: string, type = 'text/markdown') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

function errorText(code: string) {
  return ERROR_MESSAGES[code] ?? (code === 'idea_too_short' ? 'Describe the idea in more detail first.' : ERROR_MESSAGES.ai_unavailable!);
}

type Tab = 'assessment' | 'deep' | 'earlier';

function ThinkProject() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api, user } = useApp();
  const justSaved = useSearchParams().get('saved') === '1';
  const sb = getBrowserClient();
  const { data, loading, error, reload } = useAsync(async () => {
    const [project, analyses, messages, status] = await Promise.all([api.thinkProject(id), api.analyses(id), api.thinkMessages(id), api.thinkStatus()]);
    return { project, analyses, messages, status };
  }, [id]);
  const [tab, setTab] = useState<Tab | null>(null);
  const [selected, setSelected] = useState<Record<Tab, string | null>>({ assessment: null, deep: null, earlier: null });
  const [running, setRunning] = useState<'assess' | 'checklist' | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [runNotice, setRunNotice] = useState<string | null>(null);
  const [modal, setModal] = useState<'edit' | 'delete' | 'share' | 'disclosure' | 'compare' | null>(null);
  const [afterDisclosure, setAfterDisclosure] = useState<(() => void) | null>(null);
  const [deepStepView, setDeepStepView] = useState<'preview' | 'questions'>('preview');
  const [question, setQuestion] = useState('');
  const [asking, setAsking] = useState(false);
  const [extraMessages, setExtraMessages] = useState<ThinkMessage[]>([]);
  const [acknowledged, setAcknowledged] = useState(false);

  if (loading) return <div className="space-y-4"><Skeleton className="h-24" /><Skeleton className="h-96" /></div>;
  if (error) return <ErrorState message={friendlyError(error)} onRetry={reload} />;
  if (!data?.project) return <EmptyState title="Project not found" body="It may have been deleted, or it has not been shared with you." />;

  const { project, analyses, status } = data;
  const isOwner = project.owner_id === user.id;
  const completed = analyses.filter((a) => a.status === 'completed' && a.report);
  const assessments = completed.filter((a) => a.report_kind === 'assessment');
  const deeps = completed.filter((a) => a.report_kind === 'deep');
  const earlier = completed.filter((a) => a.report_kind === 'full' || a.report_kind === 'quick');
  const runningDeep = analyses.find((a) => a.report_kind === 'deep' && a.status === 'running');
  const failedDeep = analyses.find((a) => a.report_kind === 'deep' && a.status === 'failed');
  const activeTab: Tab = tab ?? (runningDeep ? 'deep' : assessments.length || !earlier.length ? 'assessment' : 'earlier');
  const list = activeTab === 'assessment' ? assessments : activeTab === 'deep' ? deeps : earlier;
  const current: ThinkAnalysis | undefined = list.find((a) => a.id === selected[activeTab]) ?? list[0];
  const messages = [...data.messages, ...extraMessages];
  const disclosureNeeded = status.ai_available && !status.disclosure_acknowledged && !acknowledged;
  const latestAssessment = assessments[0]?.report?.assessment ?? null;

  function withDisclosure(fn: () => void) {
    if (disclosureNeeded) { setAfterDisclosure(() => fn); setModal('disclosure'); return; }
    fn();
  }

  async function run(action: 'assess' | 'checklist') {
    setRunning(action); setRunError(null); setRunNotice(null);
    try {
      const res = await api.runThink(action, id);
      if (res.fallback) setRunNotice(`The AI assessment failed (${friendlyError(res.error_code ?? 'ai_unavailable')}) — a guided assessment was saved instead. You can try again later.`);
      api.track(action === 'assess' ? 'think_assessment_generated' : 'think_checklist_generated').catch(() => {});
      setSelected((s) => ({ ...s, [action === 'assess' ? 'assessment' : 'earlier']: null }));
      setTab(action === 'assess' ? 'assessment' : 'earlier');
      reload();
    } catch (e) { setRunError(errorText((e as Error).message)); }
    finally { setRunning(null); }
  }

  async function ask() {
    const p = followupSchema.safeParse(question);
    if (!p.success) return;
    setAsking(true); setRunError(null);
    const q: ThinkMessage = { id: `tmp-${Date.now()}`, project_id: id, analysis_id: null, owner_id: user.id, role: 'user', content: p.data, created_at: new Date().toISOString() };
    setExtraMessages((m) => [...m, q]); setQuestion('');
    try {
      const res = await api.runThink('followup', id, p.data);
      if (res.message) setExtraMessages((m) => [...m, res.message!]);
    } catch (e) {
      setExtraMessages((m) => m.filter((x) => x.id !== q.id)); setQuestion(p.data);
      setRunError(errorText((e as Error).message));
    } finally { setAsking(false); }
  }

  const tabs: { value: Tab; label: string; count?: number }[] = [
    { value: 'assessment', label: 'Free assessment', count: assessments.length || undefined },
    { value: 'deep', label: 'Deep Analysis', count: deeps.length || undefined },
    ...(earlier.length ? [{ value: 'earlier' as Tab, label: 'Earlier reports', count: earlier.length }] : []),
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">Think project {isOwner ? '· private' : '· shared with you (read-only)'}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {current?.report && <Button variant="secondary" onClick={() => { download(`${project.title.replace(/[^\w-]+/g, '-')}-${current.report_kind}.md`, reportToMarkdown(project.title, current.report!, new Date(current.created_at).toLocaleDateString())); api.track('think_report_exported', { kind: current.report_kind }).catch(() => {}); }}>Export</Button>}
          {current?.report && <Button variant="ghost" onClick={() => window.print()}>Print / PDF</Button>}
          {isOwner && <Button variant="secondary" onClick={() => setModal('share')}>Share</Button>}
          {isOwner && <Button variant="secondary" onClick={() => setModal('edit')}>Edit idea</Button>}
          {isOwner && <Button variant="ghost" onClick={() => setModal('delete')}>Delete</Button>}
        </div>
      </div>

      {justSaved && <Alert tone="accent" title="Saved to your workspace">Your review is now a private Think project. Re-run the free assessment after editing the idea, or explore Deep Analysis.</Alert>}
      <Card className="p-5">
        <h2 className="text-sm font-semibold">The idea</h2>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{project.idea}</p>
        {Object.keys(project.context ?? {}).length > 0 && (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(project.context).map(([k, v]) => v ? <div key={k}><dt className="text-subtle">{k.replace(/_/g, ' ')}</dt><dd>{v}</dd></div> : null)}
          </dl>
        )}
      </Card>

      <Tabs tabs={tabs} value={activeTab} onChange={(v) => setTab(v)} />

      {activeTab === 'assessment' && (
        <>
          {isOwner && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="text-sm">
                  <div className="font-medium">{assessments.length ? 'Re-run the free assessment' : 'Free 7-parameter assessment'}</div>
                  <div className="text-muted">
                    {status.ai_available
                      ? `Free assessments left today: ${Math.max(0, (status.assessments_per_day ?? 5) - (status.assessments_used_today ?? 0))} of ${status.assessments_per_day ?? 5}. Earlier versions are kept.`
                      : 'AI is unavailable right now — you will get a guided assessment (no AI) with the questions to answer for each parameter.'}
                  </div>
                </div>
                <Button onClick={() => (status.ai_available ? withDisclosure(() => run('assess')) : run('assess'))} loading={running === 'assess'}
                  disabled={!!running || (status.ai_available && (status.assessments_used_today ?? 0) >= (status.assessments_per_day ?? 5))}>
                  {assessments.length ? 'Run again' : 'Run free assessment'}
                </Button>
              </div>
              {running === 'assess' && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" />Assessing — usually 15–60 seconds.</p>}
              {runError && <div className="mt-3"><Alert tone="danger">{runError}</Alert></div>}
              {runNotice && <div className="mt-3"><Alert tone="warning">{runNotice}</Alert></div>}
            </Card>
          )}
          <ReportPanel list={assessments} current={current} onSelect={(v) => setSelected((s) => ({ ...s, assessment: v }))} onCompare={() => setModal('compare')}
            empty={<EmptyState title="No assessment yet" body={isOwner ? 'Run the free 7-parameter assessment to see strengths, weaknesses and what to investigate.' : 'The owner has not run an assessment yet.'} />} />
        </>
      )}

      {activeTab === 'deep' && (
        <>
          {runningDeep && isOwner ? (
            <DeepProgress api={api} analysis={runningDeep} onFinished={() => { setSelected((s) => ({ ...s, deep: null })); setDeepStepView('preview'); reload(); }} />
          ) : null}
          {!runningDeep && failedDeep && failedDeep === analyses.find((a) => a.report_kind === 'deep') && isOwner && (
            <Alert tone="warning">The last Deep Analysis could not be completed ({friendlyError(failedDeep.error_code ?? 'ai_unavailable')}). Your access was returned — you can try again.</Alert>
          )}
          {deeps.length > 0 && <ReportPanel list={deeps} current={current} onSelect={(v) => setSelected((s) => ({ ...s, deep: v }))} onCompare={() => setModal('compare')} empty={null} />}
          {isOwner && !runningDeep && (deepStepView === 'questions' ? (
            <DeepQuestions defaultCategory={latestAssessment?.category ?? null} defaultCustomer={project.context?.target_customer}
              onCancel={() => setDeepStepView('preview')}
              onSubmit={async (answers) => {
                await api.deepStart(id, answers);
                api.track('think_deep_started').catch(() => {});
                setDeepStepView('preview'); reload();
              }} />
          ) : (
            <>
              {deeps.length > 0 && <h2 className="pt-2 text-base font-semibold">Generate a new Deep Analysis</h2>}
              {!assessments.length && <Alert tone="neutral">Tip: run the free assessment first — Deep Analysis uses it as context (and may disagree with it).</Alert>}
              <DeepPreview status={status} onContinue={() => withDisclosure(() => setDeepStepView('questions'))} />
            </>
          ))}
          {!isOwner && !deeps.length && <EmptyState title="No Deep Analysis yet" />}
        </>
      )}

      {activeTab === 'earlier' && (
        <>
          <ReportPanel list={earlier} current={current} onSelect={(v) => setSelected((s) => ({ ...s, earlier: v }))} onCompare={() => setModal('compare')} empty={null} />
          {isOwner && (
            <div className="flex flex-wrap items-center gap-3 text-sm text-muted">
              <Button variant="secondary" onClick={() => run('checklist')} loading={running === 'checklist'} disabled={!!running}>Generate guided 20-part checklist</Button>
              <span>No AI — structured questions across 20 areas.</span>
            </div>
          )}
        </>
      )}

      <Card className="p-5">
        <h2 className="text-base font-semibold">Follow-up questions</h2>
        <p className="mt-1 text-sm text-muted">Ask about risks, experiments, pricing or anything in your reports.</p>
        <div className="mt-4 space-y-3">
          {messages.length === 0 && <p className="text-sm text-subtle">No questions yet.</p>}
          {messages.map((m) => (
            <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? '' : 'rounded-md bg-surface p-3'}`}>
              {m.role === 'user' ? <Avatar name="You" size={28} /> : <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-accent-soft text-xs font-semibold text-accent">AI</span>}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
            </div>
          ))}
          {asking && <p className="flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" />Thinking…</p>}
        </div>
        {isOwner && (
          <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); withDisclosure(ask); }}>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. What is the cheapest way to test willingness to pay?" aria-label="Follow-up question" />
            <Button type="submit" loading={asking} disabled={!status.ai_available || question.trim().length < 3 || status.followups_used_today >= status.followups_per_day}>Ask</Button>
          </form>
        )}
        {isOwner && status.ai_available && <p className="mt-2 text-xs text-subtle">Follow-ups left today: {Math.max(0, status.followups_per_day - status.followups_used_today)}.</p>}
      </Card>

      {list.length > 1 && <CompareReports key={`${activeTab}-${list.length}`} open={modal === 'compare'} onClose={() => setModal(null)} versions={list} />}
      {isOwner && (
        <>
          <Modal open={modal === 'edit'} onClose={() => setModal(null)} title="Edit idea">
            <ProjectForm submitLabel="Save changes" initial={{ title: project.title, idea: project.idea, context: project.context as Record<string, string> }} onSubmit={async (v) => {
              const { error } = await sb.from('think_projects').update(v).eq('id', id);
              if (error) throw error;
              setModal(null); reload();
            }} />
          </Modal>
          <ConfirmModal open={modal === 'delete'} onClose={() => setModal(null)} title="Delete this project?" danger confirmLabel="Delete project"
            body="The project, all report versions (including Deep Analyses) and follow-up questions will be permanently deleted. Anyone it was shared with loses access."
            onConfirm={async () => { const { error } = await sb.from('think_projects').delete().eq('id', id); if (error) throw error; router.push('/app/think'); }} />
          <DisclosureModal open={modal === 'disclosure'} provider={status.provider_label} free={status.provider_is_free !== false} onClose={() => setModal(null)} onAccept={async () => {
            await api.acknowledgeAiDisclosure(); setModal(null); setAcknowledged(true);
            const next = afterDisclosure; setAfterDisclosure(null);
            if (next) setTimeout(next, 0);
          }} />
          <ShareModal open={modal === 'share'} onClose={() => setModal(null)} projectId={id} />
        </>
      )}
    </div>
  );
}

function ReportPanel({ list, current, onSelect, onCompare, empty }: {
  list: ThinkAnalysis[]; current: ThinkAnalysis | undefined; onSelect: (id: string) => void; onCompare: () => void; empty: React.ReactNode;
}) {
  if (!current?.report) return <>{empty}</>;
  return (
    <Card className="p-5 sm:p-7">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-semibold">{current.report_kind === 'assessment' ? 'Free 7-parameter assessment' : current.report_kind === 'deep' ? 'Deep Analysis' : current.report_kind === 'quick' ? 'Quick review' : 'Report'}</h2>
        <div className="flex flex-wrap items-center gap-2">
          {list.length > 1 && (
            <>
              <Select className="w-auto" value={current.id} onChange={(e) => onSelect(e.target.value)} aria-label="Report version">
                {list.map((a) => <option key={a.id} value={a.id}>{versionLabel(list, a)}</option>)}
              </Select>
              <Button size="sm" variant="secondary" onClick={onCompare}>Compare versions</Button>
            </>
          )}
        </div>
      </div>
      <ReportView report={current.report} idPrefix={current.report_kind} />
      {current.model && <p className="mt-6 text-xs text-subtle">Generated with {current.provider} / {current.model} on {new Date(current.created_at).toLocaleString()}.</p>}
    </Card>
  );
}

function DisclosureModal({ open, provider, free, onClose, onAccept }: { open: boolean; provider: string | null; free: boolean; onClose: () => void; onAccept: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Before your idea is sent to AI" footer={
      <><Button variant="ghost" onClick={onClose}>Not now</Button><Button loading={busy} onClick={async () => { setBusy(true); await onAccept(); setBusy(false); }}>I understand, continue</Button></>
    }>
      <div className="space-y-3 text-sm text-muted">
        <p>To generate assessments, Deep Analyses and answers, the project name, idea, context, your answers and follow-up questions are sent to an external AI provider{provider ? <>: <strong className="text-fg">{provider}</strong></> : ''}. Deep Analysis may also run web searches about your idea.</p>
        <p>{free ? AI_DISCLOSURE_GEMINI_FREE : AI_DISCLOSURE_PAID}</p>
        <p>Your project stays private on Groundwork unless you share it. We record usage metadata (time, provider, model, token counts) but not your text in our usage logs.</p>
      </div>
    </Modal>
  );
}

function ShareModal({ open, onClose, projectId }: { open: boolean; onClose: () => void; projectId: string }) {
  const { api, avatar } = useApp();
  const conns = useAsync(() => (open ? api.connections(0) : Promise.resolve([])), [open]);
  const shares = useAsync(async () => {
    if (!open) return [] as string[];
    const { data } = await getBrowserClient().from('think_project_shares').select('shared_with').eq('project_id', projectId);
    return (data ?? []).map((d) => d.shared_with as string);
  }, [open, projectId]);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title="Share this project">
      <p className="text-sm text-muted">Shared connections can read the idea, reports and follow-ups. They cannot edit, run analyses or reshare. Access ends automatically if you disconnect.</p>
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
      <div className="mt-4">
        {conns.loading ? <Skeleton className="h-20" /> : !(conns.data ?? []).length ? <p className="text-sm text-muted">You can only share with connections. You have none yet.</p> : (
          <ul className="divide-y divide-line">
            {conns.data!.map((c) => {
              const on = (shares.data ?? []).includes(c.user_id);
              return (
                <li key={c.user_id} className="flex items-center gap-3 py-2">
                  <Avatar name={c.display_name} src={avatar(c.avatar_path)} size={32} />
                  <span className="flex-1 text-sm">{c.display_name}</span>
                  <Button size="sm" variant={on ? 'secondary' : 'primary'} onClick={async () => {
                    setError(null);
                    try { if (on) await api.unshareThinkProject(projectId, c.user_id); else await api.shareThinkProject(projectId, c.user_id); shares.reload(); }
                    catch (e) { setError(friendlyError(e)); }
                  }}>{on ? 'Stop sharing' : 'Share'}</Button>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </Modal>
  );
}

export default function ThinkProjectPage() {
  return <Suspense><ThinkProject /></Suspense>;
}
