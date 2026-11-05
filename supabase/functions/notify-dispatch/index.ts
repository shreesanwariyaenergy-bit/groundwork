/**
 * Delivers push + email for new rows in public.notifications.
 *
 * Wire it up with a Supabase Database Webhook:
 *   table public.notifications, event INSERT, POST to this function,
 *   header  x-webhook-secret: <NOTIFY_WEBHOOK_SECRET>
 * Deploy with verify_jwt = false (the shared secret authenticates the caller).
 *
 * Push: Expo Push API (Android delivery goes through FCM credentials uploaded to EAS).
 * Email: Resend, only when RESEND_API_KEY + EMAIL_FROM are set and the user opted in.
 * Emails never contain message bodies — only a title and a link back to the app.
 */
import { admin } from '../_shared/clients.ts';

const SECRET = Deno.env.get('NOTIFY_WEBHOOK_SECRET') ?? '';
const RESEND_API_KEY = Deno.env.get('RESEND_API_KEY') ?? '';
const EMAIL_FROM = Deno.env.get('EMAIL_FROM') ?? '';
const APP_URL = (Deno.env.get('APP_URL') ?? '').replace(/\/$/, '');
const EXPO_ACCESS_TOKEN = Deno.env.get('EXPO_ACCESS_TOKEN') ?? '';

interface NotificationRow {
  id: string; user_id: string; type: string; title: string; body: string | null; data: Record<string, unknown>;
}

const PUSH_PREF: Record<string, string | null> = {
  connection_request: 'push_connection_requests',
  connection_accepted: 'push_connection_requests',
  message: 'push_messages',
  recommendation: 'push_recommendations',
  think_report: 'push_think',
  account: null, // always delivered
};
const EMAIL_PREF: Record<string, string | null> = {
  connection_request: 'email_connection_requests',
  connection_accepted: 'email_connection_requests',
  message: 'email_messages',
  account: 'email_account',
};

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function sendPush(n: NotificationRow) {
  const { data: tokens } = await admin.from('device_tokens').select('token').eq('user_id', n.user_id);
  const list = (tokens ?? []).map((t) => t.token as string).filter((t) => t.startsWith('ExponentPushToken[') || t.startsWith('ExpoPushToken['));
  if (!list.length) return;
  const messages = list.map((to) => ({
    to,
    title: n.title,
    // message previews only; full content is fetched in-app after auth
    body: n.type === 'message' ? 'You have a new message' : (n.body ?? undefined),
    data: { path: n.data?.path ?? '/', notification_id: n.id },
    sound: 'default',
    channelId: 'default',
    priority: 'high',
  }));
  const res = await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${EXPO_ACCESS_TOKEN}` } : {}),
    },
    body: JSON.stringify(messages),
  });
  if (!res.ok) {
    console.error(JSON.stringify({ fn: 'notify-dispatch', code: 'expo_push_http_' + res.status }));
    return;
  }
  const out = (await res.json()) as { data?: { status: string; details?: { error?: string } }[] };
  const dead = (out.data ?? []).map((t, i) => (t.status === 'error' && t.details?.error === 'DeviceNotRegistered' ? list[i] : null)).filter(Boolean) as string[];
  if (dead.length) await admin.from('device_tokens').delete().in('token', dead);
}

async function sendEmail(n: NotificationRow) {
  if (!RESEND_API_KEY || !EMAIL_FROM || !APP_URL) return;
  const { data: u } = await admin.auth.admin.getUserById(n.user_id);
  const to = u?.user?.email;
  if (!to || !u?.user?.email_confirmed_at) return;
  const link = `${APP_URL}${typeof n.data?.path === 'string' ? n.data.path : '/home'}`;
  const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
  const html = `<div style="font-family:Inter,Arial,sans-serif;font-size:15px;color:#111">
    <p>${esc(n.title)}</p>
    <p><a href="${esc(link)}" style="color:#0F6E4F">Open Groundwork</a></p>
    <p style="color:#5C5C58;font-size:13px">You can change email preferences in Settings → Notifications.</p></div>`;
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: EMAIL_FROM, to, subject: n.title, html, text: `${n.title}\n\n${link}` }),
  });
  if (!res.ok) console.error(JSON.stringify({ fn: 'notify-dispatch', code: 'email_http_' + res.status }));
}

Deno.serve(async (req) => {
  if (req.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  if (!timingSafeEqual(req.headers.get('x-webhook-secret') ?? '', SECRET)) return new Response('forbidden', { status: 403 });

  let payload: { type?: string; table?: string; record?: NotificationRow };
  try { payload = await req.json(); } catch { return new Response('bad_request', { status: 400 }); }
  if (payload.type !== 'INSERT' || payload.table !== 'notifications' || !payload.record) return new Response('ignored');
  const n = payload.record;

  const { data: prefs } = await admin.from('profile_preferences').select('*').eq('user_id', n.user_id).maybeSingle();
  if (!prefs) return new Response('no_user');
  const { data: profile } = await admin.from('profiles').select('account_status').eq('id', n.user_id).maybeSingle();
  if (!profile || profile.account_status === 'suspended') return new Response('skipped');

  const pushKey = PUSH_PREF[n.type];
  const emailKey = EMAIL_PREF[n.type];
  const tasks: Promise<void>[] = [];
  if (pushKey === null || (pushKey && (prefs as Record<string, unknown>)[pushKey] === true)) tasks.push(sendPush(n));
  if (emailKey && (prefs as Record<string, unknown>)[emailKey] === true) tasks.push(sendEmail(n));
  await Promise.allSettled(tasks);
  return new Response('ok');
});
