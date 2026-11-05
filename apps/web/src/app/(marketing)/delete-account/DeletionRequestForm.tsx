'use client';
import { useState } from 'react';
import { email as emailSchema } from '@groundwork/shared';
import { Alert, Button, Field, Input, Textarea } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';

export function DeletionRequestForm() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  if (state === 'done') return <Alert tone="accent" title="Request received">If this email belongs to an account, we will contact you to confirm the deletion.</Alert>;
  return (
    <form className="mt-4 space-y-3" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const p = emailSchema.safeParse(email);
      if (!p.success) return setError('Enter a valid email');
      setState('loading'); setError(null);
      const { error } = await getBrowserClient().rpc('submit_deletion_request', { p_email: p.data, p_note: note.trim() || null });
      if (error) { setState('error'); setError('Could not submit the request. Please email support.'); return; }
      setState('done');
    }}>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Account email" htmlFor="del-email"><Input id="del-email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
      <Field label="Anything we should know?" htmlFor="del-note" optional><Textarea id="del-note" value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="min-h-16" /></Field>
      <Button type="submit" variant="secondary" loading={state === 'loading'}>Request deletion</Button>
    </form>
  );
}
