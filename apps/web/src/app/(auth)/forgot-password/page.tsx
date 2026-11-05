'use client';
import Link from 'next/link';
import { useState } from 'react';
import { email as emailSchema } from '@groundwork/shared';
import { Alert, Button, Field, Input } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/env';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'sent'>('idle');
  const [error, setError] = useState<string | null>(null);
  return state === 'sent' ? (
    <div>
      <h1 className="text-xl font-semibold">Check your email</h1>
      <p className="mt-2 text-sm text-muted">If an account exists for that address, we have sent a link to reset your password.</p>
      <Link href="/login" className="mt-6 inline-block text-sm text-accent">Back to log in</Link>
    </div>
  ) : (
    <form className="space-y-4" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const p = emailSchema.safeParse(email);
      if (!p.success) return setError('Enter a valid email');
      setState('loading'); setError(null);
      await getBrowserClient().auth.resetPasswordForEmail(p.data, { redirectTo: `${SITE_URL}/auth/callback?next=/reset-password` });
      setState('sent'); // same response whether or not the account exists
    }}>
      <h1 className="text-xl font-semibold">Reset your password</h1>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="Email" htmlFor="email"><Input id="email" type="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" /></Field>
      <Button type="submit" className="w-full" loading={state === 'loading'}>Send reset link</Button>
      <Link href="/login" className="block text-center text-sm text-muted">Back to log in</Link>
    </form>
  );
}
