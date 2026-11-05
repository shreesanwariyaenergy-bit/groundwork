import { useState } from 'react';
import { View } from 'react-native';
import { friendlyError } from '@groundwork/shared';
import { Button, Notice, Screen, Text } from '@/components/ui';
import { AvatarSection, BasicsSection, IntentsSection, LinksSection, LookingForSection, SkillsSection, StartupSection, VisibilitySection } from '@/components/profile-forms';
import { api, supabase } from '@/lib/supabase';
import { unregisterPush } from '@/lib/push';
import { useSession } from '@/lib/session';
import { useTheme } from '@/lib/theme';

type Step = 'intents' | 'looking' | 'basics' | 'skills' | 'startup' | 'visibility';

export default function Onboarding() {
  const { profile, session, refreshProfile } = useSession();
  const { c } = useTheme();
  const isFounder = profile?.intents.includes('founder');
  const steps: { key: Step; title: string; sub: string }[] = [
    { key: 'intents', title: 'What describes you?', sub: 'Choose all that apply.' },
    { key: 'looking', title: 'What are you looking for?', sub: 'This drives your recommendations.' },
    { key: 'basics', title: 'About you', sub: 'The essentials people see on your profile.' },
    { key: 'skills', title: 'Skills and links', sub: 'Specific skills make discovery far more useful.' },
    ...(isFounder ? [{ key: 'startup' as Step, title: 'What are you building?', sub: 'Shown according to the visibility you choose.' }] : []),
    { key: 'visibility', title: 'Profile visibility', sub: 'You can change this any time.' },
  ];
  const [i, setI] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const step = steps[Math.min(i, steps.length - 1)]!;
  const next = () => setI((x) => Math.min(x + 1, steps.length - 1));
  if (!profile) return null;

  async function finish() {
    setError(null);
    const { error } = await supabase.from('profiles').update({ onboarding_completed: true }).eq('id', session!.user.id);
    if (error) return setError(friendlyError(error));
    api.track('onboarding_completed', { intents: profile!.intents }, 'android').catch(() => {});
    await refreshProfile(); // navigator switches to the app automatically
  }

  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
        <Text variant="caption">Step {i + 1} of {steps.length}</Text>
        <Button small variant="ghost" title="Sign out" onPress={async () => { await unregisterPush(); await supabase.auth.signOut(); }} />
      </View>
      <View style={{ height: 4, borderRadius: 2, backgroundColor: c.border }}><View style={{ height: 4, borderRadius: 2, backgroundColor: c.accent, width: `${((i + 1) / steps.length) * 100}%` }} /></View>
      <View style={{ gap: 4 }}><Text variant="title">{step.title}</Text><Text variant="muted">{step.sub}</Text></View>
      {step.key === 'intents' && <IntentsSection label="Continue" onSaved={next} />}
      {step.key === 'looking' && <LookingForSection label="Continue" onSaved={next} />}
      {step.key === 'basics' && <><AvatarSection /><BasicsSection label="Continue" onSaved={next} /></>}
      {step.key === 'skills' && (
        <>
          <SkillsSection />
          <Text variant="heading">Professional links</Text>
          <LinksSection />
          <Button title="Continue" onPress={next} />
        </>
      )}
      {step.key === 'startup' && <StartupSection label="Continue" onSaved={next} />}
      {step.key === 'visibility' && <VisibilitySection requireAdult label="Finish" onSaved={finish} />}
      {error && <Notice tone="danger">{error}</Notice>}
      {i > 0 && <Button variant="ghost" title="Back" onPress={() => setI((x) => x - 1)} />}
    </Screen>
  );
}
