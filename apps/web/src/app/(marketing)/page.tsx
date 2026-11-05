import Link from 'next/link';
import { buttonClass } from '@/components/ui/styles';
import { DiscoveryPreview, MessagingPreview, ProfilePreview, ThinkPreview } from '@/components/marketing/Previews';

const CAPABILITIES = [
  {
    title: 'Find a co-founder',
    body: 'Business founders meet technical builders, and technical founders meet people who can sell, operate and grow. Recommendations favour people who complement you — not copies of you.',
    href: '/founder-matchmaking',
  },
  {
    title: 'Discover professional collaborators',
    body: 'AI/ML engineers, developers, designers, product and growth people who want to work with early-stage startups — part-time, advisory or as future teammates.',
    href: '/professional-matchmaking',
  },
  {
    title: 'Validate ideas with Think',
    body: 'A structured workspace that examines your idea across 20 areas — from customer pain to risks, experiments and next steps — and labels what is an assumption versus a fact.',
    href: '/think-workspace',
  },
];

const STEPS = [
  ['Create your profile', 'Say who you are, what you can contribute and how much time you have.'],
  ['Describe what you are building — or want to build', 'Founders describe the venture and the roles they need. Builders describe where they want to contribute.'],
  ['Discover relevant people', 'See recommendations with clear reasons, or search with filters for skills, stage, availability and timezone.'],
  ['Connect and start collaborating', 'Send a short, personal request. Messaging opens when both people agree.'],
  ['Use Think to sharpen the idea', 'Stress-test the idea, plan validation experiments and keep everything private unless you choose to share.'],
];

const TRUST = [
  ['Private by default', 'Think projects are visible only to you. Nothing is shared with matches unless you explicitly share it with a connection.'],
  ['You control your visibility', 'Be discoverable, visible to connections only, or paused. Change it any time.'],
  ['Consent-based connections', 'People can only message each other after a request is accepted. Requests are rate-limited.'],
  ['Report and block', 'Block anyone instantly. Reports are reviewed by people, and every moderation action is logged.'],
  ['Your data, your call', 'Export everything you have shared, or delete your account and associated data from the app or the web.'],
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 md:py-24 lg:grid-cols-[1.1fr_1fr]">
          <div>
            <p className="text-sm font-medium text-accent">For founders and the people who build with them</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.1] tracking-tight text-fg sm:text-5xl">
              Find your people.<br />Validate your idea.<br />Build what matters.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              A focused network for ambitious founders, co-founders and startup builders. Discover people whose skills complement yours,
              and pressure-test your startup idea with a structured AI workspace.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/register" className={buttonClass('primary', 'lg')}>Join the network</Link>
              <Link href="/think-workspace" className={buttonClass('secondary', 'lg')}>Explore Think</Link>
            </div>
            <p className="mt-4 text-sm text-subtle">Free to join. Adults 18+. Available on the web and Android.</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
            <DiscoveryPreview />
            <div className="space-y-4"><ThinkPreview /></div>
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Two questions every founder has to answer</h2>
        <p className="mt-2 max-w-2xl text-muted">Is this idea worth pursuing, and what should I validate next? Who are the right people to build it with?</p>
        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {CAPABILITIES.map((c) => (
            <Link key={c.title} href={c.href} className="group rounded-lg border border-line p-6 transition-colors hover:border-line-strong">
              <h3 className="font-semibold text-fg">{c.title}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.body}</p>
              <span className="mt-4 inline-block text-sm font-medium text-accent group-hover:underline">Learn more →</span>
            </Link>
          ))}
        </div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">How it works</h2>
            <ol className="mt-8 space-y-6">
              {STEPS.map(([t, b], i) => (
                <li key={t} className="flex gap-4">
                  <span className="flex size-8 shrink-0 items-center justify-center rounded-full border border-line-strong bg-raised text-sm font-medium">{i + 1}</span>
                  <div>
                    <h3 className="font-medium text-fg">{t}</h3>
                    <p className="mt-1 text-sm text-muted">{b}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
          <div className="grid content-start gap-4 sm:grid-cols-2">
            <ProfilePreview />
            <MessagingPreview />
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
        <h2 className="text-2xl font-semibold tracking-tight">Built on trust</h2>
        <p className="mt-2 max-w-2xl text-muted">Startup ideas are sensitive and introductions are personal. The product is designed around consent and control.</p>
        <dl className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map(([t, b]) => (
            <div key={t} className="border-t border-line pt-4">
              <dt className="font-medium text-fg">{t}</dt>
              <dd className="mt-1 text-sm text-muted">{b}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Start with your profile. It takes a few minutes.</h2>
            <p className="mt-1 text-muted">We are early. The network grows with every founder and builder who joins and invites a collaborator.</p>
          </div>
          <Link href="/register" className={buttonClass('primary', 'lg')}>Join the network</Link>
        </div>
      </section>
    </>
  );
}
