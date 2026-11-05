/** Working product name. Change here (and in app.json / Play listing) once the brand is approved. */
export const BRAND = {
  name: 'Groundwork',
  tagline: 'Find your people. Validate your idea. Build what matters.',
  supportEmail: 'support@groundwork.example', // TODO: replace with the real support address before launch
} as const;

export type UserIntent = 'founder' | 'cofounder_seeker' | 'professional' | 'startup_collaborator';
export type StartupStage = 'idea' | 'validation' | 'mvp' | 'launched' | 'growth';
export type Availability = 'full_time' | 'part_time' | 'weekends' | 'advisory' | 'exploring';
export type WorkMode = 'remote' | 'hybrid' | 'in_person' | 'flexible';
export type ProfileVisibility = 'members' | 'connections' | 'hidden';
export type ProjectVisibility = 'private' | 'connections' | 'members';
export type AccountStatus = 'active' | 'restricted' | 'suspended' | 'pending_deletion';
export type ConnectionStatus = 'pending' | 'accepted' | 'rejected' | 'withdrawn' | 'cancelled';
export type ReportReason = 'spam' | 'harassment' | 'fake_profile' | 'inappropriate' | 'scam' | 'other';
export type MatchType = 'cofounder' | 'professional' | 'collaborator';
export type LinkKind = 'linkedin' | 'github' | 'website' | 'portfolio' | 'project' | 'other';

export const INTENTS: { value: UserIntent; label: string; description: string }[] = [
  { value: 'founder', label: 'Founder', description: 'I am building or validating a startup.' },
  { value: 'cofounder_seeker', label: 'Looking for a co-founder role', description: 'I want to join a startup as a co-founder.' },
  { value: 'professional', label: 'Professional / builder', description: 'I bring skills such as engineering, design, product or growth.' },
  { value: 'startup_collaborator', label: 'Open to collaborating with startups', description: 'Part-time, advisory or contract work with early teams.' },
];

export const STAGES: { value: StartupStage; label: string }[] = [
  { value: 'idea', label: 'Idea' },
  { value: 'validation', label: 'Validating' },
  { value: 'mvp', label: 'Building MVP' },
  { value: 'launched', label: 'Launched' },
  { value: 'growth', label: 'Growing' },
];

export const AVAILABILITY: { value: Availability; label: string }[] = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'weekends', label: 'Evenings & weekends' },
  { value: 'advisory', label: 'Advisory' },
  { value: 'exploring', label: 'Exploring' },
];

export const WORK_MODES: { value: WorkMode; label: string }[] = [
  { value: 'remote', label: 'Remote' },
  { value: 'hybrid', label: 'Hybrid' },
  { value: 'in_person', label: 'In person' },
  { value: 'flexible', label: 'Flexible' },
];

export const VISIBILITY: { value: ProfileVisibility; label: string; description: string }[] = [
  { value: 'members', label: 'Discoverable', description: 'Signed-in members can find and view your profile.' },
  { value: 'connections', label: 'Connections only', description: 'Hidden from search and recommendations. Only connections can view it.' },
  { value: 'hidden', label: 'Paused', description: 'Hidden everywhere and you will not receive new requests.' },
];

export const PROJECT_VISIBILITY: { value: ProjectVisibility; label: string }[] = [
  { value: 'members', label: 'Visible on my profile' },
  { value: 'connections', label: 'Connections only' },
  { value: 'private', label: 'Only me' },
];

export const OPEN_TO: { value: string; label: string }[] = [
  { value: 'cofounder', label: 'Co-founder' },
  { value: 'advisory', label: 'Advisory' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
  { value: 'full_time', label: 'Full-time role' },
];

export const REPORT_REASONS: { value: ReportReason; label: string }[] = [
  { value: 'spam', label: 'Spam or unsolicited promotion' },
  { value: 'harassment', label: 'Harassment or abuse' },
  { value: 'fake_profile', label: 'Fake or impersonating profile' },
  { value: 'scam', label: 'Scam or fraud' },
  { value: 'inappropriate', label: 'Inappropriate content' },
  { value: 'other', label: 'Something else' },
];

export const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  cofounder: 'Potential co-founder',
  professional: 'Professional collaborator',
  collaborator: 'Founder you could help',
};

/** Human-readable explanations for match reasons returned by get_recommendations(). */
export const MATCH_REASON_LABELS: Record<string, string> = {
  complementary_skills: 'Your skills complement each other',
  role_fit: 'Has the role you are looking for',
  seeking_your_expertise: 'Is looking for your expertise',
  shared_industry: 'Interested in the same industry',
  stage_fit: 'Wants to work at your startup stage',
  availability_fit: 'Compatible availability',
  timezone_fit: 'Similar timezone',
  same_country: 'Based in the same country',
};

export const LINK_KINDS: { value: LinkKind; label: string }[] = [
  { value: 'linkedin', label: 'LinkedIn' },
  { value: 'github', label: 'GitHub' },
  { value: 'website', label: 'Website' },
  { value: 'portfolio', label: 'Portfolio' },
  { value: 'project', label: 'Project' },
  { value: 'other', label: 'Other' },
];




export const ERROR_MESSAGES: Record<string, string> = {
  rate_limited: 'You are doing that too often. Please wait a little and try again.',
  request_already_pending: 'There is already a pending request between you.',
  already_connected: 'You are already connected.',
  recipient_unavailable: 'This person is not accepting requests right now.',
  request_cooldown: 'You recently sent a request to this person. Please wait before trying again.',
  links_not_allowed_in_requests: 'Links are not allowed in connection requests.',
  complete_onboarding_first: 'Complete your profile before sending requests.',
  account_not_active: 'Your account is restricted. Contact support if you think this is a mistake.',
  onboarding_incomplete: 'Please add your name, a headline, what describes you, and confirm you are 18 or older.',
  verify_email_to_send_links: 'Verify your email address to send links.',
  invalid_timezone: 'Please choose a valid timezone.',
  too_many_skills: 'You can add up to 25 skills.',
  not_authenticated: 'Please sign in again.',
  forbidden: 'You do not have permission to do that.',
  quota_exceeded: 'You have reached today’s Think limit. It resets at midnight UTC.',
  ai_unavailable: 'AI analysis is unavailable right now. You can use the basic checklist instead.',
  ai_disclosure_required: 'Please review how Think processes your idea before continuing.',
};

export function friendlyError(err: unknown): string {
  const raw = err instanceof Error ? err.message : typeof err === 'object' && err && 'message' in err ? String((err as { message: unknown }).message) : String(err ?? '');
  for (const key of Object.keys(ERROR_MESSAGES)) if (raw.includes(key)) return ERROR_MESSAGES[key]!;
  if (/network|fetch failed|Failed to fetch/i.test(raw)) return 'Network problem. Check your connection and try again.';
  return 'Something went wrong. Please try again.';
}
