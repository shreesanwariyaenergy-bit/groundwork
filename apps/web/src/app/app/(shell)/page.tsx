'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { relativeTime } from '@groundwork/shared';
import { Alert, Avatar, Badge, Card, EmptyState, Skeleton, buttonClass } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { ProfileCompletionCard } from '@/components/app/ProfileCompletion';
import { PersonCard } from '@/components/app/PeopleUI';
import { InviteBox } from '@/components/app/InviteBox';

function Welcome() {
  const params = useSearchParams();
  if (!params.get('welcome')) return null;
  return <Alert tone="accent" title="Your profile is live">Connect will now recommend people who complement you.</Alert>;
}

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

export default function HomePage() {
  const { api, profile, user, avatar } = useApp();
  const onboarded = profile.onboarding_completed;
  const projects = useAsync(() => api.thinkProjects(), []);
  const status = useAsync(() => api.thinkStatus(), []);
  const connect = useAsync(async () => {
    if (!onboarded) return null;
    const [recs, requests, convs] = await Promise.all([api.recommendations(0), api.requests('received'), api.conversations(0)]);
    return { recs, requests, convs };
  }, [onboarded]);
  const firstName = profile.display_name?.split(' ')[0] || user.email?.split('@')[0] || '';

  return (
    <div className="space-y-10">
      <Suspense><Welcome /></Suspense>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Welcome{firstName ? `, ${firstName}` : ''}</h1>
        <p className="mt-1 text-sm text-muted">Pick up an idea where you left it, or start a new one.</p>
      </div>

      {/* THINK — primary */}
      <section aria-labelledby="think-h" className="space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="think-h" className="text-lg font-semibold">Think</h2>
            <p className="text-sm text-muted">
              {status.data?.ai_available
                ? `AI analyses left today: ${Math.max(0, status.data.analyses_per_day - status.data.analyses_used_today)} of ${status.data.analyses_per_day}`
                : 'Guided reviews are available. AI analysis will appear here when it is switched on.'}
            </p>
          </div>
          <div className="flex gap-2">
            <Link href="/app/think?new=1" className={buttonClass('primary')}>New Think project</Link>
            <Link href="/validate" className={buttonClass('secondary')}>Quick validate</Link>
          </div>
        </div>
        {projects.loading ? <Skeleton className="h-28" /> : (projects.data ?? []).length === 0 ? (
          <EmptyState title="No Think projects yet"
            body="Describe an idea to get a structured review: customers, risks, the assumptions you are betting on and what to test next. Projects are private to you."
            action={<Link href="/app/think?new=1" className={buttonClass('primary')}>Start your first project</Link>} />
        ) : (
          <ul className="grid gap-3 sm:grid-cols-2">
            {projects.data!.slice(0, 4).map((p) => (
              <li key={p.id}>
                <Link href={`/app/think/${p.id}`} className="block h-full rounded-lg border border-line bg-raised p-4 hover:border-line-strong">
                  <div className="flex items-start justify-between gap-2">
                    <h3 className="font-medium">{p.title}</h3>
                    {p.source === 'quick_validate' && <Badge>From Quick Validate</Badge>}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted">{p.idea}</p>
                  <p className="mt-2 text-xs text-subtle">Updated {relativeTime(p.updated_at)} ago</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
        {(projects.data?.length ?? 0) > 4 && <Link href="/app/think" className="text-sm text-muted hover:text-fg">All projects →</Link>}
      </section>

      {/* CONNECT — secondary */}
      <section aria-labelledby="connect-h" className="space-y-4 border-t border-line pt-8">
        <div>
          <h2 id="connect-h" className="text-lg font-semibold">Connect</h2>
          <p className="text-sm text-muted">Find co-founders and startup builders who complement you.</p>
        </div>
        {!onboarded ? (
          <Card className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm">
              <div className="font-medium text-fg">Set up your profile to start connecting</div>
              <div className="text-muted">About five minutes. Your Think projects stay private either way.</div>
            </div>
            <Link href="/app/onboarding" className={buttonClass('secondary')}>Set up profile</Link>
          </Card>
        ) : connect.loading ? <Skeleton className="h-40" /> : connect.error ? <Alert tone="danger">Could not load Connect right now.</Alert> : connect.data && (
          <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
            <div className="space-y-6">
              {connect.data.requests.length > 0 && (
                <Card className="p-4 text-sm"><Link href="/app/connections" className="font-medium text-accent hover:underline">
                  Respond to {connect.data.requests.length} connection request{connect.data.requests.length > 1 ? 's' : ''} →</Link></Card>
              )}
              <Section title="Recommended for you" href="/app/discover">
                {connect.data.recs.length === 0 ? (
                  <EmptyState title="No strong matches yet" body="The network is still growing. Search with filters, or invite people you would like to build with." action={<Link href="/app/discover" className={buttonClass('secondary')}>Search people</Link>} />
                ) : <ul className="grid gap-4 sm:grid-cols-2">{connect.data.recs.slice(0, 2).map((p) => <PersonCard key={p.id} person={p} />)}</ul>}
              </Section>
              {connect.data.convs.length > 0 && (
                <Section title="Recent conversations" href="/app/messages">
                  <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
                    {connect.data.convs.slice(0, 3).map((c) => (
                      <li key={c.conversation_id}><Link href={`/app/messages/${c.conversation_id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-surface">
                        <Avatar name={c.peer_name} src={avatar(c.peer_avatar)} size={32} />
                        <div className="min-w-0 flex-1"><div className="text-sm font-medium">{c.peer_name}</div><div className="truncate text-sm text-muted">{c.last_message ?? 'Say hello'}</div></div>
                        {c.unread_count > 0 && <span className="rounded-full bg-accent px-1.5 text-xs text-on-accent">{c.unread_count}</span>}
                      </Link></li>
                    ))}
                  </ul>
                </Section>
              )}
            </div>
            <div className="space-y-5"><ProfileCompletionCard compact /><InviteBox /></div>
          </div>
        )}
      </section>
    </div>
  );
}
