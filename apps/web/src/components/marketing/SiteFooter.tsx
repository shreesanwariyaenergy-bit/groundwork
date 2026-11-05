import Link from 'next/link';
import { BRAND } from '@groundwork/shared';
import { Logo } from './Logo';

const COLS = [
  { title: 'Product', links: [['/how-it-works', 'How it works'], ['/founder-matchmaking', 'Founder matchmaking'], ['/professional-matchmaking', 'Professional matchmaking'], ['/think-workspace', 'Think workspace']] },
  { title: 'Company', links: [['/about', 'About'], ['/faq', 'FAQ'], ['/contact', 'Contact']] },
  { title: 'Legal', links: [['/privacy', 'Privacy Policy'], ['/terms', 'Terms of Service'], ['/guidelines', 'Community Guidelines'], ['/delete-account', 'Delete your account']] },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-4">
        <div className="space-y-3">
          <Logo />
          <p className="text-sm text-muted">{BRAND.tagline}</p>
          <a href={`mailto:${BRAND.supportEmail}`} className="block text-sm text-muted hover:text-fg">{BRAND.supportEmail}</a>
        </div>
        {COLS.map((c) => (
          <div key={c.title}>
            <h3 className="text-sm font-semibold text-fg">{c.title}</h3>
            <ul className="mt-3 space-y-2 text-sm">
              {c.links.map(([href, label]) => <li key={href}><Link href={href!} className="text-muted hover:text-fg">{label}</Link></li>)}
            </ul>
          </div>
        ))}
      </div>
      <div className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-wrap justify-between gap-2 px-4 py-5 text-xs text-subtle sm:px-6">
          <span>© {new Date().getFullYear()} {BRAND.name}. All rights reserved.</span>
          <span>Available on the web and Android.</span>
        </div>
      </div>
    </footer>
  );
}
