/**
 * Product previews rendered with the real UI styles.
 * Content is illustrative and labelled as such — these are NOT real members.
 * Replace with genuine screenshots once the beta has consenting users.
 */
function Frame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <figure className="overflow-hidden rounded-lg border border-line bg-raised shadow-sm">
      <div className="flex items-center justify-between border-b border-line bg-surface px-4 py-2">
        <span className="text-xs font-medium text-muted">{title}</span>
        <span className="text-[11px] text-subtle">Illustrative preview</span>
      </div>
      <div className="p-4">{children}</div>
    </figure>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return <span className="rounded-sm border border-line bg-surface px-1.5 py-0.5 text-xs text-muted">{children}</span>;
}

export function DiscoveryPreview() {
  return (
    <Frame title="Discover · Recommended for you">
      <div className="space-y-3">
        {[
          { i: 'TE', role: 'AI / ML engineer · open to co-founding', reasons: ['Is looking for your expertise', 'Your skills complement each other'], skills: ['Python', 'LLM applications', 'MLOps'] },
          { i: 'PD', role: 'Product designer · part-time', reasons: ['Wants to work at your startup stage'], skills: ['UI design', 'UX research'] },
        ].map((p) => (
          <div key={p.i} className="rounded-md border border-line p-3">
            <div className="flex items-center gap-3">
              <span className="inline-flex size-9 items-center justify-center rounded-full border border-line bg-surface text-xs text-muted">{p.i}</span>
              <div className="min-w-0">
                <div className="h-3 w-28 rounded bg-surface" aria-label="Name hidden in preview" />
                <div className="mt-1 text-xs text-muted">{p.role}</div>
              </div>
            </div>
            <ul className="mt-3 space-y-1 text-xs text-fg">
              {p.reasons.map((r) => <li key={r} className="flex gap-1.5"><span className="text-accent">✓</span>{r}</li>)}
            </ul>
            <div className="mt-2 flex flex-wrap gap-1">{p.skills.map((s) => <Chip key={s}>{s}</Chip>)}</div>
          </div>
        ))}
      </div>
    </Frame>
  );
}

export function ThinkPreview() {
  return (
    <Frame title="Think · Startup analysis">
      <div className="space-y-3 text-sm">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Main risks</div>
          <p className="mt-1 text-fg">Clinics may already be locked into practice-management software that includes scheduling.</p>
        </div>
        <ul className="space-y-1.5 text-xs">
          <li className="flex gap-2"><span className="rounded-sm bg-warning-soft px-1.5 py-0.5 font-medium text-warning">Assumption</span>Owners decide on software alone.</li>
          <li className="flex gap-2"><span className="rounded-sm bg-surface px-1.5 py-0.5 font-medium text-muted">Hypothesis</span>No-shows cost clinics more than the subscription.</li>
          <li className="flex gap-2"><span className="rounded-sm bg-accent-soft px-1.5 py-0.5 font-medium text-accent">Recommendation</span>Interview 10 clinic managers before building.</li>
        </ul>
        <p className="rounded-md bg-surface px-3 py-2 text-xs text-muted">Market and competitor findings are preliminary — no external research was performed.</p>
      </div>
    </Frame>
  );
}

export function MessagingPreview() {
  return (
    <Frame title="Messages">
      <div className="space-y-2 text-sm">
        <div className="max-w-[80%] rounded-lg bg-surface px-3 py-2 text-fg">Thanks for connecting — would you be open to a call about the MVP scope?</div>
        <div className="ml-auto max-w-[80%] rounded-lg bg-accent px-3 py-2 text-on-accent">Yes. I can share how I would approach the data pipeline.</div>
        <div className="flex items-center gap-2 rounded-md border border-line px-3 py-2 text-xs text-subtle">Write a message…</div>
      </div>
    </Frame>
  );
}

export function ProfilePreview() {
  return (
    <Frame title="Founder profile">
      <div className="space-y-3 text-sm">
        <div className="flex items-center gap-3">
          <span className="inline-flex size-11 items-center justify-center rounded-full border border-line bg-surface text-xs text-muted">AF</span>
          <div>
            <div className="h-3 w-24 rounded bg-surface" />
            <div className="mt-1 text-xs text-muted">Founder · Validating · Healthtech</div>
          </div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Looking for</div>
          <div className="mt-1 flex flex-wrap gap-1"><Chip>Technical co-founder</Chip><Chip>AI / ML engineer</Chip></div>
        </div>
        <div>
          <div className="text-xs font-semibold uppercase tracking-wide text-subtle">Commitment</div>
          <div className="mt-1 text-xs text-fg">Full-time · Remote · UTC+5:30</div>
        </div>
      </div>
    </Frame>
  );
}
