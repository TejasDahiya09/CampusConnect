import { StudentAvatar } from '../students/StudentAvatar';
import { safePhoto } from '../profile/profile-avatar-value';
import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Modal } from '../../components/ui';
import { ShareActions } from '../share/ShareActions';
import { ReportAction } from '../moderation/ReportAction';
import { LostFoundBookmarkButton } from './LostFoundBookmarkButton';
import { LostFoundReportGallery } from './LostFoundReportGallery';
import {
  canEditReport,
  nextStatuses,
  type LostFoundReport,
  type LostFoundStatus,
  type LostFoundViewer,
} from './lost-found.types';
import { reportDate, reportLabel } from './lost-found-presentation';

export function LostFoundReportDetail({
  report,
  viewer,
  saving,
  error,
  onStatus,
  onBookmark,
  recovery,
  matches,
}: {
  readonly report: LostFoundReport;
  readonly viewer: LostFoundViewer | null;
  readonly saving: boolean;
  readonly error: string | null;
  readonly onStatus: (status: LostFoundStatus) => void;
  readonly onBookmark: (saved: boolean) => void;
  readonly recovery: ReactNode;
  readonly matches: ReactNode;
}) {
  const [shareOpen, setShareOpen] = useState(false);
  const owned = viewer?.id === report.reporterId;
  const initials =
    report.reporter.displayName
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((name) => name[0])
      .join('')
      .toUpperCase() || 'S';
  return (
    <div className="cc-page cc-lf-detail">
      <nav className="cc-lf-breadcrumb" aria-label="Report navigation">
        <Link to="/lost-found">
          <Icon name="chevron" />
          Lost &amp; Found
        </Link>
        {report.category ? (
          <>
            <span aria-hidden="true">/</span>
            <Link to={`/lost-found?category=${encodeURIComponent(report.category)}`}>
              {report.category}
            </Link>
          </>
        ) : null}
        <span aria-hidden="true">/</span>
        <span aria-current="page">{report.title}</span>
      </nav>
      {error ? (
        <p className="cc-alert cc-alert--danger" role="alert">
          {error}
        </p>
      ) : null}
      <div className="cc-lf-detail-workspace">
        <LostFoundReportGallery key={report.id} images={report.images} title={report.title} />
        <section className="cc-lf-summary" aria-labelledby="lf-report-title">
          <p className={`cc-lf-type cc-lf-type--${report.type.toLowerCase()}`}>
            {report.type === 'LOST' ? 'Lost item' : 'Found item'}
          </p>
          <h1 id="lf-report-title">{report.title}</h1>
          <div className="cc-lf-summary-meta">
            <span className="cc-lf-report-status" data-status={report.status}>
              {reportLabel(report.status)}
            </span>
            <span>{report.category ?? 'Category not shared'}</span>
          </div>
          {report.status === 'RESOLVED' ? (
            <p className="cc-lf-lifecycle-note">
              This report has been resolved. New claims are unavailable.
            </p>
          ) : report.status === 'ARCHIVED' || report.status === 'REMOVED' ? (
            <p className="cc-lf-lifecycle-note">
              This report is {reportLabel(report.status).toLowerCase()} and is no longer in public
              discovery.
            </p>
          ) : null}
          <div className="cc-lf-detail-actions" role="group" aria-label="Report actions">
            {report.status !== 'ARCHIVED' && report.status !== 'REMOVED' ? (
              <LostFoundBookmarkButton
                key={report.id}
                presentation="detail"
                initialBookmarked={report.isBookmarked}
                reportId={report.id}
                onChange={onBookmark}
              />
            ) : null}
            <Button variant="secondary" icon="share" onClick={() => setShareOpen(true)}>
              Share
            </Button>
            {!owned ? (
              <div className="cc-lf-report-abuse">
                <ReportAction targetId={report.id} targetType="LOST_FOUND" />
              </div>
            ) : null}
          </div>
          <section className="cc-lf-information" aria-label="About this report">
            <section className="cc-lf-about" aria-labelledby="lf-about-heading">
              <h2 id="lf-about-heading">About this item</h2>
              <p>
                {report.description.trim()
                  ? report.description
                  : 'The reporter has not added a description.'}
              </p>
            </section>
            <div className="cc-lf-information-facts">
              <section>
                <h2>Item details</h2>
                <dl className="cc-lf-facts">
                  <div>
                    <dt>Type</dt>
                    <dd>{reportLabel(report.type)}</dd>
                  </div>
                  <div>
                    <dt>Category</dt>
                    <dd>{report.category ?? 'Not shared'}</dd>
                  </div>
                  <div>
                    <dt>Status</dt>
                    <dd>{reportLabel(report.status)}</dd>
                  </div>
                </dl>
              </section>
              <section>
                <h2>Location &amp; timing</h2>
                <dl className="cc-lf-facts">
                  <div>
                    <dt>Location</dt>
                    <dd>{report.location ?? 'Not shared'}</dd>
                  </div>
                  <div>
                    <dt>{report.type === 'LOST' ? 'Lost on' : 'Found on'}</dt>
                    <dd>{reportDate(report.incidentDate, true)}</dd>
                  </div>
                  <div>
                    <dt>Reported</dt>
                    <dd>{reportDate(report.createdAt)}</dd>
                  </div>
                  {report.resolvedAt ? (
                    <div>
                      <dt>Resolved</dt>
                      <dd>{reportDate(report.resolvedAt)}</dd>
                    </div>
                  ) : null}
                </dl>
              </section>
            </div>
          </section>
        </section>
        <aside className="cc-lf-support">
          <section className="cc-lf-reporter" aria-labelledby="lf-reporter-heading">
            <h2 id="lf-reporter-heading">{owned ? 'Your report' : 'Reported by'}</h2>
            <div className="cc-lf-reporter-identity">
              <span className="cc-lf-avatar" aria-hidden="true">
                {safePhoto(report.reporter.avatar) ? (
                  <StudentAvatar
                    avatar={report.reporter.avatar}
                    displayName={report.reporter.displayName}
                  />
                ) : (
                  initials
                )}
              </span>
              <div>
                <strong>{report.reporter.displayName}</strong>
                {report.reporter.department ? <span>{report.reporter.department}</span> : null}
              </div>
            </div>
            {canEditReport(report, viewer) ? (
              <Link
                className="cc-button cc-button--secondary cc-lf-edit"
                to={`/lost-found/${report.id}/edit`}
              >
                Edit report
              </Link>
            ) : null}
            {owned && nextStatuses[report.status].length ? (
              <div className="cc-lf-owner-status">
                <h3>Update status</h3>
                <div>
                  {nextStatuses[report.status].map((status) => (
                    <Button
                      key={status}
                      variant={status === 'REMOVED' ? 'danger' : 'secondary'}
                      disabled={saving}
                      onClick={() => onStatus(status)}
                    >
                      {reportLabel(status)}
                    </Button>
                  ))}
                </div>
              </div>
            ) : null}
            {recovery}
          </section>
          <section className="cc-lf-safety">
            <h2>
              <Icon name="shield" />
              Stay safe
            </h2>
            <ul>
              <li>Arrange exchanges in public campus spaces.</li>
              <li>Verify ownership before handing over belongings.</li>
              <li>Keep identifying details in the private claim workflow.</li>
            </ul>
          </section>
        </aside>
      </div>
      {matches}
      {report.category ? (
        <Link
          className="cc-lf-related"
          to={`/lost-found?category=${encodeURIComponent(report.category)}`}
        >
          Explore more in {report.category}
          <Icon name="arrow" />
        </Link>
      ) : null}
      <Modal open={shareOpen} onClose={() => setShareOpen(false)} title="Share this report">
        <ShareActions
          includeRecordUrl
          record={{
            module: 'LOST_FOUND',
            id: report.id,
            title: report.title,
            description: report.description,
            category: report.category,
            location: report.location,
            status: reportLabel(report.status),
            type: report.type,
          }}
        />
      </Modal>
    </div>
  );
}

export function LostFoundDetailFeedback({
  loading,
  error,
  onRetry,
}: {
  readonly loading?: boolean;
  readonly error?: string;
  readonly onRetry: () => void;
}) {
  return (
    <div className="cc-page cc-lf-detail">
      <Link className="cc-lf-back" to="/lost-found">
        <Icon name="chevron" />
        Back to Lost &amp; Found
      </Link>
      {loading ? (
        <div className="cc-lf-detail-loading" role="status">
          <span className="sr-only">Loading report</span>
          <div className="cc-skeleton" />
          <div>
            <div className="cc-skeleton" />
            <div className="cc-skeleton" />
          </div>
        </div>
      ) : (
        <section className="cc-lf-feedback" role="alert">
          <Icon name="search" />
          <h1>Report unavailable</h1>
          <p>{error ?? 'This report could not be found or you may not have access to it.'}</p>
          <Button variant="secondary" onClick={onRetry}>
            Retry report
          </Button>
        </section>
      )}
    </div>
  );
}
