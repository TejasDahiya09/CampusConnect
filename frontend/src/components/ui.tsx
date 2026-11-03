import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Icon, type IconName } from './Icon';
import { cn } from './class-names';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly icon?: IconName;
  readonly loading?: boolean;
  readonly variant?: 'danger' | 'ghost' | 'outline' | 'primary' | 'secondary';
}

export function Button({
  children,
  className,
  disabled,
  icon,
  loading = false,
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      aria-busy={loading || undefined}
      className={cn('cc-button', `cc-button--${variant}`, className)}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? <span aria-hidden="true" className="cc-button-spinner" /> : null}
      {!loading && icon ? <Icon className="size-4" name={icon} /> : null}
      {children}
    </button>
  );
}

export function Badge({
  children,
  tone = 'neutral',
}: PropsWithChildren<{ readonly tone?: 'danger' | 'info' | 'neutral' | 'success' | 'warning' }>) {
  return <span className={`cc-badge cc-badge--${tone}`}>{children}</span>;
}

export function Card({ children, className }: PropsWithChildren<{ readonly className?: string }>) {
  return <section className={cn('cc-card', className)}>{children}</section>;
}

export function Avatar({
  alt,
  fallback,
  size = 'md',
  src,
}: {
  readonly alt: string;
  readonly fallback: string;
  readonly size?: 'sm' | 'md' | 'lg';
  readonly src?: string | null;
}) {
  const sizeClass = { sm: 'size-8 text-xs', md: 'size-10 text-sm', lg: 'size-14 text-lg' }[size];
  return src ? (
    <img alt={alt} className={cn(sizeClass, 'rounded-full object-cover')} src={src} />
  ) : (
    <span
      aria-label={alt}
      className={cn(
        sizeClass,
        'grid shrink-0 place-items-center rounded-full bg-indigo-400/15 font-semibold text-indigo-200',
      )}
      role="img"
    >
      {fallback.slice(0, 2).toUpperCase()}
    </span>
  );
}

export function Breadcrumbs({
  items,
}: {
  readonly items: ReadonlyArray<{ readonly href?: string; readonly label: string }>;
}) {
  return (
    <nav aria-label="Breadcrumb" className="cc-breadcrumbs mb-5 text-xs">
      <ol className="flex flex-wrap items-center gap-2">
        {items.map((item, index) => (
          <li className="flex items-center gap-2" key={`${item.label}-${index}`}>
            {index > 0 ? <span aria-hidden="true">/</span> : null}
            {item.href ? (
              <a className="transition" href={item.href}>
                {item.label}
              </a>
            ) : (
              <span aria-current="page">{item.label}</span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Tabs({
  active,
  items,
  onChange,
}: {
  readonly active: string;
  readonly items: ReadonlyArray<{ readonly id: string; readonly label: string }>;
  readonly onChange: (id: string) => void;
}) {
  return (
    <div aria-label="Sections" className="cc-tabs" role="tablist">
      {items.map((item) => (
        <button
          aria-selected={active === item.id}
          className={cn('cc-tab', active === item.id ? 'cc-tab--active' : '')}
          key={item.id}
          onClick={() => onChange(item.id)}
          role="tab"
          type="button"
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function Toast({
  message,
  onDismiss,
  tone = 'success',
}: {
  readonly message: string;
  readonly onDismiss?: () => void;
  readonly tone?: 'danger' | 'success';
}) {
  return (
    <div aria-live="polite" className={cn('cc-toast', `cc-toast--${tone}`)} role="status">
      <Icon className="size-4 shrink-0" name={tone === 'success' ? 'check' : 'warning'} />
      <span>{message}</span>
      {onDismiss ? (
        <button
          aria-label="Dismiss notification"
          className="ml-2"
          onClick={onDismiss}
          type="button"
        >
          <Icon className="size-4" name="close" />
        </button>
      ) : null}
    </div>
  );
}

export function DemoNotice({
  children = 'Preview data — backend integration is scheduled for a later phase.',
}: PropsWithChildren) {
  return (
    <div className="cc-alert cc-alert--warning">
      <Icon className="mt-0.5 size-4 shrink-0" name="warning" />
      <p>{children}</p>
    </div>
  );
}

export function EmptyState({
  action,
  description,
  icon = 'inbox',
  title,
}: {
  readonly action?: ReactNode;
  readonly description: string;
  readonly icon?: IconName;
  readonly title: string;
}) {
  return (
    <div className="cc-empty">
      <span className="cc-icon-box">
        <Icon className="size-6" name={icon} />
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="mt-5">{action}</div> : null}
    </div>
  );
}

export function PageHeader({
  actions,
  description,
  eyebrow,
  title,
}: {
  readonly actions?: ReactNode;
  readonly description: string;
  readonly eyebrow?: string;
  readonly title: string;
}) {
  return (
    <header className="flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow ? <p className="cc-eyebrow">{eyebrow}</p> : null}
        <h1 className="cc-page-title">{title}</h1>
        <p className="cc-page-description mt-2 max-w-2xl text-sm leading-6 sm:text-base">
          {description}
        </p>
      </div>
      {actions ? <div className="cc-page-actions shrink-0">{actions}</div> : null}
    </header>
  );
}

export function SectionHeader({
  actions,
  description,
  title,
}: {
  readonly actions?: ReactNode;
  readonly description?: string;
  readonly title: string;
}) {
  return (
    <header className="cc-section-header">
      <div className="min-w-0">
        <h2 className="cc-section-title">{title}</h2>
        {description ? <p className="cc-section-description">{description}</p> : null}
      </div>
      {actions ? <div className="cc-page-actions shrink-0">{actions}</div> : null}
    </header>
  );
}

export function FieldMessage({
  children,
  error = false,
}: PropsWithChildren<{ readonly error?: boolean }>) {
  return (
    <span className={error ? 'cc-field-error' : 'cc-field-help'} role={error ? 'alert' : undefined}>
      {children}
    </span>
  );
}

export function InlineAlert({
  children,
  tone = 'info',
}: PropsWithChildren<{ readonly tone?: 'danger' | 'info' | 'success' | 'warning' }>) {
  return (
    <div className={`cc-alert cc-alert--${tone}`} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 size-4 shrink-0" name={tone === 'danger' ? 'warning' : 'shield'} />
      <div>{children}</div>
    </div>
  );
}

export function StatCard({
  detail,
  icon,
  label,
  tone = 'indigo',
  value,
}: {
  readonly detail: string;
  readonly icon: IconName;
  readonly label: string;
  readonly tone?: 'cyan' | 'emerald' | 'indigo' | 'rose';
  readonly value: string;
}) {
  return (
    <Card className="p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-sm text-slate-400">{label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-white">{value}</p>
        </div>
        <span className={`cc-stat-icon cc-stat-icon--${tone}`}>
          <Icon className="size-5" name={icon} />
        </span>
      </div>
      <p className="mt-4 text-xs text-slate-500">{detail}</p>
    </Card>
  );
}

export function Skeleton({ className }: { readonly className?: string }) {
  return <div aria-hidden="true" className={cn('cc-skeleton', className)} />;
}

export function Modal({
  children,
  description,
  onClose,
  open,
  title,
}: PropsWithChildren<{
  readonly description?: string;
  readonly onClose: () => void;
  readonly open: boolean;
  readonly title: string;
}>) {
  const dialog = useRef<HTMLElement>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    if (!open) return;
    const previousFocus =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const focusable = () => [
      ...(dialog.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []),
    ];
    window.requestAnimationFrame(() => focusable()[0]?.focus());
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
      if (event.key !== 'Tab') return;
      const controls = focusable();
      if (controls.length === 0) return;
      const first = controls[0];
      const last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener('keydown', handleKey);
      previousFocus?.focus();
    };
  }, [onClose, open]);

  if (!open) return null;
  return (
    <div
      className="cc-modal-backdrop"
      onMouseDown={(event) => {
        if (event.currentTarget === event.target) onClose();
      }}
    >
      <section
        aria-describedby={description ? descriptionId : undefined}
        aria-labelledby={titleId}
        aria-modal="true"
        className="cc-modal"
        ref={dialog}
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="cc-section-title" id={titleId}>
              {title}
            </h2>
            {description ? (
              <p className="cc-section-description" id={descriptionId}>
                {description}
              </p>
            ) : null}
          </div>
          <button
            aria-label="Close dialog"
            className="cc-icon-button"
            onClick={onClose}
            type="button"
          >
            <Icon className="size-5" name="close" />
          </button>
        </div>
        <div className="mt-5">{children}</div>
      </section>
    </div>
  );
}

export function ProgressBar({ label, value }: { readonly label: string; readonly value: number }) {
  return (
    <div>
      <div className="mb-2 flex justify-between text-xs">
        <span className="text-slate-400">{label}</span>
        <span className="font-medium text-slate-200">{value}%</span>
      </div>
      <div className="cc-progress-track">
        <div
          className="cc-progress-value"
          style={{ width: `${Math.max(0, Math.min(100, value))}%` }}
        />
      </div>
    </div>
  );
}
