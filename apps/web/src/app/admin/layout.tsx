import Link from 'next/link';
import { notFound } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AppProvider } from '@/components/app/AppProvider';
import { Logo } from '@/components/marketing/Logo';

// Always evaluate the session per request (never prerender authenticated areas).
export const dynamic = 'force-dynamic';

export const metadata = { title: 'Admin', robots: { index: false } };

const NAV = [
  ['/admin', 'Overview'], ['/admin/users', 'Users'], ['/admin/reports', 'Reports'], ['/admin/deletions', 'Deletion requests'],
  ['/admin/ai', 'AI providers & usage'], ['/admin/flags', 'Feature flags & limits'], ['/admin/audit', 'Audit log'],
];

/** Server-side gate. Every admin RPC re-checks the role in Postgres, so hiding UI is never the security boundary. */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, adminRole } = await requireSession();
  if (!adminRole) notFound();
  return (
    <AppProvider user={user} initialProfile={profile} isStaff>
      <div className="min-h-dvh bg-bg">
        <header className="border-b border-line">
          <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6">
            <div className="flex items-center gap-3"><Logo href="/admin" /><span className="rounded-sm bg-danger-soft px-1.5 py-0.5 text-xs font-medium text-danger">Admin · {adminRole}</span></div>
            <Link href="/app" className="text-sm text-muted hover:text-fg">Back to app</Link>
          </div>
          <nav className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6" aria-label="Admin">
            {NAV.map(([href, label]) => <Link key={href} href={href} className="whitespace-nowrap border-b-2 border-transparent px-3 py-2 text-sm text-muted hover:text-fg">{label}</Link>)}
          </nav>
        </header>
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">{children}</main>
      </div>
    </AppProvider>
  );
}
