import { QuickValidate } from '@/components/think/QuickValidate';

export const metadata = {
  title: 'Quick Validate',
  description: 'Get a free, five-part preliminary review of your startup idea: customer and problem, biggest risks, the assumptions to test and your next steps.',
};

export default async function ValidatePage({ searchParams }: { searchParams: Promise<{ run?: string }> }) {
  const { run } = await searchParams;
  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6 sm:py-14">
      <p className="text-sm font-medium text-accent">Think · Quick Validate</p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">Is this idea worth testing?</h1>
      <p className="mt-3 max-w-2xl text-lg text-muted">
        A fast, candid first pass at your idea in five parts — what it is, who has the problem, the biggest risks,
        the assumptions you are betting on, and what to test next.
      </p>
      <div className="mt-8"><QuickValidate autoRun={run === '1'} /></div>
    </div>
  );
}
