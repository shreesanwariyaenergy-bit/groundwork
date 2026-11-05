import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/env';

/** Server client bound to the request's auth cookies. Uses the publishable key + user JWT (RLS applies). */
export async function getServerClient() {
  const store = await cookies();
  return createServerClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_KEY || 'missing-key', {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        try {
          for (const { name, value, options } of list) store.set(name, value, options);
        } catch {
          // Called from a Server Component: the proxy refreshes the session instead.
        }
      },
    },
  });
}
