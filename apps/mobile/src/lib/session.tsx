import type { Session } from '@supabase/supabase-js';
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { Industry, Profile, Role, Skill, SkillCategory } from '@groundwork/shared';
import { avatarUrl } from '@groundwork/shared';
import { api, supabase } from './supabase';
import { SUPABASE_URL } from './config';

interface Taxonomy { roles: Role[]; industries: Industry[]; skills: Skill[]; categories: SkillCategory[] }
interface SessionCtx {
  ready: boolean;
  session: Session | null;
  profile: Profile | null;
  taxonomy: Taxonomy | null;
  refreshProfile: () => Promise<void>;
  avatar: (p: string | null | undefined) => string | null;
  roleName: (s: string | null | undefined) => string;
  industryName: (s: string | null | undefined) => string;
}

const Ctx = createContext<SessionCtx | null>(null);

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [taxonomy, setTaxonomy] = useState<Taxonomy | null>(null);

  const loadProfile = useCallback(async (uid: string | undefined) => {
    if (!uid) { setProfile(null); return; }
    const { data } = await supabase.from('profiles').select('*').eq('id', uid).maybeSingle();
    setProfile((data as Profile | null) ?? null);
  }, []);

  useEffect(() => {
    let alive = true;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!alive) return;
      setSession(data.session);
      await loadProfile(data.session?.user.id).catch(() => {});
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => {
      setSession(s);
      loadProfile(s?.user.id).catch(() => {});
    });
    return () => { alive = false; sub.subscription.unsubscribe(); };
  }, [loadProfile]);

  useEffect(() => {
    if (!session) return;
    api.taxonomy().then(setTaxonomy).catch(() => {});
    api.touch('android').catch(() => {});
  }, [session]);

  const value = useMemo<SessionCtx>(() => ({
    ready, session, profile, taxonomy,
    refreshProfile: () => loadProfile(session?.user.id),
    avatar: (p) => avatarUrl(SUPABASE_URL, p),
    roleName: (s) => (s ? taxonomy?.roles.find((r) => r.slug === s)?.name ?? s.replace(/_/g, ' ') : ''),
    industryName: (s) => (s ? taxonomy?.industries.find((r) => r.slug === s)?.name ?? s : ''),
  }), [ready, session, profile, taxonomy, loadProfile]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSession() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSession outside SessionProvider');
  return v;
}

/** Async data with loading / error / reload / pull-to-refresh support. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[]) {
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(deps) + ':' + tick;
  const [state, setState] = useState<{ key: string | null; data: T | null; error: unknown }>({ key: null, data: null, error: null });
  const [refreshing, setRefreshing] = useState(false);
  useEffect(() => {
    let alive = true;
    fn().then((data) => alive && setState({ key, data, error: null }))
      .catch((error) => alive && setState((s) => ({ key, data: s.data, error })))
      .finally(() => alive && setRefreshing(false));
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return {
    data: state.data,
    error: state.key === key ? state.error : null,
    loading: state.key !== key && state.data === null,
    refreshing,
    reload: () => setTick((t) => t + 1),
    refresh: () => { setRefreshing(true); setTick((t) => t + 1); },
    setData: (d: T) => setState((s) => ({ ...s, data: d })),
  };
}
