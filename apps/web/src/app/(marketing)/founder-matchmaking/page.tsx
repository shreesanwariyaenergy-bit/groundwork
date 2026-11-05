import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'Founder matchmaking' };

export default function Page() {
  return (
    <ContentPage eyebrow="Founder matchmaking" title="Find a co-founder who complements you" intro="A business founder needs someone who can build. A technical founder needs someone who can sell and operate. Recommendations are designed around complementarity."
  sections={[
    { heading: 'Complementary, not identical', body: <p>We look at the roles you are looking for, the skills you already have, and whether the other person is looking for what you bring. Two people with the same skill set rarely make the strongest founding team.</p> },
    { heading: 'Commitment and practicality matter', body: <p>Availability, commitment expectations, timezone and working preferences are part of the ranking, so you spend less time on conversations that cannot work in practice.</p> },
    { heading: 'Clear reasons, no fake scores', body: <p>Instead of an invented compatibility percentage, each recommendation explains itself: “Is looking for your expertise”, “Your skills complement each other”, “Similar timezone”.</p> },
    { heading: 'You stay in control', body: <ul><li>Dismiss recommendations you are not interested in.</li><li>Save profiles to revisit later.</li><li>Nobody can message you until you accept their request.</li></ul> },
  ]} />
  );
}
