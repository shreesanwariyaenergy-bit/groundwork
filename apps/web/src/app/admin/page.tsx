'use client';
import { useState } from 'react';
import { friendlyError } from '@groundwork/shared';
import { Card, ErrorState, PageHeader, Select, Skeleton } from '@/components/ui';
import { useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';

type Metrics = Record<string, unknown> & { retention?: Record<string, number | null>; ai_month?: { provider: string | null; model: string | null; requests: number; successes: number; errors: number; limited: number; input_tokens: number; output_tokens: number; estimated_cost_usd: number }[] };

function Stat({ label, value, hint }: { label: string; value: unknown; hint?: string }) {
  return (
    <Card className="p-4">
      <div className="text-xs text-muted">{label}</div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value == null ? '—' : String(value)}</div>
      {hint && <div className="mt-0.5 text-xs text-subtle">{hint}</div>}
    </Card>
  );
}
const pct = (v: unknown) => (typeof v === 'number' || typeof v === 'string' ? `${(Number(v) * 100).toFixed(1)}%` : '—');

export default function AdminOverview() {
  const [days, setDays] = useState(30);
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await getBrowserClient().rpc('admin_metrics', { p_days: days });
    if (error) throw error;
    return data as Metrics;
  }, [days]);
  return (
    <>
      <PageHeader title="Overview" description="Live counts from the production database. Definitions: docs/ANALYTICS.md."
        actions={<Select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Window"><option value={7}>Last 7 days</option><option value={30}>Last 30 days</option><option value={90}>Last 90 days</option></Select>} />
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : data && (
        <div className="space-y-8">
          <section>
            <h2 className="mb-3 text-sm font-semibold">Acquisition & activation</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Total users" value={data.users_total} />
              <Stat label="Registrations" value={data.registrations} hint={`last ${days} days`} />
              <Stat label="Completed onboarding (all time)" value={data.onboarding_completed} />
              <Stat label="Completed onboarding (window)" value={data.onboarding_completed_in_window} />
              <Stat label="Weekly active" value={data.wau} />
              <Stat label="Monthly active" value={data.mau} />
              <Stat label="Searches" value={data.searches} hint="last 3 days retained" />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Matchmaking & messaging</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Connection requests" value={data.connection_requests} />
              <Stat label="Accepted" value={data.connections_accepted} />
              <Stat label="Acceptance rate" value={pct(data.acceptance_rate)} />
              <Stat label="Conversations started" value={data.conversations_started} />
              <Stat label="Messages" value={data.messages} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Think</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Projects created" value={data.think_projects} />
              <Stat label="Reports completed" value={data.think_reports} />
              <Stat label="Follow-up questions" value={data.think_followups} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Retention (cohort registered in window)</h2>
            <div className="grid grid-cols-3 gap-3">
              <Stat label="Day 1" value={pct(data.retention?.d1)} />
              <Stat label="Day 7" value={pct(data.retention?.d7)} />
              <Stat label="Day 30" value={pct(data.retention?.d30)} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">Safety</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
              <Stat label="Open reports" value={data.reports_open} />
              <Stat label="Blocks" value={data.blocks} />
              <Stat label="Suspended accounts" value={data.suspended_accounts} />
              <Stat label="Pending deletion requests" value={data.deletion_requests_pending} />
            </div>
          </section>
          <section>
            <h2 className="mb-3 text-sm font-semibold">AI usage this month</h2>
            {!data.ai_month?.length ? <p className="text-sm text-muted">No AI requests this month.</p> : (
              <div className="overflow-x-auto rounded-lg border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-surface text-left text-xs text-muted"><tr>{['Provider', 'Model', 'Requests', 'Success', 'Errors', 'Limited', 'Tokens in', 'Tokens out', 'Est. cost (USD)'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
                  <tbody className="divide-y divide-line">{data.ai_month.map((r, i) => (
                    <tr key={i}><td className="px-3 py-2">{r.provider ?? '—'}</td><td className="px-3 py-2">{r.model ?? '—'}</td><td className="px-3 py-2 tabular-nums">{r.requests}</td><td className="px-3 py-2 tabular-nums">{r.successes}</td><td className="px-3 py-2 tabular-nums">{r.errors}</td><td className="px-3 py-2 tabular-nums">{r.limited}</td><td className="px-3 py-2 tabular-nums">{r.input_tokens}</td><td className="px-3 py-2 tabular-nums">{r.output_tokens}</td><td className="px-3 py-2 tabular-nums">{r.estimated_cost_usd}</td></tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}
    </>
  );
}
