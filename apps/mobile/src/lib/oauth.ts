import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { supabase } from './supabase';

WebBrowser.maybeCompleteAuthSession();

/** Google sign-in via the system browser + PKCE, returning to groundwork://auth/callback. */
export async function signInWithGoogle(): Promise<'ok' | 'cancelled' | 'error'> {
  const redirectTo = Linking.createURL('auth/callback');
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo, skipBrowserRedirect: true } });
  if (error || !data.url) return 'error';
  const res = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
  if (res.type !== 'success') return 'cancelled';
  const code = new URL(res.url).searchParams.get('code');
  if (!code) return 'error';
  const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
  return exErr ? 'error' : 'ok';
}
