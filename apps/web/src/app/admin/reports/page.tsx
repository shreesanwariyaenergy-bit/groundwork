'use client';
import Link from 'next/link';
import { useState } from 'react';
import { REPORT_REASONS, friendlyError } from '@groundwork/shared';
import { Alert, Badge, Button, Card, EmptyState, ErrorState, PageHeader, Select, Skeleton } from '@/components/ui';
import { useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';

interface Report { id: string; reporter_id: string | null; reported_user_id: string | null; message_excerpt: string | null; reason: string; details: string | null; status: string; created_at: string; resolution_note: string | null; reported: { display_name: string } | null; reporter: { display_name: string } | null }

export default function AdminReports() {
  const sb = getBrowserClient();
  const [status, setStatus] = useState('open');
  const [msg, setMsg] = useState<string | null>(null);
  const { data, loading, error, reload } = useAsync(async () => {
    let q = sb.from('user_reports').select('*, reported:profiles!user_reports_reported_user_id_fkey(display_name), reporter:profiles!user_reports_reporter_id_fkey(display_name)').order('created_at', { ascending: false }).limit(100);
    if (status) q = q.eq('status', status);
    const { data, error } = await q;
    if (error) throw error;
    return data as unknown as Report[];
  }, [status]);

  async function resolve(r: Report, s: 'reviewing' | 'actioned' | 'dismissed') {
    const note = window.prompt('Resolution note (audit-logged):') ?? undefined;
    const { error } = await sb.rpc('admin_update_report', { p_report: r.id, p_status: s, p_note: note ?? null });
    setMsg(error ? friendlyError(error) : null); reload();
  }

  // repeat-offender signal: count reports per reported user in this list
  const counts = new Map<string, number>();
  for (const r of data ?? []) if (r.reported_user_id) counts.set(r.reported_user_id, (counts.get(r.reported_user_id) ?? 0) + 1);

  return (
    <>
      <PageHeader title="Reports" description="Moderation queue. Suspend or restrict accounts from Users."
        actions={<Select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="open">Open</option><option value="reviewing">Reviewing</option><option value="actioned">Actioned</option><option value="dismissed">Dismissed</option><option value="">All</option></Select>} />
      {msg && <div className="mb-4"><Alert tone="danger">{msg}</Alert></div>}
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : !data?.length ? <EmptyState title="Queue is empty" /> : (
        <ul className="space-y-3">
          {data.map((r) => (
            <Card as="li" key={r.id} className="p-4">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <Badge tone="danger">{REPORT_REASONS.find((x) => x.value === r.reason)?.label ?? r.reason}</Badge>
                <Badge>{r.status}</Badge>
                <span className="text-muted">Reported: {r.reported_user_id ? <Link href={`/app/u/${r.reported_user_id}`} className="font-medium text-fg hover:underline">{r.reported?.display_name ?? 'user'}</Link> : '(deleted account)'}</span>
                {r.reported_user_id && (counts.get(r.reported_user_id) ?? 0) > 1 && <Badge tone="warning">{counts.get(r.reported_user_id)} reports</Badge>}
                <span className="text-muted">by {r.reporter?.display_name ?? '(deleted account)'}</span>
                <span className="ml-auto text-xs text-subtle">{new Date(r.created_at).toLocaleString()}</span>
              </div>
              {r.details && <p className="mt-2 text-sm">{r.details}</p>}
              {r.message_excerpt && <blockquote className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-muted">Message: “{r.message_excerpt}”</blockquote>}
              {r.resolution_note && <p className="mt-2 text-xs text-subtle">Note: {r.resolution_note}</p>}
              <div className="mt-3 flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => resolve(r, 'reviewing')}>Mark reviewing</Button>
                <Button size="sm" onClick={() => resolve(r, 'actioned')}>Actioned</Button>
                <Button size="sm" variant="ghost" onClick={() => resolve(r, 'dismissed')}>Dismiss</Button>
                {r.reported_user_id && <Link href={`/admin/users`} className="inline-flex h-8 items-center px-3 text-sm text-muted hover:text-fg">Moderate user →</Link>}
              </div>
            </Card>
          ))}
        </ul>
      )}
    </>
  );
}
