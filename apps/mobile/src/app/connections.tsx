import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { friendlyError } from '@groundwork/shared';
import { Avatar, Button, Card, EmptyState, ErrorState, Loading, Row, Screen, Segmented, Text } from '@/components/ui';
import { api } from '@/lib/supabase';
import { useAsync, useSession } from '@/lib/session';

type Tab = 'connections' | 'sent' | 'saved';

export default function Connections() {
  const { avatar } = useSession();
  const [tab, setTab] = useState<Tab>('connections');
  const d = useAsync(async () => {
    const [connections, sent, saved] = await Promise.all([api.connections(0), api.requests('sent'), api.savedProfiles()]);
    return { connections, sent, saved };
  }, []);
  return (
    <Screen edges={[]} refreshing={d.refreshing} onRefresh={d.refresh}>
      <Segmented value={tab} onChange={setTab} options={[{ value: 'connections', label: 'Connected' }, { value: 'sent', label: 'Sent' }, { value: 'saved', label: 'Saved' }]} />
      {d.loading ? <Loading /> : d.error && !d.data ? <ErrorState message={friendlyError(d.error)} onRetry={d.reload} /> : d.data && (
        <>
          {tab === 'connections' && (d.data.connections.length === 0 ? <EmptyState title="No connections yet" body="Find people in Discover and send a short request." /> : d.data.connections.map((c) => (
            <Card key={c.user_id} onPress={() => router.push(`/u/${c.user_id}`)}>
              <Row>
                <Avatar name={c.display_name} uri={avatar(c.avatar_path)} size={40} />
                <View style={{ flex: 1 }}><Text variant="label">{c.display_name}</Text><Text variant="small" numberOfLines={1}>{c.headline}</Text></View>
                {c.conversation_id && <Button small variant="secondary" title="Message" onPress={() => router.push(`/messages/${c.conversation_id}`)} />}
              </Row>
            </Card>
          )))}
          {tab === 'sent' && (d.data.sent.length === 0 ? <EmptyState title="No pending sent requests" /> : d.data.sent.map((r) => (
            <Card key={r.request_id}>
              <Row>
                <Avatar name={r.display_name} uri={avatar(r.avatar_path)} size={40} />
                <View style={{ flex: 1 }}><Text variant="label">{r.display_name}</Text><Text variant="small" numberOfLines={1}>{r.headline}</Text></View>
                <Button small variant="secondary" title="Withdraw" onPress={async () => { await api.withdrawRequest(r.request_id).catch(() => {}); d.reload(); }} />
              </Row>
            </Card>
          )))}
          {tab === 'saved' && (d.data.saved.filter((s) => s.profile).length === 0 ? <EmptyState title="No saved profiles" /> : d.data.saved.filter((s) => s.profile).map((s) => (
            <Card key={s.profile!.id} onPress={() => router.push(`/u/${s.profile!.id}`)}>
              <Row>
                <Avatar name={s.profile!.display_name} uri={avatar(s.profile!.avatar_path)} size={40} />
                <View style={{ flex: 1 }}><Text variant="label">{s.profile!.display_name}</Text><Text variant="small" numberOfLines={1}>{s.profile!.headline}</Text></View>
                <Button small variant="ghost" title="Remove" onPress={async () => { await api.save(s.profile!.id, false); d.reload(); }} />
              </Row>
            </Card>
          )))}
        </>
      )}
    </Screen>
  );
}
