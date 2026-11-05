import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'About' };

export default function Page() {
  return (
    <ContentPage eyebrow="About" title="Helping founders find the people and insight to build" intro="Most startups do not fail for lack of ideas. They stall because the founder cannot find the right collaborators, or because nobody tested the riskiest assumptions early enough. We are building a focused network to help with both."
  sections={[
    { heading: 'Why we exist', body: <><p>Professional networks help people connect. Job boards help companies recruit. Freelance marketplaces sell services. None of them are designed for the moment when someone has an idea and needs a complementary co-founder or an early builder who believes in it.</p><p>We combine complementary matchmaking with Think, a structured idea-validation workspace, so founders can move from an idea to a team and a validation plan.</p></> },
    { heading: 'What we will not do', body: <ul><li>We will not show fake profiles, fake activity or invented traction.</li><li>We will not sell placement in recommendations.</li><li>We will not share your private startup ideas with anyone without your explicit consent.</li><li>We will not present AI output as verified research.</li></ul> },
    { heading: 'Where we are', body: <p>We are an early-stage product. The network is small and growing; recommendations get better as more founders and builders join. If you find the product useful, inviting a collaborator is the most valuable thing you can do.</p> },
  ]} />
  );
}
