import { router } from 'expo-router';
import { useState } from 'react';
import { THINK_CONTEXT_FIELDS, fieldErrors, friendlyError, thinkProjectSchema } from '@groundwork/shared';
import { Button, Input, Notice, Screen, Text } from '@/components/ui';
import { api, supabase } from '@/lib/supabase';
import { useSession } from '@/lib/session';

export default function NewThink() {
  const { session } = useSession();
  const [title, setTitle] = useState('');
  const [idea, setIdea] = useState('');
  const [ctx, setCtx] = useState<Record<string, string>>({});
  const [more, setMore] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  return (
    <Screen edges={[]}>
      <Input label="Project name" value={title} onChangeText={setTitle} maxLength={120} error={errors.title} placeholder="e.g. Clinic scheduling assistant" />
      <Input label="Describe the idea" value={idea} onChangeText={setIdea} multiline maxLength={6000} error={errors.idea} hint={`${idea.length}/6000 · What problem, for whom, and how you would solve it.`} style={{ minHeight: 160 }} />
      <Button variant="ghost" title={more ? 'Hide optional context' : '+ Add optional context'} onPress={() => setMore(!more)} style={{ alignSelf: 'flex-start' }} />
      {more && THINK_CONTEXT_FIELDS.map((f) => <Input key={f.key} label={f.label} placeholder={f.placeholder} maxLength={500} value={ctx[f.key] ?? ''} onChangeText={(v) => setCtx({ ...ctx, [f.key]: v })} />)}
      <Notice>Think projects are private. Avoid confidential details you would not want processed by an external AI provider.</Notice>
      {error && <Notice tone="danger">{error}</Notice>}
      <Button title="Create project" loading={saving} onPress={async () => {
        const context = Object.fromEntries(Object.entries(ctx).filter(([, v]) => v.trim()));
        const p = thinkProjectSchema.safeParse({ title, idea, context });
        if (!p.success) return setErrors(fieldErrors(p));
        setErrors({}); setSaving(true); setError(null);
        const { data, error } = await supabase.from('think_projects').insert({ ...p.data, owner_id: session!.user.id }).select('id').single();
        setSaving(false);
        if (error) return setError(friendlyError(error));
        api.track('think_project_created', {}, 'android').catch(() => {});
        router.replace(`/think/${data.id}`);
      }} />
      <Text variant="caption">You can edit the idea and regenerate the report later.</Text>
    </Screen>
  );
}
