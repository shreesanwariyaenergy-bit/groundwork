'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { signInSchema, firstError } from '@groundwork/shared';
import { Alert, Button, Field, Input } from '@/components/ui';
import { GoogleButton } from '@/components/app/GoogleButton';
import { EmailCodeForm } from '@/components/app/EmailCodeForm';
import { getBrowserClient } from '@/lib/supabase/client';

function safeNext(v: string | null) {
  return v && v.startsWith('/') && !v.startsWith('//') ? v : '/app';
}

export function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const next = safeNext(params.get('next'));
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(
    params.get('error') === 'not_configured' ? 'The app is not connected to its backend yet (missing Supabase environment variables).' :
    params.get('error') ? 'That sign-in link is invalid or has expired.' : null,
  );
  const [loading, setLoading] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false);
  const [codeFor, setCodeFor] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setError(firstError(parsed));
    setLoading(true); setError(null);
    const { error } = await getBrowserClient().auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      const notConfirmed = /confirm/i.test(error.message);
      setUnconfirmed(notConfirmed);
      setError(notConfirmed ? 'Your email is not verified yet. We can send you a code to verify it here.' : 'Incorrect email or password.');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function sendVerificationCode() {
    setLoading(true);
    const { error } = await getBrowserClient().auth.resend({ type: 'signup', email: email.trim().toLowerCase() });
    setLoading(false);
    if (error) return setError(/rate|seconds/i.test(error.message) ? 'Please wait a minute before requesting another code.' : 'Could not send a code. Please try again.');
    setCodeFor(email.trim().toLowerCase());
  }

  if (codeFor) return <EmailCodeForm email={codeFor} type="signup" next={next} onBack={() => setCodeFor(null)} />;

  return (
    <>
      <h1 className="text-xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back.</p>
      <div className="mt-6 space-y-4">
        <GoogleButton next={next} />
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          {unconfirmed && <Button type="button" variant="secondary" className="w-full" loading={loading} onClick={sendVerificationCode}>Send me a verification code</Button>}
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password" htmlFor="password"><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <div className="flex justify-end"><Link href="/forgot-password" className="text-sm text-muted hover:text-fg">Forgot password?</Link></div>
          <Button type="submit" className="w-full" loading={loading}>Log in</Button>
        </form>
        <p className="text-center text-sm text-muted">New here? <Link href="/register" className="font-medium text-accent">Create an account</Link></p>
      </div>
    </>
  );
}
