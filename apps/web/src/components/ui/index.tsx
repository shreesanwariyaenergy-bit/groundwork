'use client';
import Link from 'next/link';
import {
  forwardRef, useEffect, useId, useRef,
  type ButtonHTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes,
} from 'react';
import { initials } from '@groundwork/shared';

export { cn, buttonClass } from './styles';
import { cn, buttonClass, type Variant, type Size } from './styles';

export const Button = forwardRef<HTMLButtonElement, ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean }>(
  function Button({ variant = 'primary', size = 'md', loading, className, children, disabled, ...rest }, ref) {
    return (
      <button ref={ref} className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...rest}>
        {loading && <Spinner className="size-4" />}
        {children}
      </button>
    );
  },
);

export function LinkButton({ href, variant = 'primary', size = 'md', className, children }: { href: string; variant?: Variant; size?: Size; className?: string; children: ReactNode }) {
  return <Link href={href} className={buttonClass(variant, size, className)}>{children}</Link>;
}

// ---------------------------------------------------------------- Form fields
export function Field({ label, hint, error, children, htmlFor, optional }: { label: string; hint?: string; error?: string | null; children: ReactNode; htmlFor?: string; optional?: boolean }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-sm font-medium text-fg">
        {label} {optional && <span className="font-normal text-subtle">(optional)</span>}
      </label>
      {children}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : hint ? <p className="text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

const inputBase = 'w-full rounded-md border border-line-strong bg-raised px-3 text-sm text-fg placeholder:text-subtle focus:border-accent focus:outline-none disabled:opacity-60';

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cn(inputBase, 'h-10', className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea({ className, ...rest }, ref) {
  return <textarea ref={ref} className={cn(inputBase, 'min-h-24 py-2 leading-relaxed', className)} {...rest} />;
});

export function Select({ className, children, ...rest }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn(inputBase, 'h-10 pr-8', className)} {...rest}>{children}</select>;
}

export function Checkbox({ label, description, checked, onChange, id }: { label: ReactNode; description?: string; checked: boolean; onChange: (v: boolean) => void; id?: string }) {
  const autoId = useId();
  const cid = id ?? autoId;
  return (
    <label htmlFor={cid} className="flex cursor-pointer items-start gap-3">
      <input id={cid} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-[var(--accent)]" />
      <span className="text-sm">
        <span className="text-fg">{label}</span>
        {description && <span className="block text-muted">{description}</span>}
      </span>
    </label>
  );
}

export function Toggle({ checked, onChange, label, description }: { checked: boolean; onChange: (v: boolean) => void; label: string; description?: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <div className="text-sm">
        <div className="font-medium text-fg">{label}</div>
        {description && <div className="text-muted">{description}</div>}
      </div>
      <button
        type="button" role="switch" aria-checked={checked} aria-label={label} onClick={() => onChange(!checked)}
        className={cn('relative h-6 w-11 shrink-0 rounded-full transition-colors', checked ? 'bg-accent' : 'bg-line-strong')}
      >
        <span className={cn('absolute top-0.5 size-5 rounded-full bg-white shadow transition-transform', checked ? 'translate-x-5' : 'translate-x-0.5')} />
      </button>
    </div>
  );
}

/** Multi-select as toggleable chips (small option sets). */
export function ChipGroup<T extends string>({ options, value, onChange, max, single }: {
  options: { value: T; label: string }[]; value: T[]; onChange: (v: T[]) => void; max?: number; single?: boolean;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => {
        const on = value.includes(o.value);
        return (
          <button
            key={o.value} type="button" aria-pressed={on}
            onClick={() => {
              if (single) onChange(on ? [] : [o.value]);
              else if (on) onChange(value.filter((v) => v !== o.value));
              else if (!max || value.length < max) onChange([...value, o.value]);
            }}
            className={cn('h-9 rounded-md border px-3 text-sm transition-colors',
              on ? 'border-accent bg-accent-soft text-fg' : 'border-line-strong text-muted hover:text-fg hover:border-fg')}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------- Display
export function Card({ className, children, as: As = 'div' }: { className?: string; children: ReactNode; as?: 'div' | 'section' | 'article' | 'li' }) {
  return <As className={cn('rounded-lg border border-line bg-raised', className)}>{children}</As>;
}

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: 'neutral' | 'accent' | 'warning' | 'danger' }) {
  const tones = {
    neutral: 'bg-surface text-muted border-line',
    accent: 'bg-accent-soft text-accent border-transparent',
    warning: 'bg-warning-soft text-warning border-transparent',
    danger: 'bg-danger-soft text-danger border-transparent',
  };
  return <span className={cn('inline-flex items-center rounded-sm border px-1.5 py-0.5 text-xs font-medium', tones[tone])}>{children}</span>;
}

export function Avatar({ name, src, size = 40 }: { name: string; src?: string | null; size?: number }) {
  return src ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt="" width={size} height={size} className="shrink-0 rounded-full object-cover" style={{ width: size, height: size }} loading="lazy" />
  ) : (
    <span aria-hidden className="inline-flex shrink-0 items-center justify-center rounded-full bg-surface font-medium text-muted border border-line"
      style={{ width: size, height: size, fontSize: Math.max(11, size * 0.36) }}>
      {initials(name)}
    </span>
  );
}

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cn('animate-spin', className ?? 'size-5')} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-surface', className)} />;
}

export function EmptyState({ title, body, action }: { title: string; body?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-lg border border-dashed border-line-strong px-6 py-10 text-center">
      <h3 className="text-base font-semibold text-fg">{title}</h3>
      {body && <div className="mx-auto mt-1 max-w-md text-sm text-muted">{body}</div>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

export function Alert({ tone = 'neutral', children, title }: { tone?: 'neutral' | 'warning' | 'danger' | 'accent'; children: ReactNode; title?: string }) {
  const tones = {
    neutral: 'bg-surface border-line text-fg',
    warning: 'bg-warning-soft border-transparent text-fg',
    danger: 'bg-danger-soft border-transparent text-fg',
    accent: 'bg-accent-soft border-transparent text-fg',
  };
  return (
    <div className={cn('rounded-md border px-4 py-3 text-sm', tones[tone])} role={tone === 'danger' ? 'alert' : 'status'}>
      {title && <div className="mb-0.5 font-semibold">{title}</div>}
      {children}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <Alert tone="danger" title="Could not load">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span>{message}</span>
        {onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}
      </div>
    </Alert>
  );
}

export function PageHeader({ title, description, actions }: { title: string; description?: ReactNode; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-fg">{title}</h1>
        {description && <p className="mt-1 text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex gap-2">{actions}</div>}
    </div>
  );
}

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { value: T; label: string; count?: number }[]; value: T; onChange: (v: T) => void }) {
  return (
    <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto border-b border-line">
      {tabs.map((t) => (
        <button key={t.value} role="tab" aria-selected={value === t.value} onClick={() => onChange(t.value)}
          className={cn('-mb-px whitespace-nowrap border-b-2 px-3 py-2.5 text-sm font-medium',
            value === t.value ? 'border-fg text-fg' : 'border-transparent text-muted hover:text-fg')}>
          {t.label}{typeof t.count === 'number' && t.count > 0 && <span className="ml-1.5 text-subtle">{t.count}</span>}
        </button>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- Modal
export function Modal({ open, onClose, title, children, footer }: { open: boolean; onClose: () => void; title: string; children: ReactNode; footer?: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={ref} onClose={onClose} onCancel={onClose}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-lg border border-line bg-raised p-0 text-fg shadow-xl">
      <div className="flex items-center justify-between border-b border-line px-5 py-3.5">
        <h2 className="text-base font-semibold">{title}</h2>
        <button onClick={onClose} className="rounded-md p-1 text-muted hover:bg-surface hover:text-fg" aria-label="Close">
          <svg viewBox="0 0 20 20" className="size-5" fill="currentColor"><path d="M6.3 5 5 6.3 8.7 10 5 13.7 6.3 15l3.7-3.7 3.7 3.7 1.3-1.3-3.7-3.7L15 6.3 13.7 5 10 8.7z" /></svg>
        </button>
      </div>
      <div className="max-h-[70vh] overflow-y-auto px-5 py-4">{children}</div>
      {footer && <div className="flex justify-end gap-2 border-t border-line px-5 py-3">{footer}</div>}
    </dialog>
  );
}
