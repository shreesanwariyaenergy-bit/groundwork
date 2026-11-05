import Link from 'next/link';
import { BRAND } from '@groundwork/shared';
import { buttonClass } from '@/components/ui/styles';
import { DeletionRequestForm } from './DeletionRequestForm';

export const metadata = { title: 'Delete your account' };

export default function DeleteAccountPage() {
  return (
    <article className="mx-auto max-w-3xl px-4 py-14 sm:px-6">
      <p className="text-sm font-medium text-accent">Account deletion</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">Delete your {BRAND.name} account</h1>
      <p className="mt-4 text-lg text-muted">You can delete your account at any time — from the Android app, from the website, or using this page without reinstalling the app.</p>

      <section className="mt-10 grid gap-6 md:grid-cols-2">
        <div className="rounded-lg border border-line p-6">
          <h2 className="font-semibold">Option 1 — Sign in and delete (immediate)</h2>
          <p className="mt-2 text-sm text-muted">Sign in, then go to <strong className="text-fg">Settings → Account → Delete account</strong>. Deletion happens immediately.</p>
          <Link href="/login?next=/app/settings%3Ftab%3Daccount" className={buttonClass('primary', 'md', 'mt-4')}>Sign in to delete</Link>
          <p className="mt-4 text-sm text-muted">In the Android app: <strong className="text-fg">Profile → Settings → Delete account</strong>.</p>
        </div>
        <div className="rounded-lg border border-line p-6">
          <h2 className="font-semibold">Option 2 — Request deletion</h2>
          <p className="mt-2 text-sm text-muted">If you cannot sign in, submit your account email. We will confirm the request with you by email before deleting, normally within 30 days.</p>
          <DeletionRequestForm />
        </div>
      </section>

      <section className="mt-12 space-y-6 text-[15px] leading-relaxed text-muted">
        <div>
          <h2 className="text-lg font-semibold text-fg">What is deleted</h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>Your account, sign-in details and profile (including photo, skills, experience and links)</li>
            <li>Startup details on your profile and all Think projects, reports and follow-up questions</li>
            <li>Messages you sent, your connections, connection requests, saved profiles and blocks</li>
            <li>Notifications, notification preferences and registered devices</li>
            <li>Product analytics events linked to your account</li>
          </ul>
        </div>
        <div>
          <h2 className="text-lg font-semibold text-fg">What is kept, and why</h2>
          <ul className="mt-2 ml-5 list-disc space-y-1">
            <li>Moderation reports you filed or that were filed about you, with your account link removed, to keep the community safe.</li>
            <li>AI usage cost records (no content), with your account link removed, for cost accounting.</li>
            <li>Administrative audit records required to demonstrate moderation decisions.</li>
            <li>Encrypted provider backups are overwritten on their standard rotation.</li>
          </ul>
        </div>
        <p>Questions? Email <a className="text-accent underline" href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>.</p>
      </section>
    </article>
  );
}
