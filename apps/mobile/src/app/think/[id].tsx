import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Share, View } from 'react-native';
import { ERROR_MESSAGES, followupSchema, friendlyError, reportToMarkdown, type ThinkMessage } from '@groundwork/shared';
import { Button, Card, ChipGroup, EmptyState, ErrorState, Input, Loading, Notice, Row, Screen, Sheet, Text } from '@/components/ui';
import { ReportView } from '@/components/think';
import { api, supabase } from '@/lib/supabase';
import { useAsync, useSession } from '@/lib/session';

const errText = (code: string) => ERROR_MESSAGES[code] ?? (code === 'analysis_in_progress' ? 'An analysis is already running.' : ERROR_MESSAGES.ai_unavailable!);

export default function ThinkProject() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { session } = useSession();
  const d = useAsync(async () => {
    const [project, analyses, messages, status] = await Promise.all([api.thinkProject(id), api.analyses(id), api.thinkMessages(id), api.thinkStatus()]);
    return { project, analyses, messages, status };
  }, [id]);
  const [version, setVersion] = useState<string[]>([]);
  const [running, setRunning] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [q, setQ] = useState('');
  const [extra, setExtra] = useState<ThinkMessage[]>([]);
  const [acked, setAcked] = useState(false);
  const [disclosure, setDisclosure] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editIdea, setEditIdea] = useState('');

  if (d.loading) return <Loading />;
  if (d.error && !d.data) return <Screen edges={[]}><ErrorState message={friendlyError(d.error)} onRetry={d.reload} /></Screen>;
  if (!d.data?.project) return <Screen edges={[]}><EmptyState title="Project not found" /></Screen>;
  const { project, analyses, status } = d.data;
  const isOwner = project.owner_id === session!.user.id;
  const done = analyses.filter((a) => a.status === 'completed' && a.report);
  const current = done.find((a) => a.id === version[0]) ?? done[0];
  const messages = [...d.data.messages, ...extra];

  async function run(action: 'analyze' | 'checklist') {
    if (action === 'analyze' && !status.disclosure_acknowledged && !acked) return setDisclosure(true);
    setRunning(action); setErr(null);
    try { await api.runThink(action, id); setVersion([]); d.reload(); }
    catch (e) { setErr(errText((e as Error).message)); } finally { setRunning(null); }
  }

  return (
    <Screen edges={[]} refreshing={d.refreshing} onRefresh={d.refresh}>
      <Stack.Screen options={{ title: project.title }} />
      <Text variant="caption">{isOwner ? 'Private project' : 'Shared with you (read-only)'}</Text>
      <Card><Text variant="label">The idea</Text><Text variant="body" style={{ marginTop: 6 }}>{project.idea}</Text></Card>
      {isOwner && (
        <Card style={{ gap: 10 }}>
          <Text variant="small">{status.ai_available ? `AI analyses left today: ${Math.max(0, status.analyses_per_day - status.analyses_used_today)} of ${status.analyses_per_day}` : 'AI analysis is unavailable right now.'}</Text>
          <Button title={done.length ? 'Generate updated report' : 'Run AI analysis'} loading={running === 'analyze'} disabled={!!running || !status.ai_available || status.analyses_used_today >= status.analyses_per_day} onPress={() => run('analyze')} />
          <Button variant="secondary" title="Use basic checklist (no AI)" loading={running === 'checklist'} disabled={!!running} onPress={() => run('checklist')} />
          {running === 'analyze' && <Text variant="caption">Analysing — usually 20–60 seconds.</Text>}
          {err && <Notice tone="danger">{err}</Notice>}
          <Row>
            <Button small variant="ghost" title="Edit idea" onPress={() => { setEditIdea(project.idea); setEditing(true); }} />
            <Button small variant="ghost" title="Delete" onPress={() => Alert.alert('Delete this project?', 'All report versions and follow-ups will be deleted.', [
              { text: 'Cancel', style: 'cancel' },
              { text: 'Delete', style: 'destructive', onPress: async () => { await supabase.from('think_projects').delete().eq('id', id); router.back(); } },
            ])} />
          </Row>
        </Card>
      )}
      {current?.report ? (
        <View style={{ gap: 12 }}>
          <Row style={{ justifyContent: 'space-between' }}>
            <Text variant="heading">Report</Text>
            <Button small variant="secondary" title="Export" onPress={() => { Share.share({ title: project.title, message: reportToMarkdown(project.title, current.report!, new Date(current.created_at).toLocaleDateString()) }); api.track('think_report_exported', {}, 'android').catch(() => {}); }} />
          </Row>
          {done.length > 1 && <ChipGroup single value={[current.id]} onChange={(v) => v[0] && setVersion(v)} options={done.map((a, i) => ({ value: a.id, label: i === 0 ? 'Latest' : `v${done.length - i}` }))} />}
          <ReportView report={current.report} />
        </View>
      ) : <EmptyState title="No report yet" body={isOwner ? 'Run an AI analysis or start with the checklist.' : 'The owner has not generated a report yet.'} />}
      <Text variant="heading">Follow-up questions</Text>
      {messages.length === 0 && <Text variant="muted">No questions yet.</Text>}
      {messages.map((m) => (
        <Card key={m.id} style={{ backgroundColor: undefined }}>
          <Text variant="caption">{m.role === 'user' ? 'You' : 'AI'}</Text>
          <Text variant="body">{m.content}</Text>
        </Card>
      ))}
      {isOwner && status.ai_available && (
        <View style={{ gap: 8 }}>
          <Input value={q} onChangeText={setQ} multiline maxLength={2000} placeholder="e.g. What is the cheapest way to test willingness to pay?" />
          <Button title="Ask" loading={running === 'followup'} disabled={q.trim().length < 3 || status.followups_used_today >= status.followups_per_day} onPress={async () => {
            const p = followupSchema.safeParse(q); if (!p.success) return;
            setRunning('followup'); setErr(null);
            try { const r = await api.runThink('followup', id, p.data); setQ(''); setExtra((x) => [...x, { id: `q${Date.now()}`, project_id: id, analysis_id: null, owner_id: session!.user.id, role: 'user', content: p.data, created_at: new Date().toISOString() }, ...(r.message ? [r.message] : [])]); }
            catch (e) { setErr(errText((e as Error).message)); } finally { setRunning(null); }
          }} />
        </View>
      )}
      <Sheet visible={disclosure} onClose={() => setDisclosure(false)} title="Before your first AI analysis">
        <Text variant="body">Your project name, idea, context and follow-up questions will be sent to an external AI provider{status.provider_label ? `: ${status.provider_label}` : ''}.</Text>
        <Text variant="muted">Providers have their own data-use and retention terms; some free tiers may use submitted content to improve their services. Do not include personal data or confidential details you are not comfortable sharing. We log usage metadata, not your text.</Text>
        <Button title="I understand, continue" onPress={async () => { await api.acknowledgeAiDisclosure(); setAcked(true); setDisclosure(false); setTimeout(() => run('analyze'), 0); }} />
      </Sheet>
      <Sheet visible={editing} onClose={() => setEditing(false)} title="Edit idea">
        <Input value={editIdea} onChangeText={setEditIdea} multiline maxLength={6000} style={{ minHeight: 180 }} />
        <Button title="Save" onPress={async () => {
          if (editIdea.trim().length < 30) return;
          await supabase.from('think_projects').update({ idea: editIdea.trim() }).eq('id', id); setEditing(false); d.reload();
        }} />
      </Sheet>
    </Screen>
  );
}
