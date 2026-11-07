'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import {
  AVAILABILITY, COUNTRIES, INTENTS, PAGE_SIZE, STAGES, WORK_MODES, friendlyError,
  type ProfileCard, type RecommendationCard, type SearchFilters,
} from '@groundwork/shared';
import { Avatar, Button, ChipGroup, EmptyState, ErrorState, Field, Input, PageHeader, Select, Skeleton, Tabs, buttonClass } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { PersonCard } from '@/components/app/PeopleUI';
import { InviteBox } from '@/components/app/InviteBox';

type Tab = 'recommended' | 'search' | 'saved';

function Grid({ children }: { children: React.ReactNode }) {
  return <ul className="grid gap-4 sm:grid-cols-2">{children}</ul>;
}
function LoadingGrid() {
  return <Grid>{Array.from({ length: 4 }).map((_, i) => <li key={i}><Skeleton className="h-52" /></li>)}</Grid>;
}

function Recommended() {
  const { api } = useApp();
  const [type, setType] = useState<string[]>([]);
  const [items, setItems] = useState<RecommendationCard[] | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const [loadingMore, setLoadingMore] = useState(false);

  async function load(p: number, reset: boolean) {
    try {
      const rows = await api.recommendations(p, type[0]);
      setError(null);
      setLoadedFor(type.join());
      setItems((prev) => (reset || !prev ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE_SIZE);
      setPage(p);
      if (p === 0) api.track('recommendations_viewed', { count: rows.length }).catch(() => {});
    } catch (e) { setError(e); }
  }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader: state is set after await
  useEffect(() => { load(0, true); }, [type.join()]);
  const shown = loadedFor === type.join() ? items : null;

  return (
    <div className="space-y-5">
      <ChipGroup single value={type} onChange={setType} options={[
        { value: 'cofounder', label: 'Potential co-founders' },
        { value: 'professional', label: 'Professionals' },
        { value: 'collaborator', label: 'Founders you could help' },
      ]} />
      {error ? <ErrorState message={friendlyError(error)} onRetry={() => load(0, true)} /> : shown === null ? <LoadingGrid /> : shown.length === 0 ? (
        <div className="space-y-4">
          <EmptyState title="No strong matches yet"
            body={<>We only recommend people who genuinely fit what you are looking for, and the network is still growing. Complete your profile, try <strong>Search</strong> with broader filters, or invite people you would like to build with.</>}
            action={<Link href="/app/profile" className={buttonClass('secondary')}>Improve my profile</Link>} />
          <InviteBox />
        </div>
      ) : (
        <>
          <Grid>{shown.map((p) => <PersonCard key={p.id} person={p} onDismiss={(id) => setItems((x) => (x ?? []).filter((y) => y.id !== id))} />)}</Grid>
          {hasMore && <div className="flex justify-center"><Button variant="secondary" loading={loadingMore} onClick={async () => { setLoadingMore(true); await load(page + 1, false); setLoadingMore(false); }}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}

function SearchPanel() {
  const { api, taxonomy } = useApp();
  const [f, setF] = useState<SearchFilters>({});
  const [applied, setApplied] = useState<SearchFilters>({});
  const [page, setPage] = useState(0);
  const [items, setItems] = useState<ProfileCard[]>([]);
  const [showFilters, setShowFilters] = useState(false);
  const { loading, error, reload } = useAsync(async () => {
    const rows = await api.search(applied, page);
    setItems((prev) => (page === 0 ? rows : [...prev, ...rows]));
    return rows;
  }, [JSON.stringify(applied), page]);
  const set = <K extends keyof SearchFilters>(k: K, v: SearchFilters[K]) => setF((x) => ({ ...x, [k]: v }));
  const apply = () => { setPage(0); setApplied(f); api.track('search_performed', { has_query: !!f.query }).catch(() => {}); };
  const activeCount = Object.entries(f).filter(([k, v]) => k !== 'query' && (Array.isArray(v) ? v.length : v != null && v !== '')).length;

  return (
    <div className="space-y-5">
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); apply(); }}>
        <Input placeholder="Search by name, headline or skill" value={f.query ?? ''} onChange={(e) => set('query', e.target.value)} aria-label="Search" />
        <Button type="button" variant="secondary" onClick={() => setShowFilters((s) => !s)} aria-expanded={showFilters}>Filters{activeCount ? ` (${activeCount})` : ''}</Button>
        <Button type="submit">Search</Button>
      </form>
      {showFilters && (
        <div className="grid gap-5 rounded-lg border border-line bg-surface p-4 md:grid-cols-2">
          <Field label="Role"><ChipGroup options={(taxonomy?.roles ?? []).filter((r) => !r.is_cofounder_role).map((r) => ({ value: r.slug, label: r.name }))} value={f.roles ?? []} onChange={(v) => set('roles', v)} /></Field>
          <Field label="Looking for"><ChipGroup options={(taxonomy?.roles ?? []).filter((r) => r.is_cofounder_role).map((r) => ({ value: r.slug, label: r.name }))} value={f.seeking ?? []} onChange={(v) => set('seeking', v)} /></Field>
          <Field label="Collaboration intention"><ChipGroup options={INTENTS.map((i) => ({ value: i.value, label: i.label }))} value={f.intents ?? []} onChange={(v) => set('intents', v)} /></Field>
          <Field label="Availability"><ChipGroup options={AVAILABILITY} value={f.availability ?? []} onChange={(v) => set('availability', v)} /></Field>
          <Field label="Startup stage"><ChipGroup options={STAGES} value={f.stages ?? []} onChange={(v) => set('stages', v)} /></Field>
          <Field label="Working preference"><ChipGroup options={WORK_MODES} value={f.workModes ?? []} onChange={(v) => set('workModes', v)} /></Field>
          <Field label="Industry">
            <Select value={f.industries?.[0] ?? ''} onChange={(e) => set('industries', e.target.value ? [e.target.value] : [])}>
              <option value="">Any industry</option>
              {(taxonomy?.industries ?? []).map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
            </Select>
          </Field>
          <Field label="Skill">
            <Select value={f.skills?.[0] ?? ''} onChange={(e) => set('skills', e.target.value ? [e.target.value] : [])}>
              <option value="">Any skill</option>
              {(taxonomy?.skills ?? []).map((s) => <option key={s.slug} value={s.slug}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Country">
            <Select value={f.country ?? ''} onChange={(e) => set('country', e.target.value || undefined)}>
              <option value="">Anywhere</option>
              {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Timezone within">
              <Select value={f.maxTzDiff ?? ''} onChange={(e) => set('maxTzDiff', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Any</option><option value="2">±2 hours</option><option value="4">±4 hours</option><option value="6">±6 hours</option>
              </Select>
            </Field>
            <Field label="Min. experience">
              <Select value={f.minExperience ?? ''} onChange={(e) => set('minExperience', e.target.value ? Number(e.target.value) : undefined)}>
                <option value="">Any</option><option value="2">2+ years</option><option value="5">5+ years</option><option value="10">10+ years</option>
              </Select>
            </Field>
          </div>
          <div className="flex gap-2 md:col-span-2">
            <Button onClick={apply}>Apply filters</Button>
            <Button variant="ghost" onClick={() => { setF({}); setApplied({}); setPage(0); }}>Clear</Button>
          </div>
        </div>
      )}
      {error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : loading && page === 0 ? <LoadingGrid /> : items.length === 0 ? (
        <EmptyState title="No one matches these filters" body="Try removing a filter or searching for a broader skill. The network is growing — save a search idea and check back." />
      ) : (
        <>
          <Grid>{items.map((p) => <PersonCard key={p.id} person={p} />)}</Grid>
          {items.length % PAGE_SIZE === 0 && <div className="flex justify-center"><Button variant="secondary" loading={loading} onClick={() => setPage((p) => p + 1)}>Load more</Button></div>}
        </>
      )}
    </div>
  );
}

function Saved() {
  const { api, avatar, roleName } = useApp();
  const { data, loading, error, reload } = useAsync(() => api.savedProfiles(), []);
  if (loading) return <LoadingGrid />;
  if (error) return <ErrorState message={friendlyError(error)} onRetry={reload} />;
  const rows = (data ?? []).filter((r) => r.profile);
  if (!rows.length) return <EmptyState title="No saved profiles" body="Save people from recommendations or search to come back to them later." />;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
      {rows.map((r) => (
        <li key={r.profile!.id} className="flex items-center gap-3 px-4 py-3">
          <Avatar name={r.profile!.display_name} src={avatar(r.profile!.avatar_path)} size={40} />
          <div className="min-w-0 flex-1">
            <Link href={`/app/u/${r.profile!.id}`} className="font-medium hover:underline">{r.profile!.display_name}</Link>
            <p className="truncate text-sm text-muted">{r.profile!.headline}{r.profile!.primary_role ? ` · ${roleName(r.profile!.primary_role)}` : ''}</p>
          </div>
          <Button size="sm" variant="ghost" onClick={async () => { await api.save(r.profile!.id, false); reload(); }}>Remove</Button>
        </li>
      ))}
    </ul>
  );
}

export default function DiscoverPage() {
  const [tab, setTab] = useState<Tab>('recommended');
  return (
    <>
      <PageHeader title="Discover" description="People who complement what you are building — with the reasons why." />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'recommended', label: 'Recommended' }, { value: 'search', label: 'Search' }, { value: 'saved', label: 'Saved' }]} />
      {tab === 'recommended' && <Recommended />}
      {tab === 'search' && <SearchPanel />}
      {tab === 'saved' && <Saved />}
    </>
  );
}
