'use client';
import { createBrowserClient } from '@supabase/ssr';
import type { SupabaseClient } from '@supabase/supabase-js';
import { SUPABASE_KEY, SUPABASE_URL } from '@/lib/env';

let client: SupabaseClient | null = null;

export function getBrowserClient(): SupabaseClient {
  if (!client) {
    client = createBrowserClient(SUPABASE_URL || 'http://localhost:54321', SUPABASE_KEY || 'missing-key');
  }
  return client;
}
