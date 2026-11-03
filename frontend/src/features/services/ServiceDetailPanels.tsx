import { StudentAvatar } from '../students/StudentAvatar';
import { safePhoto } from '../profile/profile-avatar-value';
import { useId, type ReactNode } from 'react';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { canRequestService, type StudentService } from './services.types';
import {
  requestExplanations,
  requestMessageError,
  serviceDate,
  serviceStatusLabel,
} from './service-detail-state';

export function ServiceRequestControls({
  service,
  note,
  requesting,
  disabled = false,
  onNoteChange,
  onRequest,
}: {
  readonly service: StudentService;
  readonly note: string;
  readonly requesting: boolean;
  readonly disabled?: boolean;
  readonly onNoteChange: (value: string) => void;
  readonly onRequest: () => void;
}) {
  const fieldId = useId();
  const validation = requestMessageError(note);
  return (
    <>
      {service.viewerRequestStatus ? (
        <div className="cc-sd-request-status" role="status">
          <strong>Your request: {service.viewerRequestStatus}</strong>
          <p>{requestExplanations[service.viewerRequestStatus]}</p>
        </div>
      ) : null}
      {canRequestService(service) ? (
        <form
          className="cc-sd-request-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            if (!requesting && !disabled && !validation) onRequest();
          }}
        >
          <h2>Request this service</h2>
          <p>
            Send a request for the provider to review. Arrangements can be discussed after
            acceptance.
          </p>
          <label htmlFor={fieldId}>
            Request message <span>(optional)</span>
          </label>
          <textarea
            id={fieldId}
            aria-label="Optional request details"
            aria-describedby={`${fieldId}-help${validation ? ` ${fieldId}-error` : ''}`}
            aria-invalid={!!validation}
            className="cc-field"
            rows={3}
            maxLength={1000}
            placeholder="Tell the provider what you need help with…"
            value={note}
            onChange={(event) => onNoteChange(event.target.value)}
            disabled={requesting || disabled}
          />
          <p id={`${fieldId}-help`} className="cc-sd-helper">
            Optional · up to 1,000 characters. Do not include private contact information.
          </p>
          {validation ? (
            <p id={`${fieldId}-error`} role="alert">
              {validation}
            </p>
          ) : null}
          <Button
            type="submit"
            className="cc-sd-full"
            disabled={disabled || requesting || !!validation}
            loading={requesting}
          >
            {requesting ? 'Submitting…' : 'Request service'}
          </Button>
        </form>
      ) : !service.viewerRequestStatus ? (
        <p className="cc-sd-unavailable">This service is not accepting new requests.</p>
      ) : null}
    </>
  );
}

export function ServiceOverview({ service }: { readonly service: StudentService }) {
  return (
    <section className="cc-sd-overview cc-sd-panel" aria-labelledby="sd-title">
      <div className="cc-sd-eyebrow">
        <span>{service.category}</span>
        <span className={`cc-sd-availability cc-sd-availability--${service.status.toLowerCase()}`}>
          {serviceStatusLabel(service.status)}
        </span>
      </div>
      <h1 id="sd-title">{service.title}</h1>
      <div className="cc-sd-description">
        <h2>About this service</h2>
        <p>{service.description || 'No description has been provided.'}</p>
      </div>
    </section>
  );
}
export function ServiceInformation({ service }: { readonly service: StudentService }) {
  const created = serviceDate(service.createdAt),
    updated = serviceDate(service.updatedAt);
  return (
    <section className="cc-sd-information cc-sd-panel" aria-label="Service information">
      {service.skills.length ? (
        <div>
          <h2>Skills &amp; expertise</h2>
          <ul className="cc-sd-skills">
            {service.skills.map((skill) => (
              <li key={skill}>{skill}</li>
            ))}
          </ul>
        </div>
      ) : (
        <div>
          <h2>Skills &amp; expertise</h2>
          <p>No specific skills listed.</p>
        </div>
      )}
      <div className="cc-sd-metadata">
        <h2>Service information</h2>
        <dl>
          {service.location ? (
            <>
              <dt>Location</dt>
              <dd>{service.location}</dd>
            </>
          ) : null}
          {created ? (
            <>
              <dt>Published</dt>
              <dd>{created}</dd>
            </>
          ) : null}
          {updated && updated !== created ? (
            <>
              <dt>Updated</dt>
              <dd>{updated}</dd>
            </>
          ) : null}
          {!service.location && !created && !updated ? (
            <>
              <dt>Details</dt>
              <dd>No additional information shared.</dd>
            </>
          ) : null}
        </dl>
      </div>
    </section>
  );
}
export function ServiceProvider({ service }: { readonly service: StudentService }) {
  const name = service.provider.displayName || 'CampusConnect student';
  return (
    <section className="cc-sd-provider cc-sd-panel" aria-labelledby="sd-provider-title">
      <h2 id="sd-provider-title">Offered by</h2>
      <div className="cc-sd-person">
        <span className="cc-sd-avatar" aria-hidden="true">
          {safePhoto(service.provider.avatar) ? (
            <StudentAvatar avatar={service.provider.avatar} displayName={name} />
          ) : name === 'CampusConnect student' ? (
            <Icon name="profile" />
          ) : (
            name
              .split(/\s+/)
              .slice(0, 2)
              .map((part) => part[0])
              .join('')
          )}
        </span>
        <div>
          <strong>{name}</strong>
          {service.provider.department ? <p>{service.provider.department}</p> : null}
        </div>
      </div>
    </section>
  );
}
export function ServiceDetailLayout({
  mobile,
  overview,
  request,
  information,
  provider,
  actions,
}: {
  readonly mobile: boolean;
  readonly overview: ReactNode;
  readonly request: ReactNode;
  readonly information: ReactNode;
  readonly provider: ReactNode;
  readonly actions: ReactNode;
}) {
  return (
    <div className="cc-sd-workspace">
      {mobile ? (
        <>
          {overview}
          {request}
          {information}
          {provider}
          {actions}
        </>
      ) : (
        <>
          <div className="cc-sd-main">
            {overview}
            {information}
          </div>
          <aside className="cc-sd-rail" aria-label="Pricing, requests and provider">
            {request}
            {provider}
            {actions}
          </aside>
        </>
      )}
    </div>
  );
}
