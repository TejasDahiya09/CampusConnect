import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Skeleton } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { lostFoundApi } from './lost-found-service';
import {
  confidenceLabel,
  confidenceTone,
  matchingErrorMessage,
  matchPrompt,
  partitionMatches,
} from './lost-found-matching';
import {
  canFindMatches,
  reportImageUrl,
  type LostFoundMatch,
  type LostFoundReport,
  type LostFoundViewer,
} from './lost-found.types';

const date = (value: string | null): string =>
  value === null
    ? 'Date not shared'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${value}T00:00:00.000Z`),
      );

function MatchCard({ match }: { readonly match: LostFoundMatch }) {
  const image = match.report.images.find((candidate) => reportImageUrl(candidate) !== null);
  const imageUrl = image === undefined ? null : reportImageUrl(image);
  return (
    <Card className="overflow-hidden p-0">
      <div className="grid gap-4 p-4 sm:grid-cols-[8rem_minmax(0,1fr)] sm:p-5">
        <div className="grid aspect-[16/10] place-items-center overflow-hidden rounded-[var(--cc-radius-md)] bg-[var(--cc-panel-muted)]">
          {imageUrl ? (
            <img alt={match.report.title} className="size-full object-cover" src={imageUrl} />
          ) : (
            <Icon className="size-8 text-[var(--cc-subtle)]" name="search" />
          )}
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={confidenceTone(match.confidence)}>
              {confidenceLabel(match.confidence)}
            </Badge>
            <Badge tone={match.report.type === 'LOST' ? 'danger' : 'success'}>
              {match.report.type}
            </Badge>
          </div>
          <h3 className="mt-3 text-base font-semibold text-[var(--cc-text)]">
            {match.report.title}
          </h3>
          <p className="mt-2 text-sm text-[var(--cc-muted)]">
            {match.report.category ?? 'Category not shared'} ·{' '}
            {match.report.location ?? 'Location not shared'} · {date(match.report.incidentDate)}
          </p>
          {match.reasons.length ? (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cc-muted)]">
                Why this matched
              </p>
              <ul className="mt-2 grid gap-1 text-sm text-[var(--cc-text-soft)]">
                {match.reasons.map((reason) => (
                  <li className="flex gap-2" key={reason}>
                    <Icon
                      className="mt-0.5 size-4 shrink-0 text-[var(--cc-success)]"
                      name="check"
                    />
                    <span>{reason}</span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          <Link
            className="cc-button cc-button--secondary mt-4"
            to={`/lost-found/${match.report.id}`}
          >
            View report
          </Link>
        </div>
      </div>
    </Card>
  );
}

function MatchLoading() {
  return (
    <div aria-live="polite" className="mt-5 grid gap-4" role="status">
      <p className="text-sm text-[var(--cc-muted)]">Finding possible matches…</p>
      <Skeleton className="h-44" />
      <Skeleton className="h-44" />
    </div>
  );
}

export function PossibleMatchesPanel({ source }: { readonly source: LostFoundReport }) {
  const [matches, setMatches] = useState<ReturnType<typeof partitionMatches> | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const controllerRef = useRef<AbortController | null>(null);
  const requestIdRef = useRef(0);

  const findMatches = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    const requestId = requestIdRef.current + 1;
    controllerRef.current = controller;
    requestIdRef.current = requestId;
    setError(null);
    setLoading(true);
    void lostFoundApi
      .getMatches(source.id, controller.signal)
      .then((response) => {
        if (!controller.signal.aborted && requestIdRef.current === requestId) {
          setMatches(partitionMatches(response));
        }
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted && requestIdRef.current === requestId)
          setError(matchingErrorMessage(reason));
      })
      .finally(() => {
        if (!controller.signal.aborted && requestIdRef.current === requestId) setLoading(false);
      });
  };

  useEffect(() => () => controllerRef.current?.abort(), []);

  return (
    <Card className="mt-6 p-5 sm:p-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <Icon className="size-5 text-[var(--cc-primary)]" name="sparkles" />
            <h2 className="text-lg font-semibold text-[var(--cc-text)]">Possible matches</h2>
          </div>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--cc-muted)]">
            {matchPrompt(source)}
          </p>
          <p className="mt-2 text-xs leading-5 text-[var(--cc-subtle)]">
            AI-assisted matching suggests possibilities. Review each report before submitting a
            claim.
          </p>
        </div>
        {matches ? (
          <Button disabled={loading} onClick={findMatches} type="button" variant="secondary">
            Refresh matches
          </Button>
        ) : (
          <Button disabled={loading} onClick={findMatches} type="button">
            Find possible matches
          </Button>
        )}
      </div>

      {loading ? <MatchLoading /> : null}
      {!loading && error ? (
        <div className="mt-5 rounded-xl border border-rose-300/20 bg-rose-300/10 p-4">
          <p className="text-sm text-[var(--cc-danger)]" role="alert">
            {error}
          </p>
          <div className="mt-4 flex flex-wrap gap-2">
            <Button onClick={findMatches} type="button" variant="secondary">
              Try again
            </Button>
            <Link className="cc-button cc-button--secondary" to="/lost-found">
              Browse Lost & Found
            </Link>
          </div>
        </div>
      ) : null}
      {!loading && !error && matches ? (
        <div className="mt-6">
          {!matches.primary.length ? (
            <EmptyState
              action={
                <Link className="cc-button cc-button--secondary" to="/lost-found">
                  Browse Lost & Found
                </Link>
              }
              description="Try again later as more reports are added, or browse Lost & Found manually."
              icon="search"
              title="No strong matches found yet"
            />
          ) : (
            <div className="grid gap-4">
              {matches.primary.map((match) => (
                <MatchCard key={match.report.id} match={match} />
              ))}
            </div>
          )}
        </div>
      ) : null}
    </Card>
  );
}

export function MatchCenter({ viewer }: { readonly viewer: LostFoundViewer }) {
  const [reports, setReports] = useState<readonly LostFoundReport[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [selectedReport, setSelectedReport] = useState<LostFoundReport | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void lostFoundApi
      .getMyReports(controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setReports(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Your Lost & Found reports could not be loaded.');
      });
    return () => controller.abort();
  }, []);

  if (error)
    return (
      <Card className="mt-6">
        <EmptyState
          action={
            <Link className="cc-button cc-button--secondary" to="/lost-found">
              Browse Lost & Found
            </Link>
          }
          description={error}
          title="Reports unavailable"
        />
      </Card>
    );

  if (reports === null)
    return (
      <div className="mt-6 grid gap-4">
        <Skeleton className="h-28" />
        <Skeleton className="h-28" />
      </div>
    );

  if (!reports.length)
    return (
      <Card className="mt-6">
        <EmptyState
          action={
            <div className="flex flex-wrap justify-center gap-2">
              <Link className="cc-button cc-button--primary" to="/lost-found/new?type=lost">
                Report lost item
              </Link>
              <Link className="cc-button cc-button--secondary" to="/lost-found/new?type=found">
                Report found item
              </Link>
            </div>
          }
          description="Create a Lost or Found report first, then return here to look for possible matches."
          title="You don't have any Lost & Found reports yet"
        />
      </Card>
    );

  const eligibleReports = reports.filter((report) => canFindMatches(report, viewer));
  return (
    <div className="mt-6 grid gap-6">
      {!eligibleReports.length ? (
        <Card>
          <EmptyState
            description="Your current reports are resolved or no longer eligible for matching."
            title="No reports are ready for matching"
          />
        </Card>
      ) : (
        <Card className="p-5 sm:p-6">
          <h2 className="text-lg font-semibold text-[var(--cc-text)]">My reports</h2>
          <p className="mt-2 text-sm text-[var(--cc-muted)]">
            Select one of your active reports to look for potential matches. Results are
            suggestions, not ownership verification.
          </p>
          <div className="mt-5 grid gap-3">
            {eligibleReports.map((report) => (
              <div
                className="flex flex-col gap-4 rounded-[var(--cc-radius-md)] border border-[var(--cc-border)] bg-[var(--cc-panel-muted)] p-4 sm:flex-row sm:items-center sm:justify-between"
                key={report.id}
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap gap-2">
                    <Badge tone={report.type === 'LOST' ? 'danger' : 'success'}>
                      {report.type}
                    </Badge>
                    <Badge tone="neutral">{report.status}</Badge>
                  </div>
                  <h3 className="mt-2 truncate font-semibold text-[var(--cc-text)]">
                    {report.title}
                  </h3>
                  <p className="mt-1 text-sm text-[var(--cc-muted)]">
                    {report.location ?? 'Location not shared'} · {date(report.incidentDate)}
                  </p>
                </div>
                <Button onClick={() => setSelectedReport(report)} type="button">
                  Select report
                </Button>
              </div>
            ))}
          </div>
        </Card>
      )}
      {selectedReport ? (
        <div>
          <Card className="border-indigo-300/20 bg-indigo-400/[.05] p-5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--cc-primary)]">
              Finding matches for
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Badge tone={selectedReport.type === 'LOST' ? 'danger' : 'success'}>
                {selectedReport.type}
              </Badge>
              <h2 className="font-semibold text-[var(--cc-text)]">{selectedReport.title}</h2>
              <span className="text-sm text-[var(--cc-muted)]">
                {selectedReport.location ?? 'Location not shared'} ·{' '}
                {date(selectedReport.incidentDate)}
              </span>
            </div>
          </Card>
          <PossibleMatchesPanel key={selectedReport.id} source={selectedReport} />
        </div>
      ) : null}
    </div>
  );
}
