import * as WebBrowser from 'expo-web-browser';
import { useEffect, useState } from 'react';
import { Alert, Share, Switch, View } from 'react-native';
import { BRAND, friendlyError, type Preferences } from '@groundwork/shared';
import { Button, Card, Divider, Input, Notice, Row, Screen, Section, Text } from '@/components/ui';
import { SITE_URL } from '@/lib/config';
import { registerForPush, unregisterPush } from '@/lib/push';
import { api, supabase } from '@/lib/supabase';
import { useAsync, useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

function Toggle({ label, value, onChange, hint }: { label: string; value: boolean; onChange: (v: boolean) => void; hint?: string }) {
  const { c } = useTheme();
  return (
    <Row style={{ minHeight: 52, justifyContent: 'space-between' }}>
      <View style={{ flex: 1 }}><Text variant="body">{label}</Text>{hint && <Text variant="caption">{hint}</Text>}</View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: c.accent, false: c.borderStrong }} thumbColor="#fff" accessibilityLabel={label} />
    </Row>
  );
}

export default function Settings() {
  const { session } = useSession();
  const uid = session!.user.id;
  const [prefs, setPrefs] = useState<Preferences | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [confirm, setConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [pushState, setPushState] = useState<string | null>(null);
  const blocked = useAsync(() => api.blockedUsers(), []);
  useEffect(() => { supabase.from('profile_preferences').select('*').eq('user_id', uid).single().then(({ data }) => setPrefs(data as Preferences)); }, [uid]);
  const set = async (k: keyof Preferences, v: boolean) => {
    if (!prefs) return;
    const prev = prefs; setPrefs({ ...prefs, [k]: v });
    const { error } = await supabase.from('profile_preferences').update({ [k]: v }).eq('user_id', uid);
    if (error) { setPrefs(prev); setErr(friendlyError(error)); }
  };
  const signOut = async () => { await unregisterPush(); await supabase.auth.signOut(); };

  return (
    <Screen edges={[]}>
      {err && <Notice tone="danger">{err}</Notice>}
      <Section title="Account">
        <Card style={{ gap: 6 }}>
          <Text variant="small">Signed in as {session!.user.email}</Text>
          <Text variant="caption">Sign-in providers: {((session!.user.app_metadata?.providers as string[] | undefined) ?? ['email']).join(', ')}</Text>
          <Button variant="secondary" title="Sign out" onPress={signOut} />
        </Card>
      </Section>
      <Section title="Push notifications">
        <Card>
          <Button small variant="secondary" style={{ alignSelf: 'flex-start' }} title="Enable notifications on this device" onPress={async () => setPushState(await registerForPush())} />
          {pushState && <Text variant="caption">{pushState === 'granted' ? 'Notifications enabled.' : pushState === 'denied' ? 'Permission denied — enable notifications in Android settings.' : 'Push is not available on this device/build.'}</Text>}
          {prefs && (<>
            <Toggle label="Connection requests" value={prefs.push_connection_requests} onChange={(v) => set('push_connection_requests', v)} /><Divider />
            <Toggle label="Messages" value={prefs.push_messages} onChange={(v) => set('push_messages', v)} /><Divider />
            <Toggle label="New relevant recommendations" hint="At most a couple per week" value={prefs.push_recommendations} onChange={(v) => set('push_recommendations', v)} /><Divider />
            <Toggle label="Think report ready" value={prefs.push_think} onChange={(v) => set('push_think', v)} />
          </>)}
        </Card>
      </Section>
      {prefs && (
        <Section title="Email">
          <Card>
            <Toggle label="Connection requests" value={prefs.email_connection_requests} onChange={(v) => set('email_connection_requests', v)} /><Divider />
            <Toggle label="Messages" hint="Never includes message content" value={prefs.email_messages} onChange={(v) => set('email_messages', v)} /><Divider />
            <Toggle label="Account notices" value={prefs.email_account} onChange={(v) => set('email_account', v)} /><Divider />
            <Toggle label="Product updates" hint="Off unless you opt in" value={prefs.email_product_updates} onChange={(v) => set('email_product_updates', v)} />
          </Card>
        </Section>
      )}
      <Section title="Privacy">
        <Card style={{ gap: 8 }}>
          <Text variant="small">Profile visibility is in Edit profile → Visibility.</Text>
          <Button variant="secondary" title="Export my data" onPress={async () => {
            try { const data = await api.exportData(); await Share.share({ title: `${BRAND.name} data export`, message: JSON.stringify(data, null, 2) }); }
            catch (e) { setErr(friendlyError(e)); }
          }} />
        </Card>
      </Section>
      <Section title="Blocked accounts">
        <Card>
          {!blocked.data?.length ? <Text variant="muted">No blocked accounts.</Text> : blocked.data.map((b) => (
            <Row key={b.user_id} style={{ justifyContent: 'space-between', minHeight: 48 }}>
              <Text variant="body">{b.display_name || 'Member'}</Text>
              <Button small variant="secondary" title="Unblock" onPress={async () => { await api.unblock(b.user_id); blocked.reload(); }} />
            </Row>
          ))}
        </Card>
      </Section>
      <Section title="Legal & support">
        <Card style={{ gap: 4 }}>
          {[['Privacy Policy', '/privacy'], ['Terms of Service', '/terms'], ['Community Guidelines', '/guidelines'], ['Contact support', '/contact']].map(([l, p]) => (
            <Button key={p} small variant="ghost" title={l!} style={{ alignSelf: 'flex-start' }} disabled={!SITE_URL} onPress={() => WebBrowser.openBrowserAsync(SITE_URL + p)} />
          ))}
        </Card>
      </Section>
      <Section title="Delete account">
        <Card style={{ gap: 10 }}>
          <Text variant="small">Permanently deletes your account, profile, Think projects, messages you sent, connections and other associated data. This cannot be undone.</Text>
          <Input label='Type "DELETE" to confirm' value={confirm} onChangeText={setConfirm} autoCapitalize="characters" />
          <Button variant="danger" title="Delete my account" disabled={confirm !== 'DELETE'} loading={deleting} onPress={() => Alert.alert('Delete account permanently?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            { text: 'Delete', style: 'destructive', onPress: async () => {
              setDeleting(true);
              try { await unregisterPush(); await api.deleteAccount(); await supabase.auth.signOut(); }
              catch { setErr('Could not delete your account. Please try again or contact support.'); setDeleting(false); }
            } },
          ])} />
        </Card>
      </Section>
    </Screen>
  );
}
