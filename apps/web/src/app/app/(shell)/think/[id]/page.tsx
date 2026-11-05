'use client';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import { ERROR_MESSAGES, followupSchema, friendlyError, reportToMarkdown, type ThinkAnalysis, type ThinkMessage } from '@groundwork/shared';
import { Alert, Avatar, Button, Card, EmptyState, ErrorState, Modal, Select, Skeleton, Spinner, Textarea } from '@/components/ui';
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
  return ERROR_MESSAGES[code] ?? (code === 'analysis_in_progress' ? 'An analysis is already running for this project.' : code === 'idea_too_short' ? 'Describe the idea in more detail first.' : ERROR_MESSAGES.ai_unavailable!);
}

export default function ThinkProjectPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api, user, avatar } = useApp();
  const sb = getBrowserClient();
  const { data, loading, error, reload } = useAsync(async () => {
    const [project, analyses, messages, status] = await Promise.all([api.thinkProject(id), api.analyses(id), api.thinkMessages(id), api.thinkStatus()]);
    return { project, analyses, messages, status };
  }, [id]);
  const [selected, setSelected] = useState<string | null>(null);
  const [running, setRunning] = useState<'analyze' | 'checklist' | null>(null);
  const [runError, setRunError] = useState<string | null>(null);
  const [modal, setModal] = useState<'edit' | 'delete' | 'share' | 'disclosure' | null>(null);
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
  const current: ThinkAnalysis | undefined = completed.find((a) => a.id === selected) ?? completed[0];
  const messages = [...data.messages, ...extraMessages];

  async function run(action: 'analyze' | 'checklist') {
    if (action === 'analyze' && !status.disclosure_acknowledged && !acknowledged) return setModal('disclosure');
    setRunning(action); setRunError(null);
    try {
      await api.runThink(action, id);
      api.track(action === 'analyze' ? 'think_report_generated' : 'think_checklist_generated').catch(() => {});
      setSelected(null); reload();
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

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm text-muted">Think project {isOwner ? '· private' : '· shared with you (read-only)'}</p>
          <h1 className="text-2xl font-semibold tracking-tight">{project.title}</h1>
        </div>
        <div className="flex flex-wrap gap-2">
          {current?.report && <Button variant="secondary" onClick={() => { download(`${project.title.replace(/[^\w-]+/g, '-')}.md`, reportToMarkdown(project.title, current.report!, new Date(current.created_at).toLocaleDateString())); api.track('think_report_exported').catch(() => {}); }}>Export</Button>}
          {current?.report && <Button variant="ghost" onClick={() => window.print()}>Print / PDF</Button>}
          {isOwner && <Button variant="secondary" onClick={() => setModal('share')}>Share</Button>}
          {isOwner && <Button variant="secondary" onClick={() => setModal('edit')}>Edit idea</Button>}
          {isOwner && <Button variant="ghost" onClick={() => setModal('delete')}>Delete</Button>}
        </div>
      </div>

      <Card className="p-5">
        <h2 className="text-sm font-semibold">The idea</h2>
        <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed">{project.idea}</p>
        {Object.keys(project.context ?? {}).length > 0 && (
          <dl className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
            {Object.entries(project.context).map(([k, v]) => v ? <div key={k}><dt className="text-subtle">{k.replace(/_/g, ' ')}</dt><dd>{v}</dd></div> : null)}
          </dl>
        )}
      </Card>

      {isOwner && (
        <Card className="p-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="text-sm">
              <div className="font-medium">{completed.length ? 'Generate an updated report' : 'Analyse this idea'}</div>
              <div className="text-muted">
                {status.ai_available ? `AI analyses left today: ${Math.max(0, status.analyses_per_day - status.analyses_used_today)} of ${status.analyses_per_day}.` : 'AI analysis is unavailable right now.'}
              </div>
            </div>
            <div className="flex gap-2">
              <Button onClick={() => run('analyze')} loading={running === 'analyze'} disabled={!!running || !status.ai_available || status.analyses_used_today >= status.analyses_per_day}>Run AI analysis</Button>
              <Button variant="secondary" onClick={() => run('checklist')} loading={running === 'checklist'} disabled={!!running}>Use basic checklist</Button>
            </div>
          </div>
          {running === 'analyze' && <p className="mt-3 flex items-center gap-2 text-sm text-muted"><Spinner className="size-4" />Analysing — this usually takes 20–60 seconds. You can keep this page open.</p>}
          {runError && <div className="mt-3"><Alert tone="danger">{runError}</Alert></div>}
        </Card>
      )}

      {analyses.some((a) => a.status === 'failed') && completed.length === 0 && !running && (
        <Alert tone="warning">The last AI analysis failed. Try again later, or use the basic checklist.</Alert>
      )}

      {current?.report ? (
        <Card className="p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Report</h2>
            {completed.length > 1 && (
              <Select className="w-auto" value={current.id} onChange={(e) => setSelected(e.target.value)} aria-label="Report version">
                {completed.map((a, i) => <option key={a.id} value={a.id}>{i === 0 ? 'Latest' : `Version ${completed.length - i}`} · {new Date(a.created_at).toLocaleString()} · {a.mode === 'ai' ? 'AI' : 'Checklist'}</option>)}
              </Select>
            )}
          </div>
          <ReportView report={current.report} />
          {current.model && <p className="mt-6 text-xs text-subtle">Generated with {current.provider} / {current.model}.</p>}
        </Card>
      ) : (
        <EmptyState title="No report yet" body={isOwner ? 'Run an AI analysis or start with the basic checklist.' : 'The owner has not generated a report yet.'} />
      )}

      <Card className="p-5">
        <h2 className="text-base font-semibold">Follow-up questions</h2>
        <p className="mt-1 text-sm text-muted">Ask about risks, experiments, pricing or anything in the report.</p>
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
          <form className="mt-4 flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); ask(); }}>
            <Textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={2} maxLength={2000} placeholder="e.g. What is the cheapest way to test willingness to pay?" aria-label="Follow-up question" />
            <Button type="submit" loading={asking} disabled={!status.ai_available || question.trim().length < 3 || status.followups_used_today >= status.followups_per_day}>Ask</Button>
          </form>
        )}
        {isOwner && status.ai_available && <p className="mt-2 text-xs text-subtle">Follow-ups left today: {Math.max(0, status.followups_per_day - status.followups_used_today)}.</p>}
      </Card>

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
            body="The project, all report versions and follow-up questions will be permanently deleted. Anyone it was shared with loses access."
            onConfirm={async () => { const { error } = await sb.from('think_projects').delete().eq('id', id); if (error) throw error; router.push('/app/think'); }} />
          <DisclosureModal open={modal === 'disclosure'} provider={status.provider_label} onClose={() => setModal(null)} onAccept={async () => {
            await api.acknowledgeAiDisclosure(); setModal(null); setAcknowledged(true); setTimeout(() => run('analyze'), 0);
          }} />
          <ShareModal open={modal === 'share'} onClose={() => setModal(null)} projectId={id} />
        </>
      )}
    </div>
  );
}

function DisclosureModal({ open, provider, onClose, onAccept }: { open: boolean; provider: string | null; onClose: () => void; onAccept: () => Promise<void> }) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title="Before your first AI analysis" footer={
      <><Button variant="ghost" onClick={onClose}>Not now</Button><Button loading={busy} onClick={async () => { setBusy(true); await onAccept(); setBusy(false); }}>I understand, continue</Button></>
    }>
      <div className="space-y-3 text-sm text-muted">
        <p>To generate the report, the project name, idea, context and follow-up questions are sent to an external AI provider{provider ? <>: <strong className="text-fg">{provider}</strong></> : ''}.</p>
        <p>Providers have their own data-use and retention terms. Some free tiers may use submitted content to improve their services. Do not include personal data or confidential details you are not comfortable sharing.</p>
        <p>Your project stays private on this platform. We record usage metadata (time, provider, token counts) but not your text in our usage logs.</p>
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
