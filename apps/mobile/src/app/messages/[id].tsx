import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, Pressable, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { friendlyError, messageSchema, type ConversationRow, type Message } from '@groundwork/shared';
import { Button, EmptyState, ErrorState, Loading, Notice, Text } from '@/components/ui';
import { ReportSheet } from '@/components/people';
import { api, supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { font, useTheme } from '@/lib/theme';

type Item = Message & { pending?: boolean; failed?: boolean };

export default function Thread() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const { c } = useTheme();
  const me = session!.user.id;
  const [conv, setConv] = useState<ConversationRow | null | undefined>(undefined);
  const [msgs, setMsgs] = useState<Item[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendErr, setSendErr] = useState<string | null>(null);
  const [report, setReport] = useState<string | null | undefined>(undefined);

  const load = useCallback(async () => {
    try {
      const [convs, m] = await Promise.all([api.conversations(0), api.messages(id)]);
      setConv(convs.find((x) => x.conversation_id === id) ?? null);
      setMsgs(m); setHasOlder(m.length === 40); setError(null);
      api.markRead(id).catch(() => {});
    } catch (e) { setError(e); }
  }, [id]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const ch = supabase.channel(`conv:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const m = payload.new as Message;
        setMsgs((prev) => prev.some((x) => x.id === m.id) ? prev : [...prev.filter((x) => !(x.pending && x.body === m.body && m.sender_id === me)), m]);
        if (m.sender_id !== me) api.markRead(id).catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [id, me]);

  async function send() {
    const p = messageSchema.safeParse(draft);
    if (!p.success) return;
    setSendErr(null);
    const temp: Item = { id: `tmp-${Date.now()}`, conversation_id: id, sender_id: me, body: p.data, created_at: new Date().toISOString(), pending: true };
    setMsgs((m) => [...m, temp]); setDraft('');
    try {
      const saved = await api.sendMessage(id, me, p.data);
      setMsgs((m) => { const w = m.filter((x) => x.id !== temp.id); return w.some((x) => x.id === saved.id) ? w : [...w, saved]; });
    } catch (e) {
      setMsgs((m) => m.map((x) => (x.id === temp.id ? { ...x, pending: false, failed: true } : x)));
      setSendErr(friendlyError(e));
    }
  }

  if (error && conv === undefined) return <View style={{ padding: 16 }}><ErrorState message={friendlyError(error)} onRetry={load} /></View>;
  if (conv === undefined) return <Loading />;
  if (conv === null) return <View style={{ padding: 16 }}><EmptyState title="Conversation not found" /></View>;

  const data = [...msgs].reverse(); // inverted list: newest at the bottom
  return (
    <SafeAreaView edges={['bottom']} style={{ flex: 1, backgroundColor: c.bg }}>
      <Stack.Screen options={{
        title: conv.peer_name,
        headerRight: () => (
          <View style={{ flexDirection: 'row', gap: 4 }}>
            <Button small variant="ghost" title="Profile" onPress={() => router.push(`/u/${conv.peer_id}`)} />
            <Button small variant="ghost" title="Report" onPress={() => setReport(null)} />
          </View>
        ),
      }} />
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <FlatList
          inverted data={data} keyExtractor={(m) => m.id}
          contentContainerStyle={{ padding: 12, gap: 6 }}
          ListEmptyComponent={<View style={{ transform: [{ scaleY: -1 }], padding: 24 }}><Text variant="muted" style={{ textAlign: 'center' }}>You are connected. Introduce yourself and suggest a next step.</Text></View>}
          onEndReached={async () => {
            if (!hasOlder || !msgs[0]) return;
            const older = await api.messages(id, msgs[0].created_at);
            setHasOlder(older.length === 40); setMsgs((m) => [...older, ...m]);
          }}
          renderItem={({ item }) => {
            const mine = item.sender_id === me;
            return (
              <Pressable onLongPress={() => !mine && setReport(item.id)} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '82%' }}
                accessibilityHint={!mine ? 'Long press to report this message' : undefined}>
                <View style={{ backgroundColor: mine ? c.accent : c.surface, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 8, opacity: item.pending ? 0.6 : 1 }}>
                  <Text variant="body" color={mine ? c.onAccent : c.text}>{item.body}</Text>
                  <Text variant="caption" color={mine ? c.onAccent : c.textSubtle} style={{ marginTop: 2, opacity: 0.8 }}>
                    {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}{item.failed ? ' · not sent' : ''}
                  </Text>
                </View>
              </Pressable>
            );
          }}
        />
        {sendErr && <View style={{ paddingHorizontal: 12 }}><Notice tone="danger">{sendErr}</Notice></View>}
        {conv.can_send ? (
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8, padding: 10, borderTopWidth: 0.5, borderColor: c.border }}>
            <TextInput value={draft} onChangeText={setDraft} placeholder="Write a message…" placeholderTextColor={c.textSubtle} multiline maxLength={4000}
              accessibilityLabel="Message"
              style={{ flex: 1, maxHeight: 120, minHeight: 44, borderWidth: 1, borderColor: c.borderStrong, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, color: c.text, fontFamily: font.regular, fontSize: 15 }} />
            <Button title="Send" disabled={!draft.trim()} onPress={send} />
          </View>
        ) : <View style={{ padding: 16 }}><Text variant="muted" style={{ textAlign: 'center' }}>Read-only — you are no longer connected.</Text></View>}
      </KeyboardAvoidingView>
      <ReportSheet visible={report !== undefined} onClose={() => setReport(undefined)} userId={conv.peer_id} name={conv.peer_name} messageId={report ?? null} />
    </SafeAreaView>
  );
}
