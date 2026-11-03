import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, Modal } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { ApiClientError } from '../../services/api-client';
import { servicesApi } from './services-service';
import { messagingService } from '../messaging/messaging-service';
import type {
  ServiceRequest,
  ServiceStatus,
  ServicesWorkspace as Workspace,
  StudentService,
} from './services.types';
import {
  canReviewServiceRequest,
  lifecycleTargets,
  serviceConversationInput,
} from './services-management-state';
import { ServiceManagementCard, ServiceRequestCard } from './ServiceManagementCards';
import './services-management.css';

type Tab = 'offered' | 'sent' | 'received';
const tabs = [
  { id: 'offered', label: 'Services I offer' },
  { id: 'sent', label: "Requests I've sent" },
  { id: 'received', label: 'Requests received' },
] as const;
const failure = (reason: unknown) =>
  reason instanceof ApiClientError ? reason.message : 'Check your connection and try again.';
export default function ServicesWorkspace() {
  const navigate = useNavigate();
  const [data, setData] = useState<Workspace | null>(null),
    [issue, setIssue] = useState<string | null>(null),
    [attempt, setAttempt] = useState(0),
    [reading, setReading] = useState(true);
  const [tab, setTab] = useState<Tab>('offered'),
    [status, setStatus] = useState(''),
    [serviceFilter, setServiceFilter] = useState('');
  const [pending, setPending] = useState<string | null>(null),
    [needsRefresh, setNeedsRefresh] = useState(false),
    [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [confirmation, setConfirmation] = useState<StudentService | null>(null);
  const alive = useRef(true),
    lock = useRef(false),
    tablist = useRef<HTMLDivElement>(null);
  const workspaceReady = data !== null;
  useEffect(() => {
    const list = tablist.current;
    if (!list) return;
    const syncEdges = () => {
      const frame = list.parentElement;
      if (!frame) return;
      const maximum = Math.max(0, list.scrollWidth - list.clientWidth);
      frame.dataset.scrollStart = String(maximum > 1 && list.scrollLeft > 1);
      frame.dataset.scrollEnd = String(maximum > 1 && list.scrollLeft < maximum - 1);
    };
    const revealActive = () => {
      const active = list.querySelector<HTMLElement>('[aria-selected="true"]');
      const maximum = Math.max(0, list.scrollWidth - list.clientWidth);
      if (active && maximum > 1) {
        const bounds = list.getBoundingClientRect();
        const selected = active.getBoundingClientRect();
        const left = selected.left - bounds.left + list.scrollLeft;
        const right = selected.right - bounds.left + list.scrollLeft;
        // Leave room for the focus outline and any fade beside a partially visible neighbour.
        const startInset = left > 8 ? 26 : 8;
        const endInset = list.scrollWidth - right > 8 ? 26 : 8;
        let next = list.scrollLeft;
        if (left < next + startInset) next = left - startInset;
        else if (right > next + list.clientWidth - endInset)
          next = right - list.clientWidth + endInset;
        list.scrollTo({ left: Math.max(0, Math.min(maximum, next)), behavior: 'instant' });
      }
      syncEdges();
    };
    revealActive();
    list.addEventListener('scroll', syncEdges, { passive: true });
    window.addEventListener('resize', revealActive);
    const observer =
      typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(revealActive);
    observer?.observe(list);
    list.querySelectorAll('[role="tab"]').forEach((button) => observer?.observe(button));
    return () => {
      list.removeEventListener('scroll', syncEdges);
      window.removeEventListener('resize', revealActive);
      observer?.disconnect();
    };
  }, [tab, workspaceReady]);
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
  useEffect(() => {
    let current = true;
    const controller = new AbortController();
    void servicesApi
      .workspace(controller.signal)
      .then((result) => {
        if (current) {
          setData(result);
          setIssue(null);
          setNeedsRefresh(false);
        }
      })
      .catch((reason: unknown) => {
        if (current && !controller.signal.aborted) {
          setIssue(failure(reason));
          setNeedsRefresh(true);
          if (reason instanceof ApiClientError && [401, 403].includes(reason.status)) setData(null);
        }
      })
      .finally(() => {
        if (current) setReading(false);
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [attempt]);
  const closeConfirmation = useCallback(() => {
    if (!lock.current) setConfirmation(null);
  }, []);
  const mutate = async (key: string, operation: () => Promise<unknown>, success: string) => {
    if (lock.current || reading || needsRefresh) return;
    lock.current = true;
    setPending(key);
    setNotice(null);
    try {
      await operation();
      if (alive.current) {
        setNotice({ error: false, text: success });
        setNeedsRefresh(true);
        reload();
      }
    } catch (reason) {
      if (alive.current) {
        setNotice({ error: true, text: failure(reason) });
        setNeedsRefresh(true);
        reload();
      }
    } finally {
      lock.current = false;
      if (alive.current) {
        setPending(null);
        setConfirmation(null);
      }
    }
  };
  const transition = (service: StudentService, target: ServiceStatus) => {
    if (!lifecycleTargets(service).includes(target)) return;
    if (target === 'ARCHIVED') {
      setConfirmation(service);
      return;
    }
    void mutate(
      `${service.id}:${target}`,
      () => servicesApi.transition(service.id, target),
      target === 'PAUSED' ? 'Service paused.' : 'Service resumed.',
    );
  };
  const act = (request: ServiceRequest, target: 'ACCEPTED' | 'REJECTED' | 'COMPLETED') => {
    if (!request.service || !canReviewServiceRequest(request, target)) return;
    const serviceId = request.service.id;
    void mutate(
      `${request.id}:${target}`,
      () =>
        target === 'COMPLETED'
          ? servicesApi.complete(serviceId, request.id)
          : servicesApi.review(serviceId, request.id, target),
      target === 'COMPLETED'
        ? 'Request marked completed.'
        : target === 'ACCEPTED'
          ? 'Request accepted.'
          : 'Request rejected.',
    );
  };
  const message = async (request: ServiceRequest, received: boolean) => {
    const input = serviceConversationInput(request, received);
    if (!input || lock.current || reading || needsRefresh) return;
    lock.current = true;
    setPending(`${request.id}:MESSAGE`);
    setNotice(null);
    try {
      const result = await messagingService.open(input);
      if (alive.current) void navigate(`/messages/${result.id}`);
    } catch (reason) {
      if (alive.current) setNotice({ error: true, text: failure(reason) });
    } finally {
      lock.current = false;
      if (alive.current) setPending(null);
    }
  };
  const select = (value: Tab) => {
    setTab(value);
    setStatus('');
    setServiceFilter('');
  };
  const keys = (event: KeyboardEvent) => {
    const index = tabs.findIndex((item) => item.id === tab);
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % 3;
    else if (event.key === 'ArrowLeft') next = (index + 2) % 3;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = 2;
    else return;
    event.preventDefault();
    const value = tabs[next];
    if (value) {
      select(value.id);
      tablist.current
        ?.querySelectorAll<HTMLButtonElement>('[role=tab]')
        [next]?.focus({ preventScroll: true });
    }
  };
  const counts = {
    offered: data?.provided.length ?? 0,
    sent: data?.requested.length ?? 0,
    received: data?.received.length ?? 0,
  };
  const requests = tab === 'received' ? (data?.received ?? []) : (data?.requested ?? []);
  const visible = requests.filter(
    (request) =>
      (!status || request.status === status) &&
      (!serviceFilter || request.service?.id === serviceFilter),
  );
  const requestCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const request of data?.received ?? []) {
      if (request.service)
        counts.set(request.service.id, (counts.get(request.service.id) ?? 0) + 1);
    }
    return counts;
  }, [data]);
  const offered = data?.provided ?? [];
  const disabled = reading || needsRefresh || pending !== null;
  return (
    <div className="cc-page svm-page svm-workspace">
      <Link className="svm-back" to="/services">
        <Icon name="arrow" />
        Back to Campus Services
      </Link>
      <header className="svm-header">
        <div>
          <h1>My Services &amp; Requests</h1>
          <p>Manage what you offer and keep track of the help you've requested.</p>
        </div>
        <div className="svm-header-actions">
          <Button variant="secondary" onClick={reload} disabled={reading || pending !== null}>
            Refresh
          </Button>
          <Link to="/services/new" className="cc-button cc-button--primary">
            <Icon name="plus" />
            Offer a service
          </Link>
        </div>
      </header>
      {notice ? (
        <p
          className={`svm-notice ${notice.error ? 'svm-notice--error' : ''}`}
          role={notice.error ? 'alert' : 'status'}
        >
          {notice.text}
        </p>
      ) : null}
      {issue ? (
        <div className="svm-notice svm-notice--error" role="alert">
          <h2>{data ? 'Workspace refresh failed' : 'Workspace unavailable'}</h2>
          <p>{issue}</p>
          {data ? (
            <p>
              The last loaded records are shown. Actions remain paused until a refresh succeeds. A
              confirmed action will not be repeated.
            </p>
          ) : null}
          <Button variant="secondary" disabled={reading} onClick={reload}>
            Try again
          </Button>
        </div>
      ) : null}
      {!data ? (
        reading ? (
          <div className="svm-skeleton" role="status">
            Loading your services and requests…
          </div>
        ) : null
      ) : (
        <>
          <div className="svm-tabs-frame">
            <div
              className="svm-tabs"
              role="tablist"
              aria-label="Services workspace sections"
              ref={tablist}
              onKeyDown={keys}
            >
              {tabs.map((item) => (
                <button
                  key={item.id}
                  role="tab"
                  id={`workspace-tab-${item.id}`}
                  aria-controls="workspace-panel"
                  aria-selected={tab === item.id}
                  tabIndex={tab === item.id ? 0 : -1}
                  onClick={() => select(item.id)}
                >
                  {item.label}
                  <span>{counts[item.id]}</span>
                </button>
              ))}
            </div>
          </div>
          <section
            id="workspace-panel"
            role="tabpanel"
            aria-labelledby={`workspace-tab-${tab}`}
            aria-busy={reading}
            tabIndex={0}
            className="svm-tab-panel"
          >
            <div className="svm-panel-heading">
              <div>
                <h2>{tabs.find((item) => item.id === tab)?.label}</h2>
                <p>
                  {reading
                    ? 'Refreshing authoritative workspace…'
                    : tab === 'offered'
                      ? `${counts.offered} services offered`
                      : `${visible.length} ${visible.length === 1 ? 'request' : 'requests'}`}
                </p>
              </div>
              {tab !== 'offered' ? (
                <label className="svm-status-filter">
                  Request status
                  <select
                    className="cc-field"
                    aria-label="Filter request status"
                    value={status}
                    onChange={(event) => setStatus(event.target.value)}
                  >
                    <option value="">All statuses</option>
                    <option value="PENDING">Pending</option>
                    <option value="ACCEPTED">Accepted</option>
                    <option value="REJECTED">Rejected</option>
                    <option value="COMPLETED">Completed</option>
                  </select>
                </label>
              ) : null}
            </div>
            {serviceFilter ? (
              <div className="svm-service-filter">
                <span>Showing requests for the selected service</span>
                <Button variant="ghost" onClick={() => setServiceFilter('')}>
                  Show all services
                </Button>
              </div>
            ) : null}
            {tab === 'offered' ? (
              offered.length ? (
                <div className="svm-grid">
                  {offered.map((service) => (
                    <ServiceManagementCard
                      key={service.id}
                      service={service}
                      requests={requestCounts.get(service.id) ?? 0}
                      pending={pending}
                      disabled={disabled}
                      onTransition={transition}
                      onReview={() => {
                        setTab('received');
                        setServiceFilter(service.id);
                        setStatus('');
                      }}
                    />
                  ))}
                </div>
              ) : (
                <div className="svm-state">
                  <Icon name="briefcase" />
                  <h3>You have not offered a service yet</h3>
                  <p>Share a skill with your campus community.</p>
                  <Link className="cc-button cc-button--primary" to="/services/new">
                    Offer a service
                  </Link>
                </div>
              )
            ) : visible.length ? (
              <div className="svm-grid">
                {visible.map((request) => (
                  <ServiceRequestCard
                    key={request.id}
                    request={request}
                    received={tab === 'received'}
                    pending={pending}
                    disabled={disabled}
                    onAct={act}
                    onMessage={(item, received) => void message(item, received)}
                  />
                ))}
              </div>
            ) : (
              <div className="svm-state">
                <Icon name="inbox" />
                <h3>
                  {status === 'PENDING'
                    ? 'No pending requests'
                    : status || serviceFilter
                      ? 'No matching requests'
                      : tab === 'sent'
                        ? 'No requests sent yet'
                        : 'No requests received yet'}
                </h3>
                <p>
                  {status || serviceFilter
                    ? 'No requests here match the current view.'
                    : tab === 'sent'
                      ? 'Find student skills and request the help you need.'
                      : 'Requests for your services will appear here.'}
                </p>
                {status || serviceFilter ? (
                  <Button
                    variant="secondary"
                    onClick={() => {
                      setStatus('');
                      setServiceFilter('');
                    }}
                  >
                    Clear view filters
                  </Button>
                ) : (
                  <Link
                    className="cc-button cc-button--secondary"
                    to={tab === 'sent' ? '/services' : '/services/new'}
                  >
                    {tab === 'sent' ? 'Explore services' : 'Offer a service'}
                  </Link>
                )}
              </div>
            )}
          </section>
        </>
      )}
      <Modal
        open={confirmation !== null}
        onClose={closeConfirmation}
        title="Archive service"
        description="Archived services cannot be reactivated. Existing requests and conversations are preserved."
      >
        <p className="svm-confirm-title">{confirmation?.title}</p>
        <div className="svm-card-actions">
          <Button variant="secondary" disabled={pending !== null} onClick={closeConfirmation}>
            Cancel
          </Button>
          <Button
            variant="danger"
            loading={pending?.endsWith(':ARCHIVED')}
            disabled={disabled}
            onClick={() => {
              if (confirmation)
                void mutate(
                  `${confirmation.id}:ARCHIVED`,
                  () => servicesApi.transition(confirmation.id, 'ARCHIVED'),
                  'Service archived.',
                );
            }}
          >
            Archive service
          </Button>
        </div>
      </Modal>
    </div>
  );
}
