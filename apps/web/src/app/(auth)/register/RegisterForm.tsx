'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { fieldErrors, signUpSchema } from '@groundwork/shared';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui';
import { GoogleButton } from '@/components/app/GoogleButton';
import { getBrowserClient } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/env';

export function RegisterForm() {
  const params = useSearchParams();
  const invite = params.get('invite');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', isAdult: false, acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = signUpSchema.safeParse(form);
    if (!parsed.success) return setErrors(fieldErrors(parsed));
    setErrors({}); setServerError(null); setLoading(true);
    const { error } = await getBrowserClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: {
        emailRedirectTo: `${SITE_URL}/auth/callback?next=/app/onboarding`,
        data: { full_name: parsed.data.fullName, is_adult: true, ...(invite && /^[a-f0-9]{12}$/.test(invite) ? { invite_code: invite } : {}) },
      },
    });
    setLoading(false);
    if (error) {
      setServerError(/registered|exists/i.test(error.message) ? 'An account with this email may already exist. Try logging in.' :
        /password/i.test(error.message) ? 'Please choose a stronger password.' : 'Could not create your account. Please try again.');
      return;
    }
    setSentTo(parsed.data.email);
  }

  if (sentTo) {
    return (
      <div>
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted">We sent a verification link to <strong className="text-fg">{sentTo}</strong>. Open it to verify your account and continue setting up your profile.</p>
        <p className="mt-4 text-sm text-muted">Didn’t get it? Check spam, or <button className="text-accent underline" onClick={() => setSentTo(null)}>try again</button>.</p>
      </div>
    );
  }

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) => setForm((f) => ({ ...f, [k]: v }));
  return (
    <>
      <h1 className="text-xl font-semibold">Join the network</h1>
      <p className="mt-1 text-sm text-muted">Free for founders and startup builders.</p>
      <div className="mt-6 space-y-4">
        <GoogleButton next="/app/onboarding" label="Sign up with Google" />
        <form onSubmit={submit} className="space-y-4" noValidate>
          {serverError && <Alert tone="danger">{serverError}</Alert>}
          <Field label="Full name" htmlFor="name" error={errors.fullName}><Input id="name" autoComplete="name" value={form.fullName} onChange={(e) => set('fullName', e.target.value)} /></Field>
          <Field label="Email" htmlFor="email" error={errors.email}><Input id="email" type="email" autoComplete="email" value={form.email} onChange={(e) => set('email', e.target.value)} /></Field>
          <Field label="Password" htmlFor="password" error={errors.password} hint="At least 10 characters with letters and numbers.">
            <Input id="password" type="password" autoComplete="new-password" value={form.password} onChange={(e) => set('password', e.target.value)} />
          </Field>
          <div className="space-y-3">
            <Checkbox checked={form.isAdult} onChange={(v) => set('isAdult', v)} label="I am 18 years of age or older" />
            {errors.isAdult && <p className="text-sm text-danger">{errors.isAdult}</p>}
            <Checkbox checked={form.acceptTerms} onChange={(v) => set('acceptTerms', v)}
              label={<>I agree to the <Link href="/terms" className="underline" target="_blank">Terms</Link>, <Link href="/privacy" className="underline" target="_blank">Privacy Policy</Link> and <Link href="/guidelines" className="underline" target="_blank">Community Guidelines</Link></>} />
            {errors.acceptTerms && <p className="text-sm text-danger">{errors.acceptTerms}</p>}
          </div>
          <Button type="submit" className="w-full" loading={loading}>Create account</Button>
        </form>
        <p className="text-center text-sm text-muted">Already a member? <Link href="/login" className="font-medium text-accent">Log in</Link></p>
      </div>
    </>
  );
}
