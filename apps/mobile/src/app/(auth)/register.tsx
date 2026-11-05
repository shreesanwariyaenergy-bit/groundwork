import * as WebBrowser from 'expo-web-browser';
import { router } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { fieldErrors, signUpSchema } from '@groundwork/shared';
import { Button, Input, Notice, Screen, Text } from '@/components/ui';
import { SITE_URL } from '@/lib/config';
import { signInWithGoogle } from '@/lib/oauth';
import { supabase } from '@/lib/supabase';
import { useTheme } from '@/lib/theme';

function Check({ checked, onToggle, children }: { checked: boolean; onToggle: () => void; children: React.ReactNode }) {
  const { c } = useTheme();
  return (
    <Pressable onPress={onToggle} accessibilityRole="checkbox" accessibilityState={{ checked }} style={{ flexDirection: 'row', gap: 10, alignItems: 'flex-start', minHeight: 44 }}>
      <View style={{ width: 22, height: 22, borderRadius: 4, borderWidth: 1.5, borderColor: checked ? c.accent : c.borderStrong, backgroundColor: checked ? c.accent : 'transparent', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        {checked && <Text variant="caption" color={c.onAccent}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>{children}</View>
    </Pressable>
  );
}

export default function Register() {
  const { c } = useTheme();
  const [f, setF] = useState({ fullName: '', email: '', password: '', isAdult: false, acceptTerms: false });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [serverError, setServerError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const open = (p: string) => SITE_URL && WebBrowser.openBrowserAsync(SITE_URL + p);

  if (sent) return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="title">Check your email</Text>
      <Text variant="muted">We sent a verification link to {f.email}. Open it, then come back and log in.</Text>
      <Button title="Go to log in" onPress={() => router.replace('/login')} />
    </Screen>
  );

  return (
    <Screen edges={['top', 'bottom']}>
      <Text variant="title">Join the network</Text>
      {serverError && <Notice tone="danger">{serverError}</Notice>}
      <Button title="Sign up with Google" variant="secondary" onPress={async () => { const r = await signInWithGoogle(); if (r === 'error') setServerError('Google sign-in is not available right now.'); }} />
      <Text variant="caption" style={{ textAlign: 'center' }}>or</Text>
      <Input label="Full name" value={f.fullName} onChangeText={(v) => setF({ ...f, fullName: v })} autoComplete="name" error={errors.fullName} />
      <Input label="Email" value={f.email} onChangeText={(v) => setF({ ...f, email: v })} autoCapitalize="none" keyboardType="email-address" autoComplete="email" error={errors.email} />
      <Input label="Password" value={f.password} onChangeText={(v) => setF({ ...f, password: v })} secureTextEntry autoComplete="new-password" hint="At least 10 characters with letters and numbers." error={errors.password} />
      <Check checked={f.isAdult} onToggle={() => setF({ ...f, isAdult: !f.isAdult })}><Text variant="body">I am 18 years of age or older</Text></Check>
      {errors.isAdult && <Text variant="small" color={c.danger}>{errors.isAdult}</Text>}
      <Check checked={f.acceptTerms} onToggle={() => setF({ ...f, acceptTerms: !f.acceptTerms })}>
        <Text variant="body">I agree to the <Text variant="body" color={c.accent} style={{ textDecorationLine: 'underline' }}>{'Terms'}</Text>, Privacy Policy and Community Guidelines</Text>
      </Check>
      <View style={{ flexDirection: 'row', gap: 16 }}>
        <Pressable onPress={() => open('/terms')}><Text variant="small" color={c.accent}>Read Terms</Text></Pressable>
        <Pressable onPress={() => open('/privacy')}><Text variant="small" color={c.accent}>Privacy</Text></Pressable>
        <Pressable onPress={() => open('/guidelines')}><Text variant="small" color={c.accent}>Guidelines</Text></Pressable>
      </View>
      {errors.acceptTerms && <Text variant="small" color={c.danger}>{errors.acceptTerms}</Text>}
      <Button title="Create account" loading={loading} onPress={async () => {
        const p = signUpSchema.safeParse(f);
        if (!p.success) return setErrors(fieldErrors(p));
        setErrors({}); setLoading(true); setServerError(null);
        const { error } = await supabase.auth.signUp({ email: p.data.email, password: p.data.password, options: {
          emailRedirectTo: SITE_URL ? `${SITE_URL}/auth/callback?next=/app/onboarding` : undefined,
          data: { full_name: p.data.fullName, is_adult: true },
        } });
        setLoading(false);
        if (error) setServerError(/registered|exists/i.test(error.message) ? 'An account with this email may already exist.' : 'Could not create your account. Please try again.');
        else setSent(true);
      }} />
      <Button title="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
