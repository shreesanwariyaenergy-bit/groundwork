import { redirect } from 'next/navigation';
import { requireSession } from '@/lib/session';
import { AppShell } from '@/components/app/AppShell';

export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireSession();
  if (!profile.onboarding_completed) redirect('/app/onboarding');
  return <AppShell>{children}</AppShell>;
}
