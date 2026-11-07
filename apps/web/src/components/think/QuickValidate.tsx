'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { AI_DISCLOSURE_GEMINI_FREE, QUICK_LIMITS, createApi, friendlyError, sanitizeQuickInputs, type QuickInputs, type ThinkReport } from '@groundwork/shared';
import { Alert, Button, Field, Input, Skeleton, Textarea, buttonClass } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { clearResult, readResult, saveClaim, saveDraft, saveResult, takeDraft } from '@/lib/quick-validate';
import { ReportView } from './ReportView';

const EXAMPLE = 'A booking assistant for small dental clinics that texts patients, fills cancelled slots from a waitlist and cuts no-shows.';

/** Compact hero form: collects the idea and hands over to /validate, which runs the analysis. */
export function QuickValidateHero() {
  const router = useRouter();
  const [idea, setIdea] = useState('');
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="rounded-lg border border-line bg-raised p-4 shadow-sm sm:p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (idea.trim().length < QUICK_LIMITS.ideaMinChars) return setError('Describe the idea in a sentence or two (30+ characters).');
        saveDraft({ idea: idea.trim() });
        router.push('/validate?run=1');
      }}
    >
      <label htmlFor="hero-idea" className="text-sm font-medium text-fg">Describe your startup idea</label>
      <Textarea id="hero-idea" value={idea} onChange={(e) => { setIdea(e.target.value); setError(null); }} rows={4}
        maxLength={QUICK_LIMITS.ideaMaxChars} placeholder={EXAMPLE} className="mt-2 text-[15px]" aria-describedby="hero-idea-help" />
      {error && <p className="mt-2 text-sm text-danger" role="alert">{error}</p>}
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <p id="hero-idea-help" className="max-w-md text-xs text-subtle">Free · no account needed. Your idea is sent to Google’s Gemini API (free tier): Google may use it to improve its products and human reviewers may read it — leave out confidential details.</p>
        <Button type="submit" size="lg">Validate my idea</Button>
      </div>
    </form>
  );
}

export function QuickValidate({ autoRun }: { autoRun: boolean }) {
  const api = useMemo(() => createApi(getBrowserClient()), []);
  const [inputs, setInputs] = useState<QuickInputs>({ idea: '' });
  const [showMore, setShowMore] = useState(false);
  const [phase, setPhase] = useState<'form' | 'loading' | 'result'>('form');
  const [report, setReport] = useState<ThinkReport | null>(null);
  const [saveable, setSaveable] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const started = useRef(false);

  async function run(values: QuickInputs) {
    const parsed = sanitizeQuickInputs(values);
    if (!parsed.ok) { setError(friendlyError(parsed.error)); setPhase('form'); return; }
    setError(null); setPhase('loading');
    try {
      const res = await api.quickValidate(parsed.inputs);
      if (res.token && res.expires_at) saveClaim(res.token, res.expires_at);
      saveResult(parsed.inputs, res.report, Boolean(res.token));
      setReport(res.report); setSaveable(Boolean(res.token)); setPhase('result');
      requestAnimationFrame(() => { resultHeading.current?.focus(); window.scrollTo({ top: 0, behavior: 'smooth' }); });
    } catch (e) {
      setError(friendlyError(e)); setPhase('form');
    }
  }

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    // Restore after hydration (browser storage is not available during server rendering).
    Promise.resolve().then(() => {
      const draft = autoRun ? takeDraft() : null;
      if (draft?.idea) {
        const v = { idea: draft.idea };
        setInputs(v);
        run(v);
        return;
      }
      const prev = readResult();
      if (prev) { setInputs(prev.inputs); setReport(prev.report); setSaveable(prev.saveable); setPhase('result'); }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (phase === 'loading') {
    return (
      <div className="space-y-4" aria-live="polite" aria-busy="true">
        <p className="text-sm text-muted">Assessing your idea across seven parameters — this usually takes 15–60 seconds with AI.</p>
        <Skeleton className="h-6 w-1/3" /><Skeleton className="h-24" /><Skeleton className="h-40" /><Skeleton className="h-40" />
      </div>
    );
  }

  if (phase === 'result' && report) {
    return (
      <div className="space-y-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 ref={resultHeading} tabIndex={-1} className="text-2xl font-semibold tracking-tight outline-none">{report.kind === 'assessment' ? 'Your free 7-parameter assessment' : 'Your preliminary review'}</h2>
            <p className="mt-1 max-w-2xl text-sm text-muted">“{inputs.idea.length > 160 ? inputs.idea.slice(0, 157) + '…' : inputs.idea}”</p>
          </div>
          <Button variant="secondary" onClick={() => { clearResult(); setReport(null); setPhase('form'); }}>Validate another idea</Button>
        </div>

        <SaveCard saveable={saveable} />
        <ReportView report={report} idPrefix="quick" />
        <SaveCard saveable={saveable} />
      </div>
    );
  }

  return (
    <form className="space-y-5" noValidate onSubmit={(e) => { e.preventDefault(); run(inputs); }}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Describe your startup idea" htmlFor="qv-idea"
        hint={`${inputs.idea.length}/${QUICK_LIMITS.ideaMaxChars} · What problem, for whom, and how you would solve it.`}>
        <Textarea id="qv-idea" value={inputs.idea} rows={6} maxLength={QUICK_LIMITS.ideaMaxChars} placeholder={EXAMPLE}
          onChange={(e) => setInputs({ ...inputs, idea: e.target.value })} className="text-[15px]" />
      </Field>
      <button type="button" className="text-sm font-medium text-accent" aria-expanded={showMore} onClick={() => setShowMore((s) => !s)}>
        {showMore ? '− Hide optional details' : '+ Add optional details (better results)'}
      </button>
      {showMore && (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Who is it for?" htmlFor="qv-customer" optional>
            <Input id="qv-customer" maxLength={QUICK_LIMITS.fieldMaxChars} value={inputs.customer ?? ''} placeholder="e.g. Independent dental clinics"
              onChange={(e) => setInputs({ ...inputs, customer: e.target.value })} />
          </Field>
          <Field label="What do people use today?" htmlFor="qv-alt" optional>
            <Input id="qv-alt" maxLength={QUICK_LIMITS.fieldMaxChars} value={inputs.alternatives ?? ''} placeholder="e.g. Phone calls and paper diaries"
              onChange={(e) => setInputs({ ...inputs, alternatives: e.target.value })} />
          </Field>
        </div>
      )}
      <div className="flex flex-wrap items-center gap-4">
        <Button type="submit" size="lg">Validate my idea</Button>
        <span className="text-xs text-subtle">Free · no account needed</span>
      </div>
      <div className="space-y-2 rounded-md border border-line bg-surface px-4 py-3 text-xs leading-relaxed text-muted">
        <p><strong className="text-fg">Before you submit:</strong> {AI_DISCLOSURE_GEMINI_FREE}</p>
        <p>
          On Groundwork your description is stored privately for 7 days so you can save it to an account, then deleted. It is never
          shown to other people. If AI review is unavailable, a guided, non-AI assessment is produced instead. <Link href="/privacy" className="underline">Privacy</Link>
        </p>
      </div>
    </form>
  );
}

function SaveCard({ saveable }: { saveable: boolean }) {
  if (!saveable) {
    return <Alert tone="neutral">This review could not be saved for later, but you can still create a free account and start a Think project.</Alert>;
  }
  return (
    <div className="flex flex-col gap-4 rounded-lg border border-accent/30 bg-accent-soft p-5 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h3 className="font-semibold text-fg">Keep this review and go deeper</h3>
        <p className="mt-0.5 text-sm text-muted">Save it to your private Think workspace, ask follow-up questions, re-run it as the idea evolves, and explore the in-depth Deep Analysis.</p>
      </div>
      <div className="flex shrink-0 flex-wrap gap-2">
        <Link href="/register?from=quick" className={buttonClass('primary')}>Save — it’s free</Link>
        <Link href="/login?next=/app" className={buttonClass('secondary')}>Log in</Link>
      </div>
    </div>
  );
}
