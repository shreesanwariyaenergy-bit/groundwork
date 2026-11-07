import Link from 'next/link';
import { buttonClass } from '@/components/ui/styles';
import { QuickValidateHero } from '@/components/think/QuickValidate';
import { ThinkPreview } from '@/components/marketing/Previews';

const QUICK_PARTS = [
  ['Idea snapshot', 'Your idea restated plainly — who it is for, what it does, and why now.'],
  ['Customer and problem', 'Who most likely feels the problem, how badly, and what they do about it today.'],
  ['Biggest risks', 'The few things most likely to stop this idea, most serious first.'],
  ['Assumptions to test', 'What the idea is betting on, written so each belief can be tested.'],
  ['Next steps', 'Two or three cheap experiments for the next two weeks, each with a clear signal.'],
];

const PILLARS: { name: string; status: string; tone: 'live' | 'members' | 'planned'; body: string; href?: string }[] = [
  { name: 'Think', status: 'Available now', tone: 'live', href: '/validate',
    body: 'Validate startup ideas with a structured, honest AI workspace — from a five-minute quick review to a full analysis.' },
  { name: 'Connect', status: 'For members', tone: 'members', href: '/founder-matchmaking',
    body: 'Find co-founders and startup builders whose skills complement yours, with clear reasons for every match.' },
  { name: 'Capital', status: 'Planned', tone: 'planned',
    body: 'A considered way for founders and investors to find each other around real progress. Not available yet.' },
  { name: 'Test', status: 'Planned', tone: 'planned',
    body: 'Get your product in front of the right early testers and turn feedback into validated assumptions. Not available yet.' },
];

const TRUST = [
  ['Private by default', 'Your ideas are never shown to other people. Quick reviews are deleted after 7 days unless you save them.'],
  ['Honest about uncertainty', 'Every point is labelled as an assumption, hypothesis, estimate or recommendation. No invented market sizes.'],
  ['No fake traction', 'We will never show invented users, testimonials or numbers to make the network look bigger.'],
  ['Your data, your call', 'Export everything or delete your account at any time — on the web or in the Android app.'],
];

export default function HomePage() {
  return (
    <>
      <section className="border-b border-line">
        <div className="mx-auto grid max-w-6xl items-center gap-10 px-4 py-14 sm:px-6 md:py-20 lg:grid-cols-[1.05fr_1fr]">
          <div>
            <p className="text-sm font-medium text-accent">Groundwork Think</p>
            <h1 className="mt-3 text-4xl font-semibold leading-[1.08] tracking-tight text-fg sm:text-5xl">
              Validate your startup idea before you build it.
            </h1>
            <p className="mt-5 max-w-xl text-lg leading-relaxed text-muted">
              Get a candid, five-part review of your idea in minutes: who has the problem, what could kill it,
              what you are betting on, and exactly what to test next.
            </p>
            <ul className="mt-6 space-y-2 text-sm text-muted">
              <li className="flex gap-2"><span className="text-accent" aria-hidden>✓</span>Free, no account needed for your first reviews</li>
              <li className="flex gap-2"><span className="text-accent" aria-hidden>✓</span>Every point labelled — assumption, hypothesis or recommendation</li>
              <li className="flex gap-2"><span className="text-accent" aria-hidden>✓</span>Save it and go deeper in your private workspace</li>
            </ul>
          </div>
          <QuickValidateHero />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="parts">
        <h2 id="parts" className="text-2xl font-semibold tracking-tight">What your quick review covers</h2>
        <p className="mt-2 max-w-2xl text-muted">Five short parts, designed to tell you what to do next — not to flatter you.</p>
        <ol className="mt-10 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-5">
          {QUICK_PARTS.map(([t, b], i) => (
            <li key={t} className="border-t border-line pt-4">
              <span className="text-sm font-medium tabular-nums text-subtle">{String(i + 1).padStart(2, '0')}</span>
              <h3 className="mt-1 font-medium text-fg">{t}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{b}</p>
            </li>
          ))}
        </ol>
        <div className="mt-10"><Link href="/validate" className={buttonClass('primary', 'lg')}>Validate an idea</Link></div>
      </section>

      <section className="border-y border-line bg-surface">
        <div className="mx-auto grid max-w-6xl items-center gap-12 px-4 py-16 sm:px-6 lg:grid-cols-2">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Go deeper in your private Think workspace</h2>
            <p className="mt-3 text-muted">Save a quick review with just your email, then turn it into a full analysis when you are ready.</p>
            <ul className="mt-6 space-y-4 text-sm">
              {[
                ['A full 20-part analysis', 'Market structure, competitors, business models, feasibility, MVP scope, interview questions and go-to-market.'],
                ['Follow-up questions', 'Ask about pricing, risks or experiments, in the context of your idea.'],
                ['Versions and export', 'Revisit earlier reports as your idea changes; export to Markdown or PDF.'],
                ['Share only when you choose', 'Share a project read-only with a specific connection, and revoke it any time.'],
              ].map(([t, b]) => (
                <li key={t}><div className="font-medium text-fg">{t}</div><div className="text-muted">{b}</div></li>
              ))}
            </ul>
            <Link href="/think-workspace" className="mt-8 inline-block text-sm font-medium text-accent hover:underline">How Think works →</Link>
          </div>
          <ThinkPreview />
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16 sm:px-6" aria-labelledby="ecosystem">
        <h2 id="ecosystem" className="text-2xl font-semibold tracking-tight">One place to take an idea from first doubt to first customers</h2>
        <p className="mt-2 max-w-2xl text-muted">
          Groundwork is being built as four connected parts that share one profile and one record of your startup.
          We are starting with Think.
        </p>
        <ul className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {PILLARS.map((p) => {
            const inner = (
              <>
                <div className="flex items-center justify-between gap-2">
                  <h3 className="font-semibold text-fg">{p.name}</h3>
                  <span className={`rounded-sm px-1.5 py-0.5 text-xs font-medium ${p.tone === 'live' ? 'bg-accent-soft text-accent' : p.tone === 'members' ? 'bg-surface text-fg border border-line' : 'bg-surface text-subtle'}`}>{p.status}</span>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted">{p.body}</p>
              </>
            );
            return (
              <li key={p.name} className={`rounded-lg border p-5 ${p.tone === 'planned' ? 'border-dashed border-line-strong' : 'border-line'}`}>
                {p.href ? <Link href={p.href} className="block hover:opacity-90">{inner}</Link> : inner}
              </li>
            );
          })}
        </ul>
      </section>

      <section className="border-t border-line bg-surface">
        <div className="mx-auto max-w-6xl px-4 py-16 sm:px-6">
          <h2 className="text-2xl font-semibold tracking-tight">Built on trust</h2>
          <dl className="mt-8 grid gap-x-8 gap-y-6 sm:grid-cols-2 lg:grid-cols-4">
            {TRUST.map(([t, b]) => (
              <div key={t} className="border-t border-line pt-4"><dt className="font-medium text-fg">{t}</dt><dd className="mt-1 text-sm text-muted">{b}</dd></div>
            ))}
          </dl>
        </div>
      </section>

      <section className="border-t border-line">
        <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-6 px-4 py-14 sm:px-6 md:flex-row md:items-center">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Have an idea? Find out what to test first.</h2>
            <p className="mt-1 text-muted">It takes a couple of minutes and costs nothing.</p>
          </div>
          <Link href="/validate" className={buttonClass('primary', 'lg')}>Validate my idea</Link>
        </div>
      </section>
    </>
  );
}
