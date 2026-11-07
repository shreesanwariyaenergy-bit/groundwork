'use client';
import { useRouter } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { friendlyError } from '@groundwork/shared';
import { clearClaim, clearResult, readClaim } from '@/lib/quick-validate';
import { useApp } from './AppProvider';

/**
 * After sign-in, attaches an anonymous Quick Validate report (if this browser holds a claim token)
 * to the user's private Think workspace, then opens it. Runs once per mount; no UI unless it fails.
 */
export function ClaimQuickReport() {
  const { api } = useApp();
  const router = useRouter();
  const done = useRef(false);
  useEffect(() => {
    if (done.current) return;
    done.current = true;
    const token = readClaim();
    if (!token) return;
    api.claimQuickReport(token)
      .then((projectId) => {
        clearClaim(); clearResult();
        api.track('quick_report_claimed').catch(() => {});
        router.push(`/app/think/${projectId}?saved=1`);
      })
      .catch((e) => {
        const msg = friendlyError(e);
        // Expired / already saved / invalid → forget the token; transient errors keep it for the next visit.
        if (/expired|already saved|invalid/i.test(msg) || /quick_report_not_found|invalid_token/.test(String((e as Error).message))) clearClaim();
      });
  }, [api, router]);
  return null;
}
