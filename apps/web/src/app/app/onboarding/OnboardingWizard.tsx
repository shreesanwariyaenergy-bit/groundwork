'use client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { friendlyError } from '@groundwork/shared';
import { Alert, Button } from '@/components/ui';
import { Logo } from '@/components/marketing/Logo';
import { useApp } from '@/components/app/AppProvider';
import {
  AvatarUploader, BasicsForm, ExperienceEditor, IntentsForm, LinksEditor, LookingForForm, SkillsEditor, StartupForm, VisibilityForm,
} from '@/components/app/ProfileForms';
import { getBrowserClient } from '@/lib/supabase/client';

type Step = 'intents' | 'looking' | 'basics' | 'skills' | 'startup' | 'visibility';

export function OnboardingWizard() {
  const router = useRouter();
  const { profile, user, refreshProfile, api } = useApp();
  const isFounder = profile.intents.includes('founder');
  const steps: { key: Step; title: string; subtitle: string }[] = [
    { key: 'intents', title: 'What describes you?', subtitle: 'You can choose more than one.' },
    { key: 'looking', title: 'What are you looking for?', subtitle: 'We use this to recommend people who complement you.' },
    { key: 'basics', title: 'About you', subtitle: 'The essentials people see on your profile.' },
    { key: 'skills', title: 'Skills, links and experience', subtitle: 'Specific skills make discovery far more useful.' },
    ...(isFounder ? [{ key: 'startup' as Step, title: 'What are you building?', subtitle: 'Shown on your profile according to the visibility you choose.' }] : []),
    { key: 'visibility', title: 'Profile visibility', subtitle: 'Decide who can find you. You can change this at any time.' },
  ];
  const [idx, setIdx] = useState(0);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = steps[Math.min(idx, steps.length - 1)]!;
  const next = () => setIdx((i) => Math.min(i + 1, steps.length - 1));
  const back = idx > 0 ? () => setIdx((i) => i - 1) : undefined;

  async function finish() {
    setFinishing(true); setError(null);
    const { error } = await getBrowserClient().from('profiles').update({ onboarding_completed: true }).eq('id', user.id);
    if (error) { setError(friendlyError(error)); setFinishing(false); return; }
    await refreshProfile();
    api.track('onboarding_completed', { intents: profile.intents }).catch(() => {});
    router.replace('/app?welcome=1');
    router.refresh();
  }

  return (
    <div className="min-h-dvh bg-surface">
      <header className="mx-auto flex h-16 max-w-3xl items-center justify-between px-4 sm:px-6">
        <Logo href="/app/onboarding" />
        <span className="text-sm text-muted">Step {idx + 1} of {steps.length}</span>
      </header>
      <div className="mx-auto max-w-3xl px-4 pb-16 sm:px-6">
        <div className="mb-6 h-1 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent transition-all" style={{ width: `${((idx + 1) / steps.length) * 100}%` }} /></div>
        <div className="rounded-lg border border-line bg-raised p-5 sm:p-8">
          <h1 className="text-xl font-semibold">{step.title}</h1>
          <p className="mt-1 mb-6 text-sm text-muted">{step.subtitle}</p>
          {step.key === 'intents' && <IntentsForm onSaved={next} submitLabel="Continue" />}
          {step.key === 'looking' && <LookingForForm onSaved={next} submitLabel="Continue" onBack={back} />}
          {step.key === 'basics' && (
            <div className="space-y-6"><AvatarUploader /><BasicsForm onSaved={next} submitLabel="Continue" onBack={back} /></div>
          )}
          {step.key === 'skills' && (
            <div className="space-y-8">
              <section><h2 className="mb-2 text-sm font-semibold">Skills</h2><SkillsEditor /></section>
              <section><h2 className="mb-2 text-sm font-semibold">Professional links</h2><LinksEditor /></section>
              <section><h2 className="mb-2 text-sm font-semibold">Experience <span className="font-normal text-subtle">(optional)</span></h2><ExperienceEditor /></section>
              <div className="flex gap-3"><Button variant="ghost" onClick={back}>Back</Button><Button onClick={next}>Continue</Button></div>
            </div>
          )}
          {step.key === 'startup' && <StartupForm onSaved={next} submitLabel="Continue" onBack={back} />}
          {step.key === 'visibility' && (
            <div className="space-y-4">
              <VisibilityForm requireAdult onSaved={finish} submitLabel="Finish and go to my dashboard" onBack={back} />
              {finishing && <p className="text-sm text-muted">Finishing…</p>}
              {error && <Alert tone="danger">{error}</Alert>}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
