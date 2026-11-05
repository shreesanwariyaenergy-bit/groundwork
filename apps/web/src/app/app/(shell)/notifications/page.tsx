'use client';
import Link from 'next/link';
import { friendlyError, relativeTime } from '@groundwork/shared';
import { Button, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { webPath } from '@/components/app/paths';

export default function NotificationsPage() {
  const { api } = useApp();
  const { data, loading, error, reload } = useAsync(() => api.notifications(), []);
  return (
    <>
      <PageHeader title="Notifications" actions={data?.some((n) => !n.read_at) ? <Button variant="secondary" size="sm" onClick={async () => { await api.markNotificationsRead(); reload(); }}>Mark all as read</Button> : undefined} />
      {loading ? <Skeleton className="h-48" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : !data?.length ? (
        <EmptyState title="You are all caught up" body="Connection requests, messages and Think reports will appear here." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
          {data.map((n) => (
            <li key={n.id}>
              <Link href={webPath(n.data?.path)} onClick={() => { if (!n.read_at) api.markNotificationsRead([n.id]).catch(() => {}); }}
                className="flex gap-3 px-4 py-3 hover:bg-surface">
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${n.read_at ? 'bg-transparent' : 'bg-accent'}`} aria-hidden />
                <div className="min-w-0 flex-1">
                  <div className={`text-sm ${n.read_at ? 'text-fg' : 'font-semibold text-fg'}`}>{n.title}</div>
                  {n.body && n.type !== 'message' && <p className="truncate text-sm text-muted">{n.body}</p>}
                </div>
                <span className="shrink-0 text-xs text-subtle">{relativeTime(n.created_at)}</span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
