import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApiClientError } from '../../services/api-client';
import { ShareActions } from '../share/ShareActions';
import { ReportAction } from '../moderation/ReportAction';
import { messagingService } from '../messaging/messaging-service';
import { servicesApi } from './services-service';
import type { ServiceRequest, StudentService } from './services.types';
import { canRequestService } from './services.types';
import {
  latestServiceConversationRequest,
  requestMessageError,
  serviceDetailPrice,
  validServiceDetailId,
} from './service-detail-state';
import {
  ServiceDetailLayout,
  ServiceInformation,
  ServiceOverview,
  ServiceProvider,
  ServiceRequestControls,
} from './ServiceDetailPanels';
import './service-detail.css';

const subscribe = (notify: () => void) => {
  const media = window.matchMedia('(max-width: 899px)');
  media.addEventListener('change', notify);
  return () => media.removeEventListener('change', notify);
};
const mobileSnapshot = () => window.matchMedia('(max-width: 899px)').matches;
const serverSnapshot = () => false;
const message = (reason: unknown) =>
  reason instanceof ApiClientError ? reason.message : 'Check your connection and try again.';

export default function ServiceDetail({ id }: { readonly id: string }) {
  const mobile = useSyncExternalStore(subscribe, mobileSnapshot, serverSnapshot);
  const navigate = useNavigate();
  const [service, setService] = useState<StudentService | null>(null);
  const [readError, setReadError] = useState<string | null>(
    validServiceDetailId(id) ? null : 'This service link is invalid.',
  );
  const [refreshError, setRefreshError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [reading, setReading] = useState(validServiceDetailId(id));
  const [pending, setPending] = useState<'request' | 'message' | 'archive' | null>(null);
  const [needsRefresh, setNeedsRefresh] = useState(false);
  const [receipt, setReceipt] = useState<ServiceRequest | null>(null);
  const [note, setNote] = useState('');
  const [feedback, setFeedback] = useState<{ error: boolean; text: string } | null>(null);
  const [contextRecord, setContext] = useState<{
    service: StudentService;
    request: ServiceRequest | null;
    loading: boolean;
    error: string | null;
  } | null>(null);
  const alive = useRef(true),
    lock = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const reload = useCallback(() => {
    setReading(true);
    setAttempt((value) => value + 1);
  }, []);
  const context =
    contextRecord?.service === service
      ? contextRecord
      : {
          request: null,
          loading: Boolean(
            service &&
            !service.viewerIsProvider &&
            ['ACCEPTED', 'COMPLETED'].includes(service.viewerRequestStatus ?? ''),
          ),
          error: null,
        };
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (!validServiceDetailId(id)) {
      return () => controller.abort();
    }
    void servicesApi
      .get(id, controller.signal)
      .then((result) => {
        if (!current) return;
        setService(result);
        setReadError(null);
        setRefreshError(null);
        setNeedsRefresh(false);
        setReceipt(null);
      })
      .catch((reason: unknown) => {
        if (!current || controller.signal.aborted) return;
        if (reason instanceof ApiClientError && [400, 401, 403, 404].includes(reason.status)) {
          setService(null);
          setReadError(
            reason.status === 404
              ? 'This service is unavailable or you no longer have access to it.'
              : message(reason),
          );
        } else {
          setRefreshError(message(reason));
          setNeedsRefresh(true);
        }
      })
      .finally(() => {
        if (current) setReading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [id, attempt]);
  useEffect(() => {
    const focus = () => {
      if (!lock.current) reload();
    };
    window.addEventListener('focus', focus);
    return () => window.removeEventListener('focus', focus);
  }, [reload]);
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    if (
      !service ||
      service.viewerIsProvider ||
      !['ACCEPTED', 'COMPLETED'].includes(service.viewerRequestStatus ?? '')
    ) {
      return () => controller.abort();
    }
    void servicesApi
      .workspace(controller.signal)
      .then((workspace) => {
        if (current)
          setContext({
            service,
            request: latestServiceConversationRequest(service, workspace.requested),
            loading: false,
            error: null,
          });
      })
      .catch((reason: unknown) => {
        if (current && !controller.signal.aborted)
          setContext({ service, request: null, loading: false, error: message(reason) });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [service]);
  const request = async () => {
    if (
      lock.current ||
      reading ||
      needsRefresh ||
      !service ||
      !canRequestService(service) ||
      requestMessageError(note)
    )
      return;
    lock.current = true;
    setPending('request');
    setFeedback(null);
    try {
      const result = await servicesApi.request(id, note);
      if (!alive.current) return;
      setReceipt(result);
      setNote('');
      setNeedsRefresh(true);
      setFeedback({
        error: false,
        text: 'Service request submitted. Refreshing its current status…',
      });
      reload();
    } catch (reason) {
      if (alive.current) {
        setFeedback({ error: true, text: message(reason) });
        setNeedsRefresh(true);
        reload();
      }
    } finally {
      lock.current = false;
      if (alive.current) setPending(null);
    }
  };
  const openMessage = async () => {
    if (lock.current || reading || needsRefresh || !context.request || !service) return;
    lock.current = true;
    setPending('message');
    setFeedback(null);
    try {
      const conversation = await messagingService.open({
        contextType: 'SERVICE',
        contextId: context.request.id,
        targetUserId: service.providerId,
      });
      if (alive.current) void navigate(`/messages/${conversation.id}`);
    } catch (reason) {
      if (alive.current) setFeedback({ error: true, text: message(reason) });
    } finally {
      lock.current = false;
      if (alive.current) setPending(null);
    }
  };
  const archive = async () => {
    if (
      lock.current ||
      !service?.viewerIsProvider ||
      service.status === 'ARCHIVED' ||
      reading ||
      needsRefresh
    )
      return;
    lock.current = true;
    setPending('archive');
    setFeedback(null);
    try {
      const result = await servicesApi.transition(id, 'ARCHIVED');
      if (alive.current) {
        setService(result);
        setFeedback({ error: false, text: 'Service archived.' });
      }
    } catch (reason) {
      if (alive.current) {
        setFeedback({ error: true, text: message(reason) });
        setNeedsRefresh(true);
        reload();
      }
    } finally {
      lock.current = false;
      if (alive.current) setPending(null);
    }
  };
  const back = (
    <Link className="cc-sd-back" to="/services">
      <Icon name="arrow" />
      Back to Campus Services
    </Link>
  );
  if (!service)
    return (
      <div className="cc-page cc-sd-detail">
        {back}
        {reading ? (
          <div className="cc-sd-loading" role="status" aria-label="Loading service details">
            <div />
            <div />
          </div>
        ) : (
          <section className="cc-sd-state cc-sd-panel" role="alert">
            <Icon name="warning" />
            <h1>{readError ? 'Service unavailable' : 'Could not load this service'}</h1>
            <p>{readError ?? refreshError}</p>
            {validServiceDetailId(id) ? (
              <Button onClick={reload} variant="secondary">
                Try again
              </Button>
            ) : null}
            <Link to="/services" className="cc-button cc-button--primary">
              Browse Campus Services
            </Link>
          </section>
        )}
      </div>
    );
  const presented = receipt
    ? { ...service, viewerRequestStatus: receipt.status, viewerCanRequest: false }
    : service;
  const blocked = reading || needsRefresh || pending !== null;
  const requestPanel = (
    <section className="cc-sd-pricing cc-sd-panel" aria-labelledby="sd-pricing-title">
      <p className="cc-sd-kicker" id="sd-pricing-title">
        {service.pricingType === 'FIXED'
          ? 'Fixed price'
          : service.pricingType === 'FREE'
            ? 'Student-to-student help'
            : 'Flexible pricing'}
      </p>
      <p className="cc-sd-price">{serviceDetailPrice(service)}</p>
      <p className="cc-sd-price-note">
        {service.pricingType === 'NEGOTIABLE'
          ? 'Scope and price can be discussed after your request is accepted.'
          : 'Arrangements are between students. CampusConnect does not process payments.'}
      </p>
      {feedback ? (
        <p
          className={`cc-sd-feedback ${feedback.error ? 'cc-sd-feedback--error' : ''}`}
          role={feedback.error ? 'alert' : 'status'}
        >
          {feedback.text}
        </p>
      ) : null}
      {refreshError ? (
        <div className="cc-sd-refresh-error" role="alert">
          <p>
            {receipt
              ? 'Your request was submitted, but the latest service state could not be refreshed.'
              : 'The current service state could not be refreshed.'}{' '}
            {refreshError} Submission remains paused until a refresh succeeds.
          </p>
          <Button variant="secondary" onClick={reload} disabled={reading}>
            Refresh service
          </Button>
        </div>
      ) : null}
      {service.viewerIsProvider ? (
        <div className="cc-sd-owner">
          <h2>Your service</h2>
          <p>Manage your listing and review requests in your workspace.</p>
          {service.status !== 'ARCHIVED' ? (
            <>
              <Link
                className="cc-button cc-button--secondary cc-sd-full"
                to={`/services/${id}/edit`}
              >
                Edit service
              </Link>
              <Button
                variant="danger"
                className="cc-sd-full"
                disabled={blocked}
                loading={pending === 'archive'}
                onClick={() => void archive()}
              >
                Archive
              </Button>
            </>
          ) : (
            <p>This service is archived.</p>
          )}
          <Link className="cc-button cc-button--secondary cc-sd-full" to="/services/saved">
            My services &amp; requests
          </Link>
        </div>
      ) : (
        <>
          <ServiceRequestControls
            service={presented}
            note={note}
            requesting={pending === 'request'}
            disabled={blocked}
            onNoteChange={setNote}
            onRequest={() => void request()}
          />
          {canRequestService(presented) && (reading || needsRefresh) ? (
            <p role="status" className="cc-sd-helper">
              Refresh the current service state before submitting.
            </p>
          ) : null}
          {['ACCEPTED', 'COMPLETED'].includes(presented.viewerRequestStatus ?? '') ? (
            <div className="cc-sd-message">
              {context.loading ? (
                <p role="status">Checking your request for messaging…</p>
              ) : context.error ? (
                <>
                  <p role="alert">Could not check messaging: {context.error}</p>
                  <Button variant="secondary" onClick={reload}>
                    Retry messaging check
                  </Button>
                </>
              ) : context.request ? (
                <Button
                  className="cc-sd-full"
                  icon="message"
                  disabled={blocked}
                  loading={pending === 'message'}
                  onClick={() => void openMessage()}
                >
                  Message provider
                </Button>
              ) : (
                <p>
                  Messaging is not available for the current request. Check your requests for
                  historical conversations.
                </p>
              )}
              <Link className="cc-sd-text-link" to="/services/saved">
                View my requests
                <Icon name="arrow" />
              </Link>
            </div>
          ) : null}
        </>
      )}
    </section>
  );
  const actions = (
    <section className="cc-sd-secondary cc-sd-panel" aria-label="Share and report this service">
      <div className="cc-sd-secondary-row">
        <details className="cc-sd-share">
          <summary>
            <Icon name="share" />
            Share service
          </summary>
          <ShareActions
            className="cc-sd-share-content"
            includeRecordUrl
            record={{
              category: service.category,
              description: service.description,
              id: service.id,
              location: service.location,
              module: 'SERVICE',
              price: serviceDetailPrice(service),
              skills: service.skills,
              status: service.status,
              title: service.title,
            }}
          />
        </details>
        {!service.viewerIsProvider ? (
          <ReportAction targetId={service.id} targetType="SERVICE" />
        ) : null}
      </div>
    </section>
  );
  return (
    <div className="cc-page cc-sd-detail">
      {back}
      <ServiceDetailLayout
        mobile={mobile}
        overview={<ServiceOverview service={service} />}
        request={requestPanel}
        information={<ServiceInformation service={service} />}
        provider={<ServiceProvider service={service} />}
        actions={actions}
      />
      {reading ? (
        <p className="cc-sd-sync" role="status">
          Refreshing service…
        </p>
      ) : null}
    </div>
  );
}
