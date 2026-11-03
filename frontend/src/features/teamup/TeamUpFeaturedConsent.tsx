import { useId } from 'react';

/** TeamUp presentation only; consent values and eligibility remain caller/backend owned. */
export function TeamUpFeaturedConsent({
  disabled = false,
  eligible = true,
  value,
  onChange,
}: {
  readonly disabled?: boolean;
  readonly eligible?: boolean;
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
}) {
  const id = useId();
  return (
    <section className="tu-featured-consent" aria-label="Public homepage featuring">
      <label htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={`${id}-summary`}
        />
        <span>Allow this post to be featured on the public homepage</span>
      </label>
      <p id={`${id}-summary`}>
        Optional and not guaranteed. Only limited public details from active, visible, eligible
        posts may appear.
      </p>
      {!eligible ? (
        <p className="tu-featured-eligibility">
          This post is not currently eligible because of its lifecycle status. This setting only
          preserves your preference if it becomes eligible again.
        </p>
      ) : null}
      <details>
        <summary>Learn more</summary>
        <div>
          <p>
            Your post may appear to visitors who aren't signed in. Only limited public post details
            will be shown. Your private contact information, profile details, and messages won't be
            included.
          </p>
          <p>
            Featuring is optional and not guaranteed. Only active, visible, otherwise eligible posts
            can appear. You can turn it off later by editing this post; disabling it prevents future
            inclusion in uncached homepage responses.
          </p>
        </div>
      </details>
    </section>
  );
}
