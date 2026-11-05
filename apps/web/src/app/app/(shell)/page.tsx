'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { relativeTime } from '@groundwork/shared';
import { Alert, Avatar, Card, EmptyState, Skeleton, buttonClass } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { ProfileCompletionCard } from '@/components/app/ProfileCompletion';
import { PersonCard } from '@/components/app/PeopleUI';
import { InviteBox } from '@/components/app/InviteBox';

function Section({ title, href, linkLabel = 'View all', children }: { title: string; href?: string; linkLabel?: string; children: React.ReactNode }) {
  return (
    <section>
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">{title}</h2>
        {href && <Link href={href} className="text-sm text-muted hover:text-fg">{linkLabel}</Link>}
      </div>
      {children}
    </section>
  );
}

function Welcome() {
  const params = useSearchParams();
  if (!params.get('welcome')) return null;
  return <Alert tone="accent" title="Your profile is live">Here are your first recommendations. Start a Think project while the network grows.</Alert>;
}

export default function HomePage() {
  const { api, profile, avatar } = useApp();
  const recs = useAsync(() => api.recommendations(0), []);
  const requests = useAsync(() => api.requests('received'), []);
  const convs = useAsync(() => api.conversations(0), []);
  const projects = useAsync(() => api.thinkProjects(), []);
  const connections = useAsync(() => api.connections(0), []);

  const nextActions: { label: string; href: string }[] = [];
  if ((requests.data?.length ?? 0) > 0) nextActions.push({ label: `Respond to ${requests.data!.length} connection request${requests.data!.length > 1 ? 's' : ''}`, href: '/app/connections' });
  if ((projects.data?.length ?? 0) === 0) nextActions.push({ label: 'Start your first Think project', href: '/app/think' });
  if ((connections.data?.length ?? 0) === 0) nextActions.push({ label: 'Send your first connection request', href: '/app/discover' });
  if (!profile.bio) nextActions.push({ label: 'Write a short introduction', href: '/app/profile' });

  return (
    <div className="space-y-8">
      <Suspense><Welcome /></Suspense>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome back{profile.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}</h1>
        <p className="mt-1 text-sm text-muted">Here is what needs your attention.</p>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-8">
          {nextActions.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Suggested next steps</h2>
              <ul className="mt-2 space-y-1.5 text-sm">{nextActions.slice(0, 4).map((a) => <li key={a.href + a.label}><Link className="text-accent hover:underline" href={a.href}>{a.label} →</Link></li>)}</ul>
            </Card>
          )}

          <Section title="Recommended for you" href="/app/discover">
            {recs.loading ? <Skeleton className="h-52" /> : recs.error ? <Alert tone="danger">Could not load recommendations.</Alert> : (recs.data ?? []).length === 0 ? (
              <EmptyState title="No strong matches yet" body="The network is still growing. Complete your profile, search with filters, or invite collaborators." action={<Link href="/app/discover" className={buttonClass('secondary')}>Search people</Link>} />
            ) : <ul className="grid gap-4 sm:grid-cols-2">{recs.data!.slice(0, 4).map((p) => <PersonCard key={p.id} person={p} />)}</ul>}
          </Section>

          <Section title="Recent conversations" href="/app/messages">
            {convs.loading ? <Skeleton className="h-24" /> : (convs.data ?? []).length === 0 ? (
              <p className="text-sm text-muted">No conversations yet. Messaging opens when a connection request is accepted.</p>
            ) : (
              <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                {convs.data!.slice(0, 4).map((c) => (
                  <li key={c.conversation_id}><Link href={`/app/messages/${c.conversation_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                    <Avatar name={c.peer_name} src={avatar(c.peer_avatar)} size={36} />
                    <div className="min-w-0 flex-1"><div className="text-sm font-medium">{c.peer_name}</div><div className="truncate text-sm text-muted">{c.last_message ?? 'Say hello'}</div></div>
                    <div className="text-right text-xs text-subtle">{relativeTime(c.last_message_at)}{c.unread_count > 0 && <div className="mt-1 inline-block rounded-full bg-accent px-1.5 text-on-accent">{c.unread_count}</div>}</div>
                  </Link></li>
                ))}
              </ul>
            )}
          </Section>
        </div>

        <div className="space-y-5">
          <ProfileCompletionCard compact />
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Pending requests</h2><Link href="/app/connections" className="text-xs text-muted hover:text-fg">Open</Link></div>
            <p className="mt-2 text-2xl font-semibold tabular-nums">{requests.data?.length ?? '–'}</p>
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Think projects</h2><Link href="/app/think" className="text-xs text-muted hover:text-fg">Open</Link></div>
            {(projects.data ?? []).length === 0 ? <p className="mt-2 text-sm text-muted">No projects yet.</p> : (
              <ul className="mt-2 space-y-1 text-sm">{projects.data!.slice(0, 4).map((p) => <li key={p.id}><Link href={`/app/think/${p.id}`} className="text-fg hover:underline">{p.title}</Link></li>)}</ul>
            )}
          </Card>
          <Card className="p-5">
            <div className="flex items-center justify-between"><h2 className="text-sm font-semibold">Recent connections</h2><Link href="/app/connections" className="text-xs text-muted hover:text-fg">All</Link></div>
            {(connections.data ?? []).length === 0 ? <p className="mt-2 text-sm text-muted">None yet.</p> : (
              <ul className="mt-2 space-y-2">{connections.data!.slice(0, 4).map((c) => (
                <li key={c.user_id}><Link href={`/app/u/${c.user_id}`} className="flex items-center gap-2 text-sm hover:underline"><Avatar name={c.display_name} src={avatar(c.avatar_path)} size={24} />{c.display_name}</Link></li>
              ))}</ul>
            )}
          </Card>
          <InviteBox />
        </div>
      </div>
    </div>
  );
}
