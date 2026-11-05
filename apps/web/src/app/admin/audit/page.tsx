'use client';
import { friendlyError } from '@groundwork/shared';
import { ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';

interface Log { id: number; admin_id: string | null; action: string; target_type: string | null; target_id: string | null; details: unknown; created_at: string; admin: { display_name: string } | null }

export default function AdminAudit() {
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await getBrowserClient().from('admin_audit_logs').select('*, admin:profiles!admin_audit_logs_admin_id_fkey(display_name)').order('created_at', { ascending: false }).limit(300);
    if (error) throw error;
    return data as unknown as Log[];
  }, []);
  return (
    <>
      <PageHeader title="Audit log" description="Every administrative action, newest first. Read-only." />
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted"><tr>{['When', 'Admin', 'Action', 'Target', 'Details'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {(data ?? []).map((l) => (
                <tr key={l.id} className="align-top">
                  <td className="whitespace-nowrap px-3 py-2 text-xs text-muted">{new Date(l.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">{l.admin?.display_name ?? '(removed)'}</td>
                  <td className="px-3 py-2 font-mono text-xs">{l.action}</td>
                  <td className="px-3 py-2 text-xs text-muted">{l.target_type}:{l.target_id?.slice(0, 8)}</td>
                  <td className="max-w-md px-3 py-2"><pre className="overflow-x-auto whitespace-pre-wrap text-xs text-muted">{JSON.stringify(l.details)}</pre></td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.length && <p className="p-6 text-center text-sm text-muted">No actions logged yet.</p>}
        </div>
      )}
    </>
  );
}
