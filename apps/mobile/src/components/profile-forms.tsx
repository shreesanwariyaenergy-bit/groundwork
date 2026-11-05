import * as ImageManipulator from 'expo-image-manipulator';
import * as ImagePicker from 'expo-image-picker';
import { useEffect, useMemo, useState } from 'react';
import { FlatList, Pressable, View } from 'react-native';
import {
  AVAILABILITY, COUNTRIES, INTENTS, LINK_KINDS, OPEN_TO, PROJECT_VISIBILITY, STAGES, TIMEZONES, VISIBILITY, WORK_MODES,
  fieldErrors, friendlyError, guessTimezone, linkSchema, profileBasicsSchema, startupSchema,
  type Availability, type ProfileLink, type ProjectVisibility, type StartupStage, type UserIntent, type WorkMode,
} from '@groundwork/shared';
import { supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { Avatar, Badge, Button, Card, ChipGroup, Input, Notice, Row, Sheet, Text } from './ui';

function useSaver() {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  return {
    saving, error, saved,
    run: async (fn: () => Promise<void>) => {
      setSaving(true); setError(null); setSaved(false);
      try { await fn(); setSaved(true); setTimeout(() => setSaved(false), 2000); return true; }
      catch (e) { setError(friendlyError(e)); return false; }
      finally { setSaving(false); }
    },
  };
}
function check(res: { error: { message: string } | null }) { if (res.error) throw new Error(res.error.message); }

function SaveBar({ s, label = 'Save', onPress }: { s: ReturnType<typeof useSaver>; label?: string; onPress: () => void }) {
  const { c } = useTheme();
  return (
    <View style={{ gap: 8 }}>
      {s.error && <Notice tone="danger">{s.error}</Notice>}
      <Button title={s.saved ? 'Saved' : label} loading={s.saving} onPress={onPress} />
      {s.saved && <Text variant="caption" color={c.accent} style={{ textAlign: 'center' }}>Changes saved</Text>}
    </View>
  );
}

/** Searchable single-select presented as a bottom sheet (country, timezone, role…). */
export function SelectField({ label, value, options, onChange, placeholder = 'Choose…' }: {
  label: string; value: string | null; options: { value: string; label: string }[]; onChange: (v: string | null) => void; placeholder?: string;
}) {
  const { c } = useTheme();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const filtered = useMemo(() => options.filter((o) => o.label.toLowerCase().includes(q.toLowerCase())), [options, q]);
  const current = options.find((o) => o.value === value)?.label;
  return (
    <View style={{ gap: 6 }}>
      <Text variant="label">{label}</Text>
      <Pressable onPress={() => setOpen(true)} accessibilityRole="button" accessibilityLabel={`${label}: ${current ?? placeholder}`}
        style={{ minHeight: 48, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 8, paddingHorizontal: 12, justifyContent: 'center', backgroundColor: c.surfaceRaised }}>
        <Text variant="body" color={current ? c.text : c.textSubtle}>{current ?? placeholder}</Text>
      </Pressable>
      <Sheet visible={open} onClose={() => setOpen(false)} title={label}>
        {options.length > 12 && <Input placeholder="Search" value={q} onChangeText={setQ} autoFocus />}
        <View>
          {value && <Pressable onPress={() => { onChange(null); setOpen(false); }} style={{ minHeight: 44, justifyContent: 'center' }}><Text variant="muted">Clear selection</Text></Pressable>}
          <FlatList scrollEnabled={false} data={filtered.slice(0, 200)} keyExtractor={(o) => o.value} renderItem={({ item }) => (
            <Pressable onPress={() => { onChange(item.value); setOpen(false); setQ(''); }} style={{ minHeight: 44, justifyContent: 'center', borderBottomWidth: 0.5, borderColor: c.border }}>
              <Text variant="body" color={item.value === value ? c.accent : c.text}>{item.label}</Text>
            </Pressable>
          )} />
        </View>
      </Sheet>
    </View>
  );
}

export function IntentsSection({ onSaved, label }: { onSaved?: () => void; label?: string }) {
  const { profile, session, refreshProfile } = useSession();
  const { c } = useTheme();
  const [intents, setIntents] = useState<UserIntent[]>(profile?.intents ?? []);
  const s = useSaver();
  return (
    <View style={{ gap: 10 }}>
      {INTENTS.map((i) => {
        const on = intents.includes(i.value);
        return (
          <Pressable key={i.value} onPress={() => setIntents(on ? intents.filter((x) => x !== i.value) : [...intents, i.value])} accessibilityRole="checkbox" accessibilityState={{ checked: on }}
            style={{ borderWidth: 1, borderRadius: 12, padding: 14, borderColor: on ? c.accent : c.borderStrong, backgroundColor: on ? c.accentSoft : c.surfaceRaised, gap: 2 }}>
            <Text variant="label">{i.label}</Text><Text variant="small">{i.description}</Text>
          </Pressable>
        );
      })}
      <SaveBar s={s} label={label} onPress={() => {
        if (!intents.length) return;
        s.run(async () => { check(await supabase.from('profiles').update({ intents }).eq('id', session!.user.id)); await refreshProfile(); }).then((ok) => ok && onSaved?.());
      }} />
    </View>
  );
}

export function LookingForSection({ onSaved, label }: { onSaved?: () => void; label?: string }) {
  const { profile, session, taxonomy, refreshProfile } = useSession();
  const uid = session!.user.id;
  const [seeking, setSeeking] = useState<string[]>(profile?.seeking_roles ?? []);
  const [industries, setIndustries] = useState<string[]>(profile?.industries ?? []);
  const [stages, setStages] = useState<StartupStage[]>(profile?.preferred_stages ?? []);
  const [openTo, setOpenTo] = useState<string[]>([]);
  const isBuilder = (profile?.intents ?? []).some((i) => i !== 'founder');
  const s = useSaver();
  useEffect(() => { supabase.from('professional_profiles').select('open_to').eq('user_id', uid).maybeSingle().then(({ data }) => data && setOpenTo(data.open_to)); }, [uid]);
  return (
    <View style={{ gap: 14 }}>
      <Text variant="label">Who are you looking for?</Text>
      <ChipGroup max={8} value={seeking} onChange={setSeeking} options={(taxonomy?.roles ?? []).filter((r) => r.slug !== 'founder').map((r) => ({ value: r.slug, label: r.name }))} />
      {isBuilder && (<><Text variant="label">How do you want to contribute?</Text><ChipGroup value={openTo} onChange={setOpenTo} options={OPEN_TO} /></>)}
      <Text variant="label">Industries</Text>
      <ChipGroup max={8} value={industries} onChange={setIndustries} options={(taxonomy?.industries ?? []).map((i) => ({ value: i.slug, label: i.name }))} />
      <Text variant="label">Startup stages</Text>
      <ChipGroup value={stages} onChange={setStages} options={STAGES} />
      <SaveBar s={s} label={label} onPress={() => s.run(async () => {
        check(await supabase.from('profiles').update({ seeking_roles: seeking, industries, preferred_stages: stages }).eq('id', uid));
        if (isBuilder) check(await supabase.from('professional_profiles').upsert({ user_id: uid, open_to: openTo }));
        await refreshProfile();
      }).then((ok) => ok && onSaved?.())} />
    </View>
  );
}

export function BasicsSection({ onSaved, label }: { onSaved?: () => void; label?: string }) {
  const { profile, session, taxonomy, refreshProfile } = useSession();
  const p = profile!;
  const [f, setF] = useState({
    display_name: p.display_name, headline: p.headline, bio: p.bio, country_code: p.country_code, city: p.city ?? '',
    timezone: p.timezone ?? guessTimezone(), years_experience: p.years_experience, primary_role: p.primary_role,
    availability: p.availability, work_mode: p.work_mode, commitment_note: p.commitment_note ?? '',
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const s = useSaver();
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <View style={{ gap: 14 }}>
      <Input label="Full name" value={f.display_name} onChangeText={(v) => set('display_name', v)} maxLength={80} error={errors.display_name} />
      <Input label="Headline" value={f.headline} onChangeText={(v) => set('headline', v)} maxLength={140} error={errors.headline} hint="e.g. ML engineer, 6 years in fintech, open to co-founding" />
      <SelectField label="Main role" value={f.primary_role} onChange={(v) => set('primary_role', v)} options={(taxonomy?.roles ?? []).filter((r) => !r.is_cofounder_role).map((r) => ({ value: r.slug, label: r.name }))} />
      <Input label="Short introduction" value={f.bio} onChangeText={(v) => set('bio', v)} multiline maxLength={2000} hint={`${f.bio.length}/2000`} />
      <SelectField label="Country" value={f.country_code} onChange={(v) => set('country_code', v)} options={COUNTRIES.map((x) => ({ value: x.code, label: x.name }))} />
      <Input label="City (optional)" value={f.city} onChangeText={(v) => set('city', v)} maxLength={80} />
      <SelectField label="Timezone" value={f.timezone} onChange={(v) => set('timezone', v)} options={TIMEZONES.map((t) => ({ value: t, label: t.replace(/_/g, ' ') }))} />
      <Input label="Years of experience" keyboardType="number-pad" value={f.years_experience == null ? '' : String(f.years_experience)}
        onChangeText={(v) => set('years_experience', v === '' ? null : Math.max(0, Math.min(60, parseInt(v, 10) || 0)))} />
      <Text variant="label">Availability</Text>
      <ChipGroup single value={f.availability ? [f.availability] : []} onChange={(v) => set('availability', (v[0] ?? null) as Availability | null)} options={AVAILABILITY} />
      <Text variant="label">Working preference</Text>
      <ChipGroup single value={f.work_mode ? [f.work_mode] : []} onChange={(v) => set('work_mode', (v[0] ?? null) as WorkMode | null)} options={WORK_MODES} />
      <Input label="Commitment notes (optional)" value={f.commitment_note} onChangeText={(v) => set('commitment_note', v)} maxLength={300} />
      <SaveBar s={s} label={label} onPress={() => {
        const parsed = profileBasicsSchema.safeParse(f);
        if (!parsed.success) return setErrors(fieldErrors(parsed));
        setErrors({});
        s.run(async () => { check(await supabase.from('profiles').update(parsed.data).eq('id', session!.user.id)); await refreshProfile(); }).then((ok) => ok && onSaved?.());
      }} />
    </View>
  );
}

export function AvatarSection() {
  const { profile, session, avatar, refreshProfile } = useSession();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const uid = session!.user.id;
  return (
    <Row>
      <Avatar name={profile!.display_name} uri={avatar(profile!.avatar_path)} size={64} />
      <View style={{ flex: 1, gap: 6 }}>
        <Button small variant="secondary" title={profile!.avatar_path ? 'Change photo' : 'Add photo'} loading={busy} style={{ alignSelf: 'flex-start' }} onPress={async () => {
          setError(null);
          const res = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1 });
          if (res.canceled || !res.assets[0]) return;
          setBusy(true);
          try {
            const out = await ImageManipulator.manipulateAsync(res.assets[0].uri, [{ resize: { width: 512 } }], { compress: 0.8, format: ImageManipulator.SaveFormat.JPEG });
            const body = await (await fetch(out.uri)).arrayBuffer();
            const path = `${uid}/${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}.jpg`;
            const up = await supabase.storage.from('avatars').upload(path, body, { contentType: 'image/jpeg' });
            if (up.error) throw up.error;
            const old = profile!.avatar_path;
            check(await supabase.from('profiles').update({ avatar_path: path }).eq('id', uid));
            if (old) await supabase.storage.from('avatars').remove([old]);
            await refreshProfile();
          } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
        }} />
        <Text variant="caption">Resized and compressed before upload.</Text>
        {error && <Text variant="small">{error}</Text>}
      </View>
    </Row>
  );
}

export function SkillsSection() {
  const { session, taxonomy } = useSession();
  const { c } = useTheme();
  const uid = session!.user.id;
  const [mine, setMine] = useState<number[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { supabase.from('user_skills').select('skill_id').eq('user_id', uid).then(({ data }) => setMine((data ?? []).map((d) => d.skill_id as number))); }, [uid]);
  const skills = taxonomy?.skills ?? [];
  const matches = q.trim() ? skills.filter((s) => s.name.toLowerCase().includes(q.toLowerCase()) && !mine?.includes(s.id)).slice(0, 6) : [];
  return (
    <View style={{ gap: 10 }}>
      <Input placeholder="Search skills — e.g. Python, Figma, B2B sales" value={q} onChangeText={setQ} accessibilityLabel="Search skills" />
      {matches.map((m) => (
        <Pressable key={m.id} onPress={async () => {
          setError(null);
          const { error } = await supabase.from('user_skills').insert({ user_id: uid, skill_id: m.id, level: 2 });
          if (error) return setError(friendlyError(error));
          setMine((x) => [...(x ?? []), m.id]); setQ('');
        }} style={{ minHeight: 44, justifyContent: 'center', paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.surface }}>
          <Text variant="body">+ {m.name}</Text>
        </Pressable>
      ))}
      {error && <Notice tone="danger">{error}</Notice>}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {(mine ?? []).map((id) => (
          <Pressable key={id} onPress={async () => { const { error } = await supabase.from('user_skills').delete().eq('user_id', uid).eq('skill_id', id); if (!error) setMine((x) => (x ?? []).filter((y) => y !== id)); }}
            accessibilityLabel={`Remove ${skills.find((s) => s.id === id)?.name}`}
            style={{ minHeight: 36, paddingHorizontal: 12, borderRadius: 8, backgroundColor: c.accentSoft, justifyContent: 'center' }}>
            <Text variant="small" color={c.text}>{skills.find((s) => s.id === id)?.name ?? '…'}  ×</Text>
          </Pressable>
        ))}
      </View>
      <Text variant="caption">{mine?.length ?? 0}/25 · tap a skill to remove it. Add at least three.</Text>
    </View>
  );
}

export function LinksSection() {
  const { session } = useSession();
  const uid = session!.user.id;
  const [links, setLinks] = useState<ProfileLink[]>([]);
  const [kind, setKind] = useState<ProfileLink['kind'][]>(['linkedin']);
  const [url, setUrl] = useState('');
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { supabase.from('profile_links').select('*').eq('user_id', uid).then(({ data }) => setLinks((data ?? []) as ProfileLink[])); }, [uid]);
  return (
    <View style={{ gap: 10 }}>
      {links.map((l) => (
        <Row key={l.id} style={{ justifyContent: 'space-between' }}>
          <View style={{ flex: 1 }}><Badge label={LINK_KINDS.find((k) => k.value === l.kind)?.label ?? l.kind} /><Text variant="small" numberOfLines={1}>{l.url}</Text></View>
          <Button small variant="ghost" title="Remove" onPress={async () => { const { error } = await supabase.from('profile_links').delete().eq('id', l.id); if (!error) setLinks((x) => x.filter((y) => y.id !== l.id)); }} />
        </Row>
      ))}
      <ChipGroup single value={kind} onChange={(v) => v.length && setKind(v)} options={LINK_KINDS} />
      <Input placeholder="https://" value={url} onChangeText={setUrl} autoCapitalize="none" keyboardType="url" error={error} />
      <Button small variant="secondary" title="Add link" style={{ alignSelf: 'flex-start' }} onPress={async () => {
        const p = linkSchema.safeParse({ kind: kind[0], url, label: null });
        if (!p.success) return setError(fieldErrors(p).url ?? 'Invalid link');
        setError(null);
        const { data, error } = await supabase.from('profile_links').insert({ ...p.data, user_id: uid }).select('*').single();
        if (error) return setError(friendlyError(error));
        setLinks((x) => [...x, data as ProfileLink]); setUrl('');
      }} />
    </View>
  );
}

export function StartupSection({ onSaved, label }: { onSaved?: () => void; label?: string }) {
  const { session, taxonomy } = useSession();
  const uid = session!.user.id;
  const [id, setId] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [f, setF] = useState({ name: '', summary: '', problem: '', target_customer: '', industry: null as string | null, stage: 'idea' as StartupStage,
    team_size: 1, commitment_expectation: null as Availability | null, work_mode: null as WorkMode | null, visibility: 'members' as ProjectVisibility });
  const [req, setReq] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const s = useSaver();
  useEffect(() => {
    Promise.all([
      supabase.from('startup_projects').select('*').eq('owner_id', uid).eq('is_primary', true).maybeSingle(),
      supabase.from('founder_profiles').select('cofounder_requirements').eq('user_id', uid).maybeSingle(),
    ]).then(([p, fp]) => {
      if (p.data) {
        setId(p.data.id);
        setF({ name: p.data.name ?? '', summary: p.data.summary, problem: p.data.problem ?? '', target_customer: p.data.target_customer ?? '', industry: p.data.industry, stage: p.data.stage,
          team_size: p.data.team_size, commitment_expectation: p.data.commitment_expectation, work_mode: p.data.work_mode, visibility: p.data.visibility });
      }
      setReq(fp.data?.cofounder_requirements ?? '');
      setLoaded(true);
    });
  }, [uid]);
  if (!loaded) return <Text variant="muted">Loading…</Text>;
  const set = <K extends keyof typeof f>(k: K, v: (typeof f)[K]) => setF((x) => ({ ...x, [k]: v }));
  return (
    <View style={{ gap: 14 }}>
      <Notice>Shown on your profile according to the visibility below. Your Think projects stay private.</Notice>
      <Input label="Startup or project name (optional)" value={f.name} onChangeText={(v) => set('name', v)} maxLength={100} />
      <Input label="Idea summary" value={f.summary} onChangeText={(v) => set('summary', v)} multiline maxLength={1000} error={errors.summary} hint="Public pitch — share only what members may see." />
      <Input label="Problem being solved (optional)" value={f.problem} onChangeText={(v) => set('problem', v)} multiline maxLength={1000} />
      <Input label="Target customer (optional)" value={f.target_customer} onChangeText={(v) => set('target_customer', v)} maxLength={500} />
      <SelectField label="Industry" value={f.industry} onChange={(v) => set('industry', v)} options={(taxonomy?.industries ?? []).map((i) => ({ value: i.slug, label: i.name }))} />
      <Text variant="label">Stage</Text>
      <ChipGroup single value={[f.stage]} onChange={(v) => v[0] && set('stage', v[0])} options={STAGES} />
      <Input label="Team size" keyboardType="number-pad" value={String(f.team_size)} onChangeText={(v) => set('team_size', Math.max(1, Math.min(500, parseInt(v, 10) || 1)))} />
      <Text variant="label">Commitment expected from collaborators</Text>
      <ChipGroup single value={f.commitment_expectation ? [f.commitment_expectation] : []} onChange={(v) => set('commitment_expectation', (v[0] ?? null) as Availability | null)} options={AVAILABILITY} />
      <Input label="Co-founder requirements (optional)" value={req} onChangeText={setReq} multiline maxLength={1000} />
      <Text variant="label">Who can see this startup?</Text>
      <ChipGroup single value={[f.visibility]} onChange={(v) => v[0] && set('visibility', v[0])} options={PROJECT_VISIBILITY} />
      <SaveBar s={s} label={label} onPress={() => {
        const parsed = startupSchema.safeParse(f);
        if (!parsed.success) return setErrors(fieldErrors(parsed));
        setErrors({});
        s.run(async () => {
          if (id) check(await supabase.from('startup_projects').update(parsed.data).eq('id', id));
          else {
            const r = await supabase.from('startup_projects').insert({ ...parsed.data, owner_id: uid, is_primary: true }).select('id').single();
            check(r); setId(r.data!.id);
          }
          check(await supabase.from('founder_profiles').upsert({ user_id: uid, looking_for_cofounder: true, cofounder_requirements: req.trim() || null, commitment_expectation: parsed.data.commitment_expectation }));
        }).then((ok) => ok && onSaved?.());
      }} />
    </View>
  );
}

export function VisibilitySection({ onSaved, label, requireAdult }: { onSaved?: () => void; label?: string; requireAdult?: boolean }) {
  const { profile, session, refreshProfile } = useSession();
  const { c } = useTheme();
  const [vis, setVis] = useState(profile!.visibility);
  const [adult, setAdult] = useState(profile!.is_adult_confirmed);
  const s = useSaver();
  return (
    <View style={{ gap: 10 }}>
      {VISIBILITY.map((v) => (
        <Pressable key={v.value} onPress={() => setVis(v.value)} accessibilityRole="radio" accessibilityState={{ checked: vis === v.value }}>
          <Card style={{ borderColor: vis === v.value ? c.accent : c.border, backgroundColor: vis === v.value ? c.accentSoft : c.surfaceRaised, gap: 2 }}>
            <Text variant="label">{v.label}</Text><Text variant="small">{v.description}</Text>
          </Card>
        </Pressable>
      ))}
      <Notice>Think projects are always private unless you share one with a specific connection.</Notice>
      {requireAdult && !profile!.is_adult_confirmed && (
        <Pressable onPress={() => setAdult(!adult)} accessibilityRole="checkbox" accessibilityState={{ checked: adult }} style={{ minHeight: 44, justifyContent: 'center' }}>
          <Text variant="body">{adult ? '☑' : '☐'}  I confirm I am 18 years of age or older</Text>
        </Pressable>
      )}
      <SaveBar s={s} label={label} onPress={() => {
        if (requireAdult && !adult) return;
        s.run(async () => {
          check(await supabase.from('profiles').update({ visibility: vis, ...(requireAdult ? { is_adult_confirmed: true } : {}) }).eq('id', session!.user.id));
          await refreshProfile();
        }).then((ok) => ok && onSaved?.());
      }} />
    </View>
  );
}
