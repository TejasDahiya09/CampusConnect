import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Badge } from '../../components/ui';
import { Icon } from '../../components/Icon';
import { reportImageUrl, type LostFoundReport } from './lost-found.types';
import { LostFoundReportImage } from './LostFoundPhoto';
import { LostFoundBookmarkButton } from './LostFoundBookmarkButton';
import { reportDate, reportLabel } from './lost-found-presentation';
import { formatShareMessage, whatsappShareUrl } from '../share/share';

const date = (value: string | null): string =>
  value === null
    ? 'Date not shared'
    : new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeZone: 'UTC' }).format(
        new Date(`${value}T00:00:00.000Z`),
      );

export function LostFoundCard({
  report,
  variant = 'default',
}: {
  readonly report: LostFoundReport;
  readonly variant?: 'default' | 'discovery';
}) {
  const [imageFailed, setImageFailed] = useState(false);
  const image = report.images.find((candidate) => reportImageUrl(candidate) !== null);
  const imageUrl = image === undefined ? null : reportImageUrl(image);
  if (variant === 'discovery')
    return (
      <article className="cc-lf-report-card" data-report-id={report.id}>
        <Link
          className="cc-lf-report-link"
          to={`/lost-found/${report.id}`}
          aria-label={report.title}
        >
          <div className="cc-lf-report-media">
            <LostFoundReportImage images={report.images} title={report.title} />
          </div>
          <div className="cc-lf-report-body">
            <span className={`cc-lf-type cc-lf-type--${report.type.toLowerCase()}`}>
              {report.type === 'LOST' ? 'Lost item' : 'Found item'}
            </span>
            <h3 title={report.title}>{report.title}</h3>
            <p className="cc-lf-card-location" title={report.location ?? 'Location not shared'}>
              {report.location ?? 'Location not shared'}
            </p>
            <p className="cc-lf-card-date">Reported {reportDate(report.createdAt)}</p>
          </div>
        </Link>
        <div className="cc-lf-card-save">
          <LostFoundBookmarkButton
            presentation="compact"
            initialBookmarked={report.isBookmarked}
            reportId={report.id}
            onChange={() => undefined}
          />
        </div>
        <footer className="cc-lf-report-footer">
          <span className="cc-lf-report-status" data-status={report.status}>
            {reportLabel(report.status)}
          </span>
          <a
            className="cc-lf-share-link"
            target="_blank"
            rel="noreferrer"
            aria-label={`Share ${report.title} on WhatsApp`}
            href={whatsappShareUrl(
              formatShareMessage({
                module: 'LOST_FOUND',
                id: report.id,
                title: report.title,
                description: report.description,
                category: report.category,
                location: report.location,
                type: report.type,
                status: reportLabel(report.status),
              }),
            )}
          >
            <Icon name="whatsapp" />
            <span>Share</span>
          </a>
        </footer>
      </article>
    );
  return (
    <Link className="cc-feature-card group overflow-hidden" to={`/lost-found/${report.id}`}>
      <div className="cc-feature-card-placeholder relative grid aspect-[16/9] place-items-center overflow-hidden">
        {imageUrl && !imageFailed ? (
          <img
            alt=""
            className="size-full object-cover"
            onError={() => setImageFailed(true)}
            src={imageUrl}
          />
        ) : (
          <Icon className="size-10 text-[var(--cc-subtle)]" name="search" />
        )}
        <div className="absolute inset-x-4 bottom-4 flex items-center justify-between">
          <Badge tone={report.type === 'LOST' ? 'danger' : 'success'}>{report.type}</Badge>
          <Badge
            tone={
              report.status === 'RESOLVED'
                ? 'success'
                : report.status === 'MATCHED'
                  ? 'info'
                  : 'neutral'
            }
          >
            {report.status.replace('_', ' ')}
          </Badge>
        </div>
      </div>
      <div className="cc-feature-card-body">
        <h2 className="cc-feature-card-title group-hover:text-[var(--cc-primary)]">
          {report.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--cc-muted)]">
          {report.description}
        </p>
        <div className="cc-feature-card-meta mt-4">
          <span>{report.location ?? 'Location not shared'}</span>
          <span>{date(report.incidentDate)}</span>
        </div>
      </div>
    </Link>
  );
}
