import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'FAQ' };

export default function Page() {
  return (
    <ContentPage eyebrow="FAQ" title="Frequently asked questions" cta={false}
  sections={[
    { heading: 'Is it free?', body: <p>Yes. Registration, profiles, discovery, connection requests and messaging are free. Think AI analyses are free within daily limits.</p> },
    { heading: 'Who can join?', body: <p>Adults aged 18 or over, anywhere in the world. The product is in English for now.</p> },
    { heading: 'Why are there not many recommendations yet?', body: <p>We are early and will never invent users to make the network look bigger. Complete your profile, use search and filters, and invite collaborators — recommendations improve as the network grows.</p> },
    { heading: 'Can other people see my Think projects?', body: <p>No. Think projects are private. You can explicitly share a project with one of your connections, and remove access at any time.</p> },
    { heading: 'Which AI does Think use?', body: <p>Think uses a configurable AI provider. Before your first analysis, the app tells you which provider will process your idea. Do not include information you are not comfortable sharing with that provider.</p> },
    { heading: 'Can I trust the Think report?', body: <p>Treat it as a thinking aid, not research. Every point is labelled as an assumption, estimate, hypothesis, recommendation or question, and market and competitor findings are preliminary.</p> },
    { heading: 'Why can I not message someone?', body: <p>Messaging opens after a connection request is accepted. This keeps introductions consensual and the network free of spam.</p> },
    { heading: 'How do I delete my account?', body: <p>From Settings → Account in the app or website, or via the <a href="/delete-account">account deletion page</a>.</p> },
  ]} />
  );
}
