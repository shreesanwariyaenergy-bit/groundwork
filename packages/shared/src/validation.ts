import { z } from 'zod';
import { THINK_LIMITS } from './think.ts';

const trimmed = (max: number) => z.string().trim().max(max);
const optionalText = (max: number) => z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : null));

export const httpsUrl = z
  .string()
  .trim()
  .max(500)
  .refine((v) => /^https:\/\/[^\s]{3,}$/i.test(v), 'Use a full https:// link');

export const email = z.string().trim().toLowerCase().email('Enter a valid email').max(254);

export const password = z
  .string()
  .min(10, 'Use at least 10 characters')
  .max(128)
  .refine((v) => /[a-zA-Z]/.test(v) && /[0-9]/.test(v), 'Include letters and numbers');

export const signUpSchema = z.object({
  fullName: trimmed(80).min(2, 'Enter your name'),
  email,
  password,
  isAdult: z.literal(true, { message: 'You must be 18 or older to join' }),
  acceptTerms: z.literal(true, { message: 'Please accept the Terms and Privacy Policy' }),
});
export type SignUpInput = z.infer<typeof signUpSchema>;

export const signInSchema = z.object({ email, password: z.string().min(1, 'Enter your password') });

export const intentsSchema = z
  .array(z.enum(['founder', 'cofounder_seeker', 'professional', 'startup_collaborator']))
  .min(1, 'Choose at least one');

export const profileBasicsSchema = z.object({
  display_name: trimmed(80).min(2, 'Enter your name'),
  headline: trimmed(140).min(3, 'Add a short headline'),
  bio: trimmed(2000),
  country_code: z.string().regex(/^[A-Z]{2}$/).nullable(),
  city: optionalText(80),
  timezone: z.string().max(64).nullable(),
  years_experience: z.number().int().min(0).max(60).nullable(),
  primary_role: z.string().nullable(),
  availability: z.enum(['full_time', 'part_time', 'weekends', 'advisory', 'exploring']).nullable(),
  work_mode: z.enum(['remote', 'hybrid', 'in_person', 'flexible']).nullable(),
  commitment_note: optionalText(300),
});
export type ProfileBasicsInput = z.infer<typeof profileBasicsSchema>;

export const lookingForSchema = z.object({
  seeking_roles: z.array(z.string()).max(8),
  industries: z.array(z.string()).max(8),
  preferred_stages: z.array(z.enum(['idea', 'validation', 'mvp', 'launched', 'growth'])).max(5),
});

export const startupSchema = z.object({
  name: optionalText(100),
  summary: trimmed(1000).min(10, 'Describe the idea in a sentence or two'),
  problem: optionalText(1000),
  target_customer: optionalText(500),
  industry: z.string().nullable(),
  stage: z.enum(['idea', 'validation', 'mvp', 'launched', 'growth']),
  team_size: z.number().int().min(1).max(500),
  commitment_expectation: z.enum(['full_time', 'part_time', 'weekends', 'advisory', 'exploring']).nullable(),
  work_mode: z.enum(['remote', 'hybrid', 'in_person', 'flexible']).nullable(),
  visibility: z.enum(['private', 'connections', 'members']),
});
export type StartupInput = z.infer<typeof startupSchema>;

export const linkSchema = z.object({
  kind: z.enum(['linkedin', 'github', 'website', 'portfolio', 'project', 'other']),
  url: httpsUrl,
  label: optionalText(60),
});

export const experienceSchema = z.object({
  title: trimmed(120).min(1, 'Add a title'),
  organization: optionalText(120),
  start_date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable(),
  end_date: z.string().regex(/^\d{4}-\d{2}(-\d{2})?$/).nullable(),
  description: optionalText(1000),
});

export const connectionMessageSchema = z
  .string()
  .trim()
  .max(300, 'Keep it under 300 characters')
  .refine((v) => !/(https?:\/\/|www\.)/i.test(v), 'Links are not allowed in requests');

export const messageSchema = z.string().trim().min(1).max(4000);

export const thinkProjectSchema = z.object({
  title: trimmed(120).min(1, 'Give the project a name'),
  idea: trimmed(THINK_LIMITS.ideaMaxChars).min(30, 'Describe the idea in at least a few sentences (30+ characters)'),
  context: z.record(z.string(), z.string().trim().max(THINK_LIMITS.contextFieldMaxChars)).default({}),
});
export type ThinkProjectInput = z.infer<typeof thinkProjectSchema>;

export const followupSchema = z.string().trim().min(3).max(THINK_LIMITS.followupMaxChars);

export const reportSchema = z.object({
  reason: z.enum(['spam', 'harassment', 'fake_profile', 'inappropriate', 'scam', 'other']),
  details: optionalText(1000),
});

/** Return the first error message from a zod result, for simple form UIs. */
export function firstError(result: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }): string | null {
  if (result.success || !result.error) return null;
  return result.error.issues[0]?.message ?? 'Invalid input';
}

export function fieldErrors(result: { success: boolean; error?: { issues: { message: string; path: PropertyKey[] }[] } }): Record<string, string> {
  const out: Record<string, string> = {};
  if (result.success || !result.error) return out;
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '_');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
