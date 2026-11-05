import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'How it works' };

export default function Page() {
  return (
    <ContentPage eyebrow="How it works" title="From an idea to the right collaborators" intro="A short profile, complementary recommendations, consent-based connections and a private workspace for validating your idea."
  sections={[
    { heading: '1. Create your profile', body: <p>Choose what describes you — founder, co-founder seeker, professional or startup collaborator (you can pick several). Add your skills, experience, availability, timezone and working preferences.</p> },
    { heading: '2. Say what you need or offer', body: <p>Founders describe the venture, its stage and the roles they are missing. Builders describe the industries, stages and kinds of collaboration they want.</p> },
    { heading: '3. Discover relevant people', body: <p>Recommendations weigh complementary skills, role fit, whether the other person is looking for what you offer, industry and stage, availability, timezone and working style. Each recommendation shows plain-language reasons. You can also search with filters.</p> },
    { heading: '4. Connect', body: <p>Send a short request explaining why you would like to talk. If it is accepted, you can message each other. Requests are rate-limited to keep the network spam-free.</p> },
    { heading: '5. Validate with Think', body: <p>Create a private project, describe the idea and receive a structured report covering 20 areas, including risks, assumptions, validation experiments and interview questions. Ask follow-up questions and revisit earlier versions.</p> },
  ]} />
  );
}
