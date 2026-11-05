import { ContentPage } from '@/components/marketing/ContentPage';

export const metadata = { title: 'Think — AI startup workspace' };

export default function Page() {
  return (
    <ContentPage eyebrow="Think" title="A structured workspace for validating startup ideas" intro="Think helps you reason about an idea instead of telling you every idea is brilliant. It produces a structured report and helps you plan what to validate next."
  sections={[
    { heading: 'Twenty areas, one report', body: <p>Executive summary, problem, target customer, pain points, solution, market overview, competitor landscape, differentiation, business models, revenue streams, technical feasibility, execution difficulty, resources, risks, assumptions, validation experiments, MVP features, interview questions, go-to-market and next steps.</p> },
    { heading: 'Honest about uncertainty', body: <><p>Every point is labelled as an estimate, assumption, hypothesis, recommendation or question. Think does not perform live research in this version, so market and competitor findings are always marked <strong>preliminary</strong>. It is instructed never to invent market sizes, statistics, competitor figures or citations.</p></> },
    { heading: 'Private by default', body: <p>Projects are visible only to you. You can share a project with a specific connection, and revoke access at any time. Before your first AI analysis we show which AI provider will process your idea.</p> },
    { heading: 'Always useful, even without AI', body: <p>Daily AI usage is limited so the service stays free. If AI analysis is unavailable or you have reached today’s limit, you can use a clearly labelled basic checklist that walks through the same 20 areas.</p> },
  ]} />
  );
}
