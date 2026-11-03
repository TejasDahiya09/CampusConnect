import { useId } from 'react';
export function ServiceFeaturedConsent({
  value,
  onChange,
  disabled = false,
  eligible = true,
}: {
  readonly value: boolean;
  readonly onChange: (value: boolean) => void;
  readonly disabled?: boolean;
  readonly eligible?: boolean;
}) {
  const id = useId();
  return (
    <section className="svm-consent" aria-label="Public homepage featuring">
      <label htmlFor={id}>
        <input
          id={id}
          type="checkbox"
          checked={value}
          disabled={disabled}
          onChange={(event) => onChange(event.target.checked)}
          aria-describedby={`${id}-summary`}
        />
        <span>Allow this service to be featured on the public homepage</span>
      </label>
      <p id={`${id}-summary`}>
        Optional and not guaranteed. Only limited public details from active, visible, eligible
        services may appear.
      </p>
      {!eligible ? (
        <p>
          This service is not currently eligible because of its lifecycle status. This setting only
          preserves your preference if it becomes eligible again.
        </p>
      ) : null}
      <details>
        <summary>Learn more</summary>
        <div>
          <p>
            Your service may appear to visitors who aren't signed in. Only limited public service
            details will be shown. Your private contact information, profile details, and messages
            won't be included.
          </p>
          <p>
            Featuring is optional and not guaranteed. Only active, visible, otherwise eligible
            services can appear. You can turn it off later by editing this service; disabling it
            prevents future inclusion in uncached homepage responses.
          </p>
        </div>
      </details>
    </section>
  );
}
