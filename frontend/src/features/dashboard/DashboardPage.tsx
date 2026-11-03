import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, PageHeader } from '../../components/ui';
import { ApiClientError } from '../../services/api-client';
import { useAuth } from '../auth/useAuth';
import { DashboardContent, DashboardSkeleton } from './DashboardContent';
import { dashboardApi, DashboardDataError, type DashboardAnalytics } from './dashboard-service';
import './dashboard.css';

export function DashboardPage() {
  const { applicationUser } = useAuth();
  return (
    <DashboardWorkspace
      key={`${applicationUser?.id ?? 'signed-out'}:${applicationUser?.status ?? 'unknown'}`}
      active={applicationUser?.status === 'ACTIVE'}
    />
  );
}

function DashboardWorkspace({ active }: { readonly active: boolean }) {
  const [data, setData] = useState<DashboardAnalytics | null>(null);
  const [loading, setLoading] = useState(active);
  const [attempt, setAttempt] = useState(0);
  const [issue, setIssue] = useState<{
    kind: 'access' | 'auth' | 'network';
    message: string;
  } | null>(null);
  const loaded = useRef(false);
  const reload = () => {
    setLoading(true);
    setIssue(null);
    setData(null);
    setAttempt((value) => value + 1);
  };
  useEffect(() => {
    if (!active) return;
    const controller = new AbortController();
    void dashboardApi
      .get(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setData(result);
        loaded.current = true;
      })
      .catch((error: unknown) => {
        if (controller.signal.aborted) return;
        const status = error instanceof ApiClientError ? error.status : undefined;
        setIssue(
          status === 401
            ? {
                kind: 'auth',
                message: 'Your session has expired. Sign in again to view your dashboard.',
              }
            : status === 403
              ? {
                  kind: 'access',
                  message: 'Your account cannot access this dashboard. No activity is shown.',
                }
              : {
                  kind: 'network',
                  message:
                    error instanceof DashboardDataError
                      ? 'The dashboard response is incomplete. No totals are shown. Try again to reload the complete overview.'
                      : loaded.current
                        ? "We couldn't refresh your dashboard. No updated totals are shown."
                        : "We couldn't load your activity. Check your connection and try again.",
                },
        );
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [active, attempt]);
  return (
    <div className="cc-page cc-dashboard">
      <PageHeader
        eyebrow="Personal activity"
        title="Your dashboard"
        description="Your campus activity and next steps, all in one place."
        actions={
          <Button
            variant="secondary"
            loading={loading}
            disabled={!active || issue?.kind === 'auth' || issue?.kind === 'access'}
            onClick={reload}
          >
            Refresh
          </Button>
        }
      />
      {!active ? (
        <section className="cc-db-state cc-db-panel" role="alert">
          <h2>Dashboard unavailable</h2>
          <p>An active CampusConnect account is required to view your activity.</p>
        </section>
      ) : loading ? (
        <DashboardSkeleton />
      ) : issue ? (
        <section className="cc-db-state cc-db-panel" role="alert">
          <h2>{issue.kind === 'auth' ? 'Sign in to continue' : 'Dashboard unavailable'}</h2>
          <p>{issue.message}</p>
          {issue.kind === 'network' ? (
            <Button variant="secondary" onClick={reload}>
              Try again
            </Button>
          ) : issue.kind === 'auth' ? (
            <Link className="cc-button cc-button--primary" to="/login">
              Sign in
            </Link>
          ) : (
            <Link className="cc-button cc-button--secondary" to="/home">
              Return to Home
            </Link>
          )}
        </section>
      ) : data ? (
        <DashboardContent data={data} />
      ) : null}
    </div>
  );
}
