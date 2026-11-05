'use client';
import Link from 'next/link';
import { friendlyError, relativeTime } from '@groundwork/shared';
import { Avatar, EmptyState, ErrorState, PageHeader, Skeleton } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';

export default function MessagesPage() {
  const { api, avatar, user } = useApp();
  const { data, loading, error, reload } = useAsync(() => api.conversations(0), []);
  return (
    <>
      <PageHeader title="Messages" description="Private one-to-one conversations with your connections." />
      {loading ? <Skeleton className="h-60" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : !data?.length ? (
        <EmptyState title="No conversations yet" body="When someone accepts your connection request (or you accept theirs), a conversation opens here." />
      ) : (
        <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
          {data.map((c) => (
            <li key={c.conversation_id}>
              <Link href={`/app/messages/${c.conversation_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                <Avatar name={c.peer_name} src={avatar(c.peer_avatar)} size={44} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2"><span className={c.unread_count ? 'font-semibold' : 'font-medium'}>{c.peer_name}</span>{!c.can_send && <span className="text-xs text-subtle">· read-only</span>}</div>
                  <p className={`truncate text-sm ${c.unread_count ? 'text-fg' : 'text-muted'}`}>{c.last_sender_id === user.id ? 'You: ' : ''}{c.last_message ?? 'No messages yet — say hello'}</p>
                </div>
                <div className="shrink-0 text-right text-xs text-subtle">
                  {relativeTime(c.last_message_at)}
                  {c.unread_count > 0 && <div className="mt-1 ml-auto w-fit rounded-full bg-accent px-1.5 text-on-accent">{c.unread_count}</div>}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
