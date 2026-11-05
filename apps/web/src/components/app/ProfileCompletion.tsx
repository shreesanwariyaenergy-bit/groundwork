'use client';
import Link from 'next/link';
import { profileCompletion } from '@groundwork/shared';
import { Card } from '@/components/ui';
import { getBrowserClient } from '@/lib/supabase/client';
import { useApp, useAsync } from './AppProvider';

export function ProfileCompletionCard({ compact }: { compact?: boolean }) {
  const { profile, user } = useApp();
  const { data } = useAsync(async () => {
    const sb = getBrowserClient();
    const [skills, links, exp, startup] = await Promise.all([
      sb.from('user_skills').select('skill_id', { count: 'exact', head: true }).eq('user_id', user.id),
      sb.from('profile_links').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      sb.from('user_experiences').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
      sb.from('startup_projects').select('summary').eq('owner_id', user.id).eq('is_primary', true).maybeSingle(),
    ]);
    return profileCompletion({ profile, skillCount: skills.count ?? 0, linkCount: links.count ?? 0, experienceCount: exp.count ?? 0, startup: startup.data });
  }, [profile]);
  if (!data) return null;
  const missing = data.items.filter((i) => !i.done);
  if (compact && data.percent === 100) return null;
  return (
    <Card className="p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Profile completeness</h2>
        <span className="text-sm font-medium tabular-nums">{data.percent}%</span>
      </div>
      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-line"><div className="h-full bg-accent" style={{ width: `${data.percent}%` }} /></div>
      {missing.length > 0 ? (
        <ul className="mt-3 space-y-1 text-sm">
          {missing.slice(0, compact ? 3 : 10).map((m) => (
            <li key={m.key}><Link href="/app/profile" className="text-muted hover:text-fg">→ {m.label}</Link></li>
          ))}
        </ul>
      ) : <p className="mt-3 text-sm text-muted">Your profile has everything recommendations use.</p>}
      <p className="mt-3 text-xs text-subtle">Completeness measures how much information you have shared — not quality or trust.</p>
    </Card>
  );
}
