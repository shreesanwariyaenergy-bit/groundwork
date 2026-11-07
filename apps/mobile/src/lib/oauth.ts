import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { SUPABASE_KEY, SUPABASE_URL } from './config';
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

/** True only when Google sign-in is enabled in Supabase Auth (avoids opening a raw error page). */
export function useGoogleEnabled(): boolean {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    if (!SUPABASE_URL || !SUPABASE_KEY) return;
    let alive = true;
    fetch(`${SUPABASE_URL}/auth/v1/settings`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: { external?: { google?: boolean } } | null) => { if (alive) setEnabled(Boolean(s?.external?.google)); })
      .catch(() => {});
    return () => { alive = false; };
  }, []);
  return enabled;
}
