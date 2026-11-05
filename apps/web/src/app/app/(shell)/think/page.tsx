'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { friendlyError, relativeTime } from '@groundwork/shared';
import { Button, Card, EmptyState, ErrorState, Modal, PageHeader, Skeleton } from '@/components/ui';
import { ProjectForm } from '@/components/app/ThinkUI';
import { useApp, useAsync } from '@/components/app/AppProvider';
import { getBrowserClient } from '@/lib/supabase/client';

export default function ThinkListPage() {
  const { api, user } = useApp();
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const { data, loading, error, reload } = useAsync(() => api.thinkProjects(), []);
  const status = useAsync(() => api.thinkStatus(), []);
  const shared = useAsync(async () => {
    const { data } = await getBrowserClient().from('think_project_shares').select('project_id, think_projects(id, title, updated_at)').eq('shared_with', user.id);
    return (data ?? []) as unknown as { project_id: string; think_projects: { id: string; title: string; updated_at: string } | null }[];
  }, []);

  return (
    <>
      <PageHeader title="Think" description="Stress-test startup ideas and plan what to validate next. Private by default."
        actions={<Button onClick={() => setCreating(true)}>New project</Button>} />
      {status.data && (
        <p className="mb-5 text-sm text-muted">
          {status.data.ai_available
            ? <>AI analyses today: {status.data.analyses_used_today}/{status.data.analyses_per_day} · Follow-ups: {status.data.followups_used_today}/{status.data.followups_per_day}</>
            : <>AI analysis is currently unavailable. You can still create projects and use the basic checklist.</>}
        </p>
      )}
      {loading ? <Skeleton className="h-40" /> : error ? <ErrorState message={friendlyError(error)} onRetry={reload} /> : !data?.length ? (
        <EmptyState title="Start your first project" body="Describe an idea and get a structured analysis covering customers, risks, assumptions, experiments and next steps."
          action={<Button onClick={() => setCreating(true)}>New project</Button>} />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2">
          {data.map((p) => (
            <li key={p.id}>
              <Link href={`/app/think/${p.id}`} className="block h-full rounded-lg border border-line bg-raised p-5 hover:border-line-strong">
                <h2 className="font-medium">{p.title}</h2>
                <p className="mt-1 line-clamp-3 text-sm text-muted">{p.idea}</p>
                <p className="mt-3 text-xs text-subtle">Updated {relativeTime(p.updated_at)} ago</p>
              </Link>
            </li>
          ))}
        </ul>
      )}
      {(shared.data ?? []).filter((s) => s.think_projects).length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-base font-semibold">Shared with you</h2>
          <ul className="space-y-2">
            {shared.data!.filter((s) => s.think_projects).map((s) => (
              <li key={s.project_id}><Card className="px-4 py-3"><Link href={`/app/think/${s.project_id}`} className="font-medium hover:underline">{s.think_projects!.title}</Link><span className="ml-2 text-xs text-subtle">read-only</span></Card></li>
            ))}
          </ul>
        </section>
      )}
      <Modal open={creating} onClose={() => setCreating(false)} title="New Think project">
        <ProjectForm submitLabel="Create project" onSubmit={async (v) => {
          const { data, error } = await getBrowserClient().from('think_projects').insert({ ...v, owner_id: user.id }).select('id').single();
          if (error) throw error;
          api.track('think_project_created').catch(() => {});
          router.push(`/app/think/${data.id}`);
        }} />
      </Modal>
    </>
  );
}
