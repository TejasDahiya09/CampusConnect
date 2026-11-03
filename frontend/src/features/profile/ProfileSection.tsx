import type { PropsWithChildren, ReactNode } from 'react';

interface ProfileSectionProps extends PropsWithChildren {
  readonly action?: ReactNode;
  readonly description?: string;
  readonly title: string;
}

export function ProfileSection({ action, children, description, title }: ProfileSectionProps) {
  return (
    <section className="cc-card p-5 sm:p-6">
      <div className="mb-5 flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold text-[var(--cc-text)]">{title}</h2>
          {description ? (
            <p className="mt-1 text-sm text-[var(--cc-muted)]">{description}</p>
          ) : null}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
