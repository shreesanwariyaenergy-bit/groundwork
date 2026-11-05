'use client';
import Link from 'next/link';
import { useState } from 'react';
import { friendlyError, relativeTime, type AccountStatus } from '@groundwork/shared';
import { Alert, Badge, Button, ErrorState, Input, PageHeader, Select, Skeleton } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';

interface Row { id: string; email: string; display_name: string; headline: string; account_status: AccountStatus; onboarding_completed: boolean; email_verified: boolean; created_at: string; last_active_at: string; open_reports: number; admin_role: string | null }

export default function AdminUsers() {
  const { api } = useApp();
  const sb = getBrowserClient();
  const [q, setQ] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>('');
  const [msg, setMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null);
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await sb.rpc('admin_list_users', { p_search: search || null, p_status: status || null, p_limit: 100, p_offset: 0 });
    if (error) throw error;
    return data as Row[];
  }, [search, status]);

  async function setAccount(id: string, s: AccountStatus) {
    const note = s === 'active' ? null : window.prompt(`Reason for setting status to "${s}" (stored in the audit log):`);
    if (s !== 'active' && note === null) return;
    const { error } = await sb.rpc('admin_set_account_status', { p_user: id, p_status: s, p_note: note });
    setMsg(error ? { tone: 'danger', text: friendlyError(error) } : { tone: 'accent', text: `Status updated to ${s}.` });
    reload();
  }

  return (
    <>
      <PageHeader title="Users" description="Search, review and moderate accounts. Every action is audit-logged." />
      <form className="mb-4 flex flex-wrap gap-2" onSubmit={(e) => { e.preventDefault(); setSearch(q.trim()); }}>
        <Input className="max-w-xs" placeholder="Name or email" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search users" />
        <Select className="w-44" value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status">
          <option value="">All statuses</option><option value="active">Active</option><option value="restricted">Restricted</option><option value="suspended">Suspended</option><option value="pending_deletion">Pending deletion</option>
        </Select>
        <Button type="submit" variant="secondary">Search</Button>
      </form>
      {msg && <div className="mb-4"><Alert tone={msg.tone}>{msg.text}</Alert></div>}
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : (
        <div className="overflow-x-auto rounded-lg border border-line">
          <table className="w-full text-sm">
            <thead className="bg-surface text-left text-xs text-muted"><tr>{['User', 'Status', 'Profile', 'Joined', 'Active', 'Open reports', 'Actions'].map((h) => <th key={h} className="px-3 py-2 font-medium">{h}</th>)}</tr></thead>
            <tbody className="divide-y divide-line">
              {(data ?? []).map((u) => (
                <tr key={u.id} className="align-top">
                  <td className="px-3 py-2"><Link href={`/app/u/${u.id}`} className="font-medium hover:underline">{u.display_name || '(no name)'}</Link><div className="text-xs text-muted">{u.email}</div>{u.admin_role && <Badge tone="danger">{u.admin_role}</Badge>}</td>
                  <td className="px-3 py-2"><Badge tone={u.account_status === 'active' ? 'neutral' : 'danger'}>{u.account_status}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted">{u.onboarding_completed ? 'Onboarded' : 'Incomplete'}<br />{u.email_verified ? 'Verified' : 'Unverified'}</td>
                  <td className="px-3 py-2 text-xs text-muted">{new Date(u.created_at).toLocaleDateString()}</td>
                  <td className="px-3 py-2 text-xs text-muted">{relativeTime(u.last_active_at)}</td>
                  <td className="px-3 py-2 tabular-nums">{u.open_reports}</td>
                  <td className="px-3 py-2">
                    <div className="flex flex-wrap gap-1">
                      {u.account_status !== 'active' && <Button size="sm" variant="secondary" onClick={() => setAccount(u.id, 'active')}>Reactivate</Button>}
                      {u.account_status !== 'restricted' && <Button size="sm" variant="secondary" onClick={() => setAccount(u.id, 'restricted')}>Restrict</Button>}
                      {u.account_status !== 'suspended' && <Button size="sm" variant="danger" onClick={() => setAccount(u.id, 'suspended')}>Suspend</Button>}
                      <Button size="sm" variant="ghost" onClick={async () => {
                        if (window.prompt('Type DELETE to permanently delete this account') !== 'DELETE') return;
                        const { error } = await sb.functions.invoke('delete-account', { body: { confirm: 'DELETE', user_id: u.id } });
                        setMsg(error ? { tone: 'danger', text: 'Deletion failed (admins only).' } : { tone: 'accent', text: 'Account deleted.' });
                        reload();
                      }}>Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          {!data?.length && <p className="p-6 text-center text-sm text-muted">No users found.</p>}
        </div>
      )}
      <span className="hidden">{api ? '' : ''}</span>
    </>
  );
}
