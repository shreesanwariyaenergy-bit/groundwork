'use client';
import { useState } from 'react';
import {
  EVIDENCE_LABELS, THINK_CONTEXT_FIELDS, fieldErrors, friendlyError, thinkProjectSchema, type EvidenceLabel, type ThinkReport,
} from '@groundwork/shared';
import { Alert, Badge, Button, Field, Input, Textarea } from '@/components/ui';

export function ProjectForm({ initial, onSubmit, submitLabel }: {
  initial?: { title: string; idea: string; context: Record<string, string> };
  onSubmit: (v: { title: string; idea: string; context: Record<string, string> }) => Promise<void>;
  submitLabel: string;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [idea, setIdea] = useState(initial?.idea ?? '');
  const [context, setContext] = useState<Record<string, string>>(initial?.context ?? {});
  const [showContext, setShowContext] = useState(Object.keys(initial?.context ?? {}).length > 0);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <form className="space-y-4" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const clean = Object.fromEntries(Object.entries(context).filter(([, v]) => v.trim()));
      const p = thinkProjectSchema.safeParse({ title, idea, context: clean });
      if (!p.success) return setErrors(fieldErrors(p));
      setErrors({}); setSaving(true); setServerError(null);
      try { await onSubmit(p.data as { title: string; idea: string; context: Record<string, string> }); } catch (err) { setServerError(friendlyError(err)); } finally { setSaving(false); }
    }}>
      <Field label="Project name" htmlFor="pt" error={errors.title}><Input id="pt" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Clinic scheduling assistant" /></Field>
      <Field label="Describe the idea" htmlFor="pi" error={errors.idea} hint={`${idea.length}/6000 · What problem, for whom, and how you would solve it.`}>
        <Textarea id="pi" value={idea} onChange={(e) => setIdea(e.target.value)} maxLength={6000} rows={7} />
      </Field>
      <button type="button" className="text-sm font-medium text-accent" onClick={() => setShowContext((s) => !s)} aria-expanded={showContext}>
        {showContext ? '− Hide optional context' : '+ Add optional context (improves the analysis)'}
      </button>
      {showContext && (
        <div className="grid gap-4 sm:grid-cols-2">
          {THINK_CONTEXT_FIELDS.map((c) => (
            <Field key={c.key} label={c.label} htmlFor={`ctx-${c.key}`} optional>
              <Input id={`ctx-${c.key}`} value={context[c.key] ?? ''} maxLength={500} placeholder={c.placeholder} onChange={(e) => setContext((x) => ({ ...x, [c.key]: e.target.value }))} />
            </Field>
          ))}
        </div>
      )}
      <Alert tone="neutral">Think projects are private to you. Avoid including confidential details you would not want processed by an external AI provider.</Alert>
      {serverError && <Alert tone="danger">{serverError}</Alert>}
      <Button type="submit" loading={saving}>{submitLabel}</Button>
    </form>
  );
}


const LABEL_TONE: Record<EvidenceLabel, 'neutral' | 'accent' | 'warning' | 'danger'> = {
  verified: 'accent', estimate: 'warning', assumption: 'warning', hypothesis: 'neutral', recommendation: 'accent', question: 'neutral',
};

export function ReportView({ report }: { report: ThinkReport }) {
  return (
    <div className="space-y-6">
      <Alert tone={report.generated_by === 'ai' ? 'warning' : 'neutral'} title={report.generated_by === 'ai' ? 'AI-generated — verify before relying on it' : 'Basic checklist (no AI)'}>
        {report.disclaimer}
      </Alert>
      {report.overall_signal && (
        <p className="text-sm text-muted">Overall signal from the AI: <strong className="text-fg capitalize">{report.overall_signal}</strong> — an opinion, not a prediction.</p>
      )}
      <nav aria-label="Report sections" className="flex flex-wrap gap-1.5">
        {report.sections.map((s) => <a key={s.key} href={`#sec-${s.key}`} className="rounded-sm border border-line px-2 py-0.5 text-xs text-muted hover:text-fg">{s.title}</a>)}
      </nav>
      <div className="flex flex-wrap gap-3 text-xs text-muted">
        {(Object.keys(EVIDENCE_LABELS) as EvidenceLabel[]).filter((l) => l !== 'verified' || report.research_performed).map((l) => (
          <span key={l} className="flex items-center gap-1"><Badge tone={LABEL_TONE[l]}>{EVIDENCE_LABELS[l].name}</Badge>{EVIDENCE_LABELS[l].description}</span>
        ))}
      </div>
      {report.sections.map((s, i) => (
        <section key={s.key} id={`sec-${s.key}`} className="scroll-mt-20 border-t border-line pt-5">
          <h3 className="flex flex-wrap items-center gap-2 text-base font-semibold">
            <span className="text-subtle tabular-nums">{String(i + 1).padStart(2, '0')}</span>{s.title}
            {s.preliminary && <Badge tone="warning">Preliminary</Badge>}
          </h3>
          {s.summary && <p className="mt-2 text-[15px] leading-relaxed text-fg">{s.summary}</p>}
          {s.points.length > 0 && (
            <ul className="mt-3 space-y-2">
              {s.points.map((p, j) => (
                <li key={j} className="flex gap-2 text-sm leading-relaxed">
                  <span className="shrink-0 pt-0.5"><Badge tone={LABEL_TONE[p.label]}>{EVIDENCE_LABELS[p.label].name}</Badge></span>
                  <span className="text-fg">{p.text}</span>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
      {report.sources.length > 0 && (
        <section className="border-t border-line pt-5">
          <h3 className="text-base font-semibold">Sources</h3>
          <ul className="mt-2 space-y-1 text-sm">{report.sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{s.name}</a> <span className="text-subtle">retrieved {s.retrieved_at}</span></li>)}</ul>
        </section>
      )}
    </div>
  );
}
