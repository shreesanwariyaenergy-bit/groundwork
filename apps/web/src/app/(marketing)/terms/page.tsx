import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'Terms of Service' };

export default function Page() {
  return (
    <ContentPage title="Terms of Service" draftNotice cta={false}
  intro="Last updated: November 2026. By creating an account you agree to these terms."
  sections={[
    { heading: 'Eligibility', body: <p>You must be at least 18 years old and able to form a binding contract. You are responsible for the accuracy of the information you provide.</p> },
    { heading: 'Your account', body: <p>Keep your credentials secure. You are responsible for activity on your account. Tell us promptly about any unauthorised use.</p> },
    { heading: 'Acceptable use', body: <p>Follow the <a href="/guidelines">Community Guidelines</a>. Do not scrape the service, automate requests, attempt to access other users’ data, or interfere with the service.</p> },
    { heading: 'Your content', body: <p>You keep ownership of what you post. You give us a limited licence to host and display it to operate the service according to your settings.</p> },
    { heading: 'Think and AI output', body: <p>Think reports are generated automatically and may be inaccurate or incomplete. They are not legal, financial, investment or professional advice. You are responsible for decisions you make.</p> },
    { heading: 'Connections between members', body: <p>We do not verify every member’s identity or claims, and we are not party to agreements between members. Use your own judgement and due diligence before collaborating, sharing confidential information or exchanging money.</p> },
    { heading: 'Suspension and termination', body: <p>We may restrict or suspend accounts that violate these terms. You may delete your account at any time.</p> },
    { heading: 'Disclaimers and liability', body: <p>The service is provided “as is”. To the extent permitted by law, we are not liable for indirect or consequential losses. Some jurisdictions do not allow these limitations, so they may not apply to you.</p> },
    { heading: 'Changes', body: <p>We will notify you of material changes to these terms.</p> },
  ]} />
  );
}
