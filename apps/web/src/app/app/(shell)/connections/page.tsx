'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { friendlyError, relativeTime, type ConnectionRequestRow } from '@groundwork/shared';
import { Alert, Avatar, Button, EmptyState, ErrorState, PageHeader, Skeleton, Tabs } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';

type Tab = 'received' | 'sent' | 'connections';

function RequestList({ direction }: { direction: 'received' | 'sent' }) {
  const { api, avatar, roleName } = useApp();
  const router = useRouter();
  const { data, loading, error, reload, setData } = useAsync(() => api.requests(direction), [direction]);
  const [busy, setBusy] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <ErrorState message={friendlyError(error)} onRetry={reload} />;
  if (!data?.length) return <EmptyState title={direction === 'received' ? 'No pending requests' : 'No sent requests'} body={direction === 'received' ? 'When someone wants to connect, it will appear here.' : 'Requests you send appear here until they are answered.'} />;
  const remove = (id: string) => setData((data ?? []).filter((r) => r.request_id !== id));
  async function act(r: ConnectionRequestRow, fn: () => Promise<unknown>, after?: (v: unknown) => void) {
    setBusy(r.request_id); setActionError(null);
    try { const v = await fn(); remove(r.request_id); after?.(v); } catch (e) { setActionError(friendlyError(e)); } finally { setBusy(null); }
  }
  return (
    <div className="space-y-3">
      {actionError && <Alert tone="danger">{actionError}</Alert>}
      <ul className="space-y-3">
        {data.map((r) => (
          <li key={r.request_id} className="rounded-lg border border-line bg-raised p-4">
            <div className="flex items-start gap-3">
              <Avatar name={r.display_name} src={avatar(r.avatar_path)} size={44} />
              <div className="min-w-0 flex-1">
                <Link href={`/app/u/${r.user_id}`} className="font-medium hover:underline">{r.display_name}</Link>
                <p className="text-sm text-muted">{r.headline}{r.primary_role ? ` · ${roleName(r.primary_role)}` : ''}</p>
                {r.message && <p className="mt-2 rounded-md bg-surface px-3 py-2 text-sm text-fg">“{r.message}”</p>}
                <p className="mt-1 text-xs text-subtle">{relativeTime(r.created_at)} ago</p>
              </div>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              {direction === 'received' ? (
                <>
                  <Button size="sm" loading={busy === r.request_id} onClick={() => act(r, () => api.respondRequest(r.request_id, true), (conv) => conv && router.push(`/app/messages/${conv}`))}>Accept</Button>
                  <Button size="sm" variant="secondary" disabled={busy === r.request_id} onClick={() => act(r, () => api.respondRequest(r.request_id, false))}>Decline</Button>
                  <Link href={`/app/u/${r.user_id}`} className="inline-flex h-8 items-center px-3 text-sm text-muted hover:text-fg">View profile</Link>
                </>
              ) : (
                <Button size="sm" variant="secondary" loading={busy === r.request_id} onClick={() => act(r, () => api.withdrawRequest(r.request_id))}>Withdraw</Button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ConnectionList() {
  const { api, avatar, roleName } = useApp();
  const { data, loading, error, reload } = useAsync(() => api.connections(0), []);
  if (loading) return <Skeleton className="h-40" />;
  if (error) return <ErrorState message={friendlyError(error)} onRetry={reload} />;
  if (!data?.length) return <EmptyState title="No connections yet" body="Find people in Discover and send a short, personal request." action={<Link href="/app/discover" className="text-sm font-medium text-accent">Go to Discover →</Link>} />;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
      {data.map((c) => (
        <li key={c.user_id} className="flex items-center gap-3 px-4 py-3">
          <Avatar name={c.display_name} src={avatar(c.avatar_path)} size={40} />
          <div className="min-w-0 flex-1">
            <Link href={`/app/u/${c.user_id}`} className="font-medium hover:underline">{c.display_name}</Link>
            <p className="truncate text-sm text-muted">{c.headline}{c.primary_role ? ` · ${roleName(c.primary_role)}` : ''}</p>
          </div>
          {c.conversation_id && <Link href={`/app/messages/${c.conversation_id}`} className="inline-flex h-8 items-center rounded-md border border-line-strong px-3 text-sm hover:bg-surface">Message</Link>}
        </li>
      ))}
    </ul>
  );
}

export default function ConnectionsPage() {
  const [tab, setTab] = useState<Tab>('received');
  return (
    <>
      <PageHeader title="Connections" description="Requests, people you are connected with, and messaging access." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'received', label: 'Received' }, { value: 'sent', label: 'Sent' }, { value: 'connections', label: 'Connections' }]} />
      {tab === 'connections' ? <ConnectionList /> : <RequestList direction={tab} />}
      <p className="mt-6 text-sm text-muted">Looking for people you saved? They are in <Link href="/app/discover" className="underline">Discover → Saved</Link>.</p>
    </>
  );
}
