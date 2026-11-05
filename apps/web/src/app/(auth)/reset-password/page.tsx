'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { password as passwordSchema, firstError } from '@groundwork/shared';
import { Alert, Button, Field, Input } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';

export default function ResetPasswordPage() {
  const router = useRouter();
  const [pw, setPw] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <form className="space-y-4" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const p = passwordSchema.safeParse(pw);
      if (!p.success) return setError(firstError(p));
      setLoading(true);
      const { error } = await getBrowserClient().auth.updateUser({ password: p.data });
      setLoading(false);
      if (error) return setError('Your reset link has expired. Request a new one.');
      router.replace('/app');
    }}>
      <h1 className="text-xl font-semibold">Choose a new password</h1>
      {error && <Alert tone="danger">{error}</Alert>}
      <Field label="New password" htmlFor="pw" hint="At least 10 characters with letters and numbers.">
        <Input id="pw" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
      </Field>
      <Button type="submit" className="w-full" loading={loading}>Update password</Button>
    </form>
  );
}
