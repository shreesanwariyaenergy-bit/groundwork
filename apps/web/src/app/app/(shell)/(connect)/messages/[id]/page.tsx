'use client';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { friendlyError, messageSchema, type ConversationRow, type Message } from '@groundwork/shared';
import { Alert, Avatar, Button, EmptyState, ErrorState, Skeleton, Textarea } from '@/components/ui';
import { useApp } from '@/components/app/AppProvider';
import { ReportModal } from '@/components/app/PeopleUI';
import { getBrowserClient } from '@/lib/supabase/client';

type Pending = Message & { pending?: boolean; failed?: boolean };

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === y.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ThreadPage() {
  const { id } = useParams<{ id: string }>();
  const { api, user, avatar } = useApp();
  const [conv, setConv] = useState<ConversationRow | null>(null);
  const [messages, setMessages] = useState<Pending[] | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [hasOlder, setHasOlder] = useState(false);
  const [draft, setDraft] = useState('');
  const [sendError, setSendError] = useState<string | null>(null);
  const [reportMsg, setReportMsg] = useState<string | null | undefined>(undefined);
  const bottom = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const [convs, msgs] = await Promise.all([api.conversations(0), api.messages(id)]);
      setConv(convs.find((c) => c.conversation_id === id) ?? null);
      setMessages(msgs);
      setHasOlder(msgs.length === 40);
      setError(null);
      api.markRead(id).catch(() => {});
    } catch (e) { setError(e); }
  }, [api, id]);

  // eslint-disable-next-line react-hooks/set-state-in-effect -- async loader: state is set after await
  useEffect(() => { load(); }, [load]);

  // Realtime: new messages in this conversation (RLS restricts rows to members).
  useEffect(() => {
    const sb = getBrowserClient();
    const ch = sb.channel(`conv:${id}`)
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${id}` }, (payload) => {
        const m = payload.new as Message;
        setMessages((prev) => {
          if (!prev) return prev;
          if (prev.some((x) => x.id === m.id)) return prev;
          return [...prev.filter((x) => !(x.pending && x.body === m.body && m.sender_id === user.id)), m];
        });
        if (m.sender_id !== user.id) api.markRead(id).catch(() => {});
      })
      .subscribe();
    return () => { sb.removeChannel(ch); };
  }, [api, id, user.id]);

  useEffect(() => { bottom.current?.scrollIntoView({ block: 'end' }); }, [messages?.length]);

  async function send() {
    const p = messageSchema.safeParse(draft);
    if (!p.success) return;
    setSendError(null);
    const temp: Pending = { id: `tmp-${Date.now()}`, conversation_id: id, sender_id: user.id, body: p.data, created_at: new Date().toISOString(), pending: true };
    setMessages((m) => [...(m ?? []), temp]);
    setDraft('');
    try {
      const saved = await api.sendMessage(id, user.id, p.data);
      setMessages((m) => {
        const without = (m ?? []).filter((x) => x.id !== temp.id);
        return without.some((x) => x.id === saved.id) ? without : [...without, saved];
      });
    } catch (e) {
      setMessages((m) => (m ?? []).map((x) => (x.id === temp.id ? { ...x, pending: false, failed: true } : x)));
      setSendError(friendlyError(e));
    }
  }

  if (error) return <ErrorState message={friendlyError(error)} onRetry={load} />;
  if (messages === null) return <Skeleton className="h-96" />;
  if (!conv) return <EmptyState title="Conversation not found" body="It may have been removed, or you are not a member." />;

  const dayHeaders = messages.map((m, i) => {
    const day = dayLabel(m.created_at);
    return i === 0 || dayLabel(messages[i - 1]!.created_at) !== day ? day : null;
  });
  return (
    <div className="flex h-[calc(100dvh-10rem)] flex-col rounded-lg border border-line bg-raised lg:h-[calc(100dvh-7.5rem)]">
      <div className="flex items-center gap-3 border-b border-line px-4 py-3">
        <Link href="/app/messages" className="text-sm text-muted hover:text-fg lg:hidden" aria-label="Back">←</Link>
        <Avatar name={conv.peer_name} src={avatar(conv.peer_avatar)} size={36} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/u/${conv.peer_id}`} className="font-medium hover:underline">{conv.peer_name}</Link>
          <p className="truncate text-xs text-muted">{conv.peer_headline}</p>
        </div>
        <Button size="sm" variant="ghost" onClick={async () => { await api.setMuted(id, !conv.muted); setConv({ ...conv, muted: !conv.muted }); }}>{conv.muted ? 'Unmute' : 'Mute'}</Button>
        <Button size="sm" variant="ghost" onClick={() => setReportMsg(null)}>Report</Button>
      </div>

      <div className="flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite">
        {hasOlder && (
          <div className="flex justify-center pb-2">
            <Button size="sm" variant="secondary" onClick={async () => {
              const older = await api.messages(id, messages[0]?.created_at);
              setHasOlder(older.length === 40);
              setMessages((m) => [...older, ...(m ?? [])]);
            }}>Load earlier messages</Button>
          </div>
        )}
        {messages.length === 0 && <p className="py-10 text-center text-sm text-muted">You are connected. Introduce yourself and suggest a next step.</p>}
        {messages.map((m, i) => {
          const mine = m.sender_id === user.id;
          return (
            <div key={m.id}>
              {dayHeaders[i] && <div className="py-2 text-center text-xs text-subtle">{dayHeaders[i]}</div>}
              <div className={`group flex ${mine ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[80%] rounded-lg px-3 py-2 text-[15px] leading-relaxed ${mine ? 'bg-accent text-on-accent' : 'bg-surface text-fg'} ${m.pending ? 'opacity-60' : ''}`}>
                  <p className="whitespace-pre-wrap break-words">{m.body}</p>
                  <div className={`mt-0.5 text-[11px] ${mine ? 'text-on-accent/70' : 'text-subtle'}`}>
                    {new Date(m.created_at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' })}
                    {m.failed && ' · not sent'}
                  </div>
                </div>
                {!mine && <button onClick={() => setReportMsg(m.id)} className="ml-1 hidden self-center text-xs text-subtle hover:text-danger group-hover:block">Report</button>}
              </div>
            </div>
          );
        })}
        <div ref={bottom} />
      </div>

      <div className="border-t border-line p-3">
        {sendError && <div className="mb-2"><Alert tone="danger">{sendError}</Alert></div>}
        {conv.can_send ? (
          <form className="flex items-end gap-2" onSubmit={(e) => { e.preventDefault(); send(); }}>
            <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} rows={1} maxLength={4000} placeholder="Write a message…" aria-label="Message"
              className="min-h-10 max-h-40 resize-none"
              onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} />
            <Button type="submit" disabled={!draft.trim()}>Send</Button>
          </form>
        ) : (
          <p className="text-center text-sm text-muted">This conversation is read-only because you are no longer connected.</p>
        )}
      </div>

      <ReportModal open={reportMsg !== undefined} onClose={() => setReportMsg(undefined)} userId={conv.peer_id} name={conv.peer_name} messageId={reportMsg ?? null} />
    </div>
  );
}
