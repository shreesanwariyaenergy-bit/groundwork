'use client';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Avatar, cn } from '@/components/ui';
import { Logo } from '@/components/marketing/Logo';
import { getBrowserClient } from '@/lib/supabase/client';
import { useApp } from './AppProvider';

type IconName = 'home' | 'discover' | 'think' | 'connections' | 'messages' | 'profile' | 'settings' | 'bell' | 'shield';
export function Icon({ name, className = 'size-5' }: { name: IconName; className?: string }) {
  const d: Record<IconName, string> = {
    home: 'M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z',
    discover: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zm9 16-4.3-4.3',
    think: 'M9 18h6M10 21h4M12 3a6 6 0 0 0-3.5 10.9c.6.4 1 1.1 1 1.8V16h5v-.3c0-.7.4-1.4 1-1.8A6 6 0 0 0 12 3z',
    connections: 'M16 19v-1a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v1M9 10a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zm8 1a3 3 0 1 0 0-6m5 14v-1a4 4 0 0 0-3-3.9',
    messages: 'M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12z',
    profile: 'M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm-8 9a8 8 0 0 1 16 0',
    settings: 'M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zm8.4-3a8.4 8.4 0 0 0-.1-1.3l2-1.6-2-3.4-2.4 1a8 8 0 0 0-2.2-1.3L15.3 3h-4l-.4 2.4a8 8 0 0 0-2.2 1.3l-2.4-1-2 3.4 2 1.6a8.4 8.4 0 0 0 0 2.6l-2 1.6 2 3.4 2.4-1a8 8 0 0 0 2.2 1.3l.4 2.4h4l.4-2.4a8 8 0 0 0 2.2-1.3l2.4 1 2-3.4-2-1.6c.1-.4.1-.9.1-1.3z',
    bell: 'M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9M13.7 21a2 2 0 0 1-3.4 0',
    shield: 'M12 3 4 6v6c0 5 3.4 8.4 8 9 4.6-.6 8-4 8-9V6z',
  };
  return (
    <svg viewBox="0 0 24 24" className={className} fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={d[name]} />
    </svg>
  );
}

type NavItem = { href: string; label: string; icon: IconName; mobile?: string };
/** Pillar-shaped navigation. Capital and Test get entries only once they are functional. */
const NAV_GROUPS: { label?: string; items: NavItem[] }[] = [
  { items: [
    { href: '/app', label: 'Home', icon: 'home', mobile: 'Home' },
    { href: '/app/think', label: 'Think', icon: 'think', mobile: 'Think' },
  ] },
  { label: 'Connect', items: [
    { href: '/app/discover', label: 'Discover', icon: 'discover', mobile: 'Connect' },
    { href: '/app/connections', label: 'Connections', icon: 'connections' },
    { href: '/app/messages', label: 'Messages', icon: 'messages', mobile: 'Messages' },
  ] },
  { label: 'You', items: [
    { href: '/app/profile', label: 'Profile', icon: 'profile', mobile: 'Profile' },
    { href: '/app/settings', label: 'Settings', icon: 'settings' },
  ] },
];
const NAV = NAV_GROUPS.flatMap((g) => g.items);

function isActive(path: string, href: string) {
  return href === '/app' ? path === '/app' : path === href || path.startsWith(href + '/');
}

function useUnreadCounts() {
  const { api, user } = useApp();
  const [counts, setCounts] = useState({ notifications: 0, messages: 0 });
  useEffect(() => {
    let alive = true;
    const load = async () => {
      try {
        const [n, convs] = await Promise.all([api.unreadNotificationCount(), api.conversations(0)]);
        if (alive) setCounts({ notifications: n, messages: convs.reduce((s, c) => s + c.unread_count, 0) });
      } catch { /* offline: keep last counts */ }
    };
    load();
    const sb = getBrowserClient();
    const ch = sb.channel(`badges:${user.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` }, load)
      .subscribe();
    const iv = setInterval(load, 60_000);
    return () => { alive = false; clearInterval(iv); sb.removeChannel(ch); };
  }, [api, user.id]);
  return counts;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { profile, avatar, isStaff } = useApp();
  const counts = useUnreadCounts();

  const badge = (href: string) => (href === '/app/messages' ? counts.messages : 0);

  return (
    <div className="min-h-dvh bg-bg">
      {/* Desktop sidebar */}
      <aside className="fixed inset-y-0 left-0 hidden w-60 flex-col border-r border-line bg-surface px-3 py-4 lg:flex">
        <div className="px-2 pb-6"><Logo href="/app" /></div>
        <nav className="flex-1 space-y-0.5" aria-label="App">
          {NAV_GROUPS.map((g, gi) => (
            <div key={gi} className={gi ? 'pt-4' : ''}>
              {g.label && <div className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-wider text-subtle">{g.label}</div>}
              {g.items.map((n) => (
                <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined}
                  className={cn('flex h-10 items-center gap-3 rounded-md px-3 text-sm', isActive(path, n.href) ? 'bg-raised font-medium text-fg shadow-sm border border-line' : 'text-muted hover:text-fg')}>
                  <Icon name={n.icon} />
                  <span className="flex-1">{n.label}</span>
                  {badge(n.href) > 0 && <span className="rounded-full bg-accent px-1.5 text-xs font-medium text-on-accent">{badge(n.href)}<span className="sr-only"> unread</span></span>}
                </Link>
              ))}
            </div>
          ))}
          {isStaff && (
            <Link href="/admin" className="mt-4 flex h-10 items-center gap-3 rounded-md px-3 text-sm text-muted hover:text-fg">
              <Icon name="shield" /> Admin
            </Link>
          )}
        </nav>
        <Link href="/app/profile" className="flex items-center gap-3 rounded-md px-2 py-2 hover:bg-raised">
          <Avatar name={profile.display_name} src={avatar(profile.avatar_path)} size={32} />
          <div className="min-w-0 text-sm">
            <div className="truncate font-medium">{profile.display_name}</div>
            <div className="truncate text-xs text-muted">{profile.headline}</div>
          </div>
        </Link>
      </aside>

      <div className="lg:pl-60">
        <header className="sticky top-0 z-20 flex h-14 items-center justify-between border-b border-line bg-bg/90 px-4 backdrop-blur sm:px-6">
          <div className="lg:hidden"><Logo href="/app" /></div>
          <div className="hidden lg:block" />
          <div className="flex items-center gap-1">
            <Link href="/app/connections" className="rounded-md p-2 text-muted hover:bg-surface hover:text-fg lg:hidden" aria-label="Connections"><Icon name="connections" /></Link>
            <button onClick={() => router.push('/app/notifications')} className="relative rounded-md p-2 text-muted hover:bg-surface hover:text-fg" aria-label={`Notifications${counts.notifications ? `, ${counts.notifications} unread` : ''}`}>
              <Icon name="bell" />
              {counts.notifications > 0 && <span className="absolute right-1 top-1 size-2 rounded-full bg-accent" />}
            </button>
            <Link href="/app/settings" className="rounded-md p-2 text-muted hover:bg-surface hover:text-fg lg:hidden" aria-label="Settings"><Icon name="settings" /></Link>
          </div>
        </header>

        {!profile.email_verified && (
          <div className="border-b border-line bg-warning-soft px-4 py-2 text-sm sm:px-6">
            Verify your email to unlock full connection limits and sharing links. Check your inbox for the verification link.
          </div>
        )}
        {profile.account_status !== 'active' && (
          <div className="border-b border-line bg-danger-soft px-4 py-2 text-sm sm:px-6">
            Your account is {profile.account_status.replace('_', ' ')}. Some features are unavailable. Contact support if you believe this is a mistake.
          </div>
        )}

        <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 lg:pb-12">{children}</main>
      </div>

      {/* Mobile browser bottom nav */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-line bg-bg pb-[env(safe-area-inset-bottom)] lg:hidden" aria-label="App mobile">
        {NAV.filter((n) => n.mobile).map((n) => (
          <Link key={n.href} href={n.href} aria-current={isActive(path, n.href) ? 'page' : undefined}
            className={cn('relative flex h-16 flex-col items-center justify-center gap-1 text-[11px]', (isActive(path, n.href) || (n.mobile === 'Connect' && isActive(path, '/app/connections'))) ? 'text-fg' : 'text-subtle')}>
            <Icon name={n.icon} />
            {n.mobile}
            {badge(n.href) > 0 && <span className="absolute right-[calc(50%-18px)] top-2 size-2 rounded-full bg-accent" />}
          </Link>
        ))}
      </nav>
    </div>
  );
}
