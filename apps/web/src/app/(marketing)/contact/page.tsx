import { BRAND } from '@groundwork/shared';
import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'Contact' };

export default function Page() {
  return (
    <ContentPage eyebrow="Contact" title="Get in touch" cta={false}
  sections={[
    { heading: 'Support', body: <p>Email <a href={`mailto:${BRAND.supportEmail}`}>{BRAND.supportEmail}</a>. Please include the email address you registered with, but never your password.</p> },
    { heading: 'Report a safety concern', body: <p>Use the Report option on a profile or message so our moderators see the context. For urgent safety issues, contact local authorities first.</p> },
    { heading: 'Privacy requests', body: <p>You can export your data from Settings → Privacy. For other privacy requests, email us from your registered address.</p> },
    { heading: 'Partnerships', body: <p>Running a founder community, incubator, university entrepreneurship group or hackathon? We would like to hear from you.</p> },
  ]} />
  );
}
