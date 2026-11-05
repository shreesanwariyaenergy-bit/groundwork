import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'Professional matchmaking' };

export default function Page() {
  return (
    <ContentPage eyebrow="Professional matchmaking" title="Meet the builders early-stage startups need" intro="Founders discover AI/ML engineers, developers, designers, product and growth professionals who want to work with early teams. Professionals discover founders working on problems they care about."
  sections={[
    { heading: 'For founders', body: <p>Building an AI product? See AI/ML engineers. Preparing an MVP? Find product designers and mobile developers. Ready for users? Meet growth professionals. Filter by skills, stage, availability, timezone and experience.</p> },
    { heading: 'For professionals', body: <p>State how you want to contribute — co-founder, advisory, part-time or contract — along with the industries and stages that interest you. Founders looking for your expertise will see why you are a fit.</p> },
    { heading: 'Free to appear', body: <p>Professionals do not pay to be discoverable, and nobody can pay to rank higher. Ranking is based on relevance only.</p> },
  ]} />
  );
}
