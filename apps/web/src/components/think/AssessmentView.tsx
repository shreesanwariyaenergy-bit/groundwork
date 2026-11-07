'use client';
import { BUSINESS_CATEGORIES, RATING_LABELS, type AssessmentRating, type ThinkReport } from '@groundwork/shared';
import { Badge, cn } from '@/components/ui';

export const RATING_TONE: Record<AssessmentRating, 'accent' | 'warning' | 'danger' | 'neutral'> = {
  strong: 'accent', mixed: 'warning', weak: 'danger', insufficient: 'neutral',
};

const RATING_DOT: Record<AssessmentRating, string> = {
  strong: 'bg-accent', mixed: 'bg-warning', weak: 'bg-danger', insufficient: 'bg-line-strong',
};

export function RatingBadge({ rating }: { rating: AssessmentRating }) {
  return <span title={RATING_LABELS[rating].description}><Badge tone={RATING_TONE[rating]}>{RATING_LABELS[rating].name}</Badge></span>;
}

/** Free 7-parameter assessment. Qualitative ratings only — no scores. */
export function AssessmentView({ report, idPrefix = 'asm' }: { report: ThinkReport; idPrefix?: string }) {
  const a = report.assessment;
  if (!a) return null;
  const category = a.category ? BUSINESS_CATEGORIES.find((c) => c.value === a.category)?.label : null;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Badge tone="warning">Free assessment · 7 parameters</Badge>
        <Badge tone={report.generated_by === 'ai' ? 'accent' : 'neutral'}>{report.generated_by === 'ai' ? 'AI-generated' : 'Guided · no AI'}</Badge>
        {category && <span className="text-muted">Category: <span className="text-fg">{category}</span></span>}
      </div>
      <p className="rounded-md bg-surface px-4 py-3 text-sm text-muted">{report.disclaimer}</p>

      {/* Overview */}
      <section aria-labelledby={`${idPrefix}-overview`} className="rounded-lg border border-line bg-raised p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 id={`${idPrefix}-overview`} className="text-base font-semibold">Preliminary overall assessment</h3>
          <RatingBadge rating={a.overall.rating} />
        </div>
        {a.overall.summary && <p className="mt-2 text-[15px] leading-relaxed">{a.overall.summary}</p>}
        <ul className="mt-4 grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {a.parameters.map((p) => (
            <li key={p.key}>
              <a href={`#${idPrefix}-${p.key}`} className="flex items-center justify-between gap-3 rounded-md px-2 py-1.5 text-sm hover:bg-surface">
                <span className="flex items-center gap-2"><span className={cn('size-2 rounded-full', RATING_DOT[p.rating])} aria-hidden />{p.title}</span>
                <span className="text-xs text-muted">{RATING_LABELS[p.rating].name}</span>
              </a>
            </li>
          ))}
        </ul>
      </section>

      {/* Parameters */}
      <div className="space-y-4">
        {a.parameters.map((p, i) => (
          <section key={p.key} id={`${idPrefix}-${p.key}`} aria-labelledby={`${idPrefix}-${p.key}-h`} className="scroll-mt-24 rounded-lg border border-line p-4 sm:p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 id={`${idPrefix}-${p.key}-h`} className="text-base font-semibold"><span className="mr-2 text-subtle tabular-nums">{i + 1}</span>{p.title}</h3>
              <RatingBadge rating={p.rating} />
            </div>
            <p className="mt-2 text-[15px] font-medium leading-relaxed text-fg">{p.finding}</p>
            {p.explanation && <p className="mt-1 text-sm leading-relaxed text-muted">{p.explanation}</p>}
            <dl className="mt-3 grid gap-3 text-sm sm:grid-cols-2">
              {p.concern && <div className="rounded-md bg-danger-soft/40 px-3 py-2"><dt className="text-xs font-medium text-subtle">Biggest concern</dt><dd className="mt-0.5 text-fg">{p.concern}</dd></div>}
              {p.investigate && <div className="rounded-md bg-surface px-3 py-2"><dt className="text-xs font-medium text-subtle">Investigate next</dt><dd className="mt-0.5 text-fg">{p.investigate}</dd></div>}
            </dl>
          </section>
        ))}
      </div>

      {/* Summary */}
      <section aria-labelledby={`${idPrefix}-summary`} className="space-y-4">
        <h3 id={`${idPrefix}-summary`} className="text-base font-semibold">Summary</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <div className="rounded-lg border border-line p-4">
            <h4 className="text-sm font-semibold">Three main opportunities</h4>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">{a.opportunities.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </div>
          <div className="rounded-lg border border-line p-4">
            <h4 className="text-sm font-semibold">Three biggest concerns</h4>
            <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-sm">{a.concerns.map((t, i) => <li key={i}>{t}</li>)}</ol>
          </div>
        </div>
        {a.experiment.title && (
          <div className="rounded-lg border border-accent/30 bg-accent-soft p-4">
            <h4 className="text-sm font-semibold">Recommended validation experiment: {a.experiment.title}</h4>
            {a.experiment.method && <p className="mt-1 text-sm">{a.experiment.method}</p>}
            {a.experiment.success_signal && <p className="mt-2 text-sm"><span className="font-medium">Success signal:</span> {a.experiment.success_signal}</p>}
          </div>
        )}
        {a.next_decision && (
          <div className="rounded-lg border border-line p-4">
            <h4 className="text-sm font-semibold">Recommended next decision</h4>
            <p className="mt-1 text-sm">{a.next_decision}</p>
          </div>
        )}
      </section>
    </div>
  );
}
