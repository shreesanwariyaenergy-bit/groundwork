'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Alert, Button, Field, Input } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';

/**
 * Verify an emailed one-time code on the device the person is already using.
 * Works across devices (no link to open) and does not depend on redirect URLs.
 *  - type 'signup': code from the "Confirm signup" email (password sign-up)
 *  - type 'email' : code from a passwordless sign-in email (signInWithOtp)
 */
export function EmailCodeForm({ email, type, next, onBack }: {
  email: string; type: 'signup' | 'email'; next: string; onBack?: () => void;
}) {
  const router = useRouter();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [cooldown, setCooldown] = useState(60);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldown]);

  async function verify(e: React.FormEvent) {
    e.preventDefault();
    const token = code.replace(/\s+/g, '');
    if (!/^\d{6,10}$/.test(token)) return setError('Enter the code from the email (numbers only).');
    setLoading(true); setError(null);
    const { error } = await getBrowserClient().auth.verifyOtp({ email, token, type });
    setLoading(false);
    if (error) {
      setError(/expired/i.test(error.message) ? 'That code has expired. Request a new one below.' : 'That code is not valid. Check the latest email and try again.');
      return;
    }
    router.replace(next);
    router.refresh();
  }

  async function resend() {
    setError(null); setNotice(null);
    const sb = getBrowserClient();
    const { error } = type === 'signup'
      ? await sb.auth.resend({ type: 'signup', email })
      : await sb.auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
    if (error) return setError(/rate|seconds/i.test(error.message) ? 'Please wait a minute before requesting another code.' : 'Could not send a new code. Please try again.');
    setNotice('A new code is on its way.');
    setCooldown(60);
  }

  return (
    <form onSubmit={verify} className="space-y-4" noValidate>
      <div>
        <h1 className="text-xl font-semibold">Enter your code</h1>
        <p className="mt-1 text-sm text-muted">We emailed a code to <strong className="text-fg">{email}</strong>. Enter it here — you can stay on this device.</p>
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {notice && <Alert tone="accent">{notice}</Alert>}
      <Field label="Verification code" htmlFor="otp">
        <Input id="otp" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} autoFocus
          value={code} onChange={(e) => setCode(e.target.value.replace(/[^\d]/g, ''))}
          className="h-12 text-center text-xl tracking-[0.4em] tabular-nums" placeholder="••••••" />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>Verify and continue</Button>
      <div className="flex items-center justify-between text-sm">
        <button type="button" className="text-muted hover:text-fg disabled:opacity-50" disabled={cooldown > 0} onClick={resend}>
          {cooldown > 0 ? `Resend code in ${cooldown}s` : 'Resend code'}
        </button>
        {onBack && <button type="button" className="text-muted hover:text-fg" onClick={onBack}>Use a different email</button>}
      </div>
      <p className="text-xs text-subtle">Can’t find it? Check spam. The code expires after a short time.</p>
    </form>
  );
}
