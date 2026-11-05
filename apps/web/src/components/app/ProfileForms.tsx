'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  AVAILABILITY, COUNTRIES, INTENTS, LINK_KINDS, OPEN_TO, PROJECT_VISIBILITY, STAGES, TIMEZONES, VISIBILITY, WORK_MODES,
  experienceSchema, fieldErrors, friendlyError, guessTimezone, linkSchema, profileBasicsSchema, startupSchema,
  type Experience, type FounderProfile, type ProfileLink, type ProfessionalProfile, type StartupProject, type UserIntent,
} from '@groundwork/shared';
import { Alert, Avatar, Badge, Button, Checkbox, ChipGroup, Field, Input, Select, Textarea } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { useApp } from './AppProvider';

function useSaver() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  async function run(fn: () => Promise<void>) {
    setSaving(true); setError(null); setSaved(false);
    try { await fn(); setSaved(true); setTimeout(() => setSaved(false), 2500); return true; }
    catch (e) { setError(friendlyError(e)); return false; }
    finally { setSaving(false); }
  }
  return { saving, error, saved, run };
}

function Actions({ saving, saved, label = 'Save', onBack }: { saving: boolean; saved: boolean; label?: string; onBack?: () => void }) {
  return (
    <div className="flex items-center gap-3 pt-2">
      {onBack && <Button type="button" variant="ghost" onClick={onBack}>Back</Button>}
      <Button type="submit" loading={saving}>{label}</Button>
      {saved && <span className="text-sm text-accent">Saved</span>}
    </div>
  );
}

const sb = () => getBrowserClient();
function check<T>(res: { error: { message: string } | null; data?: T | null }) {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

// ------------------------------------------------------------------ Intents
export function IntentsForm({ onSaved, submitLabel, onBack }: { onSaved?: () => void; submitLabel?: string; onBack?: () => void }) {
  const { profile, user, refreshProfile } = useApp();
  const [intents, setIntents] = useState<UserIntent[]>(profile.intents);
  const s = useSaver();
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (!intents.length) return;
      if (await s.run(async () => { check(await sb().from('profiles').update({ intents }).eq('id', user.id)); await refreshProfile(); })) onSaved?.();
    }}>
      <div className="grid gap-3 sm:grid-cols-2">
        {INTENTS.map((i) => {
          const on = intents.includes(i.value);
          return (
            <button type="button" key={i.value} aria-pressed={on}
              onClick={() => setIntents(on ? intents.filter((x) => x !== i.value) : [...intents, i.value])}
              className={`rounded-lg border p-4 text-left transition-colors ${on ? 'border-accent bg-accent-soft' : 'border-line-strong hover:border-fg'}`}>
              <div className="font-medium text-fg">{i.label}</div>
              <div className="mt-1 text-sm text-muted">{i.description}</div>
            </button>
          );
        })}
      </div>
      <p className="text-sm text-muted">Choose all that apply.</p>
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      <Actions saving={s.saving} saved={s.saved} label={submitLabel} onBack={onBack} />
      {!intents.length && <p className="text-sm text-danger">Choose at least one.</p>}
    </form>
  );
}

// ------------------------------------------------------------------ Looking for
export function LookingForForm({ onSaved, submitLabel, onBack }: { onSaved?: () => void; submitLabel?: string; onBack?: () => void }) {
  const { profile, user, taxonomy, refreshProfile } = useApp();
  const [seeking, setSeeking] = useState<string[]>(profile.seeking_roles);
  const [industries, setIndustries] = useState<string[]>(profile.industries);
  const [stages, setStages] = useState(profile.preferred_stages);
  const [openTo, setOpenTo] = useState<string[]>([]);
  const isBuilder = profile.intents.some((i) => i !== 'founder');
  const s = useSaver();
  useEffect(() => {
    sb().from('professional_profiles').select('open_to').eq('user_id', user.id).maybeSingle().then(({ data }) => data && setOpenTo(data.open_to));
  }, [user.id]);
  const roleOptions = (taxonomy?.roles ?? []).filter((r) => r.slug !== 'founder').map((r) => ({ value: r.slug, label: r.name }));
  return (
    <form className="space-y-6" onSubmit={async (e) => {
      e.preventDefault();
      if (await s.run(async () => {
        check(await sb().from('profiles').update({ seeking_roles: seeking, industries, preferred_stages: stages }).eq('id', user.id));
        if (isBuilder) check(await sb().from('professional_profiles').upsert({ user_id: user.id, open_to: openTo }));
        await refreshProfile();
      })) onSaved?.();
    }}>
      <Field label="Who are you looking for?" hint="Choose up to 8. This drives your recommendations.">
        {taxonomy ? <ChipGroup options={roleOptions} value={seeking} onChange={setSeeking} max={8} /> : <p className="text-sm text-muted">Loading…</p>}
      </Field>
      {isBuilder && (
        <Field label="How do you want to contribute?" hint="Shown to founders on your profile.">
          <ChipGroup options={OPEN_TO} value={openTo} onChange={setOpenTo} />
        </Field>
      )}
      <Field label="Industries you care about" hint="Up to 8.">
        <ChipGroup options={(taxonomy?.industries ?? []).map((i) => ({ value: i.slug, label: i.name }))} value={industries} onChange={setIndustries} max={8} />
      </Field>
      <Field label="Startup stages you want to work with" optional>
        <ChipGroup options={STAGES} value={stages} onChange={setStages} />
      </Field>
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      <Actions saving={s.saving} saved={s.saved} label={submitLabel} onBack={onBack} />
    </form>
  );
}

// ------------------------------------------------------------------ Basics
export function BasicsForm({ onSaved, submitLabel, onBack }: { onSaved?: () => void; submitLabel?: string; onBack?: () => void }) {
  const { profile, user, taxonomy, refreshProfile } = useApp();
  const [f, setF] = useState({
    display_name: profile.display_name, headline: profile.headline, bio: profile.bio,
    country_code: profile.country_code, city: profile.city ?? '', timezone: profile.timezone ?? guessTimezone(),
    years_experience: profile.years_experience, primary_role: profile.primary_role, availability: profile.availability,
    work_mode: profile.work_mode, commitment_note: profile.commitment_note ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const s = useSaver();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <form className="space-y-4" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const parsed = profileBasicsSchema.safeParse(f);
      if (!parsed.success) return setErrors(fieldErrors(parsed));
      setErrors({});
      if (await s.run(async () => { check(await sb().from('profiles').update(parsed.data).eq('id', user.id)); await refreshProfile(); })) onSaved?.();
    }}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Full name" htmlFor="dn" error={errors.display_name}><Input id="dn" value={f.display_name} onChange={(e) => set('display_name', e.target.value)} maxLength={80} /></Field>
        <Field label="Main role" htmlFor="role">
          <Select id="role" value={f.primary_role ?? ''} onChange={(e) => set('primary_role', e.target.value || null)}>
            <option value="">Choose…</option>
            {(taxonomy?.roles ?? []).filter((r) => !r.is_cofounder_role).map((r) => <option key={r.slug} value={r.slug}>{r.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Headline" htmlFor="hl" error={errors.headline} hint="e.g. “ML engineer, 6 years in fintech, open to co-founding”">
        <Input id="hl" value={f.headline} onChange={(e) => set('headline', e.target.value)} maxLength={140} />
      </Field>
      <Field label="Short introduction" htmlFor="bio" hint={`${f.bio.length}/2000 · What you have built, what you want to build next.`}>
        <Textarea id="bio" value={f.bio} onChange={(e) => set('bio', e.target.value)} maxLength={2000} rows={5} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Country" htmlFor="cc">
          <Select id="cc" value={f.country_code ?? ''} onChange={(e) => set('country_code', e.target.value || null)}>
            <option value="">Choose…</option>
            {COUNTRIES.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
          </Select>
        </Field>
        <Field label="City" htmlFor="city" optional><Input id="city" value={f.city} onChange={(e) => set('city', e.target.value)} maxLength={80} /></Field>
        <Field label="Timezone" htmlFor="tz">
          <Select id="tz" value={f.timezone ?? ''} onChange={(e) => set('timezone', e.target.value || null)}>
            <option value="">Choose…</option>
            {TIMEZONES.map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </Select>
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Years of experience" htmlFor="yrs">
          <Input id="yrs" type="number" min={0} max={60} value={f.years_experience ?? ''} onChange={(e) => set('years_experience', e.target.value === '' ? null : Math.max(0, Math.min(60, Number(e.target.value))))} />
        </Field>
        <Field label="Availability" htmlFor="av">
          <Select id="av" value={f.availability ?? ''} onChange={(e) => set('availability', (e.target.value || null) as typeof f.availability)}>
            <option value="">Choose…</option>
            {AVAILABILITY.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </Field>
        <Field label="Working preference" htmlFor="wm">
          <Select id="wm" value={f.work_mode ?? ''} onChange={(e) => set('work_mode', (e.target.value || null) as typeof f.work_mode)}>
            <option value="">Choose…</option>
            {WORK_MODES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Commitment notes" htmlFor="cn" optional hint="e.g. “Can go full-time from March; prefer equity-based roles.”">
        <Input id="cn" value={f.commitment_note} onChange={(e) => set('commitment_note', e.target.value)} maxLength={300} />
      </Field>
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      <Actions saving={s.saving} saved={s.saved} label={submitLabel} onBack={onBack} />
    </form>
  );
}

// ------------------------------------------------------------------ Skills
export function SkillsEditor() {
  const { user, taxonomy } = useApp();
  const [selected, setSelected] = useState<{ skill_id: number; level: number }[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    sb().from('user_skills').select('skill_id, level').eq('user_id', user.id).then(({ data }) => setSelected(data ?? []));
  }, [user.id]);
  const skills = taxonomy?.skills ?? [];
  const byId = useMemo(() => new Map(skills.map((s) => [s.id, s])), [skills]);
  const matches = q.trim().length ? skills.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) && !selected?.some((x) => x.skill_id === s.id)).slice(0, 8) : [];

  async function add(id: number) {
    setError(null);
    const { error } = await sb().from('user_skills').insert({ user_id: user.id, skill_id: id, level: 2 });
    if (error) return setError(friendlyError(error));
    setSelected((s) => [...(s ?? []), { skill_id: id, level: 2 }]); setQ('');
  }
  async function remove(id: number) {
    const { error } = await sb().from('user_skills').delete().eq('user_id', user.id).eq('skill_id', id);
    if (!error) setSelected((s) => (s ?? []).filter((x) => x.skill_id !== id));
  }
  async function setLevel(id: number, level: number) {
    const { error } = await sb().from('user_skills').update({ level }).eq('user_id', user.id).eq('skill_id', id);
    if (!error) setSelected((s) => (s ?? []).map((x) => (x.skill_id === id ? { ...x, level } : x)));
  }
  return (
    <div className="space-y-3">
      <div className="relative">
        <Input placeholder="Search skills — e.g. Python, Figma, B2B sales" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Search skills" />
        {matches.length > 0 && (
          <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-md border border-line bg-raised shadow-lg">
            {matches.map((m) => (
              <li key={m.id}><button type="button" onClick={() => add(m.id)} className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-surface">
                {m.name}<span className="text-xs text-subtle">{taxonomy?.categories.find((c) => c.slug === m.category)?.name}</span>
              </button></li>
            ))}
          </ul>
        )}
      </div>
      {error && <Alert tone="danger">{error}</Alert>}
      {selected === null ? <p className="text-sm text-muted">Loading…</p> : selected.length === 0 ? (
        <p className="text-sm text-muted">No skills yet. Add at least three so the right people can find you.</p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {selected.map((s) => (
            <li key={s.skill_id} className="flex items-center justify-between gap-3 px-3 py-2">
              <span className="text-sm text-fg">{byId.get(s.skill_id)?.name ?? '…'}</span>
              <div className="flex items-center gap-2">
                <Select className="h-8 w-32 text-xs" value={s.level} onChange={(e) => setLevel(s.skill_id, Number(e.target.value))} aria-label="Level">
                  <option value={1}>Familiar</option><option value={2}>Proficient</option><option value={3}>Expert</option>
                </Select>
                <button type="button" onClick={() => remove(s.skill_id)} className="text-sm text-muted hover:text-danger" aria-label={`Remove ${byId.get(s.skill_id)?.name}`}>Remove</button>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="text-xs text-subtle">{selected?.length ?? 0}/25 skills</p>
    </div>
  );
}

// ------------------------------------------------------------------ Startup (founders)
export function StartupForm({ onSaved, submitLabel, onBack }: { onSaved?: () => void; submitLabel?: string; onBack?: () => void }) {
  const { user, taxonomy } = useApp();
  const [loaded, setLoaded] = useState(false);
  const [projectId, setProjectId] = useState<string | null>(null);
  const [f, setF] = useState({
    name: '', summary: '', problem: '', target_customer: '', industry: null as string | null, stage: 'idea' as StartupProject['stage'],
    team_size: 1, commitment_expectation: null as StartupProject['commitment_expectation'], work_mode: null as StartupProject['work_mode'],
    visibility: 'members' as StartupProject['visibility'],
  });
  const [fp, setFp] = useState({ looking_for_cofounder: true, cofounder_requirements: '', previous_ventures: '' });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const s = useSaver();
  useEffect(() => {
    Promise.all([
      sb().from('startup_projects').select('*').eq('owner_id', user.id).eq('is_primary', true).maybeSingle(),
      sb().from('founder_profiles').select('*').eq('user_id', user.id).maybeSingle(),
    ]).then(([p, fpr]) => {
      const d = p.data as StartupProject | null;
      if (d) {
        setProjectId(d.id);
        setF({ name: d.name ?? '', summary: d.summary, problem: d.problem ?? '', target_customer: d.target_customer ?? '', industry: d.industry,
          stage: d.stage, team_size: d.team_size, commitment_expectation: d.commitment_expectation, work_mode: d.work_mode, visibility: d.visibility });
      }
      const fd = fpr.data as FounderProfile | null;
      if (fd) setFp({ looking_for_cofounder: fd.looking_for_cofounder, cofounder_requirements: fd.cofounder_requirements ?? '', previous_ventures: fd.previous_ventures ?? '' });
      setLoaded(true);
    });
  }, [user.id]);
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  if (!loaded) return <p className="text-sm text-muted">Loading…</p>;
  return (
    <form className="space-y-4" noValidate onSubmit={async (e) => {
      e.preventDefault();
      const parsed = startupSchema.safeParse(f);
      if (!parsed.success) return setErrors(fieldErrors(parsed));
      setErrors({});
      if (await s.run(async () => {
        if (projectId) check(await sb().from('startup_projects').update(parsed.data).eq('id', projectId));
        else {
          const row = check<{ id: string }>(await sb().from('startup_projects').insert({ ...parsed.data, owner_id: user.id, is_primary: true }).select('id').single());
          setProjectId(row.id);
        }
        check(await sb().from('founder_profiles').upsert({
          user_id: user.id, looking_for_cofounder: fp.looking_for_cofounder,
          cofounder_requirements: fp.cofounder_requirements.trim() || null, previous_ventures: fp.previous_ventures.trim() || null,
          commitment_expectation: parsed.data.commitment_expectation,
        }));
      })) onSaved?.();
    }}>
      <Alert tone="neutral">This appears on your profile according to the visibility you choose below. It is separate from your private Think projects, which are never shown to others.</Alert>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Startup or project name" htmlFor="sn" optional><Input id="sn" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={100} /></Field>
        <Field label="Industry" htmlFor="si">
          <Select id="si" value={f.industry ?? ''} onChange={(e) => set('industry', e.target.value || null)}>
            <option value="">Choose…</option>
            {(taxonomy?.industries ?? []).map((i) => <option key={i.slug} value={i.slug}>{i.name}</option>)}
          </Select>
        </Field>
      </div>
      <Field label="Idea summary" htmlFor="ss" error={errors.summary} hint="Public pitch — share only what you are comfortable with members seeing.">
        <Textarea id="ss" value={f.summary} onChange={(e) => set('summary', e.target.value)} maxLength={1000} rows={3} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Problem being solved" htmlFor="sp" optional><Textarea id="sp" value={f.problem} onChange={(e) => set('problem', e.target.value)} maxLength={1000} rows={3} /></Field>
        <Field label="Target customer" htmlFor="stc" optional><Textarea id="stc" value={f.target_customer} onChange={(e) => set('target_customer', e.target.value)} maxLength={500} rows={3} /></Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Stage" htmlFor="sst">
          <Select id="sst" value={f.stage} onChange={(e) => set('stage', e.target.value as typeof f.stage)}>
            {STAGES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label="Team size" htmlFor="sts"><Input id="sts" type="number" min={1} max={500} value={f.team_size} onChange={(e) => set('team_size', Math.max(1, Number(e.target.value) || 1))} /></Field>
        <Field label="Commitment expected" htmlFor="sce">
          <Select id="sce" value={f.commitment_expectation ?? ''} onChange={(e) => set('commitment_expectation', (e.target.value || null) as typeof f.commitment_expectation)}>
            <option value="">Choose…</option>
            {AVAILABILITY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </Select>
        </Field>
        <Field label="Working arrangement" htmlFor="swm">
          <Select id="swm" value={f.work_mode ?? ''} onChange={(e) => set('work_mode', (e.target.value || null) as typeof f.work_mode)}>
            <option value="">Choose…</option>
            {WORK_MODES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
          </Select>
        </Field>
      </div>
      <Checkbox checked={fp.looking_for_cofounder} onChange={(v) => setFp((x) => ({ ...x, looking_for_cofounder: v }))} label="I am looking for a co-founder" />
      {fp.looking_for_cofounder && (
        <Field label="Co-founder requirements" htmlFor="cr" optional hint="Skills, commitment and what you offer (e.g. equity split expectations).">
          <Textarea id="cr" value={fp.cofounder_requirements} onChange={(e) => setFp((x) => ({ ...x, cofounder_requirements: e.target.value }))} maxLength={1000} rows={3} />
        </Field>
      )}
      <Field label="Previous ventures" htmlFor="pv" optional>
        <Textarea id="pv" value={fp.previous_ventures} onChange={(e) => setFp((x) => ({ ...x, previous_ventures: e.target.value }))} maxLength={1000} rows={2} />
      </Field>
      <Field label="Who can see this startup?" htmlFor="sv">
        <Select id="sv" value={f.visibility} onChange={(e) => set('visibility', e.target.value as typeof f.visibility)}>
          {PROJECT_VISIBILITY.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
        </Select>
      </Field>
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      <Actions saving={s.saving} saved={s.saved} label={submitLabel} onBack={onBack} />
    </form>
  );
}

// ------------------------------------------------------------------ Links
export function LinksEditor() {
  const { user } = useApp();
  const [links, setLinks] = useState<ProfileLink[] | null>(null);
  const [draft, setDraft] = useState({ kind: 'linkedin' as ProfileLink['kind'], url: '', label: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { sb().from('profile_links').select('*').eq('user_id', user.id).order('created_at').then(({ data }) => setLinks((data ?? []) as ProfileLink[])); }, [user.id]);
  return (
    <div className="space-y-3">
      {links?.length ? (
        <ul className="divide-y divide-line rounded-md border border-line">
          {links.map((l) => (
            <li key={l.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
              <span className="min-w-0 truncate"><Badge>{LINK_KINDS.find((k) => k.value === l.kind)?.label}</Badge> <span className="ml-2 text-muted">{l.url}</span></span>
              <button className="text-muted hover:text-danger" onClick={async () => {
                const { error } = await sb().from('profile_links').delete().eq('id', l.id);
                if (!error) setLinks((x) => (x ?? []).filter((y) => y.id !== l.id));
              }}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No links yet. A LinkedIn, GitHub or portfolio link helps people trust your profile.</p>}
      <form className="flex flex-col gap-2 sm:flex-row" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const p = linkSchema.safeParse(draft);
        if (!p.success) return setError(fieldErrors(p).url ?? 'Invalid link');
        if ((links?.length ?? 0) >= 10) return setError('Up to 10 links.');
        setError(null);
        const { data, error } = await sb().from('profile_links').insert({ ...p.data, user_id: user.id }).select('*').single();
        if (error) return setError(friendlyError(error));
        setLinks((x) => [...(x ?? []), data as ProfileLink]); setDraft({ ...draft, url: '', label: '' });
      }}>
        <Select className="sm:w-36" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as ProfileLink['kind'] })} aria-label="Link type">
          {LINK_KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
        </Select>
        <Input placeholder="https://" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} aria-label="URL" />
        <Button type="submit" variant="secondary">Add</Button>
      </form>
      {error && <p className="text-sm text-danger">{error}</p>}
    </div>
  );
}

// ------------------------------------------------------------------ Experience
export function ExperienceEditor() {
  const { user } = useApp();
  const [items, setItems] = useState<Experience[] | null>(null);
  const [draft, setDraft] = useState({ title: '', organization: '', start_date: '', end_date: '', description: '' });
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { sb().from('user_experiences').select('*').eq('user_id', user.id).order('start_date', { ascending: false, nullsFirst: false }).then(({ data }) => setItems((data ?? []) as Experience[])); }, [user.id]);
  return (
    <div className="space-y-3">
      {items?.length ? (
        <ul className="space-y-2">
          {items.map((x) => (
            <li key={x.id} className="flex items-start justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
              <div>
                <div className="font-medium text-fg">{x.title}{x.organization && <span className="font-normal text-muted"> · {x.organization}</span>}</div>
                <div className="text-xs text-subtle">{x.start_date?.slice(0, 7) ?? '—'} – {x.end_date?.slice(0, 7) ?? 'present'}</div>
              </div>
              <button className="text-muted hover:text-danger" onClick={async () => {
                const { error } = await sb().from('user_experiences').delete().eq('id', x.id);
                if (!error) setItems((i) => (i ?? []).filter((y) => y.id !== x.id));
              }}>Remove</button>
            </li>
          ))}
        </ul>
      ) : <p className="text-sm text-muted">No experience added.</p>}
      <form className="grid gap-2 rounded-md border border-dashed border-line-strong p-3 sm:grid-cols-2" noValidate onSubmit={async (e) => {
        e.preventDefault();
        const p = experienceSchema.safeParse({ ...draft, start_date: draft.start_date ? draft.start_date + '-01' : null, end_date: draft.end_date ? draft.end_date + '-01' : null });
        if (!p.success) return setError(fieldErrors(p).title ?? 'Check the dates');
        setError(null);
        const { data, error } = await sb().from('user_experiences').insert({ ...p.data, user_id: user.id }).select('*').single();
        if (error) return setError(friendlyError(error));
        setItems((i) => [data as Experience, ...(i ?? [])]); setDraft({ title: '', organization: '', start_date: '', end_date: '', description: '' });
      }}>
        <Input placeholder="Title (e.g. Senior engineer)" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} aria-label="Title" />
        <Input placeholder="Organisation" value={draft.organization} onChange={(e) => setDraft({ ...draft, organization: e.target.value })} aria-label="Organisation" />
        <label className="text-xs text-muted">Start<Input type="month" value={draft.start_date} onChange={(e) => setDraft({ ...draft, start_date: e.target.value })} /></label>
        <label className="text-xs text-muted">End (leave empty if current)<Input type="month" value={draft.end_date} onChange={(e) => setDraft({ ...draft, end_date: e.target.value })} /></label>
        <div className="sm:col-span-2 flex items-center gap-3"><Button type="submit" variant="secondary" size="sm">Add experience</Button>{error && <span className="text-sm text-danger">{error}</span>}</div>
      </form>
    </div>
  );
}

// ------------------------------------------------------------------ Avatar
async function resizeImage(file: File, max = 512): Promise<Blob> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale); canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return await new Promise((res, rej) => canvas.toBlob((b) => (b ? res(b) : rej(new Error('encode_failed'))), 'image/jpeg', 0.85));
}

export function AvatarUploader() {
  const { profile, user, avatar, refreshProfile } = useApp();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="flex items-center gap-4">
      <Avatar name={profile.display_name} src={avatar(profile.avatar_path)} size={64} />
      <div className="space-y-1">
        <div className="flex gap-2">
          <Button type="button" variant="secondary" size="sm" loading={busy} onClick={() => input.current?.click()}>{profile.avatar_path ? 'Change photo' : 'Upload photo'}</Button>
          {profile.avatar_path && <Button type="button" variant="ghost" size="sm" onClick={async () => {
            await sb().storage.from('avatars').remove([profile.avatar_path!]);
            await sb().from('profiles').update({ avatar_path: null }).eq('id', user.id); await refreshProfile();
          }}>Remove</Button>}
        </div>
        <p className="text-xs text-subtle">JPG, PNG or WebP. Resized to 512px before upload.</p>
        {error && <p className="text-sm text-danger">{error}</p>}
      </div>
      <input ref={input} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={async (e) => {
        const file = e.target.files?.[0]; e.target.value = '';
        if (!file) return;
        if (!/^image\/(jpeg|png|webp)$/.test(file.type)) return setError('Please choose a JPG, PNG or WebP image.');
        if (file.size > 10 * 1024 * 1024) return setError('Image is too large (max 10 MB before resizing).');
        setBusy(true); setError(null);
        try {
          const blob = await resizeImage(file);
          const path = `${user.id}/${crypto.randomUUID()}.jpg`;
          const up = await sb().storage.from('avatars').upload(path, blob, { contentType: 'image/jpeg', upsert: false });
          if (up.error) throw up.error;
          const old = profile.avatar_path;
          check(await sb().from('profiles').update({ avatar_path: path }).eq('id', user.id));
          if (old) await sb().storage.from('avatars').remove([old]);
          await refreshProfile();
        } catch (err) { setError(friendlyError(err)); } finally { setBusy(false); }
      }} />
    </div>
  );
}

// ------------------------------------------------------------------ Visibility
export function VisibilityForm({ onSaved, submitLabel, requireAdult, onBack }: { onSaved?: () => void; submitLabel?: string; requireAdult?: boolean; onBack?: () => void }) {
  const { profile, user, refreshProfile } = useApp();
  const [visibility, setVisibility] = useState(profile.visibility);
  const [adult, setAdult] = useState(profile.is_adult_confirmed);
  const s = useSaver();
  return (
    <form className="space-y-4" onSubmit={async (e) => {
      e.preventDefault();
      if (requireAdult && !adult) return;
      if (await s.run(async () => {
        check(await sb().from('profiles').update({ visibility, ...(requireAdult ? { is_adult_confirmed: true } : {}) }).eq('id', user.id));
        await refreshProfile();
      })) onSaved?.();
    }}>
      <div className="space-y-2">
        {VISIBILITY.map((v) => (
          <label key={v.value} className={`flex cursor-pointer gap-3 rounded-lg border p-4 ${visibility === v.value ? 'border-accent bg-accent-soft' : 'border-line-strong'}`}>
            <input type="radio" name="visibility" value={v.value} checked={visibility === v.value} onChange={() => setVisibility(v.value)} className="mt-1 accent-[var(--accent)]" />
            <span><span className="block font-medium text-fg">{v.label}</span><span className="text-sm text-muted">{v.description}</span></span>
          </label>
        ))}
      </div>
      <Alert tone="neutral">Your Think projects are always private, whatever you choose here. They are only shared if you explicitly share a project with a connection.</Alert>
      {requireAdult && !profile.is_adult_confirmed && (
        <Checkbox checked={adult} onChange={setAdult} label="I confirm I am 18 years of age or older" />
      )}
      {s.error && <Alert tone="danger">{s.error}</Alert>}
      <Actions saving={s.saving} saved={s.saved} label={submitLabel} onBack={onBack} />
    </form>
  );
}

export type { ProfessionalProfile };
