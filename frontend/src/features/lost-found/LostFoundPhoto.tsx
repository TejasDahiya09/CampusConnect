import { useState } from 'react';
import { Icon } from '../../components/Icon';
import type { LostFoundImage } from './lost-found.types';
import { reportPhotoCandidates } from './lost-found-presentation';

export function LostFoundPhoto({
  url,
  title,
  lazy = false,
  onFailure,
}: {
  readonly url: string;
  readonly title: string;
  readonly lazy?: boolean;
  readonly onFailure: (url: string) => void;
}) {
  const [loaded, setLoaded] = useState(false);
  return (
    <div className="cc-lf-photo" data-image-state={loaded ? 'loaded' : 'loading'}>
      {!loaded ? (
        <span className="cc-lf-photo-pending" aria-hidden="true">
          <Icon name="search" />
          <span>Photo loading</span>
        </span>
      ) : null}
      <img
        src={url}
        alt={title}
        loading={lazy ? 'lazy' : 'eager'}
        decoding="async"
        onLoad={() => setLoaded(true)}
        onError={(event) => {
          if (event.currentTarget.complete && event.currentTarget.naturalWidth === 0)
            onFailure(url);
        }}
      />
    </div>
  );
}
export function LostFoundReportImage({
  images,
  title,
}: {
  readonly images: readonly LostFoundImage[];
  readonly title: string;
}) {
  const [failed, setFailed] = useState<readonly string[]>([]);
  const candidates = reportPhotoCandidates(images);
  const image = candidates.find((item) => !failed.includes(item.url!));
  return image ? (
    <LostFoundPhoto
      key={image.url}
      url={image.url!}
      title={title}
      lazy
      onFailure={(url) =>
        setFailed((current) => (current.includes(url) ? current : [...current, url]))
      }
    />
  ) : (
    <div className="cc-lf-photo-empty">
      <Icon name="search" />
      <span>{candidates.length ? 'Photos unavailable' : 'No photo added'}</span>
    </div>
  );
}
