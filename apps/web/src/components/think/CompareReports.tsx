'use client';
import { useState } from 'react';
import { RATING_LABELS, VERDICT_LABELS, type ThinkAnalysis } from '@groundwork/shared';
import { Modal, Select } from '@/components/ui';
import { RatingBadge } from './AssessmentView';

export function versionLabel(list: ThinkAnalysis[], a: ThinkAnalysis): string {
  const i = list.findIndex((x) => x.id === a.id);
  const n = list.length - i;
  return `${i === 0 ? 'Latest · ' : ''}v${n} · ${a.mode === 'ai' ? 'AI' : 'Guided'} · ${new Date(a.created_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}`;
}

/** Side-by-side comparison of two versions of the same report kind. Read-only; never modifies reports. */
export function CompareReports({ open, onClose, versions }: { open: boolean; onClose: () => void; versions: ThinkAnalysis[] }) {
  const [left, setLeft] = useState(versions[1]?.id ?? '');
  const [right, setRight] = useState(versions[0]?.id ?? '');
  const a = versions.find((v) => v.id === left)?.report;
  const b = versions.find((v) => v.id === right)?.report;
  const kind = a?.kind ?? b?.kind;
  return (
    <Modal open={open} onClose={onClose} title="Compare report versions">
      <div className="grid gap-3 sm:grid-cols-2">
        {[{ v: left, set: setLeft, label: 'Earlier' }, { v: right, set: setRight, label: 'Later' }].map((s) => (
          <label key={s.label} className="text-xs text-subtle">{s.label}
            <Select className="mt-1" value={s.v} onChange={(e) => s.set(e.target.value)}>
              {versions.map((x) => <option key={x.id} value={x.id}>{versionLabel(versions, x)}</option>)}
            </Select>
          </label>
        ))}
      </div>
      {a && b && (
        <div className="mt-4 max-h-[60vh] overflow-auto">
          <table className="w-full border-collapse text-left text-sm">
            <tbody>
              {kind === 'assessment' && a.assessment && b.assessment ? (
                <>
                  <Row label="Overall" l={<RatingBadge rating={a.assessment.overall.rating} />} r={<RatingBadge rating={b.assessment.overall.rating} />}
                    changed={a.assessment.overall.rating !== b.assessment.overall.rating} />
                  {a.assessment.parameters.map((p, i) => {
                    const q = b.assessment!.parameters[i]!;
                    return <Row key={p.key} label={p.title} changed={p.rating !== q.rating}
                      l={<><RatingBadge rating={p.rating} /><p className="mt-1 text-xs text-muted">{p.finding}</p></>}
                      r={<><RatingBadge rating={q.rating} /><p className="mt-1 text-xs text-muted">{q.finding}</p></>} />;
                  })}
                </>
              ) : (
                <>
                  {(a.deep || b.deep) && <Row label="Recommendation" changed={a.deep?.verdict !== b.deep?.verdict}
                    l={a.deep?.verdict ? VERDICT_LABELS[a.deep.verdict] : '—'} r={b.deep?.verdict ? VERDICT_LABELS[b.deep.verdict] : '—'} />}
                  {a.sections.map((s) => {
                    const t = b.sections.find((x) => x.key === s.key);
                    return <Row key={s.key} label={s.title} changed={s.summary !== t?.summary}
                      l={<span className="text-xs">{s.summary}</span>} r={<span className="text-xs">{t?.summary ?? '—'}</span>} />;
                  })}
                </>
              )}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-subtle">Highlighted rows differ. {kind === 'assessment' ? `Ratings: ${Object.values(RATING_LABELS).map((r) => r.name).join(' · ')}.` : ''}</p>
        </div>
      )}
    </Modal>
  );
}

function Row({ label, l, r, changed }: { label: string; l: React.ReactNode; r: React.ReactNode; changed: boolean }) {
  return (
    <tr className={changed ? 'bg-warning-soft/50' : undefined}>
      <th scope="row" className="w-1/4 border-t border-line px-2 py-2 align-top text-xs font-medium">{label}</th>
      <td className="w-3/8 border-t border-line px-2 py-2 align-top">{l}</td>
      <td className="w-3/8 border-t border-line px-2 py-2 align-top">{r}</td>
    </tr>
  );
}
