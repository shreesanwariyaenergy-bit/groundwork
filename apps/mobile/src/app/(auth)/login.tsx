import { Link, router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { signInSchema, firstError } from '@groundwork/shared';
import { Button, Input, Notice, Screen, Text } from '@/components/ui';
import { signInWithGoogle } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

export default function Login() {
  const { c } = useTheme();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="title">Log in</Text>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button title="Continue with Google" variant="secondary" onPress={async () => {
        setError(null);
        const r = await signInWithGoogle();
        if (r === 'error') setError('Google sign-in is not available right now.');
      }} />
      <Text variant="caption" style={{ textAlign: 'center' }}>or</Text>
      <Input label="Email" value={email} onChangeText={setEmail} autoCapitalize="none" autoComplete="email" keyboardType="email-address" textContentType="emailAddress" />
      <Input label="Password" value={password} onChangeText={setPassword} secureTextEntry autoComplete="current-password" textContentType="password" />
      <Button title="Log in" loading={loading} onPress={async () => {
        const p = signInSchema.safeParse({ email, password });
        if (!p.success) return setError(firstError(p));
        setLoading(true); setError(null);
        const { error } = await supabase.auth.signInWithPassword(p.data);
        setLoading(false);
        if (error) setError(/confirm/i.test(error.message) ? 'Please verify your email first — check your inbox.' : 'Incorrect email or password.');
      }} />
      <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
        <Link href="/forgot" style={{ color: c.textMuted, fontSize: 14 }}>Forgot password?</Link>
        <Link href="/register" style={{ color: c.accent, fontSize: 14 }}>Create account</Link>
      </View>
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
