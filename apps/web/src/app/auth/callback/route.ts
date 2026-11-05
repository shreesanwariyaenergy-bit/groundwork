import { NextResponse, type NextRequest } from 'next/server';
import type { EmailOtpType } from '@supabase/supabase-js';
import { getServerClient } from '@/lib/supabase/server';

/** Handles OAuth (PKCE `code`) and email links (`token_hash` + `type`). */
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const rawNext = url.searchParams.get('next') ?? '/app';
  const next = rawNext.startsWith('/') && !rawNext.startsWith('//') ? rawNext : '/app';
  const supabase = await getServerClient();

  const code = url.searchParams.get('code');
  const tokenHash = url.searchParams.get('token_hash');
  const type = url.searchParams.get('type') as EmailOtpType | null;

  let ok = false;
  if (code) ok = !(await supabase.auth.exchangeCodeForSession(code)).error;
  else if (tokenHash && type) ok = !(await supabase.auth.verifyOtp({ token_hash: tokenHash, type })).error;

  return NextResponse.redirect(new URL(ok ? next : '/login?error=link_invalid', request.url));
}
