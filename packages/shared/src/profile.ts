import type { Profile, StartupProject } from './types.ts';

export interface CompletionInput {
  profile: Pick<Profile, 'display_name' | 'headline' | 'bio' | 'avatar_path' | 'country_code' | 'timezone' | 'primary_role' |
    'intents' | 'seeking_roles' | 'availability' | 'years_experience' | 'industries'>;
  skillCount: number;
  linkCount: number;
  experienceCount: number;
  startup?: Pick<StartupProject, 'summary'> | null;
}

export interface CompletionItem { key: string; label: string; done: boolean; weight: number }

/**
 * Profile completeness based on information that makes matching useful.
 * It measures completeness only — never quality or trust.
 */
export function profileCompletion(input: CompletionInput): { percent: number; items: CompletionItem[] } {
  const p = input.profile;
  const isFounder = p.intents.includes('founder');
  const items: CompletionItem[] = [
    { key: 'name', label: 'Add your name', done: p.display_name.trim().length >= 2, weight: 1 },
    { key: 'headline', label: 'Write a headline', done: p.headline.trim().length >= 3, weight: 1 },
    { key: 'intents', label: 'Choose what describes you', done: p.intents.length > 0, weight: 1 },
    { key: 'role', label: 'Choose your main role', done: !!p.primary_role, weight: 1 },
    { key: 'skills', label: 'Add at least 3 skills', done: input.skillCount >= 3, weight: 2 },
    { key: 'seeking', label: 'Say who you are looking for', done: p.seeking_roles.length > 0, weight: 2 },
    { key: 'bio', label: 'Write a short introduction (80+ characters)', done: p.bio.trim().length >= 80, weight: 1 },
    { key: 'location', label: 'Add your country and timezone', done: !!p.country_code && !!p.timezone, weight: 1 },
    { key: 'availability', label: 'Set your availability', done: !!p.availability, weight: 1 },
    { key: 'industries', label: 'Pick industries you care about', done: p.industries.length > 0, weight: 1 },
    { key: 'experience', label: 'Add experience', done: input.experienceCount > 0 || (p.years_experience ?? 0) > 0, weight: 1 },
    { key: 'links', label: 'Add a professional link', done: input.linkCount > 0, weight: 1 },
    { key: 'photo', label: 'Add a profile photo', done: !!p.avatar_path, weight: 0.5 },
  ];
  if (isFounder) {
    items.push({ key: 'startup', label: 'Describe what you are building', done: (input.startup?.summary ?? '').trim().length >= 10, weight: 2 });
  }
  const total = items.reduce((s, i) => s + i.weight, 0);
  const done = items.filter((i) => i.done).reduce((s, i) => s + i.weight, 0);
  return { percent: Math.round((done / total) * 100), items };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  return ((parts[0]![0] ?? '') + (parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : '')).toUpperCase();
}

export function relativeTime(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return '';
  const diff = Math.max(0, now - new Date(iso).getTime());
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  const d = Math.floor(h / 24);
  if (d < 7) return `${d}d`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
