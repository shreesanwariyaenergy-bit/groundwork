import { router } from 'expo-router';
import { useState } from 'react';
import { email as emailSchema } from '@groundwork/shared';
import { Button, Input, Notice, Screen, Text } from '@/components/ui';
import { SITE_URL } from '@/lib/config';
import { supabase } from '@/lib/supabase';

export default function Forgot() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="title">Reset password</Text>
      {sent ? <Notice tone="accent">If an account exists for that address, we sent a reset link. Open it to choose a new password, then log in here.</Notice> : (
        <>
          {error && <Notice tone="danger">{error}</Notice>}
          <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" />
          <Button title="Send reset link" onPress={async () => {
            const p = emailSchema.safeParse(email);
            if (!p.success) return setError('Enter a valid email');
            await supabase.auth.resetPasswordForEmail(p.data, { redirectTo: SITE_URL ? `${SITE_URL}/auth/callback?next=/reset-password` : undefined });
            setSent(true);
          }} />
        </>
      )}
      <Button title="Back to log in" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
