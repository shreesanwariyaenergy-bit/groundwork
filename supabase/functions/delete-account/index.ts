/**
 * Account deletion.
 *   POST { confirm: 'DELETE' }                    — the signed-in user deletes their own account
 *   POST { confirm: 'DELETE', user_id, request_id? } — an ADMIN completes a deletion request
 *
 * Deletes storage objects, then the auth user. Every public table references
 * profiles(id) with ON DELETE CASCADE, except records that must survive for
 * safety/accounting, which are anonymised via ON DELETE SET NULL
 * (moderation reports, AI usage cost ledger, admin audit log).
 */
import { admin, requireUser } from '../_shared/clients.ts';
import { json, preflight } from '../_shared/http.ts';

Deno.serve(async (req) => {
  const pf = preflight(req);
  if (pf) return pf;
  const caller = await requireUser(req);
  if (!caller) return json(req, 401, { error: 'not_authenticated' });

  let body: { confirm?: string; user_id?: string; request_id?: string };
  try { body = await req.json(); } catch { return json(req, 400, { error: 'invalid_body' }); }
  if (body.confirm !== 'DELETE') return json(req, 400, { error: 'confirmation_required' });

  let target = caller.id;
  let actingAdmin = false;
  if (body.user_id && body.user_id !== caller.id) {
    const { data: role } = await admin.from('admin_roles').select('role').eq('user_id', caller.id).maybeSingle();
    if (role?.role !== 'admin') return json(req, 403, { error: 'forbidden' });
    target = body.user_id;
    actingAdmin = true;
  }

  const { data: authUser, error: getErr } = await admin.auth.admin.getUserById(target);
  if (getErr || !authUser.user) return json(req, 404, { error: 'user_not_found' });
  const email = authUser.user.email ?? null;

  // 1. Storage: remove every object under avatars/<uid>/
  const { data: objects } = await admin.storage.from('avatars').list(target, { limit: 1000 });
  if (objects && objects.length) {
    await admin.storage.from('avatars').remove(objects.map((o) => `${target}/${o.name}`));
  }

  // 2. Record completion of any open deletion request (kept without user link).
  const nowIso = new Date().toISOString();
  if (body.request_id && actingAdmin) {
    await admin.from('account_deletion_requests').update({ status: 'completed', completed_at: nowIso }).eq('id', body.request_id);
  }
  if (email) {
    await admin.from('account_deletion_requests').update({ status: 'completed', completed_at: nowIso })
      .eq('email', email).in('status', ['pending', 'verified']);
  }

  // 3. Audit (admin-initiated only)
  if (actingAdmin) {
    await admin.from('admin_audit_logs').insert({ admin_id: caller.id, action: 'delete_account', target_type: 'user', target_id: target, details: {} });
  }

  // 4. Delete the auth user → cascades through public schema.
  const { error: delErr } = await admin.auth.admin.deleteUser(target);
  if (delErr) {
    console.error(JSON.stringify({ fn: 'delete-account', code: 'auth_delete_failed', message: delErr.message }));
    return json(req, 500, { error: 'delete_failed' });
  }
  return json(req, 200, { ok: true });
});
