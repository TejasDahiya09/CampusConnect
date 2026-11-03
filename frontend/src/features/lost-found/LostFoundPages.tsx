import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { FeaturedOnLandingField } from '../../components/FeaturedOnLandingField';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Modal,
  PageHeader,
  Skeleton,
  Toast,
} from '../../components/ui';
import { ApiClientError } from '../../services/api-client';
import { useAuth } from '../auth/useAuth';
import { LostFoundCard } from './LostFoundCard';
import { LostFoundImagePicker, LostFoundMediaManager } from './LostFoundMedia';
import { LostFoundDetailFeedback, LostFoundReportDetail } from './LostFoundReportDetail';
import { MatchCenter, PossibleMatchesPanel } from './LostFoundMatchExperience';
import { lostFoundApi } from './lost-found-service';
import { lostFoundCategories } from './lost-found-presentation';
import './lost-found.css';
import {
  canEditReport,
  canFindMatches,
  canReviewClaims,
  lostFoundFileKey,
  type ClaimStatus,
  type LostFoundClaim,
  type LostFoundDraft,
  type LostFoundReport,
  type LostFoundStatus,
  type LostFoundType,
} from './lost-found.types';

const categories = lostFoundCategories;
const messageFor = (error: unknown, fallback: string): string =>
  error instanceof ApiClientError || error instanceof Error ? error.message : fallback;
function ErrorBanner({
  message,
  retry,
}: {
  readonly message: string;
  readonly retry?: () => void;
}) {
  return (
    <div className="cc-alert cc-alert--danger mt-5 flex-wrap justify-between">
      <span>{message}</span>
      {retry ? (
        <Button onClick={retry} type="button" variant="secondary">
          Retry
        </Button>
      ) : null}
    </div>
  );
}

function ReportGridLoading() {
  return (
    <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
      {Array.from({ length: 6 }, (_, index) => (
        <Card className="overflow-hidden" key={index}>
          <Skeleton className="aspect-[16/8] rounded-none" />
          <div className="space-y-3 p-5">
            <Skeleton className="h-5 w-2/3" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        </Card>
      ))}
    </div>
  );
}

export { LostFoundPage } from './LostFoundBrowse';

function ReportForm({
  eligible = true,
  existingImageCount = 0,
  files,
  initial,
  lockType = false,
  onFilesChange,
  progress,
  submitLabel,
  onSubmit,
}: {
  readonly eligible?: boolean;
  readonly existingImageCount?: number;
  readonly files: readonly File[];
  readonly initial: LostFoundDraft;
  readonly lockType?: boolean;
  readonly onFilesChange: (files: readonly File[]) => void;
  readonly progress: Readonly<Record<string, number>>;
  readonly submitLabel: string;
  readonly onSubmit: (draft: LostFoundDraft) => Promise<void>;
}) {
  const [draft, setDraft] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (field: keyof LostFoundDraft, value: string | boolean) =>
    setDraft((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    void onSubmit(draft)
      .catch((reason: unknown) => setError(messageFor(reason, 'The report could not be saved.')))
      .finally(() => setSaving(false));
  };
  return (
    <form className="grid gap-5" onSubmit={submit}>
      {error ? <ErrorBanner message={error} /> : null}
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="cc-label">
          Report type
          <select
            className="cc-field"
            disabled={lockType}
            onChange={(event) => set('type', event.target.value)}
            value={draft.type}
          >
            <option value="LOST">Lost item</option>
            <option value="FOUND">Found item</option>
          </select>
        </label>
        <label className="cc-label">
          Category
          <input
            className="cc-field"
            list="report-categories"
            onChange={(event) => set('category', event.target.value)}
            required
            value={draft.category}
          />
          <datalist id="report-categories">
            {categories.map((category) => (
              <option key={category} value={category} />
            ))}
          </datalist>
        </label>
      </div>
      <label className="cc-label">
        Item title
        <input
          className="cc-field"
          maxLength={180}
          minLength={3}
          onChange={(event) => set('title', event.target.value)}
          required
          value={draft.title}
        />
      </label>
      <label className="cc-label">
        Description
        <textarea
          className="cc-field min-h-32 resize-y"
          maxLength={5000}
          minLength={10}
          onChange={(event) => set('description', event.target.value)}
          required
          value={draft.description}
        />
      </label>
      <div className="grid gap-5 sm:grid-cols-2">
        <label className="cc-label">
          Campus location
          <input
            className="cc-field"
            maxLength={180}
            minLength={2}
            onChange={(event) => set('location', event.target.value)}
            required
            value={draft.location}
          />
        </label>
        <label className="cc-label">
          Incident date
          <input
            className="cc-field"
            onChange={(event) => set('incidentDate', event.target.value)}
            required
            type="date"
            value={draft.incidentDate}
          />
        </label>
      </div>
      <LostFoundImagePicker
        disabled={saving}
        existingCount={existingImageCount}
        files={files}
        onChange={onFilesChange}
        progress={progress}
      />
      <FeaturedOnLandingField
        disabled={saving}
        eligible={eligible}
        lostFound
        onChange={(value) => set('featuredOnLanding', value)}
        value={draft.featuredOnLanding}
      />
      <div className="flex justify-end gap-2">
        <Link className="cc-button cc-button--ghost" to="/lost-found">
          Cancel
        </Link>
        <Button disabled={saving} type="submit">
          {saving ? 'Saving…' : submitLabel}
        </Button>
      </div>
    </form>
  );
}

export function LostFoundCreatePage() {
  const navigate = useNavigate();
  const [search] = useSearchParams();
  const [success, setSuccess] = useState(false);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [progress, setProgress] = useState<Readonly<Record<string, number>>>({});
  const [createdReportId, setCreatedReportId] = useState<string | null>(null);
  const type: LostFoundType = search.get('type') === 'found' ? 'FOUND' : 'LOST';
  return (
    <div className="cc-page max-w-3xl">
      <Link className="cc-auth-link inline-flex" to="/lost-found">
        ← Back to Lost & Found
      </Link>
      <PageHeader
        description="Provide precise details so other students can identify the item."
        eyebrow="New report"
        title={`Report a ${type.toLowerCase()} item`}
      />
      <Card className="mt-6 p-5 sm:p-7">
        <ReportForm
          files={files}
          initial={{
            category: '',
            description: '',
            featuredOnLanding: false,
            incidentDate: '',
            location: '',
            title: '',
            type,
          }}
          onFilesChange={setFiles}
          onSubmit={async (draft) => {
            const reportId = createdReportId ?? (await lostFoundApi.createReport(draft)).id;
            setCreatedReportId(reportId);
            for (const file of files) {
              const key = lostFoundFileKey(file);
              await lostFoundApi.uploadMedia(reportId, file, (percentage) =>
                setProgress((current) => ({ ...current, [key]: percentage })),
              );
              setFiles((current) =>
                current.filter((candidate) => lostFoundFileKey(candidate) !== key),
              );
            }
            setSuccess(true);
            window.setTimeout(() => void navigate(`/lost-found/${reportId}`), 500);
          }}
          progress={progress}
          submitLabel="Publish report"
        />
      </Card>
      {success ? <Toast message="Report published successfully." /> : null}
    </div>
  );
}

export function LostFoundEditPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const { applicationUser } = useAuth();
  const [report, setReport] = useState<LostFoundReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<readonly File[]>([]);
  const [progress, setProgress] = useState<Readonly<Record<string, number>>>({});
  useEffect(() => {
    let active = true;
    void lostFoundApi
      .getReport(id)
      .then((value) => {
        if (active) setReport(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(messageFor(reason, 'The report could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [id]);
  if (error)
    return (
      <div className="cc-page">
        <ErrorBanner message={error} />
      </div>
    );
  if (!report)
    return (
      <div className="cc-page">
        <ReportGridLoading />
      </div>
    );
  const viewer = applicationUser ? { id: applicationUser.id, role: applicationUser.role } : null;
  if (!canEditReport(report, viewer))
    return (
      <div className="cc-page">
        <Card>
          <EmptyState
            description="Only the reporter can edit an open or matched report."
            title="Report is not editable"
          />
        </Card>
      </div>
    );
  if (typeof report.featuredOnLanding !== 'boolean')
    return (
      <div className="cc-page">
        <ErrorBanner message="This owner response is missing the Featured Posts consent value. Editing is disabled to avoid changing your consent unintentionally." />
      </div>
    );
  const initial: LostFoundDraft = {
    category: report.category ?? '',
    description: report.description,
    featuredOnLanding: report.featuredOnLanding,
    incidentDate: report.incidentDate ?? '',
    location: report.location ?? '',
    title: report.title,
    type: report.type,
  };
  return (
    <div className="cc-page max-w-3xl">
      <PageHeader
        description="Update the public report details. Status changes remain separate."
        eyebrow="Your report"
        title="Edit report"
      />
      <Card className="mt-6 p-5 sm:p-7">
        <LostFoundMediaManager
          disabled={false}
          media={report.images}
          onChange={(images) => setReport({ ...report, images })}
          onError={setError}
          reportId={report.id}
        />
        <ReportForm
          eligible={report.status === 'OPEN'}
          existingImageCount={report.images.length}
          files={files}
          initial={initial}
          lockType
          onFilesChange={setFiles}
          onSubmit={async ({ type: _type, ...draft }) => {
            await lostFoundApi.updateReport(id, draft);
            for (const file of files) {
              const key = lostFoundFileKey(file);
              await lostFoundApi.uploadMedia(id, file, (percentage) =>
                setProgress((current) => ({ ...current, [key]: percentage })),
              );
              setFiles((current) =>
                current.filter((candidate) => lostFoundFileKey(candidate) !== key),
              );
            }
            void navigate(`/lost-found/${id}`);
          }}
          progress={progress}
          submitLabel="Save changes"
        />
      </Card>
    </div>
  );
}

function ClaimPanel({ report }: { readonly report: LostFoundReport }) {
  const { applicationUser } = useAuth();
  const viewer = applicationUser ? { id: applicationUser.id, role: applicationUser.role } : null;
  const [claims, setClaims] = useState<readonly LostFoundClaim[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [restricted, setRestricted] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [modal, setModal] = useState(false);
  const [message, setMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const closeClaim = useCallback(() => {
    if (!submitting) setModal(false);
  }, [submitting, setModal]);
  const refresh = () => {
    setLoading(true);
    setLoadError(null);
    setRestricted(false);
    setError(null);
    setAttempt((value) => value + 1);
  };
  useEffect(() => {
    let active = true;
    const controller = new AbortController();
    const timeout = window.setTimeout(() => {
      if (!active) return;
      active = false;
      controller.abort();
      setLoadError('Claims took too long to load. Please retry.');
      setLoading(false);
    }, 12000);
    void lostFoundApi
      .getClaims(report.id, controller.signal)
      .then((value) => {
        if (active) setClaims(value);
      })
      .catch((reason: unknown) => {
        if (!active) return;
        const denied = reason instanceof ApiClientError && [401, 403].includes(reason.status);
        setRestricted(denied);
        setLoadError(
          denied
            ? 'Claims are unavailable to this account.'
            : messageFor(reason, 'Claims could not be loaded.'),
        );
      })
      .finally(() => {
        window.clearTimeout(timeout);
        if (active) setLoading(false);
      });
    return () => {
      active = false;
      window.clearTimeout(timeout);
      controller.abort();
    };
  }, [report.id, attempt]);
  const pendingOwnClaim = claims.find(
    (claim) => claim.claimantId === applicationUser?.id && claim.status === 'PENDING',
  );
  const eligible =
    applicationUser?.status === 'ACTIVE' &&
    applicationUser?.id !== report.reporterId &&
    (report.status === 'OPEN' || report.status === 'MATCHED');
  const review = (claimId: string, status: Extract<ClaimStatus, 'APPROVED' | 'REJECTED'>) =>
    lostFoundApi
      .reviewClaim(report.id, claimId, status)
      .then(refresh)
      .catch((reason: unknown) => setError(messageFor(reason, 'The claim could not be reviewed.')));
  return (
    <section className="cc-lf-recovery" aria-label="Private claims" aria-busy={loading}>
      <header>
        <div>
          <h2 className="font-semibold text-[var(--cc-text)]">Claims</h2>
          <p className="cc-lf-claim-intro">
            Private claim details are visible only to authorized participants.
          </p>
        </div>
        {eligible && !pendingOwnClaim && !loading && !loadError ? (
          <Button onClick={() => setModal(true)} type="button">
            Submit claim
          </Button>
        ) : null}
      </header>
      {error ? (
        <p className="cc-lf-error" role="alert">
          {error}
        </p>
      ) : null}
      {loading ? (
        <div className="cc-lf-claim-loading" role="status">
          <span>Loading your permitted claims…</span>
          <Skeleton className="cc-lf-claim-skeleton" />
        </div>
      ) : loadError ? (
        <div className="cc-lf-claim-feedback" role={restricted ? 'status' : 'alert'}>
          <p>{loadError}</p>
          {!restricted ? (
            <Button variant="secondary" onClick={refresh}>
              Retry claims
            </Button>
          ) : null}
        </div>
      ) : claims.length === 0 ? (
        <p className="cc-lf-claim-empty">No claims available to you.</p>
      ) : (
        <div className="cc-lf-claim-list">
          {claims.map((claim) => (
            <div
              className="rounded-[var(--cc-radius-md)] border border-[var(--cc-border)] bg-[var(--cc-panel-muted)] p-4"
              key={claim.id}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge
                  tone={
                    claim.status === 'APPROVED'
                      ? 'success'
                      : claim.status === 'REJECTED'
                        ? 'danger'
                        : 'neutral'
                  }
                >
                  {claim.status}
                </Badge>
                <span className="text-xs text-[var(--cc-subtle)]">
                  {new Date(claim.createdAt).toLocaleString()}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap text-sm text-[var(--cc-text-soft)]">
                {claim.message}
              </p>
              {claim.status === 'PENDING' &&
              (canReviewClaims(report, viewer) || claim.claimantId === applicationUser?.id) ? (
                <div className="mt-3 flex flex-wrap gap-2">
                  {canReviewClaims(report, viewer) && claim.status === 'PENDING' ? (
                    <>
                      <Button onClick={() => void review(claim.id, 'APPROVED')} type="button">
                        Approve
                      </Button>
                      <Button
                        onClick={() => void review(claim.id, 'REJECTED')}
                        type="button"
                        variant="danger"
                      >
                        Reject
                      </Button>
                    </>
                  ) : null}
                  {claim.claimantId === applicationUser?.id && claim.status === 'PENDING' ? (
                    <Button
                      onClick={() =>
                        void lostFoundApi
                          .cancelClaim(report.id, claim.id)
                          .then(refresh)
                          .catch((reason: unknown) =>
                            setError(messageFor(reason, 'The claim could not be cancelled.')),
                          )
                      }
                      type="button"
                      variant="secondary"
                    >
                      Cancel claim
                    </Button>
                  ) : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
      )}
      <Modal
        description="Provide details only the rightful owner or finder would know."
        onClose={closeClaim}
        open={modal}
        title="Submit a claim"
      >
        <textarea
          aria-label="Private identifying details"
          className="cc-field min-h-28 resize-y"
          maxLength={2000}
          minLength={10}
          onChange={(event) => setMessage(event.target.value)}
          placeholder="Identifying marks, contents, or where you last saw the item…"
          value={message}
        />
        {error ? (
          <p className="cc-lf-error" role="alert">
            {error}
          </p>
        ) : null}
        <div className="mt-4 flex justify-end gap-2">
          <Button
            disabled={submitting}
            onClick={() => setModal(false)}
            type="button"
            variant="ghost"
          >
            Cancel
          </Button>
          <Button
            disabled={submitting || message.trim().length < 10}
            loading={submitting}
            onClick={() => {
              setSubmitting(true);
              void lostFoundApi
                .submitClaim(report.id, message)
                .then(() => {
                  setMessage('');
                  setModal(false);
                  return refresh();
                })
                .catch((reason: unknown) =>
                  setError(messageFor(reason, 'The claim could not be submitted.')),
                )
                .finally(() => setSubmitting(false));
            }}
            type="button"
          >
            Submit claim
          </Button>
        </div>
      </Modal>
    </section>
  );
}

export function LostFoundDetailPage() {
  const { id = '' } = useParams();
  const { applicationUser } = useAuth();
  const [report, setReport] = useState<LostFoundReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void lostFoundApi
      .getReport(id)
      .then(async (value) => {
        const bookmarked =
          value.status === 'ARCHIVED' || value.status === 'REMOVED'
            ? value.isBookmarked
            : await lostFoundApi.getBookmarkState(id);
        if (active) setReport({ ...value, isBookmarked: bookmarked });
      })
      .catch((reason: unknown) => {
        if (active) setError(messageFor(reason, 'The report could not be loaded.'));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [id, retry]);
  if (loading) return <LostFoundDetailFeedback loading onRetry={() => undefined} />;
  if (!report)
    return (
      <LostFoundDetailFeedback
        error={error ?? undefined}
        onRetry={() => {
          setLoading(true);
          setError(null);
          setRetry((value) => value + 1);
        }}
      />
    );
  const viewer = applicationUser ? { id: applicationUser.id, role: applicationUser.role } : null;
  const transition = (status: LostFoundStatus) => {
    setSaving(true);
    setError(null);
    void lostFoundApi
      .transitionReport(report.id, status)
      .then(setReport)
      .catch((reason: unknown) => setError(messageFor(reason, 'The status could not be updated.')))
      .finally(() => setSaving(false));
  };
  return (
    <LostFoundReportDetail
      report={report}
      viewer={viewer}
      saving={saving}
      error={error}
      onStatus={transition}
      onBookmark={(isBookmarked) => setReport({ ...report, isBookmarked })}
      recovery={
        <ClaimPanel
          key={`${report.id}:${applicationUser?.id}:${applicationUser?.role}`}
          report={report}
        />
      }
      matches={canFindMatches(report, viewer) ? <PossibleMatchesPanel source={report} /> : null}
    />
  );
}

export function LostFoundSavedPage() {
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof lostFoundApi.getSavedReports>
  > | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    void lostFoundApi
      .getSavedReports(page, 12)
      .then((value) => {
        if (active) setResult(value);
      })
      .catch((reason: unknown) => {
        if (active) setError(messageFor(reason, 'Saved reports could not be loaded.'));
      });
    return () => {
      active = false;
    };
  }, [page, retry]);
  return (
    <div className="cc-page">
      <PageHeader
        actions={
          <Link className="cc-button cc-button--secondary" to="/lost-found">
            Browse reports
          </Link>
        }
        description="Reports you bookmarked for later review."
        title="Saved Lost & Found reports"
      />
      {error ? (
        <ErrorBanner
          message={error}
          retry={() => {
            setResult(null);
            setError(null);
            setRetry((value) => value + 1);
          }}
        />
      ) : null}
      {!result ? (
        <ReportGridLoading />
      ) : result.reports.length ? (
        <div className="mt-6 grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
          {result.reports.map((report) => (
            <LostFoundCard key={report.id} report={report} />
          ))}
        </div>
      ) : (
        <Card className="mt-6">
          <EmptyState description="Bookmark a report to find it here." title="No saved reports" />
        </Card>
      )}
      {result && result.pagination.totalPages > 1 ? (
        <div className="mt-8 flex justify-center gap-3">
          <Button
            disabled={page === 1}
            onClick={() => {
              setResult(null);
              setPage((value) => value - 1);
            }}
            type="button"
            variant="secondary"
          >
            Previous
          </Button>
          <Button
            disabled={page >= result.pagination.totalPages}
            onClick={() => {
              setResult(null);
              setPage((value) => value + 1);
            }}
            type="button"
            variant="secondary"
          >
            Next
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function LostFoundMatchesPage() {
  const { applicationUser } = useAuth();
  const viewer = applicationUser ? { id: applicationUser.id, role: applicationUser.role } : null;
  return (
    <div className="cc-page">
      <PageHeader
        actions={
          <Link className="cc-button cc-button--secondary" to="/lost-found">
            Browse Lost & Found
          </Link>
        }
        description="Select one of your reports to compare it with relevant opposite-type reports."
        eyebrow="AI-assisted suggestions"
        title="Possible matches"
      />
      {viewer ? <MatchCenter viewer={viewer} /> : null}
    </div>
  );
}
