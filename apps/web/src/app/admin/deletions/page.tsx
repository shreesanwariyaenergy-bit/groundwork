'use client';
import { friendlyError } from '@groundwork/shared';
import { Alert, Badge, Button, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';
import { useState } from 'react';

interface Req { id: string; user_id: string | null; email: string; source: string; status: string; note: string | null; requested_at: string; completed_at: string | null }

export default function AdminDeletions() {
  const sb = getBrowserClient();
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null);
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await sb.from('account_deletion_requests').select('*').order('requested_at', { ascending: false }).limit(200);
    if (error) throw error;
    return data as Req[];
  }, []);
  return (
    <>
      <PageHeader title="Deletion requests" description="Requests submitted from the public deletion page. Confirm the requester controls the email before completing." />
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : !data?.length ? <EmptyState title="No requests" /> : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted"><tr>{['Email', 'Account found', 'Status', 'Requested', 'Note', 'Actions'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {data.map((r) => (
                <tr key={r.id} className="align-top">
                  <td className="px-3 py-2">{r.email}</td>
                  <td className="px-3 py-2">{r.user_id ? 'Yes' : 'No'}</td>
                  <td className="px-3 py-2"><Badge>{r.status}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted">{new Date(r.requested_at).toLocaleString()}</td>
                  <td className="px-3 py-2 text-xs text-muted">{r.note}</td>
                  <td className="px-3 py-2">
                    {r.status === 'pending' || r.status === 'verified' ? (
                      <div className="flex flex-wrap gap-1">
                        {r.status === 'pending' && <Button size="sm" variant="secondary" onClick={async () => { const { error } = await sb.rpc('admin_update_deletion_request', { p_id: r.id, p_status: 'verified', p_note: 'Identity confirmed by email' }); if (error) setMsg({ tone: 'danger', text: friendlyError(error) }); reload(); }}>Mark verified</Button>}
                        {r.user_id && r.status === 'verified' && <Button size="sm" variant="danger" onClick={async () => {
                          if (window.prompt('Type DELETE to permanently delete this account') !== 'DELETE') return;
                          const { error } = await sb.functions.invoke('delete-account', { body: { confirm: 'DELETE', user_id: r.user_id, request_id: r.id } });
                          setMsg(error ? { tone: 'danger', text: 'Deletion failed (admins only).' } : { tone: 'accent', text: 'Account deleted.' }); reload();
                        }}>Delete account</Button>}
                        {!r.user_id && <Button size="sm" variant="secondary" onClick={async () => { await sb.rpc('admin_update_deletion_request', { p_id: r.id, p_status: 'completed', p_note: 'No account for this email' }); reload(); }}>Close (no account)</Button>}
                        <Button size="sm" variant="ghost" onClick={async () => { await sb.rpc('admin_update_deletion_request', { p_id: r.id, p_status: 'rejected', p_note: window.prompt('Reason') ?? null }); reload(); }}>Reject</Button>
                      </div>
                    ) : <span className="text-xs text-subtle">{r.completed_at ? new Date(r.completed_at).toLocaleDateString() : ''}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}
