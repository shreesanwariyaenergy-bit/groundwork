'use client';
import { useState } from 'react';
import { Button, Card, Input } from '@/components/ui';
import { SITE_URL } from '@/lib/env';
import { useApp, useAsync } from './AppProvider';

export function InviteBox() {
  const { api } = useApp();
  const { data: code } = useAsync(() => api.inviteCode(), []);
  const [copied, setCopied] = useState(false);
  const link = code ? `${SITE_URL}/register?invite=${code}` : '';
  return (
    <Card className="p-5">
      <h2 className="text-sm font-semibold">Invite collaborators</h2>
      <p className="mt-1 text-sm text-muted">Know a founder or builder who should be here? Share your personal link. Every relevant person who joins makes recommendations better for everyone.</p>
      <div className="mt-3 flex gap-2">
        <Input readOnly value={link || 'Loading…'} aria-label="Invite link" onFocus={(e) => e.target.select()} />
        <Button variant="secondary" disabled={!link} onClick={async () => { await navigator.clipboard.writeText(link); setCopied(true); setTimeout(() => setCopied(false), 2000); }}>{copied ? 'Copied' : 'Copy'}</Button>
      </div>
    </Card>
  );
}
