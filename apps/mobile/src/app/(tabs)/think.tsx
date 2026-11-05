import { router } from 'expo-router';
import { friendlyError, relativeTime } from '@groundwork/shared';
import { Button, Card, EmptyState, ErrorState, Loading, Row, Screen, Text } from '@/components/ui';
import { api } from '@/lib/supabase';
import { useAsync } from '@/lib/session';

export default function ThinkTab() {
  const d = useAsync(async () => ({ projects: await api.thinkProjects(), status: await api.thinkStatus() }), []);
  return (
    <Screen refreshing={d.refreshing} onRefresh={d.refresh}>
      <Row style={{ justifyContent: 'space-between' }}>
        <Text variant="title">Think</Text>
        <Button small title="New project" onPress={() => router.push('/think/new')} />
      </Row>
      <Text variant="muted">Stress-test startup ideas and plan what to validate next. Private by default.</Text>
      {d.data?.status && (
        <Text variant="caption">{d.data.status.ai_available ? `AI analyses today: ${d.data.status.analyses_used_today}/${d.data.status.analyses_per_day}` : 'AI analysis is unavailable right now — the basic checklist still works.'}</Text>
      )}
      {d.loading ? <Loading /> : d.error && !d.data ? <ErrorState message={friendlyError(d.error)} onRetry={d.reload} /> : !d.data?.projects.length ? (
        <EmptyState title="Start your first project" body="Describe an idea and get a structured analysis of customers, risks, assumptions and next steps." action={<Button title="New project" onPress={() => router.push('/think/new')} />} />
      ) : d.data.projects.map((p) => (
        <Card key={p.id} onPress={() => router.push(`/think/${p.id}`)} style={{ gap: 4 }}>
          <Text variant="label">{p.title}</Text>
          <Text variant="small" numberOfLines={2}>{p.idea}</Text>
          <Text variant="caption">Updated {relativeTime(p.updated_at)} ago</Text>
        </Card>
      ))}
    </Screen>
  );
}
