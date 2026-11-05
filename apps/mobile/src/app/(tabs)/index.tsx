import { router } from 'expo-router';
import { View } from 'react-native';
import { friendlyError, profileCompletion, relativeTime } from '@groundwork/shared';
import { Avatar, Button, Card, EmptyState, ErrorState, Loading, Notice, Row, Screen, Section, Text } from '@/components/ui';
import { PersonCard } from '@/components/people';
import { api, supabase } from '@/lib/supabase';
import { useAsync, useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

export default function Home() {
  const { profile, session, avatar } = useSession();
  const { c } = useTheme();
  const uid = session!.user.id;
  const d = useAsync(async () => {
    const [recs, requests, convs, projects, counts] = await Promise.all([
      api.recommendations(0), api.requests('received'), api.conversations(0), api.thinkProjects(),
      Promise.all([
        supabase.from('user_skills').select('skill_id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('profile_links').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('user_experiences').select('id', { count: 'exact', head: true }).eq('user_id', uid),
        supabase.from('startup_projects').select('summary').eq('owner_id', uid).eq('is_primary', true).maybeSingle(),
      ]),
    ]);
    const completion = profileCompletion({ profile: profile!, skillCount: counts[0].count ?? 0, linkCount: counts[1].count ?? 0, experienceCount: counts[2].count ?? 0, startup: counts[3].data });
    return { recs, requests, convs, projects, completion };
  }, [profile?.updated_at]);

  return (
    <Screen refreshing={d.refreshing} onRefresh={d.refresh}>
      <Text variant="title">Hi{profile?.display_name ? `, ${profile.display_name.split(' ')[0]}` : ''}</Text>
      {!profile?.email_verified && <Notice tone="warning">Verify your email to unlock full connection limits.</Notice>}
      {profile?.account_status !== 'active' && <Notice tone="danger">Your account is {profile?.account_status}. Some features are unavailable.</Notice>}
      {d.loading ? <Loading /> : d.error && !d.data ? <ErrorState message={friendlyError(d.error)} onRetry={d.reload} /> : d.data && (
        <>
          {d.data.completion.percent < 100 && (
            <Card onPress={() => router.push('/edit-profile')} style={{ gap: 8 }}>
              <Row style={{ justifyContent: 'space-between' }}><Text variant="label">Profile completeness</Text><Text variant="label">{d.data.completion.percent}%</Text></Row>
              <View style={{ height: 6, borderRadius: 3, backgroundColor: c.border }}><View style={{ height: 6, borderRadius: 3, backgroundColor: c.accent, width: `${d.data.completion.percent}%` }} /></View>
              {d.data.completion.items.filter((x) => !x.done).slice(0, 2).map((x) => <Text key={x.key} variant="small">→ {x.label}</Text>)}
            </Card>
          )}
          {d.data.requests.length > 0 && (
            <Card onPress={() => router.push('/connections')}><Text variant="label">{d.data.requests.length} pending connection request{d.data.requests.length > 1 ? 's' : ''}</Text><Text variant="small">Tap to respond</Text></Card>
          )}
          <Section title="Recommended for you" action={<Button small variant="ghost" title="See all" onPress={() => router.push('/discover')} />}>
            {d.data.recs.length === 0
              ? <EmptyState title="No strong matches yet" body="The network is still growing. Complete your profile or search with filters." action={<Button small variant="secondary" title="Search people" onPress={() => router.push('/discover')} />} />
              : d.data.recs.slice(0, 3).map((p) => <PersonCard key={p.id} person={p} />)}
          </Section>
          <Section title="Recent conversations">
            {d.data.convs.length === 0 ? <Text variant="muted">Messaging opens when a connection request is accepted.</Text> : d.data.convs.slice(0, 3).map((cv) => (
              <Card key={cv.conversation_id} onPress={() => router.push(`/messages/${cv.conversation_id}`)}>
                <Row>
                  <Avatar name={cv.peer_name} uri={avatar(cv.peer_avatar)} size={36} />
                  <View style={{ flex: 1 }}><Text variant="label">{cv.peer_name}</Text><Text variant="small" numberOfLines={1}>{cv.last_message ?? 'Say hello'}</Text></View>
                  <Text variant="caption">{relativeTime(cv.last_message_at)}</Text>
                </Row>
              </Card>
            ))}
          </Section>
          <Section title="Think projects" action={<Button small variant="ghost" title="Open" onPress={() => router.push('/think')} />}>
            {d.data.projects.length === 0 ? <Button variant="secondary" title="Start your first Think project" onPress={() => router.push('/think/new')} /> :
              d.data.projects.slice(0, 3).map((p) => <Card key={p.id} onPress={() => router.push(`/think/${p.id}`)}><Text variant="label">{p.title}</Text></Card>)}
          </Section>
        </>
      )}
    </Screen>
  );
}
