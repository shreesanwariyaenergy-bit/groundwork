'use client';
import Link from 'next/link';
import { useState } from 'react';
import {
  AVAILABILITY, MATCH_REASON_LABELS, MATCH_TYPE_LABELS, REPORT_REASONS, connectionMessageSchema, countryName, firstError, friendlyError,
  type ProfileCard as Card, type RecommendationCard, type ReportReason,
} from '@groundwork/shared';
import { Alert, Avatar, Badge, Button, Field, Modal, Select, Textarea } from '@/components/ui';
import { useApp } from './AppProvider';

export function PersonCard({ person, onDismiss, onSavedChange }: {
  person: Card | RecommendationCard; onDismiss?: (id: string) => void; onSavedChange?: (id: string, saved: boolean) => void;
}) {
  const { api, avatar, roleName } = useApp();
  const [saved, setSaved] = useState(person.is_saved);
  const rec = 'reasons' in person ? person : null;
  const location = [person.city, countryName(person.country_code)].filter(Boolean).join(', ');
  return (
    <li className="flex flex-col rounded-lg border border-line bg-raised p-4">
      <div className="flex items-start gap-3">
        <Avatar name={person.display_name} src={avatar(person.avatar_path)} size={44} />
        <div className="min-w-0 flex-1">
          <Link href={`/app/u/${person.id}`} className="font-medium text-fg hover:underline">{person.display_name}</Link>
          <p className="line-clamp-2 text-sm text-muted">{person.headline}</p>
        </div>
        {rec?.is_new && <Badge tone="accent">New</Badge>}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-xs text-subtle">
        {person.primary_role && <span>{roleName(person.primary_role)}</span>}
        {person.availability && <span>{AVAILABILITY.find((a) => a.value === person.availability)?.label}</span>}
        {location && <span>{location}</span>}
        {person.timezone && <span>{person.timezone.split('/').pop()?.replace(/_/g, ' ')}</span>}
      </div>
      {rec && (
        <div className="mt-3">
          <div className="text-xs font-medium text-muted">{MATCH_TYPE_LABELS[rec.match_type]}</div>
          {rec.reasons.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-sm">
              {rec.reasons.slice(0, 3).map((r) => <li key={r} className="flex gap-1.5 text-fg"><span className="text-accent" aria-hidden>✓</span>{MATCH_REASON_LABELS[r] ?? r}</li>)}
            </ul>
          )}
        </div>
      )}
      {person.skills.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1">{person.skills.slice(0, 6).map((s) => <Badge key={s}>{s}</Badge>)}</div>
      )}
      <div className="mt-4 flex flex-wrap gap-2 pt-1">
        <Link href={`/app/u/${person.id}`} className="inline-flex h-8 items-center rounded-md bg-accent px-3 text-sm font-medium text-on-accent hover:bg-accent-hover">View profile</Link>
        <Button size="sm" variant="secondary" onClick={async () => {
          const next = !saved; setSaved(next);
          try { await api.save(person.id, next); onSavedChange?.(person.id, next); } catch { setSaved(!next); }
        }}>{saved ? 'Saved' : 'Save'}</Button>
        {onDismiss && <Button size="sm" variant="ghost" onClick={async () => { onDismiss(person.id); await api.dismiss(person.id).catch(() => {}); }}>Not now</Button>}
      </div>
    </li>
  );
}

export function ConnectModal({ open, onClose, userId, name, onSent }: { open: boolean; onClose: () => void; userId: string; name: string; onSent: () => void }) {
  const { api } = useApp();
  const [msg, setMsg] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  return (
    <Modal open={open} onClose={onClose} title={`Connect with ${name}`} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button loading={loading} onClick={async () => {
          const p = connectionMessageSchema.safeParse(msg);
          if (!p.success) return setError(firstError(p));
          setLoading(true); setError(null);
          try { await api.sendRequest(userId, p.data); onSent(); onClose(); setMsg(''); api.track('connection_request_sent').catch(() => {}); }
          catch (e) { setError(friendlyError(e)); }
          finally { setLoading(false); }
        }}>Send request</Button>
      </>
    }>
      <Field label="Add a short note" htmlFor="cm" optional hint={`${msg.length}/300 · Say why you would like to talk. Links are not allowed.`}>
        <Textarea id="cm" value={msg} onChange={(e) => setMsg(e.target.value)} maxLength={300} rows={4}
          placeholder="Hi — I am building … and your experience with … stood out. Would you be open to a short call?" />
      </Field>
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </Modal>
  );
}

export function ReportModal({ open, onClose, userId, name, messageId }: { open: boolean; onClose: () => void; userId: string; name: string; messageId?: string | null }) {
  const { api } = useApp();
  const [reason, setReason] = useState<ReportReason>('spam');
  const [details, setDetails] = useState('');
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={() => { onClose(); setState('idle'); }} title={`Report ${name}`} footer={state === 'done' ? (
      <Button onClick={() => { onClose(); setState('idle'); }}>Close</Button>
    ) : (
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant="danger" loading={state === 'loading'} onClick={async () => {
          setState('loading'); setError(null);
          try { await api.report(userId, reason, details.trim() || null, messageId ?? null); setState('done'); }
          catch (e) { setError(friendlyError(e)); setState('idle'); }
        }}>Submit report</Button>
      </>
    )}>
      {state === 'done' ? (
        <p className="text-sm text-muted">Thank you. A moderator will review this report. You can also block this person so they cannot contact you.</p>
      ) : (
        <div className="space-y-4">
          <Field label="Reason" htmlFor="rr">
            <Select id="rr" value={reason} onChange={(e) => setReason(e.target.value as ReportReason)}>
              {REPORT_REASONS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </Select>
          </Field>
          <Field label="Details" htmlFor="rd" optional><Textarea id="rd" value={details} onChange={(e) => setDetails(e.target.value)} maxLength={1000} /></Field>
          {messageId && <p className="text-xs text-subtle">The reported message will be attached for moderators.</p>}
          {error && <Alert tone="danger">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

export function ConfirmModal({ open, onClose, title, body, confirmLabel, danger, onConfirm }: {
  open: boolean; onClose: () => void; title: string; body: React.ReactNode; confirmLabel: string; danger?: boolean; onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <Modal open={open} onClose={onClose} title={title} footer={
      <>
        <Button variant="ghost" onClick={onClose}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={async () => {
          setLoading(true); setError(null);
          try { await onConfirm(); onClose(); } catch (e) { setError(friendlyError(e)); } finally { setLoading(false); }
        }}>{confirmLabel}</Button>
      </>
    }>
      <div className="text-sm text-muted">{body}</div>
      {error && <div className="mt-3"><Alert tone="danger">{error}</Alert></div>}
    </Modal>
  );
}
