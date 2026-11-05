import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'Community Guidelines' };

export default function Page() {
  return (
    <ContentPage eyebrow="Community" title="Community Guidelines" cta={false}
  intro="This is a professional network for people building startups. These guidelines keep it useful and safe."
  sections={[
    { heading: 'Be real', body: <ul><li>Use your real name and accurate information about your skills and experience.</li><li>Do not impersonate anyone or create accounts for other people.</li><li>One person, one account.</li></ul> },
    { heading: 'Be respectful', body: <ul><li>No harassment, discrimination, threats or sexual content.</li><li>Accept a declined request gracefully. Do not repeatedly contact someone who is not interested.</li></ul> },
    { heading: 'No spam or scams', body: <ul><li>No mass or automated requests, scraping or unsolicited promotion.</li><li>No requests for money, investment schemes, or “pay to join my startup” offers.</li><li>No malicious links.</li></ul> },
    { heading: 'Respect confidentiality', body: <p>If someone shares a startup idea or Think project with you, do not copy, publish or forward it without their permission.</p> },
    { heading: 'Enforcement', body: <p>We may remove content, restrict features, or suspend accounts that break these guidelines. Moderation actions are logged and reviewed. Contact support if you believe a decision was wrong.</p> },
  ]} />
  );
}
