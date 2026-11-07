import Link from 'next/link';
import { Logo } from './Logo';
import { buttonClass } from '@/components/ui/styles';

const NAV = [
  { href: '/validate', label: 'Quick Validate' },
  { href: '/think-workspace', label: 'Think' },
  { href: '/founder-matchmaking', label: 'Connect' },
  { href: '/how-it-works', label: 'How it works' },
  { href: '/faq', label: 'FAQ' },
];

export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b border-line bg-bg/90 backdrop-blur">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-4 px-4 sm:px-6">
        <Logo />
        <nav className="hidden items-center gap-6 text-sm text-muted md:flex" aria-label="Main">
          {NAV.map((n) => <Link key={n.href} href={n.href} className="hover:text-fg">{n.label}</Link>)}
        </nav>
        <div className="flex items-center gap-2">
          <Link href="/login" className={buttonClass('ghost', 'sm')}>Log in</Link>
          <Link href="/validate" className={buttonClass('primary', 'sm')}>Validate an idea</Link>
        </div>
      </div>
      <nav className="flex gap-5 overflow-x-auto border-t border-line px-4 py-2 text-sm text-muted md:hidden" aria-label="Main mobile">
        {NAV.map((n) => <Link key={n.href} href={n.href} className="whitespace-nowrap hover:text-fg">{n.label}</Link>)}
      </nav>
    </header>
  );
}
