import Link from 'next/link';
import { buttonClass } from '@/components/ui/styles';

export interface Section { heading: string; body: React.ReactNode }

export function ContentPage({ eyebrow, title, intro, sections, draftNotice, cta = true }: {
  eyebrow?: string; title: string; intro?: React.ReactNode; sections: Section[]; draftNotice?: boolean; cta?: boolean;
}) {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      {eyebrow && <p className="text-sm font-medium text-accent">{eyebrow}</p>}
      <h1 className="mt-2 text-3xl font-semibold tracking-tight text-fg sm:text-4xl">{title}</h1>
      {intro && <div className="mt-4 text-lg leading-relaxed text-muted">{intro}</div>}
      {draftNotice && (
        <div className="mt-6 rounded-md bg-warning-soft px-4 py-3 text-sm text-fg">
          <strong>Draft for legal review.</strong> This document has not yet been reviewed by a lawyer and must be finalised for
          each market served before public launch.
        </div>
      )}
      <div className="mt-10 space-y-10">
        {sections.map((s) => (
          <section key={s.heading}>
            <h2 className="text-lg font-semibold text-fg">{s.heading}</h2>
            <div className="mt-2 space-y-3 text-[15px] leading-relaxed text-muted [&_a]:text-accent [&_a]:underline [&_li]:ml-5 [&_li]:list-disc [&_strong]:text-fg">{s.body}</div>
          </section>
        ))}
      </div>
      {cta && (
        <div className="mt-14 flex flex-wrap gap-3 border-t border-line pt-8">
          <Link href="/register" className={buttonClass('primary')}>Join the network</Link>
          <Link href="/how-it-works" className={buttonClass('secondary')}>How it works</Link>
        </div>
      )}
    </article>
  );
}
