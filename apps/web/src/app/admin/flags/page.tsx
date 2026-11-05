'use client';
import { useState } from 'react';
import { friendlyError } from '@groundwork/shared';
import { Alert, Button, Card, ErrorState, PageHeader, Skeleton, Textarea, Toggle } from '@/components/ui';
import { useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';

interface Flag { key: string; enabled: boolean; value: unknown; description: string | null; is_public: boolean; updated_at: string }

function FlagRow({ f, onSaved }: { f: Flag; onSaved: () => void }) {
  const sb = getBrowserClient();
  const [text, setText] = useState(JSON.stringify(f.value, null, 2));
  const [error, setError] = useState<string | null>(null);
  const save = async (enabled: boolean, valueText = text) => {
    let value: unknown;
    try { value = JSON.parse(valueText); } catch { return setError('Value must be valid JSON.'); }
    const { error } = await sb.rpc('admin_set_flag', { p_key: f.key, p_enabled: enabled, p_value: value });
    if (error) setError(friendlyError(error)); else { setError(null); onSaved(); }
  };
  return (
    <Card className="p-4">
      <Toggle label={f.key} description={f.description ?? undefined} checked={f.enabled} onChange={(on) => save(on)} />
      {text !== '{}' && (
        <div className="mt-2 space-y-2">
          <Textarea className="font-mono text-xs" rows={Math.min(8, text.split('\n').length + 1)} value={text} onChange={(e) => setText(e.target.value)} aria-label={`${f.key} value`} />
          <Button size="sm" variant="secondary" onClick={() => save(f.enabled)}>Save value</Button>
        </div>
      )}
      {error && <div className="mt-2"><Alert tone="danger">{error}</Alert></div>}
      <p className="mt-2 text-xs text-subtle">{f.is_public ? 'Visible to clients' : 'Server-only'} · updated {new Date(f.updated_at).toLocaleString()}</p>
    </Card>
  );
}

export default function AdminFlags() {
  const { data, loading, error, reload } = useAsync(async () => {
    const { data, error } = await getBrowserClient().from('feature_flags').select('*').order('key');
    if (error) throw error;
    return data as Flag[];
  }, []);
  return (
    <>
      <PageHeader title="Feature flags & limits" description="Think quotas, matching weights, connection limits, maintenance mode and registration. Changes apply immediately and are audit-logged." />
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : (
        <div className="grid gap-4 lg:grid-cols-2">{(data ?? []).map((f) => <FlagRow key={f.key} f={f} onSaved={reload} />)}</div>
      )}
    </>
  );
}
