'use client';
import { useEffect, useState } from 'react';
import { Button } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { SITE_URL, SUPABASE_KEY, SUPABASE_URL } from '@/lib/env';

/**
 * Asks Supabase Auth which external providers are enabled, so we never send people to a
 * provider that is switched off (Supabase would answer with a raw JSON error page).
 */
function useGoogleEnabled(): boolean {
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

/** Renders the Google button plus an "or" divider — or nothing when Google sign-in is not enabled. */
export function GoogleButton({ next = '/app', label = 'Continue with Google' }: { next?: string; label?: string }) {
  const enabled = useGoogleEnabled();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!enabled) return null;
  return (
    <div className="space-y-4">
      <Button type="button" variant="secondary" className="w-full" loading={loading} onClick={async () => {
        setLoading(true); setError(null);
        const { error } = await getBrowserClient().auth.signInWithOAuth({
          provider: 'google',
          options: { redirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}` },
        });
        if (error) { setError('Google sign-in is not available right now.'); setLoading(false); }
      }}>
        <svg viewBox="0 0 24 24" className="size-4" aria-hidden><path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.3-2.1 3.5-5.2 3.5-8.7z"/><path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"/><path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z"/><path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"/></svg>
        {label}
      </Button>
      {error && <p className="text-sm text-danger">{error}</p>}
      <div className="flex items-center gap-3 text-xs text-subtle"><span className="h-px flex-1 bg-line" />or<span className="h-px flex-1 bg-line" /></div>
    </div>
  );
}
