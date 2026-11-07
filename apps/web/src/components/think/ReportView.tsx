'use client';
import { useEffect, useState } from 'react';
import { EVIDENCE_LABELS, assumptionsSummary, labelCounts, type EvidenceLabel, type ThinkReport } from '@groundwork/shared';
import { Badge, cn } from '@/components/ui';

export const LABEL_TONE: Record<EvidenceLabel, 'neutral' | 'accent' | 'warning' | 'danger'> = {
  verified: 'accent', estimate: 'warning', assumption: 'warning', hypothesis: 'neutral', recommendation: 'accent', question: 'neutral',
};

const SIGNAL_TEXT: Record<string, string> = {
  strong: 'Strong first impression',
  promising: 'Promising, with open questions',
  uncertain: 'Uncertain — key questions first',
  weak: 'Weak as described — rethink the core',
};

function useActiveSection(ids: string[]) {
  const [active, setActive] = useState(ids[0] ?? '');
  useEffect(() => {
    const els = ids.map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    if (!els.length || typeof IntersectionObserver === 'undefined') return;
    const obs = new IntersectionObserver((entries) => {
      const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible[0]) setActive(visible[0].target.id);
    }, { rootMargin: '-80px 0px -60% 0px' });
    els.forEach((el) => obs.observe(el));
    return () => obs.disconnect();
  }, [ids]);
  return active;
}

export function ReportView({ report, idPrefix = 'sec' }: { report: ThinkReport; idPrefix?: string }) {
  const quick = report.kind === 'quick';
  const ids = report.sections.map((s) => `${idPrefix}-${s.key}`);
  const active = useActiveSection(ids);
  const bets = assumptionsSummary(report, quick ? 6 : 8);
  const counts = labelCounts(report);
  const labels = (Object.keys(EVIDENCE_LABELS) as EvidenceLabel[]).filter((l) => counts[l] > 0);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone={quick ? 'warning' : 'neutral'}>{quick ? 'Preliminary · 5 sections' : `Full analysis · ${report.sections.length} sections`}</Badge>
        <Badge tone={report.generated_by === 'ai' ? 'accent' : 'neutral'}>{report.generated_by === 'ai' ? 'AI-generated' : 'Guided · no AI'}</Badge>
        {report.overall_signal && <span className="text-muted">AI first impression: <strong className="text-fg">{SIGNAL_TEXT[report.overall_signal]}</strong></span>}
      </div>
      <p className="rounded-md bg-surface px-4 py-3 text-sm text-muted">{report.disclaimer}</p>

      {/* What you're betting on */}
      {bets.length > 0 && (
        <section aria-labelledby={`${idPrefix}-bets`} className="rounded-lg border border-warning/30 bg-warning-soft/60 p-4 sm:p-5">
          <h3 id={`${idPrefix}-bets`} className="text-sm font-semibold text-fg">What this idea is betting on</h3>
          <p className="mt-0.5 text-xs text-muted">Assumptions and hypotheses from this report. Test the riskiest one first.</p>
          <ol className="mt-3 space-y-2">
            {bets.map((b, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-raised text-[11px] font-semibold text-muted tabular-nums">{i + 1}</span>
                <span><span className="text-fg">{b.text}</span> <span className="text-xs text-subtle">· {b.section}</span></span>
              </li>
            ))}
          </ol>
        </section>
      )}

      <div className="lg:grid lg:grid-cols-[13rem_1fr] lg:gap-8">
        {/* Section navigation */}
        <nav aria-label="Report sections" className="mb-4 lg:mb-0">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:sticky lg:top-20 lg:flex-col lg:gap-0.5 lg:overflow-visible">
            {report.sections.map((s, i) => {
              const id = ids[i]!;
              return (
                <a key={s.key} href={`#${id}`} aria-current={active === id ? 'true' : undefined}
                  className={cn('whitespace-nowrap rounded-md px-2.5 py-1.5 text-xs lg:whitespace-normal lg:text-sm',
                    active === id ? 'bg-surface font-medium text-fg' : 'text-muted hover:text-fg')}>
                  <span className="mr-1.5 text-subtle tabular-nums">{String(i + 1).padStart(2, '0')}</span>{s.title}
                </a>
              );
            })}
            {labels.length > 0 && (
              <div className="mt-4 hidden border-t border-line pt-3 lg:block">
                <div className="mb-2 text-xs font-medium text-subtle">Evidence labels</div>
                <ul className="space-y-1.5">
                  {labels.map((l) => (
                    <li key={l} className="flex items-center justify-between gap-2 text-xs" title={EVIDENCE_LABELS[l].description}>
                      <Badge tone={LABEL_TONE[l]}>{EVIDENCE_LABELS[l].name}</Badge><span className="tabular-nums text-subtle">{counts[l]}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </nav>

        {/* Sections */}
        <div className="min-w-0 space-y-6">
          {report.sections.map((s, i) => (
            <section key={s.key} id={ids[i]} className="scroll-mt-24 border-t border-line pt-5 first:border-t-0 first:pt-0" aria-labelledby={`${ids[i]}-h`}>
              <h3 id={`${ids[i]}-h`} className="flex flex-wrap items-center gap-2 text-base font-semibold">
                <span className="text-subtle tabular-nums">{String(i + 1).padStart(2, '0')}</span>{s.title}
                {s.preliminary && !quick && <Badge tone="warning">Preliminary</Badge>}
              </h3>
              {s.summary && <p className="mt-2 text-[15px] leading-relaxed text-fg">{s.summary}</p>}
              {s.points.length > 0 && (
                <ul className="mt-3 space-y-2.5">
                  {s.points.map((p, j) => (
                    <li key={j} className="flex flex-col gap-1 text-sm leading-relaxed sm:flex-row sm:gap-3">
                      <span className="shrink-0 sm:w-32 sm:pt-0.5"><Badge tone={LABEL_TONE[p.label]}>{EVIDENCE_LABELS[p.label].name}</Badge></span>
                      <span className="text-fg">{p.text}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          ))}
          {report.sources.length > 0 && (
            <section className="border-t border-line pt-5">
              <h3 className="text-base font-semibold">Sources</h3>
              <ul className="mt-2 space-y-1 text-sm">{report.sources.map((s) => <li key={s.id}><a href={s.url} target="_blank" rel="noopener noreferrer" className="text-accent underline">{s.name}</a> <span className="text-subtle">retrieved {s.retrieved_at}</span></li>)}</ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
