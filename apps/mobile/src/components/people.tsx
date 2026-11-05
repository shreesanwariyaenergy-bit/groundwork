import { router } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import {
  AVAILABILITY, MATCH_REASON_LABELS, MATCH_TYPE_LABELS, REPORT_REASONS, connectionMessageSchema, countryName, firstError, friendlyError,
  type ProfileCard, type RecommendationCard, type ReportReason,
} from '@groundwork/shared';
import { api } from '@/lib/supabase';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';
import { Avatar, Badge, Button, Card, ChipGroup, Input, Notice, Row, Sheet, Text } from './ui';

export function PersonCard({ person, onDismiss }: { person: ProfileCard | RecommendationCard; onDismiss?: (id: string) => void }) {
  const { avatar, roleName } = useSession();
  const { c } = useTheme();
  const [saved, setSaved] = useState(person.is_saved);
  const rec = 'reasons' in person ? person : null;
  const meta = [roleName(person.primary_role), AVAILABILITY.find((a) => a.value === person.availability)?.label, [person.city, countryName(person.country_code)].filter(Boolean).join(', ')].filter(Boolean).join(' · ');
  return (
    <Card onPress={() => router.push(`/u/${person.id}`)} style={{ gap: 10 }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Avatar name={person.display_name} uri={avatar(person.avatar_path)} size={48} />
        <View style={{ flex: 1, gap: 2 }}>
          <Text variant="label" style={{ fontSize: 16 }}>{person.display_name}</Text>
          <Text variant="small" numberOfLines={2}>{person.headline}</Text>
          {!!meta && <Text variant="caption" numberOfLines={1}>{meta}</Text>}
        </View>
        {rec?.is_new && <Badge label="New" tone="accent" />}
      </Row>
      {rec && (
        <View style={{ gap: 3 }}>
          <Text variant="caption" style={{ color: c.textMuted }}>{MATCH_TYPE_LABELS[rec.match_type]}</Text>
          {rec.reasons.slice(0, 3).map((r) => <Text key={r} variant="small" color={c.text}><Text variant="small" color={c.accent}>✓ </Text>{MATCH_REASON_LABELS[r] ?? r}</Text>)}
        </View>
      )}
      {person.skills.length > 0 && <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>{person.skills.slice(0, 5).map((s) => <Badge key={s} label={s} />)}</View>}
      <Row>
        <Button small variant="secondary" title={saved ? 'Saved' : 'Save'} onPress={async () => { const n = !saved; setSaved(n); try { await api.save(person.id, n); } catch { setSaved(!n); } }} />
        {onDismiss && <Button small variant="ghost" title="Not now" onPress={() => { onDismiss(person.id); api.dismiss(person.id).catch(() => {}); }} />}
      </Row>
    </Card>
  );
}

export function ConnectSheet({ visible, onClose, userId, name, onSent }: { visible: boolean; onClose: () => void; userId: string; name: string; onSent: () => void }) {
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <Sheet visible={visible} onClose={onClose} title={`Connect with ${name}`}>
      <Input label="Add a short note (optional)" value={msg} onChangeText={setMsg} multiline maxLength={300}
        hint={`${msg.length}/300 · Say why you would like to talk. Links are not allowed.`} placeholder="Hi — I am building … and your experience with … stood out." />
      {error && <Notice tone="danger">{error}</Notice>}
      <Button title="Send request" loading={loading} onPress={async () => {
        const p = connectionMessageSchema.safeParse(msg);
        if (!p.success) return setError(firstError(p));
        setLoading(true); setError(null);
        try { await api.sendRequest(userId, p.data); api.track('connection_request_sent', {}, 'android').catch(() => {}); setMsg(''); onSent(); onClose(); }
        catch (e) { setError(friendlyError(e)); } finally { setLoading(false); }
      }} />
    </Sheet>
  );
}

export function ReportSheet({ visible, onClose, userId, name, messageId }: { visible: boolean; onClose: () => void; userId: string; name: string; messageId?: string | null }) {
  const [reason, setReason] = useState<ReportReason[]>(['spam']);
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  const close = () => { setState('idle'); onClose(); };
  return (
    <Sheet visible={visible} onClose={close} title={`Report ${name}`}>
      {state === 'done' ? (
        <>
          <Text variant="muted">Thank you. A moderator will review this report. You can also block this person.</Text>
          <Button title="Done" onPress={close} />
        </>
      ) : (
        <>
          <Text variant="label">Reason</Text>
          <ChipGroup single options={REPORT_REASONS} value={reason} onChange={(v) => v.length && setReason(v)} />
          <Input label="Details (optional)" value={details} onChangeText={setDetails} multiline maxLength={1000} />
          {messageId && <Text variant="caption">The reported message will be attached for moderators.</Text>}
          {error && <Notice tone="danger">{error}</Notice>}
          <Button title="Submit report" variant="danger" loading={state === 'loading'} onPress={async () => {
            setState('loading'); setError(null);
            try { await api.report(userId, reason[0]!, details.trim() || null, messageId ?? null); setState('done'); }
            catch (e) { setError(friendlyError(e)); setState('idle'); }
          }} />
        </>
      )}
    </Sheet>
  );
}
