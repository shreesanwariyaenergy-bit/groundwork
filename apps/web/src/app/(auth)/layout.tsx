import Link from 'next/link';
import { Logo } from '@/components/marketing/Logo';

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col bg-surface">
      <header className="mx-auto flex h-16 w-full max-w-6xl items-center px-4 sm:px-6"><Logo /></header>
      <main className="flex flex-1 items-start justify-center px-4 pb-16 pt-6 sm:pt-12">
        <div className="w-full max-w-md rounded-lg border border-line bg-raised p-6 sm:p-8">{children}</div>
      </main>
      <footer className="pb-8 text-center text-xs text-subtle">
        <Link href="/terms" className="hover:text-fg">Terms</Link> · <Link href="/privacy" className="hover:text-fg">Privacy</Link> · <Link href="/guidelines" className="hover:text-fg">Guidelines</Link>
      </footer>
    </div>
  );
}
