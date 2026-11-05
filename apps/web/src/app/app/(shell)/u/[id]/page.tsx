'use client';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  AVAILABILITY, INTENTS, LINK_KINDS, OPEN_TO, STAGES, WORK_MODES, countryName, friendlyError,
  type Experience, type FounderProfile, type Profile, type ProfileLink, type ProfessionalProfile, type StartupProject,
} from '@groundwork/shared';
import { Alert, Avatar, Badge, Button, Card, EmptyState, ErrorState, Skeleton, buttonClass } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { ConfirmModal, ConnectModal, ReportModal } from '@/components/app/PeopleUI';
import { getBrowserClient } from '@/lib/supabase/client';

export default function ProfileViewPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const { api, user, avatar, roleName, industryName } = useApp();
  const isMe = id === user.id;
  const [modal, setModal] = useState<'connect' | 'report' | 'block' | 'remove' | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const { data, loading, error, reload } = useAsync(async () => {
    const sb = getBrowserClient();
    const [p, skills, links, exp, fp, pp, sp] = await Promise.all([
      sb.from('profiles').select('*').eq('id', id).maybeSingle(),
      sb.from('user_skills').select('level, skills(name, category)').eq('user_id', id).order('level', { ascending: false }),
      sb.from('profile_links').select('*').eq('user_id', id),
      sb.from('user_experiences').select('*').eq('user_id', id).order('start_date', { ascending: false, nullsFirst: false }),
      sb.from('founder_profiles').select('*').eq('user_id', id).maybeSingle(),
      sb.from('professional_profiles').select('*').eq('user_id', id).maybeSingle(),
      sb.from('startup_projects').select('*').eq('owner_id', id).eq('is_primary', true).maybeSingle(),
    ]);
    if (p.error) throw p.error;
    const rel = isMe ? null : await api.relationship(id, user.id);
    return {
      profile: p.data as Profile | null,
      skills: (skills.data ?? []) as unknown as { level: number; skills: { name: string } | null }[],
      links: (links.data ?? []) as ProfileLink[],
      experience: (exp.data ?? []) as Experience[],
      founder: fp.data as FounderProfile | null,
      professional: pp.data as ProfessionalProfile | null,
      startup: sp.data as StartupProject | null,
      rel,
    };
  }, [id]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-28" /><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState message={friendlyError(error)} onRetry={reload} />;
  if (!data?.profile) return <EmptyState title="Profile not available" body="This profile does not exist, is private, or is no longer available." action={<Link href="/app/discover" className={buttonClass('secondary')}>Back to Discover</Link>} />;

  const p = data.profile;
  const rel = data.rel;
  const location = [p.city, countryName(p.country_code)].filter(Boolean).join(', ');

  async function act(fn: () => Promise<unknown>) {
    setActionError(null);
    try { await fn(); reload(); } catch (e) { setActionError(friendlyError(e)); }
  }

  return (
    <div className="space-y-5">
      <Card className="p-5 sm:p-6">
        <div className="flex flex-col gap-5 sm:flex-row sm:items-start">
          <Avatar name={p.display_name} src={avatar(p.avatar_path)} size={80} />
          <div className="min-w-0 flex-1">
            <h1 className="text-2xl font-semibold tracking-tight">{p.display_name}</h1>
            <p className="mt-1 text-muted">{p.headline}</p>
            <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-sm text-subtle">
              {p.primary_role && <span>{roleName(p.primary_role)}</span>}
              {location && <span>{location}</span>}
              {p.timezone && <span>{p.timezone.replace(/_/g, ' ')}</span>}
              {p.years_experience != null && p.years_experience > 0 && <span>{p.years_experience} yrs experience</span>}
            </div>
            <div className="mt-3 flex flex-wrap gap-1.5">{p.intents.map((i) => <Badge key={i}>{INTENTS.find((x) => x.value === i)?.label}</Badge>)}</div>
          </div>
          {!isMe && rel && (
            <div className="flex flex-wrap gap-2 sm:flex-col sm:items-stretch">
              {rel.connected ? (
                <Button onClick={async () => {
                  const conns = await api.connections();
                  const c = conns.find((x) => x.user_id === id);
                  if (c?.conversation_id) router.push(`/app/messages/${c.conversation_id}`);
                }}>Message</Button>
              ) : rel.pendingRequestId ? (
                rel.pendingFromMe ? <Button variant="secondary" onClick={() => act(() => api.withdrawRequest(rel.pendingRequestId!))}>Withdraw request</Button>
                  : <Link href="/app/connections" className={buttonClass('primary')}>Respond to request</Link>
              ) : rel.blocked ? null : (
                <Button onClick={() => setModal('connect')}>Connect</Button>
              )}
              {!rel.blocked && <Button variant="secondary" onClick={() => act(() => api.save(id, !rel.saved))}>{rel.saved ? 'Saved' : 'Save'}</Button>}
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" onClick={() => setModal('report')}>Report</Button>
                {rel.blocked ? <Button variant="ghost" size="sm" onClick={() => act(() => api.unblock(id))}>Unblock</Button>
                  : <Button variant="ghost" size="sm" onClick={() => setModal('block')}>Block</Button>}
              </div>
              {rel.connected && <Button variant="ghost" size="sm" onClick={() => setModal('remove')}>Remove connection</Button>}
            </div>
          )}
          {isMe && <Link href="/app/profile" className={buttonClass('secondary')}>Edit profile</Link>}
        </div>
        {actionError && <div className="mt-4"><Alert tone="danger">{actionError}</Alert></div>}
      </Card>

      <div className="grid gap-5 lg:grid-cols-[1fr_320px]">
        <div className="space-y-5">
          {p.bio && <Card className="p-5"><h2 className="text-sm font-semibold">About</h2><p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-fg">{p.bio}</p></Card>}
          {data.startup && (
            <Card className="p-5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-sm font-semibold">{data.startup.name || 'What they are building'}</h2>
                <div className="flex gap-1.5">
                  <Badge>{STAGES.find((s) => s.value === data.startup!.stage)?.label}</Badge>
                  {data.startup.industry && <Badge>{industryName(data.startup.industry)}</Badge>}
                </div>
              </div>
              <p className="mt-2 text-[15px] leading-relaxed">{data.startup.summary}</p>
              <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
                {data.startup.problem && <div><dt className="text-subtle">Problem</dt><dd className="mt-0.5">{data.startup.problem}</dd></div>}
                {data.startup.target_customer && <div><dt className="text-subtle">Target customer</dt><dd className="mt-0.5">{data.startup.target_customer}</dd></div>}
                <div><dt className="text-subtle">Team size</dt><dd className="mt-0.5">{data.startup.team_size}</dd></div>
                {data.startup.commitment_expectation && <div><dt className="text-subtle">Commitment expected</dt><dd className="mt-0.5">{AVAILABILITY.find((a) => a.value === data.startup!.commitment_expectation)?.label}</dd></div>}
              </dl>
              {data.founder?.looking_for_cofounder && data.founder.cofounder_requirements && (
                <div className="mt-4 rounded-md bg-surface p-3 text-sm"><div className="font-medium">Co-founder requirements</div><p className="mt-1 text-muted">{data.founder.cofounder_requirements}</p></div>
              )}
            </Card>
          )}
          {data.experience.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Experience</h2>
              <ul className="mt-3 space-y-3">
                {data.experience.map((x) => (
                  <li key={x.id} className="text-sm">
                    <div className="font-medium">{x.title}{x.organization && <span className="font-normal text-muted"> · {x.organization}</span>}</div>
                    <div className="text-xs text-subtle">{x.start_date?.slice(0, 7) ?? '—'} – {x.end_date?.slice(0, 7) ?? 'present'}</div>
                    {x.description && <p className="mt-1 text-muted">{x.description}</p>}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
        <div className="space-y-5">
          <Card className="p-5">
            <h2 className="text-sm font-semibold">Looking for</h2>
            {p.seeking_roles.length ? <div className="mt-2 flex flex-wrap gap-1.5">{p.seeking_roles.map((r) => <Badge key={r} tone="accent">{roleName(r)}</Badge>)}</div> : <p className="mt-2 text-sm text-muted">Not specified</p>}
            {data.professional?.open_to.length ? (<><h3 className="mt-4 text-sm font-semibold">Open to</h3><p className="mt-1 text-sm text-muted">{data.professional.open_to.map((o) => OPEN_TO.find((x) => x.value === o)?.label).join(', ')}</p></>) : null}
            <h3 className="mt-4 text-sm font-semibold">Availability</h3>
            <p className="mt-1 text-sm text-muted">{[AVAILABILITY.find((a) => a.value === p.availability)?.label, WORK_MODES.find((w) => w.value === p.work_mode)?.label].filter(Boolean).join(' · ') || 'Not specified'}</p>
            {p.commitment_note && <p className="mt-1 text-sm text-muted">{p.commitment_note}</p>}
            {p.industries.length > 0 && (<><h3 className="mt-4 text-sm font-semibold">Industries</h3><p className="mt-1 text-sm text-muted">{p.industries.map(industryName).join(', ')}</p></>)}
          </Card>
          {data.skills.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Skills</h2>
              <div className="mt-2 flex flex-wrap gap-1.5">{data.skills.map((s, i) => <Badge key={i} tone={s.level === 3 ? 'accent' : 'neutral'}>{s.skills?.name}</Badge>)}</div>
            </Card>
          )}
          {data.links.length > 0 && (
            <Card className="p-5">
              <h2 className="text-sm font-semibold">Links</h2>
              <ul className="mt-2 space-y-1.5 text-sm">
                {data.links.map((l) => <li key={l.id}><a href={l.url} target="_blank" rel="noopener noreferrer nofollow ugc" className="text-accent hover:underline">{l.label || LINK_KINDS.find((k) => k.value === l.kind)?.label}</a></li>)}
              </ul>
            </Card>
          )}
        </div>
      </div>

      {!isMe && (
        <>
          <ConnectModal open={modal === 'connect'} onClose={() => setModal(null)} userId={id} name={p.display_name} onSent={reload} />
          <ReportModal open={modal === 'report'} onClose={() => setModal(null)} userId={id} name={p.display_name} />
          <ConfirmModal open={modal === 'block'} onClose={() => setModal(null)} title={`Block ${p.display_name}?`} danger confirmLabel="Block"
            body="They will not be able to see your profile, send you requests or message you. Any connection and pending requests between you will be removed. They are not notified."
            onConfirm={async () => { await api.block(id); router.push('/app/discover'); }} />
          <ConfirmModal open={modal === 'remove'} onClose={() => setModal(null)} title="Remove connection?" danger confirmLabel="Remove"
            body="You will no longer be able to message each other, and any Think projects shared between you will be unshared."
            onConfirm={async () => { await api.removeConnection(id); reload(); }} />
        </>
      )}
    </div>
  );
}
