'use client';
import { useState } from 'react';
import { friendlyError } from '@groundwork/shared';
import { Alert, Badge, Button, Card, ErrorState, Field, Input, PageHeader, Skeleton, Toggle } from '@/components/ui';
import { useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';

interface Provider {
  id: string; key: string; provider: string; label: string; model: string; base_url: string | null; api_key_env: string | null;
  is_enabled: boolean; is_paid: boolean; paid_approved: boolean; priority: number; timeout_ms: number; max_output_tokens: number;
  max_input_chars: number; requests_per_minute: number; daily_request_limit: number; cost_per_1m_input_usd: number;
  cost_per_1m_output_usd: number; monthly_budget_usd: number; notes: string | null;
}
interface Usage { provider_config_id: string | null; status: string; estimated_cost_usd: number; created_at: string; error_code: string | null }

function ProviderCard({ p, usage, onChange }: { p: Provider; usage: Usage[]; onChange: () => void }) {
  const sb = getBrowserClient();
  const [edit, setEdit] = useState<Partial<Provider>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const v = { ...p, ...edit };
  const mine = usage.filter((u) => u.provider_config_id === p.id);
  const today = mine.filter((u) => new Date(u.created_at) >= new Date(new Date().toISOString().slice(0, 10)));
  const errors = mine.filter((u) => u.status === 'error');
  const cost = mine.reduce((s, u) => s + Number(u.estimated_cost_usd), 0);
  const lastErr = errors[0]?.error_code;

  async function save(changes: Partial<Provider>) {
    setSaving(true); setError(null);
    const { error } = await sb.rpc('admin_update_ai_provider', { p_id: p.id, p_changes: changes });
    setSaving(false);
    if (error) setError(/paid_requires_approval/.test(error.message) ? 'A paid provider needs explicit approval and a monthly budget above 0 before it can be enabled.' : friendlyError(error));
    else { setEdit({}); onChange(); }
  }
  const num = (k: keyof Provider) => (
    <Field label={k.replace(/_/g, ' ')} htmlFor={`${p.id}-${k}`}>
      <Input id={`${p.id}-${k}`} type="number" value={String(v[k] ?? '')} onChange={(e) => setEdit((x) => ({ ...x, [k]: e.target.value === '' ? null : Number(e.target.value) }))} />
    </Field>
  );
  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2"><h2 className="font-semibold">{p.label}</h2>{p.is_paid ? <Badge tone="warning">Paid</Badge> : <Badge>Free tier</Badge>}{p.is_enabled ? <Badge tone="accent">Enabled</Badge> : <Badge>Disabled</Badge>}</div>
          <p className="text-xs text-muted">{p.provider} · {p.model} · priority {p.priority} · key secret: <code>{p.api_key_env ?? '—'}</code></p>
        </div>
        <div className="text-right text-xs text-muted">
          <div>Month: {mine.length} requests · {errors.length} errors · ${cost.toFixed(4)}</div>
          <div>Today: {today.length} / {p.daily_request_limit}</div>
          {lastErr && <div className="text-danger">Last error: {lastErr}</div>}
        </div>
      </div>
      {p.notes && <p className="mt-2 text-xs text-subtle">{p.notes}</p>}
      <div className="mt-3 border-t border-line">
        <Toggle label="Enabled" description="Disabled providers are never called." checked={p.is_enabled} onChange={(on) => save({ is_enabled: on })} />
        <Toggle label="This provider costs money" checked={v.is_paid} onChange={(on) => save({ is_paid: on, ...(on ? {} : { paid_approved: false }) })} />
        {v.is_paid && <Toggle label="I approve paid usage up to the monthly budget" description="Without this, Think will never call this provider." checked={v.paid_approved} onChange={(on) => save({ paid_approved: on })} />}
      </div>
      <details className="mt-2">
        <summary className="cursor-pointer text-sm text-muted">Configuration</summary>
        <div className="mt-3 grid gap-3 md:grid-cols-3">
          <Field label="model" htmlFor={`${p.id}-model`}><Input id={`${p.id}-model`} value={v.model} onChange={(e) => setEdit((x) => ({ ...x, model: e.target.value }))} /></Field>
          <Field label="base url" htmlFor={`${p.id}-url`}><Input id={`${p.id}-url`} value={v.base_url ?? ''} onChange={(e) => setEdit((x) => ({ ...x, base_url: e.target.value }))} /></Field>
          <Field label="api key secret name" htmlFor={`${p.id}-env`} hint="Name of the Edge Function secret — never the key itself."><Input id={`${p.id}-env`} value={v.api_key_env ?? ''} onChange={(e) => setEdit((x) => ({ ...x, api_key_env: e.target.value.toUpperCase() }))} /></Field>
          {num('priority')}{num('timeout_ms')}{num('max_output_tokens')}{num('max_input_chars')}{num('requests_per_minute')}{num('daily_request_limit')}
          {num('cost_per_1m_input_usd')}{num('cost_per_1m_output_usd')}{num('monthly_budget_usd')}
        </div>
        <Button className="mt-3" size="sm" loading={saving} disabled={!Object.keys(edit).length} onClick={() => save(edit)}>Save configuration</Button>
      </details>
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </Card>
  );
}

export default function AdminAI() {
  const sb = getBrowserClient();
  const { data, loading, error, reload } = useAsync(async () => {
    const monthStart = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1)).toISOString();
    const [p, u, f] = await Promise.all([
      sb.from('ai_provider_configs').select('*').order('priority'),
      sb.from('ai_usage_logs').select('provider_config_id, status, estimated_cost_usd, created_at, error_code').gte('created_at', monthStart).order('created_at', { ascending: false }).limit(5000),
      sb.from('feature_flags').select('enabled').eq('key', 'think.ai_enabled').single(),
    ]);
    if (p.error) throw p.error;
    return { providers: p.data as Provider[], usage: (u.data ?? []) as Usage[], aiOn: !!f.data?.enabled };
  }, []);
  const limited = (data?.usage ?? []).filter((u) => u.status === 'rate_limited' || u.status === 'quota_blocked').length;
  return (
    <>
      <PageHeader title="AI providers & usage" description="Free tiers first. A paid provider is never called without explicit approval and a budget. There is no automatic paid fallback." />
      {loading ? <Skeleton className="h-64" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : data && (
        <div className="space-y-5">
          <Card className="px-5">
            <Toggle label="Think AI master switch" description="When off, Think only offers the non-AI checklist. Turn on after configuring and testing a provider."
              checked={data.aiOn} onChange={async (on) => { await sb.rpc('admin_set_flag', { p_key: 'think.ai_enabled', p_enabled: on }); reload(); }} />
          </Card>
          <p className="text-sm text-muted">Rate-limit / quota blocks this month: {limited}. API keys are set with <code>supabase secrets set NAME=value</code> and are never readable from this dashboard.</p>
          {data.providers.map((p) => <ProviderCard key={p.id} p={p} usage={data.usage} onChange={reload} />)}
        </div>
      )}
    </>
  );
}
