import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, EmptyState, PageHeader } from '../../components/ui';
import { LostFoundCard } from './LostFoundCard';
import { lostFoundApi } from './lost-found-service';
import type { LostFoundReport } from './lost-found.types';

export function MyReportsPage() {
  const [reports, setReports] = useState<readonly LostFoundReport[] | null>(null);
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void lostFoundApi
      .getMyReports(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReports(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [attempt]);
  const totalPages = Math.ceil((reports?.length ?? 0) / 12);
  return (
    <div className="cc-page">
      <PageHeader
        title="My reports"
        description="Lost and found items you reported. Open a report to view its status and permitted recovery actions."
        actions={
          <Link className="cc-button cc-button--secondary" to="/lost-found">
            Browse Lost &amp; Found
          </Link>
        }
      />
      {error ? (
        <div className="cc-alert cc-alert--danger mt-6" role="alert">
          Your reports could not be loaded.
          <Button
            onClick={() => {
              setError(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : !reports ? (
        <p className="mt-6" role="status">
          Loading your reports…
        </p>
      ) : reports.length ? (
        <div className="mt-6 grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {reports.slice((page - 1) * 12, page * 12).map((report) => (
            <LostFoundCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No reports yet"
          description="The lost and found items you report will appear here."
          action={
            <Link className="cc-button cc-button--primary" to="/lost-found/new?type=lost">
              Report an item
            </Link>
          }
        />
      )}
      {totalPages > 1 ? (
        <nav
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
          aria-label="My reports pagination"
        >
          <Button variant="secondary" disabled={page <= 1} onClick={() => setPage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
