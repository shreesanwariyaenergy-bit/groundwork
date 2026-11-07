'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { email as emailSchema, fieldErrors, signUpSchema } from '@groundwork/shared';
import { Alert, Button, Checkbox, Field, Input } from '@/components/ui';
import { GoogleButton } from '@/components/app/GoogleButton';
import { getBrowserClient } from '@/lib/supabase/client';
import { SITE_URL } from '@/lib/env';

/**
 * Progressive, email-first registration.
 * Step 1 asks only for an email (+ age and terms). A magic link signs the person in; profile details are
 * collected later, when they use Connect. A password-based sign-up remains available.
 */
export function RegisterForm() {
  const params = useSearchParams();
  const invite = params.get('invite');
  const fromQuick = params.get('from') === 'quick';
  const [mode, setMode] = useState<'link' | 'password'>('link');
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [isAdult, setIsAdult] = useState(false);
  const [acceptTerms, setAcceptTerms] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const next = fromQuick ? '/app/think' : '/app';
  const meta = { is_adult: true, ...(invite && /^[a-f0-9]{12}$/.test(invite) ? { invite_code: invite } : {}) };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setServerError(null);
    const errs: Record<string, string> = {};
    if (!isAdult) errs.isAdult = 'You must be 18 or older to join';
    if (!acceptTerms) errs.acceptTerms = 'Please accept the Terms and Privacy Policy';

    if (mode === 'link') {
      const p = emailSchema.safeParse(email);
      if (!p.success) errs.email = 'Enter a valid email';
      setErrors(errs);
      if (Object.keys(errs).length || !p.success) return;
      setLoading(true);
      const { error } = await getBrowserClient().auth.signInWithOtp({
        email: p.data,
        options: { shouldCreateUser: true, emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`, data: meta },
      });
      setLoading(false);
      if (error) return setServerError(/rate|seconds/i.test(error.message) ? 'Please wait a minute before requesting another link.' : 'Could not send the link. Please try again.');
      setSentTo(p.data);
      return;
    }

    const parsed = signUpSchema.safeParse({ fullName, email, password, isAdult, acceptTerms });
    if (!parsed.success) return setErrors({ ...errs, ...fieldErrors(parsed) });
    setErrors({}); setLoading(true);
    const { error } = await getBrowserClient().auth.signUp({
      email: parsed.data.email,
      password: parsed.data.password,
      options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`, data: { ...meta, full_name: parsed.data.fullName } },
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
      <div aria-live="polite">
        <h1 className="text-xl font-semibold">Check your email</h1>
        <p className="mt-2 text-sm text-muted">
          We sent a {mode === 'link' ? 'sign-in link' : 'verification link'} to <strong className="text-fg">{sentTo}</strong>.
          Open it on this device{fromQuick ? ' and your quick review will be saved to your workspace automatically' : ''}.
        </p>
        <p className="mt-4 text-sm text-muted">Didn’t get it? Check spam, or <button className="text-accent underline" onClick={() => setSentTo(null)}>try again</button>.</p>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-xl font-semibold">{fromQuick ? 'Save your review' : 'Create your free account'}</h1>
      <p className="mt-1 text-sm text-muted">
        {fromQuick ? 'Just your email — we’ll save the review to your private Think workspace.' : 'Start with your email. You can add profile details later.'}
      </p>
      <div className="mt-6 space-y-4">
        <GoogleButton next={next} label="Continue with Google" />
        <form onSubmit={submit} className="space-y-4" noValidate>
          {serverError && <Alert tone="danger">{serverError}</Alert>}
          {mode === 'password' && (
            <Field label="Full name" htmlFor="name" error={errors.fullName}><Input id="name" autoComplete="name" value={fullName} onChange={(e) => setFullName(e.target.value)} /></Field>
          )}
          <Field label="Email" htmlFor="email" error={errors.email}>
            <Input id="email" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
          </Field>
          {mode === 'password' && (
            <Field label="Password" htmlFor="password" error={errors.password} hint="At least 10 characters with letters and numbers.">
              <Input id="password" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
            </Field>
          )}
          <div className="space-y-3">
            <Checkbox checked={isAdult} onChange={setIsAdult} label="I am 18 years of age or older" />
            {errors.isAdult && <p className="text-sm text-danger">{errors.isAdult}</p>}
            <Checkbox checked={acceptTerms} onChange={setAcceptTerms}
              label={<>I agree to the <Link href="/terms" className="underline" target="_blank">Terms</Link>, <Link href="/privacy" className="underline" target="_blank">Privacy Policy</Link> and <Link href="/guidelines" className="underline" target="_blank">Community Guidelines</Link></>} />
            {errors.acceptTerms && <p className="text-sm text-danger">{errors.acceptTerms}</p>}
          </div>
          <Button type="submit" className="w-full" loading={loading}>{mode === 'link' ? 'Email me a sign-in link' : 'Create account'}</Button>
          <button type="button" className="block w-full text-center text-sm text-muted hover:text-fg" onClick={() => { setMode(mode === 'link' ? 'password' : 'link'); setErrors({}); }}>
            {mode === 'link' ? 'Prefer a password? Sign up with a password' : 'Use a sign-in link instead'}
          </button>
        </form>
        <p className="text-center text-sm text-muted">Already a member? <Link href={`/login?next=${encodeURIComponent(next)}`} className="font-medium text-accent">Log in</Link></p>
      </div>
    </>
  );
}
