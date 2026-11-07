import { requireSession } from '@/lib/session';
import { AppShell } from '@/components/app/AppShell';

/**
 * Think is usable straight after sign-up (progressive registration). The profile is only
 * required for Connect — see (connect)/layout.tsx — and enforced server-side by the RPCs.
 */
export default async function ShellLayout({ children }: { children: React.ReactNode }) {
  await requireSession();
  return <AppShell>{children}</AppShell>;
}
