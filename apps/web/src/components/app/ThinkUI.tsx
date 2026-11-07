'use client';
import { useState } from 'react';
import { THINK_CONTEXT_FIELDS, fieldErrors, friendlyError, thinkProjectSchema } from '@groundwork/shared';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui';

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


export { ReportView } from '@/components/think/ReportView';
