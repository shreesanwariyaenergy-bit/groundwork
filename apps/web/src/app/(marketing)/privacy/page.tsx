import { BRAND } from '@groundwork/shared';
import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'Privacy Policy' };

export default function Page() {
  return (
    <ContentPage title="Privacy Policy" draftNotice cta={false}
  intro={<>Last updated: November 2026. This policy explains what we collect, why, and the choices you have.</>}
  sections={[
    { heading: 'Information you provide', body: <ul><li>Account: name, email address, password (stored hashed by our authentication provider), and confirmation that you are 18 or older.</li><li>Profile: headline, introduction, photo, skills, experience, links, location (country, optional city), timezone, availability and preferences.</li><li>Startup information you choose to add to your profile.</li><li>Think projects: ideas, context, reports and follow-up questions.</li><li>Connections, messages, reports and blocks.</li></ul> },
    { heading: 'Information collected automatically', body: <ul><li>Product events (for example, that you opened the app or sent a request) used to measure and improve the product.</li><li>Device push-notification tokens if you enable notifications on Android.</li><li>Technical logs kept by our hosting providers for security and reliability.</li></ul> },
    { heading: 'How we use information', body: <><ul><li>To operate the network: show your profile to members according to your visibility setting, generate recommendations and deliver messages and notifications.</li><li>To keep the service safe: rate limiting, spam prevention and moderation.</li><li>To generate Think reports when you request them.</li></ul><p>We do not sell personal information, and we do not use your private Think projects for matching or advertising.</p></> },
    { heading: 'AI processing', body: <p>When you request an AI analysis, your project title, idea, context and follow-up questions are sent to the AI provider shown in the app. Providers’ data-use and retention terms differ, and some free tiers may use submitted content to improve their services. We show the provider before your first analysis. We store usage metadata (tokens, provider, time) but not your prompt text in our usage logs.</p> },
    { heading: 'Who we share with', body: <ul><li>Other members, according to your visibility settings.</li><li>Service providers acting on our behalf: database and authentication hosting (Supabase), web hosting (Vercel), push delivery (Expo / Google Firebase Cloud Messaging), transactional email (if enabled), and the configured AI provider.</li><li>Authorities where required by law.</li></ul> },
    { heading: 'Retention and deletion', body: <p>We keep your information while your account is active. When you delete your account, we delete your profile, Think projects, messages you sent, connections, saved profiles, notifications and devices. Moderation reports and AI cost records are kept without a link to your account for safety and accounting. Backups are overwritten on our providers’ standard schedule.</p> },
    { heading: 'Your choices and rights', body: <ul><li>Edit your profile and visibility at any time.</li><li>Export your data from Settings → Privacy.</li><li>Delete your account from Settings → Account or the <a href="/delete-account">account deletion page</a>.</li><li>Depending on where you live, you may have additional rights (for example under the GDPR or India’s DPDP Act). Contact us to exercise them.</li></ul> },
    { heading: 'Contact', body: <p>{BRAND.supportEmail}</p> },
  ]} />
  );
}
