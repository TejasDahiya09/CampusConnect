import { useEffect, useState } from 'react';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  PageHeader,
  Skeleton,
  StatCard,
} from '../../components/ui';
import { moderationApi } from './moderation-service';
import type { ModerationReport, ReportStatus } from './moderation.types';
import { adminApi } from '../admin/admin-service';
import { useAuth } from '../auth/useAuth';

const tones = {
  DISMISSED: 'neutral',
  OPEN: 'warning',
  RESOLVED: 'success',
  UNDER_REVIEW: 'info',
} as const;
const readable = (value: string) =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/\b\w/gu, (letter) => letter.toUpperCase());

export function ModerationPage() {
  const { applicationUser } = useAuth();
  const [overview, setOverview] = useState<Awaited<
    ReturnType<typeof moderationApi.overview>
  > | null>(null);
  const [filters, setFilters] = useState({
    page: 1,
    reason: '',
    search: '',
    status: '',
    targetType: '',
  });
  const [reports, setReports] = useState<readonly ModerationReport[] | null>(null);
  const [pages, setPages] = useState(1);
  const [selected, setSelected] = useState<Awaited<ReturnType<typeof moderationApi.detail>> | null>(
    null,
  );
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const refresh = () =>
    Promise.all([moderationApi.overview(), moderationApi.list(filters)])
      .then(([nextOverview, queue]) => {
        setOverview(nextOverview);
        setReports(queue.reports);
        setPages(queue.pagination.totalPages);
        setError(null);
      })
      .catch(() => {
        setReports([]);
        setError('The moderation queue could not be loaded.');
      });
  useEffect(() => {
    let active = true;
    void Promise.all([moderationApi.overview(), moderationApi.list(filters)])
      .then(([nextOverview, queue]) => {
        if (!active) return;
        setOverview(nextOverview);
        setReports(queue.reports);
        setPages(queue.pagination.totalPages);
        setError(null);
      })
      .catch(() => {
        if (!active) return;
        setReports([]);
        setError('The moderation queue could not be loaded.');
      });
    return () => {
      active = false;
    };
  }, [filters]);
  const decide = async (status: Exclude<ReportStatus, 'OPEN'>) => {
    if (!selected || !note.trim()) return;
    try {
      await moderationApi.decide(selected.report.id, status, note);
      setSelected(null);
      setNote('');
      setReports(null);
      await refresh();
    } catch {
      setError('The decision could not be saved. Refresh before trying again.');
    }
  };
  const hideReportedContent = async () => {
    if (!selected || !note.trim() || applicationUser?.role !== 'ADMIN') return;
    try {
      await adminApi.enforceContent(
        selected.report.targetType,
        selected.report.targetId,
        'HIDDEN',
        note.trim(),
      );
      setError(null);
      setNote('');
    } catch {
      setError('The content could not be hidden. It may already be hidden or unavailable.');
    }
  };
  return (
    <div className="cc-page">
      <PageHeader
        description="Review student reports using minimal evidence and auditable decisions."
        eyebrow="Authorized workspace"
        title="Moderation"
      />
      <div className="mt-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          detail="Awaiting review"
          icon="warning"
          label="Pending"
          value={String(overview?.counts.open ?? '—')}
        />
        <StatCard
          detail="Assigned for review"
          icon="shield"
          label="Under review"
          tone="cyan"
          value={String(overview?.counts.underReview ?? '—')}
        />
        <StatCard
          detail="Violation reviewed"
          icon="check"
          label="Resolved"
          tone="emerald"
          value={String(overview?.counts.resolved ?? '—')}
        />
        <StatCard
          detail="No action required"
          icon="close"
          label="Dismissed"
          value={String(overview?.counts.dismissed ?? '—')}
        />
      </div>
      <Card className="cc-filter-panel mt-6 p-4 sm:p-5">
        <div className="cc-filter-grid md:grid-cols-2 xl:grid-cols-4">
          <input
            aria-label="Search reports"
            className="cc-field"
            onChange={(event) => {
              setReports(null);
              setFilters({ ...filters, page: 1, search: event.target.value });
            }}
            placeholder="Search report details"
            value={filters.search}
          />
          <select
            aria-label="Filter by status"
            className="cc-field"
            onChange={(event) => {
              setReports(null);
              setFilters({ ...filters, page: 1, status: event.target.value });
            }}
            value={filters.status}
          >
            <option value="">All statuses</option>
            {['OPEN', 'UNDER_REVIEW', 'RESOLVED', 'DISMISSED'].map((value) => (
              <option key={value} value={value}>
                {readable(value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by reason"
            className="cc-field"
            onChange={(event) => {
              setReports(null);
              setFilters({ ...filters, page: 1, reason: event.target.value });
            }}
            value={filters.reason}
          >
            <option value="">All reasons</option>
            {[
              'SPAM',
              'SCAM',
              'HARASSMENT',
              'INAPPROPRIATE_CONTENT',
              'FAKE_LISTING',
              'FAKE_PROFILE',
              'DUPLICATE',
              'OTHER',
            ].map((value) => (
              <option key={value} value={value}>
                {readable(value)}
              </option>
            ))}
          </select>
          <select
            aria-label="Filter by target type"
            className="cc-field"
            onChange={(event) => {
              setReports(null);
              setFilters({ ...filters, page: 1, targetType: event.target.value });
            }}
            value={filters.targetType}
          >
            <option value="">All content</option>
            {['MARKETPLACE', 'LOST_FOUND', 'TEAMUP', 'SERVICE', 'PROFILE'].map((value) => (
              <option key={value} value={value}>
                {readable(value)}
              </option>
            ))}
          </select>
        </div>
      </Card>
      {error ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {error}
        </p>
      ) : null}
      {reports === null ? (
        <Skeleton className="mt-6 h-72" />
      ) : reports.length === 0 ? (
        <Card className="mt-6">
          <EmptyState description="No reports match these filters." title="Queue is clear" />
        </Card>
      ) : (
        <Card className="mt-6 overflow-hidden">
          <div
            aria-label="Moderation reports table"
            className="cc-table-scroll"
            role="region"
            tabIndex={0}
          >
            <table className="w-full min-w-[48rem] text-left text-sm">
              <thead>
                <tr className="border-b border-white/[.08]">
                  <th className="p-4">Content</th>
                  <th className="p-4">Reason</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Created</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr className="border-b border-white/[.06]" key={report.id}>
                    <td className="p-4">{readable(report.targetType)}</td>
                    <td className="p-4">{readable(report.reason)}</td>
                    <td className="p-4">
                      <Badge tone={tones[report.status]}>{readable(report.status)}</Badge>
                    </td>
                    <td className="p-4">{new Date(report.createdAt).toLocaleDateString()}</td>
                    <td className="p-4">
                      <Button
                        onClick={() => void moderationApi.detail(report.id).then(setSelected)}
                        variant="secondary"
                      >
                        Review
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
      {pages > 1 ? (
        <div className="cc-pagination mt-5">
          <Button
            disabled={filters.page <= 1}
            onClick={() => {
              setReports(null);
              setFilters({ ...filters, page: filters.page - 1 });
            }}
            variant="secondary"
          >
            Previous
          </Button>
          <span className="self-center text-sm">
            Page {filters.page} of {pages}
          </span>
          <Button
            disabled={filters.page >= pages}
            onClick={() => {
              setReports(null);
              setFilters({ ...filters, page: filters.page + 1 });
            }}
            variant="secondary"
          >
            Next
          </Button>
        </div>
      ) : null}
      {selected ? (
        <Card className="mt-6 p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <h2 className="text-xl font-semibold">
                {selected.target?.title ?? 'Unavailable content'}
              </h2>
              <p className="mt-2 text-sm text-slate-400">
                {selected.target?.description ?? 'No public preview is available.'}
              </p>
            </div>
            <Button onClick={() => setSelected(null)} variant="secondary">
              Close
            </Button>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            {selected.safetySignals.map((signal) => (
              <Badge key={signal.code} tone="warning">
                {signal.explanation}
              </Badge>
            ))}
          </div>
          <p className="mt-4 text-sm">
            <strong>Student report:</strong>{' '}
            {selected.report.description ?? 'No additional description.'}
          </p>
          {selected.report.status === 'OPEN' || selected.report.status === 'UNDER_REVIEW' ? (
            <div className="mt-5">
              <label className="cc-label">
                Decision note
                <textarea
                  className="cc-field min-h-24"
                  maxLength={1000}
                  onChange={(event) => setNote(event.target.value)}
                  value={note}
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                {applicationUser?.role === 'ADMIN' ? (
                  <Button
                    disabled={!note.trim()}
                    onClick={() => void hideReportedContent()}
                    variant="danger"
                  >
                    Hide content (admin)
                  </Button>
                ) : null}
                <Button
                  disabled={!note.trim()}
                  onClick={() => void decide('UNDER_REVIEW')}
                  variant="secondary"
                >
                  Mark under review
                </Button>
                <Button
                  disabled={!note.trim()}
                  onClick={() => void decide('DISMISSED')}
                  variant="secondary"
                >
                  Dismiss report
                </Button>
                <Button
                  disabled={!note.trim()}
                  onClick={() => void decide('RESOLVED')}
                  variant="danger"
                >
                  Resolve violation
                </Button>
              </div>
            </div>
          ) : (
            <p className="mt-4 text-sm text-slate-500">
              Final decision: {selected.report.resolutionNote}
            </p>
          )}
        </Card>
      ) : null}
    </div>
  );
}
