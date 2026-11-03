import { Link } from 'react-router-dom';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import type { ServiceRequest, ServiceStatus, StudentService } from './services.types';
import { serviceDate, serviceDetailPrice, serviceStatusLabel } from './service-detail-state';
import {
  canReviewServiceRequest,
  lifecycleTargets,
  serviceConversationInput,
} from './services-management-state';

export function ManagementStatus({ value }: { readonly value: string }) {
  return (
    <span className={`svm-status svm-status--${value.toLowerCase()}`}>
      {value === 'ACTIVE' || value === 'PAUSED' || value === 'ARCHIVED'
        ? serviceStatusLabel(value)
        : value.charAt(0) + value.slice(1).toLowerCase()}
    </span>
  );
}
export function ServiceManagementCard({
  service,
  requests,
  pending,
  disabled,
  onTransition,
  onReview,
}: {
  readonly service: StudentService;
  readonly requests: number;
  readonly pending: string | null;
  readonly disabled: boolean;
  readonly onTransition: (service: StudentService, status: ServiceStatus) => void;
  readonly onReview: () => void;
}) {
  const date = serviceDate(service.createdAt),
    targets = lifecycleTargets(service);
  return (
    <article className="svm-card">
      <div className="svm-card-top">
        <span className="svm-category">{service.category}</span>
        <ManagementStatus value={service.status} />
      </div>
      <h2>
        <Link to={`/services/${service.id}`}>{service.title}</Link>
      </h2>
      <strong className="svm-card-price">{serviceDetailPrice(service)}</strong>
      <p className="svm-card-description">{service.description}</p>
      <p className="svm-meta">
        {requests} {requests === 1 ? 'request' : 'requests'}
        {date ? ` · Published ${date}` : ''}
      </p>
      <div className="svm-card-actions">
        <Link className="cc-button cc-button--primary" to={`/services/${service.id}`}>
          Manage service
          <Icon name="arrow" />
        </Link>
        {requests > 0 ? (
          <Button disabled={disabled} variant="secondary" onClick={onReview}>
            Review requests
          </Button>
        ) : null}
      </div>
      {service.viewerIsProvider ? (
        <div className="svm-owner-actions">
          {service.status !== 'ARCHIVED' ? (
            <Link className="svm-text-action" to={`/services/${service.id}/edit`}>
              Edit service
            </Link>
          ) : (
            <span className="svm-meta">Archived · history preserved</span>
          )}
          {targets.length ? (
            <details className="svm-lifecycle">
              <summary>
                Availability
                <Icon name="chevron" />
              </summary>
              <div>
                {targets.map((target) => (
                  <Button
                    key={target}
                    variant={target === 'ARCHIVED' ? 'danger' : 'secondary'}
                    disabled={disabled}
                    loading={pending === `${service.id}:${target}`}
                    onClick={() => onTransition(service, target)}
                  >
                    {target === 'ACTIVE' ? 'Resume' : target === 'PAUSED' ? 'Pause' : 'Archive'}
                  </Button>
                ))}
              </div>
            </details>
          ) : null}
        </div>
      ) : null}
    </article>
  );
}
export function ServiceRequestCard({
  request,
  received,
  pending,
  disabled,
  onAct,
  onMessage,
}: {
  readonly request: ServiceRequest;
  readonly received: boolean;
  readonly pending: string | null;
  readonly disabled: boolean;
  readonly onAct: (request: ServiceRequest, status: 'ACCEPTED' | 'REJECTED' | 'COMPLETED') => void;
  readonly onMessage: (request: ServiceRequest, received: boolean) => void;
}) {
  const name = received ? request.requester.displayName : request.service?.provider.displayName;
  const date = serviceDate(request.createdAt);
  return (
    <article className="svm-card svm-request-card">
      <div className="svm-card-top">
        <span className="svm-category">{received ? 'Request received' : 'Request sent'}</span>
        <ManagementStatus value={request.status} />
      </div>
      <h2>
        {request.service ? (
          <Link to={`/services/${request.service.id}`}>{request.service.title}</Link>
        ) : (
          'Service unavailable'
        )}
      </h2>
      <p className="svm-request-person">
        <Icon name="profile" />
        {received ? 'From' : 'Provider'}: {name || 'CampusConnect student'}
      </p>
      {date ? <p className="svm-meta">Submitted {date}</p> : null}
      {request.message ? (
        <p className="svm-request-message">{request.message}</p>
      ) : (
        <p className="svm-meta">No message included.</p>
      )}
      <div className="svm-card-actions">
        {received
          ? (['ACCEPTED', 'REJECTED', 'COMPLETED'] as const)
              .filter((status) => canReviewServiceRequest(request, status))
              .map((status) => (
                <Button
                  key={status}
                  disabled={disabled}
                  loading={pending === `${request.id}:${status}`}
                  variant={status === 'REJECTED' ? 'secondary' : 'primary'}
                  onClick={() => onAct(request, status)}
                >
                  {status === 'ACCEPTED'
                    ? 'Accept'
                    : status === 'REJECTED'
                      ? 'Reject'
                      : 'Mark completed'}
                </Button>
              ))
          : null}
        {serviceConversationInput(request, received) ? (
          <Button
            icon="message"
            disabled={disabled}
            loading={pending === `${request.id}:MESSAGE`}
            variant="secondary"
            onClick={() => onMessage(request, received)}
          >
            Message {received ? 'requester' : 'provider'}
          </Button>
        ) : null}
        {request.service ? (
          <Link className="svm-text-action" to={`/services/${request.service.id}`}>
            View service
            <Icon name="arrow" />
          </Link>
        ) : null}
      </div>
      {!received && ['REJECTED', 'COMPLETED'].includes(request.status) ? (
        <p className="svm-help">
          This is a historical request. Current re-request eligibility is shown on the service page.
        </p>
      ) : null}
    </article>
  );
}
