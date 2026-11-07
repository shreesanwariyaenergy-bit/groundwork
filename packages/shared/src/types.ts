import type {
  AccountStatus, Availability, ConnectionStatus, LinkKind, MatchType, ProfileVisibility, ProjectVisibility,
  StartupStage, UserIntent, WorkMode,
} from './constants.ts';
import type { ThinkContext, ThinkReport } from './think.ts';

/**
 * Hand-maintained row types for the tables and RPCs the apps use.
 * Regenerate full types with `supabase gen types typescript` once the
 * project exists and compare against these.
 */
export interface Profile {
  id: string;
  display_name: string;
  headline: string;
  bio: string;
  avatar_path: string | null;
  country_code: string | null;
  city: string | null;
  timezone: string | null;
  years_experience: number | null;
  intents: UserIntent[];
  primary_role: string | null;
  seeking_roles: string[];
  industries: string[];
  preferred_stages: StartupStage[];
  availability: Availability | null;
  work_mode: WorkMode | null;
  commitment_note: string | null;
  visibility: ProfileVisibility;
  onboarding_completed: boolean;
  is_adult_confirmed: boolean;
  email_verified: boolean;
  account_status: AccountStatus;
  last_active_at: string;
  created_at: string;
  updated_at: string;
}

export interface FounderProfile {
  user_id: string;
  looking_for_cofounder: boolean;
  cofounder_requirements: string | null;
  commitment_expectation: Availability | null;
  previous_ventures: string | null;
}

export interface ProfessionalProfile {
  user_id: string;
  expertise_summary: string | null;
  open_to: string[];
}

export interface StartupProject {
  id: string;
  owner_id: string;
  name: string | null;
  summary: string;
  problem: string | null;
  target_customer: string | null;
  industry: string | null;
  stage: StartupStage;
  team_size: number;
  commitment_expectation: Availability | null;
  work_mode: WorkMode | null;
  visibility: ProjectVisibility;
  is_primary: boolean;
  created_at: string;
  updated_at: string;
}

export interface Skill { id: number; slug: string; name: string; category: string }
export interface Role { slug: string; name: string; categories: string[]; is_cofounder_role: boolean; sort_order: number }
export interface Industry { slug: string; name: string; sort_order: number }
export interface SkillCategory { slug: string; name: string; sort_order: number }

export interface UserSkill { user_id: string; skill_id: number; level: number; skills?: Skill }
export interface Experience {
  id: string; user_id: string; title: string; organization: string | null;
  start_date: string | null; end_date: string | null; description: string | null;
}
export interface ProfileLink { id: string; user_id: string; kind: LinkKind; url: string; label: string | null }

export interface Preferences {
  user_id: string;
  push_connection_requests: boolean;
  push_messages: boolean;
  push_recommendations: boolean;
  push_think: boolean;
  email_connection_requests: boolean;
  email_messages: boolean;
  email_account: boolean;
  email_product_updates: boolean;
  ai_processing_acknowledged_at: string | null;
}

export interface ProfileCard {
  id: string;
  display_name: string;
  headline: string;
  avatar_path: string | null;
  country_code: string | null;
  city: string | null;
  timezone: string | null;
  primary_role: string | null;
  availability: Availability | null;
  intents: UserIntent[];
  years_experience: number | null;
  skills: string[];
  is_saved: boolean;
}

export interface RecommendationCard extends ProfileCard {
  match_type: MatchType;
  reasons: string[];
  is_new: boolean;
}

export interface ConnectionRequestRow {
  request_id: string;
  status: ConnectionStatus;
  message: string | null;
  created_at: string;
  user_id: string;
  display_name: string;
  headline: string;
  avatar_path: string | null;
  primary_role: string | null;
  country_code: string | null;
}

export interface ConnectionRow {
  user_id: string;
  display_name: string;
  headline: string;
  avatar_path: string | null;
  primary_role: string | null;
  country_code: string | null;
  connected_at: string;
  conversation_id: string | null;
}

export interface ConversationRow {
  conversation_id: string;
  peer_id: string;
  peer_name: string;
  peer_headline: string;
  peer_avatar: string | null;
  last_message: string | null;
  last_message_at: string | null;
  last_sender_id: string | null;
  unread_count: number;
  can_send: boolean;
  muted: boolean;
}

export interface Message {
  id: string;
  conversation_id: string;
  sender_id: string;
  body: string;
  created_at: string;
}

export interface Notification {
  id: string;
  user_id: string;
  type: 'connection_request' | 'connection_accepted' | 'message' | 'recommendation' | 'think_report' | 'account';
  title: string;
  body: string | null;
  data: { path?: string; conversation_id?: string; user_id?: string; request_id?: string; project_id?: string };
  read_at: string | null;
  created_at: string;
}

export interface ThinkProject {
  id: string;
  owner_id: string;
  title: string;
  idea: string;
  context: ThinkContext;
  startup_project_id: string | null;
  source: 'workspace' | 'quick_validate';
  archived: boolean;
  created_at: string;
  updated_at: string;
}

export interface ThinkAnalysis {
  id: string;
  project_id: string;
  owner_id: string;
  status: 'running' | 'completed' | 'failed';
  mode: 'ai' | 'checklist';
  report_kind: 'full' | 'quick' | 'assessment' | 'deep';
  /** Staged Deep Analysis progress (stage, failures, last_error). */
  progress: { stage?: string; failures?: number; last_error?: string | null } | null;
  input_snapshot?: Record<string, unknown>;
  provider: string | null;
  model: string | null;
  report: ThinkReport | null;
  error_code: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface ThinkMessage {
  id: string;
  project_id: string;
  analysis_id: string | null;
  owner_id: string;
  role: 'user' | 'assistant';
  content: string;
  created_at: string;
}

export interface ThinkStatus {
  ai_available: boolean;
  provider_label: string | null;
  analyses_used_today: number;
  analyses_per_day: number;
  followups_used_today: number;
  followups_per_day: number;
  disclosure_acknowledged: boolean;
  // phase 2 (absent on older backends)
  assessments_used_today?: number;
  assessments_per_day?: number;
  provider_is_free?: boolean;
  deep?: {
    enabled: boolean;
    payments_enabled: boolean;
    price_label: string | null;
    entitlements_available: number;
    research_enabled: boolean;
  };
}

export interface SearchFilters {
  query?: string;
  roles?: string[];
  seeking?: string[];
  skills?: string[];
  industries?: string[];
  stages?: StartupStage[];
  availability?: Availability[];
  intents?: UserIntent[];
  workModes?: WorkMode[];
  country?: string;
  maxTzDiff?: number;
  minExperience?: number;
}
