'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { email as emailSchema, signInSchema, firstError } from '@groundwork/shared';
import { Alert, Button, Field, Input } from '@/components/ui';
import { GoogleButton } from '@/components/app/GoogleButton';
import { getBrowserClient } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/env';

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
  const [linkSent, setLinkSent] = useState(false);

  async function sendLink() {
    const p = emailSchema.safeParse(email);
    if (!p.success) return setError('Enter your email above, then request a link.');
    setLoading(true); setError(null);
    await getBrowserClient().auth.signInWithOtp({
      email: p.data,
      options: { shouldCreateUser: false, emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
    });
    setLoading(false);
    setLinkSent(true); // same message whether or not the account exists
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signInSchema.safeParse({ email, password });
    if (!parsed.success) return setError(firstError(parsed));
    setLoading(true); setError(null);
    const { error } = await getBrowserClient().auth.signInWithPassword(parsed.data);
    setLoading(false);
    if (error) {
      setError(/confirm/i.test(error.message) ? 'Please verify your email first — check your inbox for the link.' : 'Incorrect email or password.');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  return (
    <>
      <h1 className="text-xl font-semibold">Log in</h1>
      <p className="mt-1 text-sm text-muted">Welcome back.</p>
      <div className="mt-6 space-y-4">
        <GoogleButton next={next} />
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && <Alert tone="danger">{error}</Alert>}
          <Field label="Email" htmlFor="email"><Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required /></Field>
          <Field label="Password" htmlFor="password" hint="Signed up with a link? Use “Email me a sign-in link”."><Input id="password" type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required /></Field>
          <div className="flex justify-end"><Link href="/forgot-password" className="text-sm text-muted hover:text-fg">Forgot password?</Link></div>
          <Button type="submit" className="w-full" loading={loading}>Log in</Button>
          <Button type="button" variant="secondary" className="w-full" disabled={loading} onClick={sendLink}>Email me a sign-in link instead</Button>
          {linkSent && <Alert tone="accent">If an account exists for that email, a sign-in link is on its way. Open it on this device.</Alert>}
        </form>
        <p className="text-center text-sm text-muted">New here? <Link href="/register" className="font-medium text-accent">Create an account</Link></p>
      </div>
    </>
  );
}
