import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/app', '/admin'];

/** Refreshes the Supabase session cookie and gates authenticated areas. Authorization is enforced again by RLS/RPCs. */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const path = request.nextUrl.pathname;
  const isProtected = PROTECTED.some((p) => path === p || path.startsWith(p + '/'));
  if (!url || !key) {
    if (isProtected) return NextResponse.redirect(new URL('/login?error=not_configured', request.url));
    return response;
  }

  const supabase = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        for (const { name, value } of list) request.cookies.set(name, value);
        response = NextResponse.next({ request });
        for (const { name, value, options } of list) response.cookies.set(name, value, options);
      },
    },
  });
  const { data } = await supabase.auth.getUser();

  if (isProtected && !data.user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', path + request.nextUrl.search);
    return NextResponse.redirect(login);
  }
  if (data.user && (path === '/login' || path === '/register')) {
    return NextResponse.redirect(new URL('/app', request.url));
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|txt|xml)$).*)'],
};
