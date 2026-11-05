'use client';
import Link from 'next/link';
import { PageHeader, Card, buttonClass } from '@/components/ui';
import { useApp } from '@/components/app/AppProvider';
import { ProfileCompletionCard } from '@/components/app/ProfileCompletion';
import {
  AvatarUploader, BasicsForm, ExperienceEditor, IntentsForm, LinksEditor, LookingForForm, SkillsEditor, StartupForm, VisibilityForm,
} from '@/components/app/ProfileForms';

function Section({ id, title, description, children }: { id: string; title: string; description?: string; children: React.ReactNode }) {
  return (
    <Card as="section" className="p-5 sm:p-6">
      <h2 id={id} className="text-base font-semibold">{title}</h2>
      {description && <p className="mt-0.5 text-sm text-muted">{description}</p>}
      <div className="mt-5">{children}</div>
    </Card>
  );
}

export default function MyProfilePage() {
  const { profile, user } = useApp();
  return (
    <>
      <PageHeader title="Your profile" description="Everything here can be edited at any time."
        actions={<Link href={`/app/u/${user.id}`} className={buttonClass('secondary')}>View as others see it</Link>} />
      <div className="space-y-5">
        <ProfileCompletionCard />
        <Section id="photo" title="Photo"><AvatarUploader /></Section>
        <Section id="basics" title="About you"><BasicsForm /></Section>
        <Section id="intents" title="What describes you"><IntentsForm /></Section>
        <Section id="looking" title="What you are looking for"><LookingForForm /></Section>
        <Section id="skills" title="Skills"><SkillsEditor /></Section>
        <Section id="links" title="Links"><LinksEditor /></Section>
        <Section id="experience" title="Experience"><ExperienceEditor /></Section>
        {profile.intents.includes('founder') && <Section id="startup" title="Your startup"><StartupForm /></Section>}
        <Section id="visibility" title="Visibility"><VisibilityForm /></Section>
      </div>
    </>
  );
}
