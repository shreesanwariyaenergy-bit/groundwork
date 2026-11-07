'use client';
import type { QuickInputs, ThinkReport } from '@groundwork/shared';

/**
 * Browser-side state for anonymous Quick Validate.
 * - The claim token is the only thing that can attach the report to an account; it never leaves this browser
 *   except in the claim call made after sign-in. Stored in localStorage until claimed or expired (7 days).
 * - The last result is kept in sessionStorage so a refresh does not lose it.
 */
const TOKEN_KEY = 'gw.quick.claim';
const RESULT_KEY = 'gw.quick.result';
const DRAFT_KEY = 'gw.quick.draft';

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

export function saveClaim(token: string, expiresAt: string) {
  safe(() => localStorage.setItem(TOKEN_KEY, JSON.stringify({ token, expiresAt })), undefined);
}
export function readClaim(): string | null {
  return safe(() => {
    const raw = localStorage.getItem(TOKEN_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as { token: string; expiresAt: string };
    if (!v.token || new Date(v.expiresAt).getTime() < Date.now()) { localStorage.removeItem(TOKEN_KEY); return null; }
    return v.token;
  }, null);
}
export function clearClaim() { safe(() => localStorage.removeItem(TOKEN_KEY), undefined); }

export function saveResult(inputs: QuickInputs, report: ThinkReport, saveable: boolean) {
  safe(() => sessionStorage.setItem(RESULT_KEY, JSON.stringify({ inputs, report, saveable })), undefined);
}
export function readResult(): { inputs: QuickInputs; report: ThinkReport; saveable: boolean } | null {
  return safe(() => { const r = sessionStorage.getItem(RESULT_KEY); return r ? JSON.parse(r) : null; }, null);
}
export function clearResult() { safe(() => sessionStorage.removeItem(RESULT_KEY), undefined); }

export function saveDraft(inputs: Partial<QuickInputs>) { safe(() => sessionStorage.setItem(DRAFT_KEY, JSON.stringify(inputs)), undefined); }
export function takeDraft(): Partial<QuickInputs> | null {
  return safe(() => { const r = sessionStorage.getItem(DRAFT_KEY); sessionStorage.removeItem(DRAFT_KEY); return r ? JSON.parse(r) : null; }, null);
}
