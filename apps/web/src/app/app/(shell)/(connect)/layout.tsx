'use client';
import Link from 'next/link';
import { buttonClass } from '@/components/ui';
import { useApp } from '@/components/app/AppProvider';

/** Connect needs a profile: others discover you through it. Think does not. */
export default function ConnectLayout({ children }: { children: React.ReactNode }) {
  const { profile } = useApp();
  if (profile.onboarding_completed) return <>{children}</>;
  return (
    <div className="mx-auto max-w-2xl py-6">
      <p className="text-sm font-medium text-accent">Connect</p>
      <h1 className="mt-2 text-2xl font-semibold tracking-tight">Set up your profile to use Connect</h1>
      <p className="mt-3 text-muted">
        Connect helps you find co-founders and startup builders whose skills complement yours. People can only find
        and message you once you have a profile, so we ask for a few details first — what you are building or what you
        bring, your skills and your availability. It takes about five minutes.
      </p>
      <ul className="mt-6 space-y-2 text-sm text-muted">
        <li className="flex gap-2"><span className="text-accent" aria-hidden>✓</span>Recommendations with clear reasons — no fake match scores</li>
        <li className="flex gap-2"><span className="text-accent" aria-hidden>✓</span>Messaging only after both people accept</li>
        <li className="flex gap-2"><span className="text-accent" aria-hidden>✓</span>Your Think projects stay private either way</li>
      </ul>
      <div className="mt-8 flex flex-wrap gap-3">
        <Link href="/app/onboarding" className={buttonClass('primary', 'lg')}>Set up my profile</Link>
        <Link href="/app/think" className={buttonClass('secondary', 'lg')}>Back to Think</Link>
      </div>
    </div>
  );
}
