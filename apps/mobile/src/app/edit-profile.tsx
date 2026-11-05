import { useState } from 'react';
import { BasicsSection, AvatarSection, IntentsSection, LinksSection, LookingForSection, SkillsSection, StartupSection, VisibilitySection } from '@/components/profile-forms';
import { Card, ChipGroup, Screen, Text } from '@/components/ui';
import { useSession } from '@/lib/session';

type Part = 'about' | 'intents' | 'looking' | 'skills' | 'startup' | 'visibility';

export default function EditProfile() {
  const { profile } = useSession();
  const [part, setPart] = useState<Part[]>(['about']);
  const options: { value: Part; label: string }[] = [
    { value: 'about', label: 'About' }, { value: 'intents', label: 'I am' }, { value: 'looking', label: 'Looking for' },
    { value: 'skills', label: 'Skills & links' }, ...(profile?.intents.includes('founder') ? [{ value: 'startup' as Part, label: 'Startup' }] : []),
    { value: 'visibility', label: 'Visibility' },
  ];
  const p = part[0] ?? 'about';
  return (
    <Screen edges={[]}>
      <ChipGroup single value={part} onChange={(v) => v.length && setPart(v)} options={options} />
      <Card style={{ gap: 14 }}>
        {p === 'about' && <><AvatarSection /><BasicsSection /></>}
        {p === 'intents' && <IntentsSection />}
        {p === 'looking' && <LookingForSection />}
        {p === 'skills' && <><SkillsSection /><Text variant="heading">Links</Text><LinksSection /></>}
        {p === 'startup' && <StartupSection />}
        {p === 'visibility' && <VisibilitySection />}
      </Card>
    </Screen>
  );
}
