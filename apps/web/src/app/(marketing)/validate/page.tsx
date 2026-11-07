import { QuickValidate } from '@/components/think/QuickValidate';

export const metadata = {
  title: 'Quick Validate',
  description: 'A free 7-parameter assessment of your startup idea: problem strength, customer clarity, market opportunity, competition, differentiation, business model and execution feasibility.',
};

export default async function ValidatePage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium text-accent">Think · Quick Validate</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Is this idea worth testing?</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        A free, candid first assessment across seven parameters — problem, customer, market, competition, differentiation,
        business model and execution — with the biggest opportunities and concerns, one experiment to run and your next decision.
      </p>
      <div className="mt-8"><QuickValidate autoRun={run === '1'} /></div>
    </div>
  );
}
