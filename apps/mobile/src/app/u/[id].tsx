import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, View } from 'react-native';
import {
  AVAILABILITY, INTENTS, LINK_KINDS, STAGES, WORK_MODES, countryName, friendlyError,
  type Profile, type ProfileLink, type StartupProject,
} from '@groundwork/shared';
import { Avatar, Badge, Button, Card, EmptyState, ErrorState, Loading, Notice, Row, Screen, Text } from '@/components/ui';
import { ConnectSheet, ReportSheet } from '@/components/people';
import { api, supabase } from '@/lib/supabase';
import { useAsync, useSession } from '@/lib/session';

export default function ProfileView() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session, avatar, roleName, industryName } = useSession();
  const me = session!.user.id;
  const isMe = id === me;
  const [sheet, setSheet] = useState<'connect' | 'report' | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const d = useAsync(async () => {
    const [p, skills, links, sp, fp] = await Promise.all([
      supabase.from('profiles').select('*').eq('id', id).maybeSingle(),
      supabase.from('user_skills').select('level, skills(name)').eq('user_id', id).order('level', { ascending: false }),
      supabase.from('profile_links').select('*').eq('user_id', id),
      supabase.from('startup_projects').select('*').eq('owner_id', id).eq('is_primary', true).maybeSingle(),
      supabase.from('founder_profiles').select('cofounder_requirements').eq('user_id', id).maybeSingle(),
    ]);
    if (p.error) throw p.error;
    return {
      profile: p.data as Profile | null,
      skills: (skills.data ?? []) as unknown as { level: number; skills: { name: string } | null }[],
      links: (links.data ?? []) as ProfileLink[],
      startup: sp.data as StartupProject | null,
      requirements: (fp.data?.cofounder_requirements as string | null) ?? null,
      rel: isMe ? null : await api.relationship(id, me),
    };
  }, [id]);

  if (d.loading) return <Loading />;
  if (d.error && !d.data) return <Screen edges={[]}><ErrorState message={friendlyError(d.error)} onRetry={d.reload} /></Screen>;
  const p = d.data?.profile;
  if (!p) return <Screen edges={[]}><EmptyState title="Profile not available" body="This profile does not exist, is private, or is no longer available." /></Screen>;
  const rel = d.data!.rel;
  const act = async (fn: () => Promise<unknown>) => { setErr(null); try { await fn(); d.reload(); } catch (e) { setErr(friendlyError(e)); } };

  return (
    <Screen edges={[]} refreshing={d.refreshing} onRefresh={d.refresh}>
      <Stack.Screen options={{ title: p.display_name }} />
      <Row style={{ alignItems: 'flex-start' }}>
        <Avatar name={p.display_name} uri={avatar(p.avatar_path)} size={72} />
        <View style={{ flex: 1, gap: 4 }}>
          <Text variant="title" style={{ fontSize: 22 }}>{p.display_name}</Text>
          <Text variant="muted">{p.headline}</Text>
          <Text variant="caption">{[roleName(p.primary_role), [p.city, countryName(p.country_code)].filter(Boolean).join(', '), p.timezone?.replace(/_/g, ' ')].filter(Boolean).join(' · ')}</Text>
        </View>
      </Row>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{p.intents.map((i) => <Badge key={i} label={INTENTS.find((x) => x.value === i)?.label ?? i} />)}</View>
      {err && <Notice tone="danger">{err}</Notice>}
      {rel && (
        <View style={{ gap: 8 }}>
          {rel.connected ? (
            <Button title="Message" onPress={async () => { const c = (await api.connections()).find((x) => x.user_id === id); if (c?.conversation_id) router.push(`/messages/${c.conversation_id}`); }} />
          ) : rel.pendingRequestId ? (
            rel.pendingFromMe ? <Button variant="secondary" title="Withdraw request" onPress={() => act(() => api.withdrawRequest(rel.pendingRequestId!))} />
              : <Button title="Respond to request" onPress={() => router.push('/inbox')} />
          ) : !rel.blocked && <Button title="Connect" onPress={() => setSheet('connect')} />}
          <Row>
            {!rel.blocked && <Button small variant="secondary" title={rel.saved ? 'Saved' : 'Save'} onPress={() => act(() => api.save(id, !rel.saved))} />}
            <Button small variant="ghost" title="Report" onPress={() => setSheet('report')} />
            {rel.blocked ? <Button small variant="ghost" title="Unblock" onPress={() => act(() => api.unblock(id))} /> : (
              <Button small variant="ghost" title="Block" onPress={() => Alert.alert(`Block ${p.display_name}?`, 'They will not be able to see your profile, send requests or message you. Any connection between you is removed.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Block', style: 'destructive', onPress: () => act(async () => { await api.block(id); router.back(); }) },
              ])} />
            )}
            {rel.connected && <Button small variant="ghost" title="Disconnect" onPress={() => Alert.alert('Remove connection?', 'You will no longer be able to message each other.', [
              { text: 'Cancel', style: 'cancel' }, { text: 'Remove', style: 'destructive', onPress: () => act(() => api.removeConnection(id)) },
            ])} />}
          </Row>
        </View>
      )}
      {isMe && <Button variant="secondary" title="Edit profile" onPress={() => router.push('/edit-profile')} />}
      {!!p.bio && <Card><Text variant="label">About</Text><Text variant="body" style={{ marginTop: 6 }}>{p.bio}</Text></Card>}
      {d.data!.startup && (
        <Card style={{ gap: 6 }}>
          <Text variant="label">{d.data!.startup.name || 'What they are building'}</Text>
          <Row><Badge label={STAGES.find((s) => s.value === d.data!.startup!.stage)?.label ?? ''} />{d.data!.startup.industry && <Badge label={industryName(d.data!.startup.industry)} />}</Row>
          <Text variant="body">{d.data!.startup.summary}</Text>
          {d.data!.startup.problem && <Text variant="small">Problem: {d.data!.startup.problem}</Text>}
          {d.data!.requirements && <Text variant="small">Co-founder requirements: {d.data!.requirements}</Text>}
        </Card>
      )}
      <Card style={{ gap: 6 }}>
        <Text variant="label">Looking for</Text>
        {p.seeking_roles.length ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{p.seeking_roles.map((r) => <Badge key={r} tone="accent" label={roleName(r)} />)}</View> : <Text variant="small">Not specified</Text>}
        <Text variant="small">{[AVAILABILITY.find((a) => a.value === p.availability)?.label, WORK_MODES.find((w) => w.value === p.work_mode)?.label].filter(Boolean).join(' · ')}</Text>
        {p.industries.length > 0 && <Text variant="small">Industries: {p.industries.map(industryName).join(', ')}</Text>}
      </Card>
      {d.data!.skills.length > 0 && <Card style={{ gap: 8 }}><Text variant="label">Skills</Text><View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{d.data!.skills.map((s, i) => <Badge key={i} tone={s.level === 3 ? 'accent' : 'neutral'} label={s.skills?.name ?? ''} />)}</View></Card>}
      {d.data!.links.length > 0 && <Card style={{ gap: 4 }}><Text variant="label">Links</Text>{d.data!.links.map((l) => <Button key={l.id} small variant="ghost" style={{ alignSelf: 'flex-start' }} title={l.label || (LINK_KINDS.find((k) => k.value === l.kind)?.label ?? 'Link')} onPress={() => Linking.openURL(l.url)} />)}</Card>}
      {!isMe && (
        <>
          <ConnectSheet visible={sheet === 'connect'} onClose={() => setSheet(null)} userId={id} name={p.display_name} onSent={d.reload} />
          <ReportSheet visible={sheet === 'report'} onClose={() => setSheet(null)} userId={id} name={p.display_name} />
        </>
      )}
    </Screen>
  );
}
