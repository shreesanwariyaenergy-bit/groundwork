import Constants from 'expo-constants';

const extra = (Constants.expoConfig?.extra ?? {}) as Record<string, string | undefined>;

/** Public config only. Service-role and AI keys never ship in the app. */
export const SUPABASE_URL = process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '';
export const SUPABASE_KEY = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY || extra.supabasePublishableKey || '';
export const SITE_URL = (process.env.EXPO_PUBLIC_SITE_URL || extra.siteUrl || '').replace(/\/$/, '');
export const isConfigured = Boolean(SUPABASE_URL && SUPABASE_KEY);
