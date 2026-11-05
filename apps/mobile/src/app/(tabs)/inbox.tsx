import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { friendlyError, relativeTime, type ConnectionRequestRow } from '@groundwork/shared';
import { Avatar, Button, Card, EmptyState, ErrorState, Loading, Notice, Row, Screen, Segmented, Text } from '@/components/ui';
import { openNotificationPath } from '@/lib/push';
import { api } from '@/lib/supabase';
import { useAsync, useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

type Tab = 'messages' | 'requests' | 'notifications';

export default function Inbox() {
  const { avatar, session } = useSession();
  const { c } = useTheme();
  const [tab, setTab] = useState<Tab>('messages');
  const d = useAsync(async () => {
    const [convs, requests, notes] = await Promise.all([api.conversations(0), api.requests('received'), api.notifications(50)]);
    return { convs, requests, notes };
  }, []);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const respond = async (r: ConnectionRequestRow, accept: boolean) => {
    setBusy(r.request_id); setErr(null);
    try { const conv = await api.respondRequest(r.request_id, accept); d.reload(); if (accept && conv) router.push(`/messages/${conv}`); }
    catch (e) { setErr(friendlyError(e)); } finally { setBusy(null); }
  };
  const unreadMsgs = d.data?.convs.reduce((s, x) => s + x.unread_count, 0) ?? 0;
  const unreadNotes = d.data?.notes.filter((n) => !n.read_at).length ?? 0;
  return (
    <Screen refreshing={d.refreshing} onRefresh={d.refresh}>
      <Text variant="title">Inbox</Text>
      <Segmented value={tab} onChange={setTab} options={[
        { value: 'messages', label: 'Messages', count: unreadMsgs },
        { value: 'requests', label: 'Requests', count: d.data?.requests.length },
        { value: 'notifications', label: 'Activity', count: unreadNotes },
      ]} />
      {err && <Notice tone="danger">{err}</Notice>}
      {d.loading ? <Loading /> : d.error && !d.data ? <ErrorState message={friendlyError(d.error)} onRetry={d.reload} /> : d.data && (
        <>
          {tab === 'messages' && (d.data.convs.length === 0 ? <EmptyState title="No conversations yet" body="A conversation opens when a connection request is accepted." /> : d.data.convs.map((cv) => (
            <Card key={cv.conversation_id} onPress={() => router.push(`/messages/${cv.conversation_id}`)}>
              <Row>
                <Avatar name={cv.peer_name} uri={avatar(cv.peer_avatar)} size={44} />
                <View style={{ flex: 1 }}>
                  <Text variant="label">{cv.peer_name}</Text>
                  <Text variant="small" numberOfLines={1} color={cv.unread_count ? c.text : undefined}>{cv.last_sender_id === session!.user.id ? 'You: ' : ''}{cv.last_message ?? 'Say hello'}</Text>
                </View>
                <View style={{ alignItems: 'flex-end', gap: 4 }}>
                  <Text variant="caption">{relativeTime(cv.last_message_at)}</Text>
                  {cv.unread_count > 0 && <View style={{ backgroundColor: c.accent, borderRadius: 10, paddingHorizontal: 6 }}><Text variant="caption" color={c.onAccent}>{cv.unread_count}</Text></View>}
                </View>
              </Row>
            </Card>
          )))}
          {tab === 'requests' && (
            <>
              {d.data.requests.length === 0 ? <EmptyState title="No pending requests" /> : d.data.requests.map((r) => (
                <Card key={r.request_id} style={{ gap: 10 }}>
                  <Row style={{ alignItems: 'flex-start' }}>
                    <Avatar name={r.display_name} uri={avatar(r.avatar_path)} size={44} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <Text variant="label" >{r.display_name}</Text>
                      <Text variant="small">{r.headline}</Text>
                      {r.message && <Text variant="body" style={{ marginTop: 4 }}>“{r.message}”</Text>}
                    </View>
                  </Row>
                  <Row>
                    <Button small title="Accept" loading={busy === r.request_id} onPress={() => respond(r, true)} />
                    <Button small variant="secondary" title="Decline" disabled={busy === r.request_id} onPress={() => respond(r, false)} />
                    <Button small variant="ghost" title="View" onPress={() => router.push(`/u/${r.user_id}`)} />
                  </Row>
                </Card>
              ))}
              <Button variant="ghost" title="Sent requests & connections" onPress={() => router.push('/connections')} />
            </>
          )}
          {tab === 'notifications' && (
            <>
              {unreadNotes > 0 && <Button small variant="secondary" title="Mark all as read" style={{ alignSelf: 'flex-start' }} onPress={async () => { await api.markNotificationsRead(); d.reload(); }} />}
              {d.data.notes.length === 0 ? <EmptyState title="You are all caught up" /> : d.data.notes.map((n) => (
                <Card key={n.id} onPress={() => { if (!n.read_at) api.markNotificationsRead([n.id]).catch(() => {}); openNotificationPath(n.data?.path); }}>
                  <Row style={{ alignItems: 'flex-start' }}>
                    <View style={{ width: 8, height: 8, borderRadius: 4, marginTop: 6, backgroundColor: n.read_at ? 'transparent' : c.accent }} />
                    <View style={{ flex: 1 }}><Text variant="label">{n.title}</Text>{n.body && n.type !== 'message' && <Text variant="small" numberOfLines={2}>{n.body}</Text>}</View>
                    <Text variant="caption">{relativeTime(n.created_at)}</Text>
                  </Row>
                </Card>
              ))}
            </>
          )}
        </>
      )}
    </Screen>
  );
}
