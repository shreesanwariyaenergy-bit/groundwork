'use client';
import { useEffect, useRef, useState } from 'react';
import {
  BUSINESS_CATEGORIES, DEEP_DELIVERABLES, DEEP_QUESTIONS, DEEP_STAGES, DEEP_STAGE_LABELS, friendlyError, sanitizeDeepAnswers,
  type Api, type BusinessCategory, type DeepAnswers, type ThinkAnalysis, type ThinkStatus,
} from '@groundwork/shared';
import { Alert, Badge, Button, Card, Field, Input, Select, Spinner, Textarea, cn } from '@/components/ui';

const PART_TITLES = ['Problem, customers, market and competition', 'Strategy, pricing, economics and go-to-market', 'Execution, risk, experiments and roadmap'];

/** What the paid report adds beyond the free assessment — factual description of the product, not marketing claims. */
const DIFFERENCES = [
  'A new analysis built from your answers — not an expansion of the free assessment, and it may disagree with it.',
  'Live web research with numbered, linked sources for market, competitor, pricing and regulatory findings.',
  'Bottom-up TAM / SAM / SOM with every step and assumption shown.',
  'Frameworks for your business type (e.g. D2C contribution margin, SaaS CAC payback, marketplace take rate).',
  'Unit economics, financial scenarios, a first-100-customers plan and a 30/60/90-day roadmap.',
];

export function DeepPreview({ status, onContinue }: { status: ThinkStatus; onContinue: () => void }) {
  const deep = status.deep;
  const [all, setAll] = useState(false);
  const enabled = Boolean(deep?.enabled);
  const hasAccess = (deep?.entitlements_available ?? 0) > 0;
  const devPreview = enabled && hasAccess && !deep?.payments_enabled;
  return (
    <Card className="p-5 sm:p-7">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h2 className="text-lg font-semibold">Groundwork Deep Analysis</h2>{!enabled && <Badge>Coming soon</Badge>}</div>
          <p className="mt-1 max-w-2xl text-sm text-muted">A personalised, research-grounded investigation of the opportunity: 24 sections across market, competition, economics and execution.</p>
        </div>
        <div className="text-right">
          <div className="text-xs text-subtle">Price</div>
          <div className="text-base font-semibold">{deep?.price_label || 'To be announced'}</div>
        </div>
      </div>

      <ul className="mt-5 grid gap-2 text-sm sm:grid-cols-2">
        {DIFFERENCES.map((d) => <li key={d} className="flex gap-2"><span aria-hidden className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />{d}</li>)}
      </ul>

      <div className="mt-6">
        <h3 className="text-sm font-semibold">All deliverables</h3>
        <div className="mt-3 grid gap-4 md:grid-cols-3">
          {[1, 2, 3].map((part) => {
            const items = DEEP_DELIVERABLES.filter((d) => d.part === part);
            return (
              <div key={part} className="rounded-md border border-line p-3">
                <div className="text-xs font-medium text-subtle">{PART_TITLES[part - 1]}</div>
                <ol className="mt-2 space-y-1.5 text-sm">
                  {(all ? items : items.slice(0, 4)).map((d) => (
                    <li key={d.key} title={d.description}>
                      <span className="text-fg">{d.title}</span>{d.research && <span className="ml-1 text-xs text-accent">· researched</span>}
                      {all && <p className="text-xs text-muted">{d.description}</p>}
                    </li>
                  ))}
                </ol>
              </div>
            );
          })}
        </div>
        <button type="button" className="mt-2 text-sm font-medium text-accent" aria-expanded={all} onClick={() => setAll((v) => !v)}>{all ? 'Show less' : 'Show all 24 deliverables with descriptions'}</button>
      </div>

      <div className="mt-6 border-t border-line pt-5">
        {!enabled ? (
          <p className="text-sm text-muted">Deep Analysis is not available yet. Your free assessment stays available and private.</p>
        ) : devPreview ? (
          <div className="space-y-3">
            <Alert tone="warning" title="Development preview">You have test access granted by Groundwork. No payment is taken — purchasing is not live yet. Generating a report uses one test access.</Alert>
            <Button onClick={onContinue} disabled={!status.ai_available}>Continue — answer a few questions</Button>
            {!status.ai_available && <p className="text-sm text-muted">AI is unavailable right now, so Deep Analysis cannot run.</p>}
          </div>
        ) : hasAccess ? (
          <Button onClick={onContinue} disabled={!status.ai_available}>Continue — answer a few questions</Button>
        ) : (
          <div className="flex flex-wrap items-center gap-3">
            <Button disabled>Purchase — not available yet</Button>
            <span className="text-sm text-muted">Purchasing is not live yet. No payment can be taken.</span>
          </div>
        )}
      </div>
    </Card>
  );
}

export function DeepQuestions({ defaultCategory, defaultCustomer, onSubmit, onCancel }: {
  defaultCategory: BusinessCategory | null; defaultCustomer?: string;
  onSubmit: (answers: DeepAnswers) => Promise<void>; onCancel: () => void;
}) {
  const [v, setV] = useState<Record<string, string>>({ category: defaultCategory ?? '', target_customer: defaultCustomer ?? '' });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string, val: string) => setV((x) => ({ ...x, [k]: val }));
  return (
    <Card className="p-5 sm:p-7">
      <h2 className="text-lg font-semibold">A few questions first</h2>
      <p className="mt-1 text-sm text-muted">Your answers personalise the analysis. Only the first two are required — anything you skip is treated as an explicitly labelled assumption.</p>
      <form className="mt-5 space-y-4" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const parsed = sanitizeDeepAnswers(v);
        if (!parsed.ok) return setError(friendlyError(parsed.error));
        setBusy(true); setError(null);
        try { await onSubmit(parsed.answers); } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
      }}>
        {error && <Alert tone="danger">{error}</Alert>}
        <Field label="Type of business" htmlFor="dq-category" hint="Decides which economic and go-to-market frameworks are used.">
          <Select id="dq-category" value={v.category} onChange={(e) => set('category', e.target.value)} required>
            <option value="">Choose…</option>
            {BUSINESS_CATEGORIES.map((c) => <option key={c.value} value={c.value}>{c.label}</option>)}
          </Select>
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          {DEEP_QUESTIONS.map((q) => (
            <div key={q.key} className={q.long ? 'sm:col-span-2' : undefined}>
              <Field label={q.label} htmlFor={`dq-${q.key}`} optional={!q.essential}>
                {q.long
                  ? <Textarea id={`dq-${q.key}`} rows={3} maxLength={1500} value={v[q.key] ?? ''} placeholder={q.placeholder} onChange={(e) => set(q.key, e.target.value)} />
                  : <Input id={`dq-${q.key}`} maxLength={300} value={v[q.key] ?? ''} placeholder={q.placeholder} onChange={(e) => set(q.key, e.target.value)} />}
              </Field>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="submit" loading={busy}>Generate Deep Analysis</Button>
          <Button type="button" variant="ghost" onClick={onCancel} disabled={busy}>Back</Button>
        </div>
        <p className="text-xs text-subtle">Generation takes a few minutes and runs in stages. You can leave this page and come back to continue.</p>
      </form>
    </Card>
  );
}

/** Drives the staged generation (one server call per stage) and shows progress. Resumable. */
export function DeepProgress({ api, analysis, onFinished }: { api: Api; analysis: ThinkAnalysis; onFinished: () => void }) {
  const [stage, setStage] = useState<string>(analysis.progress?.stage ?? 'research');
  const [state, setState] = useState<'running' | 'paused' | 'failed'>('running');
  const [message, setMessage] = useState<string | null>(null);
  const stop = useRef(false);

  async function loop() {
    stop.current = false;
    setState('running'); setMessage(null);
    let networkErrors = 0;
    while (!stop.current) {
      try {
        const res = await api.deepStep(analysis.id);
        networkErrors = 0;
        if (res.stage) setStage(res.stage);
        if (res.status === 'completed') { onFinished(); return; }
        if (res.status === 'failed') {
          setState('failed');
          setMessage(`${friendlyError(res.error ?? 'ai_unavailable')} Your Deep Analysis access was returned, so you can try again.`);
          onFinished();
          return;
        }
        if (res.busy) { await new Promise((r) => setTimeout(r, 5000)); continue; }
        if (res.error) { setMessage(`${friendlyError(res.error)} Retrying…`); await new Promise((r) => setTimeout(r, 4000)); continue; }
        setMessage(null);
      } catch {
        networkErrors += 1;
        if (networkErrors >= 3) { setState('paused'); setMessage('Connection problem — generation is paused. Continue when you are back online.'); return; }
        await new Promise((r) => setTimeout(r, 3000));
      }
    }
  }

  useEffect(() => {
    // Defer the first network call until after the render that mounted this component.
    Promise.resolve().then(loop);
    return () => { stop.current = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [analysis.id]);

  const current = DEEP_STAGES.indexOf(stage as (typeof DEEP_STAGES)[number]);
  return (
    <Card className="p-5 sm:p-7" >
      <div aria-live="polite">
        <h2 className="text-lg font-semibold">Generating your Deep Analysis</h2>
        <p className="mt-1 text-sm text-muted">This runs in four stages and usually takes a few minutes. You can leave and come back — progress is saved.</p>
        <ol className="mt-5 space-y-3">
          {DEEP_STAGES.map((s, i) => {
            const done = current > i || stage === 'done';
            const active = current === i && state === 'running';
            return (
              <li key={s} className="flex items-center gap-3 text-sm">
                <span className={cn('flex size-6 items-center justify-center rounded-full border text-xs', done ? 'border-accent bg-accent text-on-accent' : active ? 'border-accent text-accent' : 'border-line text-subtle')}>
                  {done ? '✓' : active ? <Spinner className="size-3.5" /> : i + 1}
                </span>
                <span className={done ? 'text-muted' : active ? 'font-medium text-fg' : 'text-subtle'}>{DEEP_STAGE_LABELS[s]}</span>
              </li>
            );
          })}
        </ol>
        {message && <div className="mt-4"><Alert tone={state === 'failed' ? 'danger' : 'warning'}>{message}</Alert></div>}
        {state === 'paused' && <div className="mt-3"><Button onClick={loop}>Continue generation</Button></div>}
      </div>
    </Card>
  );
}
