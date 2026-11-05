import Link from 'next/link';
import { BRAND } from '@groundwork/shared';

export function Logo({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="inline-flex items-center gap-2 font-semibold tracking-tight text-fg" aria-label={`${BRAND.name} home`}>
      <svg viewBox="0 0 32 32" className="size-6" aria-hidden>
        <rect width="32" height="32" rx="7" fill="currentColor" />
        <path d="M8 22h16M8 16h10M8 10h16" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round" />
      </svg>
      {BRAND.name}
    </Link>
  );
}
