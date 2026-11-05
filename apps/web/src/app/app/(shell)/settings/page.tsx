'use client';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { friendlyError, password as passwordSchema, firstError, type Preferences } from '@groundwork/shared';
import { Alert, Button, Card, EmptyState, Field, Input, PageHeader, Skeleton, Tabs, Toggle } from '@/components/ui';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { VisibilityForm } from '@/components/app/ProfileForms';
import { getBrowserClient } from '@/lib/supabase/client';

type Tab = 'account' | 'privacy' | 'notifications' | 'blocked';

function AccountTab() {
  const { user, api } = useApp();
  const router = useRouter();
  const sb = getBrowserClient();
  const [pw, setPw] = useState('');
  const [pwMsg, setPwMsg] = useState<{ tone: 'accent' | 'danger'; text: string } | null>(null);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [delError, setDelError] = useState<string | null>(null);
  const providers = (user.app_metadata?.providers as string[] | undefined) ?? [user.app_metadata?.provider ?? 'email'];
  return (
    <div className="space-y-5">
      <Card className="p-5">
        <h2 className="text-base font-semibold">Sign-in</h2>
        <dl className="mt-3 space-y-2 text-sm">
          <div className="flex justify-between gap-4"><dt className="text-muted">Email</dt><dd>{user.email}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Email verified</dt><dd>{user.email_confirmed_at ? 'Yes' : 'No — check your inbox'}</dd></div>
          <div className="flex justify-between gap-4"><dt className="text-muted">Connected sign-in providers</dt><dd className="capitalize">{providers.join(', ')}</dd></div>
        </dl>
        <Button className="mt-4" variant="secondary" onClick={async () => { await sb.auth.signOut(); router.replace('/login'); router.refresh(); }}>Sign out</Button>
      </Card>
      <Card className="p-5">
        <h2 className="text-base font-semibold">Change password</h2>
        <form className="mt-3 flex flex-col gap-2 sm:flex-row" onSubmit={async (e) => {
          e.preventDefault();
          const p = passwordSchema.safeParse(pw);
          if (!p.success) return setPwMsg({ tone: 'danger', text: firstError(p)! });
          const { error } = await sb.auth.updateUser({ password: p.data });
          setPwMsg(error ? { tone: 'danger', text: 'Could not update the password. You may need to sign in again first.' } : { tone: 'accent', text: 'Password updated.' });
          if (!error) setPw('');
        }}>
          <Input type="password" autoComplete="new-password" placeholder="New password (10+ characters)" value={pw} onChange={(e) => setPw(e.target.value)} aria-label="New password" />
          <Button type="submit" variant="secondary">Update</Button>
        </form>
        {pwMsg && <div className="mt-3"><Alert tone={pwMsg.tone}>{pwMsg.text}</Alert></div>}
      </Card>
      <Card className="border-danger/40 p-5">
        <h2 className="text-base font-semibold text-danger">Delete account</h2>
        <p className="mt-1 text-sm text-muted">Permanently deletes your account, profile, Think projects, messages you sent, connections and other associated data. This cannot be undone. <Link href="/delete-account" className="underline">What is deleted and kept</Link>.</p>
        <Field label='Type "DELETE" to confirm' htmlFor="del"><Input id="del" value={confirm} onChange={(e) => setConfirm(e.target.value)} className="max-w-xs" /></Field>
        {delError && <div className="mt-3"><Alert tone="danger">{delError}</Alert></div>}
        <Button className="mt-3" variant="danger" disabled={confirm !== 'DELETE'} loading={deleting} onClick={async () => {
          setDeleting(true); setDelError(null);
          try { await api.deleteAccount(); await sb.auth.signOut(); router.replace('/?deleted=1'); }
          catch { setDelError('Could not delete your account. Please try again or contact support.'); setDeleting(false); }
        }}>Delete my account</Button>
      </Card>
    </div>
  );
}

function PrivacyTab() {
  const { api } = useApp();
  const [exporting, setExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="space-y-5">
      <Card className="p-5"><h2 className="mb-4 text-base font-semibold">Profile visibility</h2><VisibilityForm /></Card>
      <Card className="p-5">
        <h2 className="text-base font-semibold">Export your data</h2>
        <p className="mt-1 text-sm text-muted">Download a JSON file with your profile, startup details, Think projects, connections, messages you sent and other data linked to your account.</p>
        {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
        <Button className="mt-3" variant="secondary" loading={exporting} onClick={async () => {
          setExporting(true); setError(null);
          try {
            const data = await api.exportData();
            const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }));
            const a = document.createElement('a'); a.href = url; a.download = `groundwork-export-${new Date().toISOString().slice(0, 10)}.json`; a.click(); URL.revokeObjectURL(url);
          } catch (e) { setError(friendlyError(e)); } finally { setExporting(false); }
        }}>Download my data</Button>
      </Card>
    </div>
  );
}

function NotificationsTab() {
  const { user } = useApp();
  const sb = getBrowserClient();
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { sb.from('profile_preferences').select('*').eq('user_id', user.id).single().then(({ data }) => setPrefs(data as Preferences)); }, [sb, user.id]);
  if (!prefs) return <Skeleton className="h-64" />;
  const set = async (k: keyof Preferences, v: boolean) => {
    const prev = prefs; setPrefs({ ...prefs, [k]: v }); setError(null);
    const { error } = await sb.from('profile_preferences').update({ [k]: v }).eq('user_id', user.id);
    if (error) { setPrefs(prev); setError(friendlyError(error)); }
  };
  return (
    <div className="space-y-5">
      {error && <Alert tone="danger">{error}</Alert>}
      <Card className="divide-y divide-line px-5">
        <h2 className="py-4 text-base font-semibold">Push notifications (Android app)</h2>
        <Toggle label="Connection requests and acceptances" checked={prefs.push_connection_requests} onChange={(v) => set('push_connection_requests', v)} />
        <Toggle label="New messages" checked={prefs.push_messages} onChange={(v) => set('push_messages', v)} />
        <Toggle label="New relevant recommendations" description="At most a couple of times per week." checked={prefs.push_recommendations} onChange={(v) => set('push_recommendations', v)} />
        <Toggle label="Think report ready" checked={prefs.push_think} onChange={(v) => set('push_think', v)} />
      </Card>
      <Card className="divide-y divide-line px-5">
        <h2 className="py-4 text-base font-semibold">Email</h2>
        <Toggle label="Connection requests" checked={prefs.email_connection_requests} onChange={(v) => set('email_connection_requests', v)} />
        <Toggle label="New messages" description="Emails never include message content." checked={prefs.email_messages} onChange={(v) => set('email_messages', v)} />
        <Toggle label="Important account notices" description="Security and account-status emails." checked={prefs.email_account} onChange={(v) => set('email_account', v)} />
        <Toggle label="Product updates" description="Occasional news. Off unless you opt in; unsubscribe any time." checked={prefs.email_product_updates} onChange={(v) => set('email_product_updates', v)} />
      </Card>
    </div>
  );
}

function BlockedTab() {
  const { api } = useApp();
  const { data, loading, reload } = useAsync(() => api.blockedUsers(), []);
  if (loading) return <Skeleton className="h-32" />;
  if (!data?.length) return <EmptyState title="No blocked accounts" body="People you block cannot see your profile, send requests or message you." />;
  return (
    <ul className="divide-y divide-line rounded-lg border border-line bg-raised">
      {data.map((b) => (
        <li key={b.user_id} className="flex items-center justify-between px-4 py-3 text-sm">
          <span>{b.display_name || 'Member'}</span>
          <Button size="sm" variant="secondary" onClick={async () => { await api.unblock(b.user_id); reload(); }}>Unblock</Button>
        </li>
      ))}
    </ul>
  );
}

function SettingsInner() {
  const params = useSearchParams();
  const initial = (params.get('tab') as Tab) || 'account';
  const [tab, setTab] = useState<Tab>(['account', 'privacy', 'notifications', 'blocked'].includes(initial) ? initial : 'account');
  return (
    <>
      <PageHeader title="Settings" />
      <Tabs value={tab} onChange={setTab} tabs={[{ value: 'account', label: 'Account' }, { value: 'privacy', label: 'Privacy' }, { value: 'notifications', label: 'Notifications' }, { value: 'blocked', label: 'Blocked accounts' }]} />
      {tab === 'account' && <AccountTab />}
      {tab === 'privacy' && <PrivacyTab />}
      {tab === 'notifications' && <NotificationsTab />}
      {tab === 'blocked' && <BlockedTab />}
    </>
  );
}

export default function SettingsPage() {
  return <Suspense><SettingsInner /></Suspense>;
}
