import { requireSession } from '@/lib/session';
import { AppProvider } from '@/components/app/AppProvider';
import { ClaimQuickReport } from '@/components/app/ClaimQuickReport';

// Always evaluate the session per request (never prerender authenticated areas).
export const dynamic = 'force-dynamic';

export const metadata = { robots: { index: false } };

export default async function AppRootLayout({ children }: { children: React.ReactNode }) {
  const { user, profile, adminRole } = await requireSession();
  return <AppProvider user={user} initialProfile={profile} isStaff={!!adminRole}><ClaimQuickReport />{children}</AppProvider>;
}
