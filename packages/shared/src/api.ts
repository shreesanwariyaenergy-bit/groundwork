import type { SupabaseClient } from '@supabase/supabase-js';
import type { ReportReason, StartupStage, Availability, UserIntent, WorkMode } from './constants.ts';
import type { QuickInputs, ThinkReport } from './think.ts';
import type { DeepAnswers } from './deep.ts';
import type {
  ConnectionRequestRow, ConnectionRow, ConversationRow, Message, Notification, ProfileCard, RecommendationCard,
  SearchFilters, ThinkAnalysis, ThinkMessage, ThinkProject, ThinkStatus, Role, Industry, Skill, SkillCategory,
} from './types.ts';

/**
 * Thin typed client over the shared backend. Web and Android call exactly the
 * same RPCs/edge functions, so business rules live in one place (Postgres +
 * Edge Functions) and are enforced server-side.
 */
export class ApiError extends Error {
  code?: string;
  constructor(message: string, code?: string) {
    super(message);
    this.code = code;
  }
}

function unwrap<T>(res: { data: T | null; error: { message: string; code?: string } | null }): T {
  if (res.error) throw new ApiError(res.error.message, res.error.code);
  return res.data as T;
}

export const PAGE_SIZE = 20;

async function invokeFn<T>(sb: SupabaseClient, name: string, body: Record<string, unknown>, fallbackCode: string): Promise<T> {
  const { data, error } = await sb.functions.invoke(name, { body });
  if (error) {
    let code = fallbackCode;
    try {
      const ctx = (error as unknown as { context?: Response }).context;
      if (ctx && typeof ctx.json === 'function') code = ((await ctx.json()) as { error?: string }).error ?? code;
    } catch { /* ignore */ }
    throw new ApiError(code, code);
  }
  return data as T;
}

export function createApi(sb: SupabaseClient) {
  return {
    // ---------- taxonomy ----------
    async taxonomy(): Promise<{ roles: Role[]; industries: Industry[]; skills: Skill[]; categories: SkillCategory[] }> {
      const [roles, industries, skills, categories] = await Promise.all([
        sb.from('roles').select('*').order('sort_order'),
        sb.from('industries').select('*').order('sort_order'),
        sb.from('skills').select('id, slug, name, category').eq('is_active', true).order('name'),
        sb.from('skill_categories').select('*').order('sort_order'),
      ]);
      return { roles: unwrap(roles), industries: unwrap(industries), skills: unwrap(skills), categories: unwrap(categories) };
    },

    // ---------- discovery ----------
    async recommendations(page = 0, matchType?: string): Promise<RecommendationCard[]> {
      return unwrap(await sb.rpc('get_recommendations', { p_limit: PAGE_SIZE, p_offset: page * PAGE_SIZE, p_match_type: matchType ?? null }));
    },
    async refreshRecommendations(): Promise<number> {
      return unwrap(await sb.rpc('refresh_recommendations'));
    },
    async search(filters: SearchFilters, page = 0): Promise<ProfileCard[]> {
      const arr = <T>(v?: T[]) => (v && v.length ? v : null);
      return unwrap(
        await sb.rpc('search_profiles', {
          p_query: filters.query?.trim() || null,
          p_roles: arr(filters.roles),
          p_seeking: arr(filters.seeking),
          p_skills: arr(filters.skills),
          p_industries: arr(filters.industries),
          p_stages: arr<StartupStage>(filters.stages),
          p_availability: arr<Availability>(filters.availability),
          p_intents: arr<UserIntent>(filters.intents),
          p_work_modes: arr<WorkMode>(filters.workModes),
          p_country: filters.country || null,
          p_max_tz_diff: filters.maxTzDiff ?? null,
          p_min_experience: filters.minExperience ?? null,
          p_limit: PAGE_SIZE,
          p_offset: page * PAGE_SIZE,
        }),
      );
    },
    async dismiss(candidateId: string, kind: 'dismissed' | 'relevant' | 'not_relevant' = 'dismissed') {
      const { data: auth } = await sb.auth.getUser();
      unwrap(await sb.from('match_feedback').upsert({ user_id: auth.user!.id, candidate_id: candidateId, kind }));
    },
    async save(userId: string, saved: boolean) {
      const { data: auth } = await sb.auth.getUser();
      if (saved) unwrap(await sb.from('saved_profiles').upsert({ user_id: auth.user!.id, saved_user_id: userId }));
      else unwrap(await sb.from('saved_profiles').delete().eq('user_id', auth.user!.id).eq('saved_user_id', userId));
    },
    async savedProfiles() {
      return unwrap(
        await sb
          .from('saved_profiles')
          .select('created_at, note, profile:profiles!saved_profiles_saved_user_id_fkey(id, display_name, headline, avatar_path, primary_role, country_code)')
          .order('created_at', { ascending: false })
          .limit(200),
      ) as unknown as { created_at: string; note: string | null; profile: Pick<ProfileCard, 'id' | 'display_name' | 'headline' | 'avatar_path' | 'primary_role' | 'country_code'> | null }[];
    },

    // ---------- connections ----------
    async sendRequest(recipientId: string, message?: string): Promise<string> {
      return unwrap(await sb.rpc('send_connection_request', { p_recipient: recipientId, p_message: message?.trim() || null }));
    },
    async respondRequest(requestId: string, accept: boolean): Promise<string | null> {
      return unwrap(await sb.rpc('respond_connection_request', { p_request: requestId, p_accept: accept }));
    },
    async withdrawRequest(requestId: string) {
      unwrap(await sb.rpc('withdraw_connection_request', { p_request: requestId }));
    },
    async removeConnection(userId: string) {
      unwrap(await sb.rpc('remove_connection', { p_other: userId }));
    },
    async requests(direction: 'received' | 'sent'): Promise<ConnectionRequestRow[]> {
      return unwrap(await sb.rpc('get_connection_requests', { p_direction: direction }));
    },
    async connections(page = 0): Promise<ConnectionRow[]> {
      return unwrap(await sb.rpc('get_connections', { p_limit: 50, p_offset: page * 50 }));
    },
    /** Relationship between the current user and another profile. */
    async relationship(userId: string, me: string) {
      const [conn, reqs, saved, blocked] = await Promise.all([
        sb.from('connections').select('created_at').eq('user_a', me < userId ? me : userId).eq('user_b', me < userId ? userId : me).maybeSingle(),
        sb.from('connection_requests').select('id, sender_id, status').eq('status', 'pending')
          .or(`and(sender_id.eq.${me},recipient_id.eq.${userId}),and(sender_id.eq.${userId},recipient_id.eq.${me})`),
        sb.from('saved_profiles').select('saved_user_id').eq('user_id', me).eq('saved_user_id', userId).maybeSingle(),
        sb.from('blocked_users').select('blocked_id').eq('blocker_id', me).eq('blocked_id', userId).maybeSingle(),
      ]);
      const pending = (reqs.data ?? [])[0] as { id: string; sender_id: string } | undefined;
      return {
        connected: !!conn.data,
        pendingRequestId: pending?.id ?? null,
        pendingFromMe: pending ? pending.sender_id === me : false,
        saved: !!saved.data,
        blocked: !!blocked.data,
      };
    },

    // ---------- safety ----------
    async block(userId: string) { unwrap(await sb.rpc('block_user', { p_target: userId })); },
    async unblock(userId: string) { unwrap(await sb.rpc('unblock_user', { p_target: userId })); },
    async blockedUsers(): Promise<{ user_id: string; display_name: string; blocked_at: string }[]> {
      return unwrap(await sb.rpc('get_blocked_users'));
    },
    async report(userId: string, reason: ReportReason, details?: string | null, messageId?: string | null) {
      return unwrap(await sb.rpc('report_user', { p_target: userId, p_reason: reason, p_details: details ?? null, p_message: messageId ?? null }));
    },

    // ---------- messaging ----------
    async conversations(page = 0): Promise<ConversationRow[]> {
      return unwrap(await sb.rpc('get_conversations', { p_limit: 30, p_offset: page * 30 }));
    },
    async messages(conversationId: string, before?: string, limit = 40): Promise<Message[]> {
      let q = sb.from('messages').select('id, conversation_id, sender_id, body, created_at').eq('conversation_id', conversationId)
        .order('created_at', { ascending: false }).limit(limit);
      if (before) q = q.lt('created_at', before);
      const rows = unwrap(await q) as Message[];
      return rows.reverse();
    },
    async sendMessage(conversationId: string, senderId: string, body: string): Promise<Message> {
      return unwrap(
        await sb.from('messages').insert({ conversation_id: conversationId, sender_id: senderId, body: body.trim() })
          .select('id, conversation_id, sender_id, body, created_at').single(),
      ) as Message;
    },
    async markRead(conversationId: string) { unwrap(await sb.rpc('mark_conversation_read', { p_conversation: conversationId })); },
    async setMuted(conversationId: string, muted: boolean) {
      unwrap(await sb.rpc('set_conversation_muted', { p_conversation: conversationId, p_muted: muted }));
    },

    // ---------- notifications ----------
    async notifications(limit = 50): Promise<Notification[]> {
      return unwrap(await sb.from('notifications').select('*').order('created_at', { ascending: false }).limit(limit)) as Notification[];
    },
    async unreadNotificationCount(): Promise<number> {
      const res = await sb.from('notifications').select('id', { count: 'exact', head: true }).is('read_at', null);
      if (res.error) throw new ApiError(res.error.message);
      return res.count ?? 0;
    },
    async markNotificationsRead(ids?: string[]) { unwrap(await sb.rpc('mark_notifications_read', { p_ids: ids ?? null })); },
    async registerDevice(token: string, platform: 'android' | 'ios' | 'web') {
      unwrap(await sb.rpc('register_device_token', { p_token: token, p_platform: platform }));
    },
    async unregisterDevice(token: string) { unwrap(await sb.rpc('unregister_device_token', { p_token: token })); },

    // ---------- think ----------
    async thinkStatus(): Promise<ThinkStatus> { return unwrap(await sb.rpc('think_status')) as ThinkStatus; },
    async thinkProjects(): Promise<ThinkProject[]> {
      return unwrap(await sb.from('think_projects').select('*').eq('archived', false).order('updated_at', { ascending: false }).limit(100)) as ThinkProject[];
    },
    async thinkProject(id: string): Promise<ThinkProject | null> {
      return unwrap(await sb.from('think_projects').select('*').eq('id', id).maybeSingle()) as ThinkProject | null;
    },
    async analyses(projectId: string): Promise<ThinkAnalysis[]> {
      return unwrap(await sb.from('think_analyses').select('*').eq('project_id', projectId).order('created_at', { ascending: false }).limit(60)) as ThinkAnalysis[];
    },
    async thinkMessages(projectId: string): Promise<ThinkMessage[]> {
      return unwrap(await sb.from('think_messages').select('*').eq('project_id', projectId).order('created_at').limit(200)) as ThinkMessage[];
    },
    /** Runs on the server (Edge Function `think`). mode=checklist never calls an AI provider. */
    async runThink(action: 'analyze' | 'followup' | 'checklist' | 'assess', projectId: string, question?: string) {
      const { data, error } = await sb.functions.invoke('think', { body: { action, project_id: projectId, question } });
      if (error) {
        let code = 'ai_unavailable';
        try {
          const ctx = (error as unknown as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') code = ((await ctx.json()) as { error?: string }).error ?? code;
        } catch { /* ignore */ }
        throw new ApiError(code, code);
      }
      return data as { analysis?: ThinkAnalysis; message?: ThinkMessage; fallback?: boolean; error_code?: string | null };
    },
    /** Paid Deep Analysis: start (consumes one access entitlement server-side) and advance one stage per call. */
    async deepStart(projectId: string, answers: DeepAnswers): Promise<string> {
      const res = await invokeFn<{ analysis_id: string }>(sb, 'think-deep', { action: 'start', project_id: projectId, answers: answers as unknown as Record<string, unknown> }, 'ai_unavailable');
      return res.analysis_id;
    },
    async deepStep(analysisId: string): Promise<{ status: 'running' | 'completed' | 'failed'; stage: string | null; busy?: boolean; error?: string; retryable?: boolean }> {
      const { data, error } = await sb.functions.invoke('think-deep', { body: { action: 'step', analysis_id: analysisId } });
      if (!error) return data;
      // 502 carries a useful body (retryable stage error or final failure).
      try {
        const ctx = (error as unknown as { context?: Response }).context;
        if (ctx && typeof ctx.json === 'function') return await ctx.json();
      } catch { /* ignore */ }
      throw new ApiError('ai_unavailable', 'ai_unavailable');
    },
    async deepEntitlements(): Promise<{ id: string; status: string; source: string; created_at: string; consumed_at: string | null }[]> {
      return unwrap(await sb.from('think_deep_entitlements').select('id, status, source, created_at, consumed_at').order('created_at', { ascending: false }).limit(50)) as { id: string; status: string; source: string; created_at: string; consumed_at: string | null }[];
    },
    /** Anonymous Quick Validate (public site). Returns the report and a one-time claim token. */
    async quickValidate(inputs: QuickInputs): Promise<{ token: string | null; report: ThinkReport; expires_at: string | null; mode: 'ai' | 'checklist' }> {
      const { data, error } = await sb.functions.invoke('think-quick', { body: inputs });
      if (error) {
        let code = 'quick_unavailable';
        try {
          const ctx = (error as unknown as { context?: Response }).context;
          if (ctx && typeof ctx.json === 'function') code = ((await ctx.json()) as { error?: string }).error ?? code;
        } catch { /* ignore */ }
        throw new ApiError(code, code);
      }
      return data as { token: string | null; report: ThinkReport; expires_at: string | null; mode: 'ai' | 'checklist' };
    },
    /** Attach an anonymous Quick Validate report to the signed-in user; returns the new Think project id. */
    async claimQuickReport(token: string): Promise<string> {
      return unwrap(await sb.rpc('claim_quick_report', { p_token: token })) as string;
    },
    async acknowledgeAiDisclosure() {
      const { data: auth } = await sb.auth.getUser();
      unwrap(await sb.from('profile_preferences').update({ ai_processing_acknowledged_at: new Date().toISOString() }).eq('user_id', auth.user!.id));
    },
    async shareThinkProject(projectId: string, userId: string) {
      const { data: auth } = await sb.auth.getUser();
      unwrap(await sb.from('think_project_shares').insert({ project_id: projectId, shared_with: userId, shared_by: auth.user!.id }));
    },
    async unshareThinkProject(projectId: string, userId: string) {
      unwrap(await sb.from('think_project_shares').delete().eq('project_id', projectId).eq('shared_with', userId));
    },

    // ---------- account ----------
    async touch(platform: 'web' | 'android' | 'ios') { await sb.rpc('touch_activity', { p_platform: platform }); },
    async exportData(): Promise<unknown> { return unwrap(await sb.rpc('export_my_data')); },
    async inviteCode(): Promise<string> { return unwrap(await sb.rpc('get_my_invite_code')) as string; },
    async deleteAccount(): Promise<void> {
      const { error } = await sb.functions.invoke('delete-account', { body: { confirm: 'DELETE' } });
      if (error) throw new ApiError('delete_failed');
    },
    async track(name: string, properties: Record<string, unknown> = {}, platform: 'web' | 'android' | 'ios' = 'web') {
      const { data: auth } = await sb.auth.getUser();
      if (!auth.user) return;
      await sb.from('analytics_events').insert({ user_id: auth.user.id, name, properties, platform });
    },
    async publicFlags(): Promise<Record<string, { enabled: boolean; value: Record<string, unknown> }>> {
      const rows = unwrap(await sb.from('feature_flags').select('key, enabled, value').eq('is_public', true)) as { key: string; enabled: boolean; value: Record<string, unknown> }[];
      return Object.fromEntries(rows.map((r) => [r.key, { enabled: r.enabled, value: r.value }]));
    },
  };
}

export type Api = ReturnType<typeof createApi>;

export function avatarUrl(supabaseUrl: string, path: string | null | undefined): string | null {
  if (!path) return null;
  return `${supabaseUrl.replace(/\/$/, '')}/storage/v1/object/public/avatars/${path}`;
}
