import * as React from 'react';

interface FeaturedOnLandingFieldProps {
  readonly disabled?: boolean;
  readonly eligible?: boolean;
  readonly lostFound?: boolean;
  readonly onChange: (value: boolean) => void;
  readonly value: boolean;
}

export function FeaturedOnLandingField({
  disabled = false,
  eligible = true,
  lostFound = false,
  onChange,
  value,
}: FeaturedOnLandingFieldProps) {
  const descriptionId = React.useId();

  return (
    <div className="rounded-2xl border border-[var(--cc-border)] bg-[var(--cc-surface-subtle)] p-4 sm:p-5">
      <label className="flex cursor-pointer items-start gap-3 text-[var(--cc-text)]">
        <input
          aria-describedby={descriptionId}
          checked={value}
          className="mt-0.5 h-5 w-5 shrink-0 accent-[var(--cc-accent)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--cc-focus)] disabled:cursor-not-allowed disabled:opacity-60"
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          type="checkbox"
        />
        <span>
          <span className="block text-sm font-semibold">
            Allow this post to be featured on the public homepage
          </span>
          <span className="mt-1 block text-sm leading-6 text-[var(--cc-muted)]" id={descriptionId}>
            Your post may appear to visitors who aren't signed in. Only limited public post details
            will be shown. Your private contact information, profile details, and messages won't be
            included.
            {lostFound ? (
              <span className="mt-1 block">
                Exact locations, claim evidence, and ownership-verification details are excluded
                from homepage previews.
              </span>
            ) : null}
            <span className="mt-1 block">
              Featuring is optional and not guaranteed. Only active, visible, otherwise eligible
              posts can appear. You can turn it off later by editing this post; disabling it
              prevents future inclusion in uncached homepage responses.
            </span>
            {!eligible ? (
              <span className="mt-1 block font-medium text-[var(--cc-warning-text)]">
                This post is not currently eligible because of its lifecycle status. This setting
                only preserves your preference if it becomes eligible again.
              </span>
            ) : null}
          </span>
        </span>
      </label>
    </div>
  );
}
