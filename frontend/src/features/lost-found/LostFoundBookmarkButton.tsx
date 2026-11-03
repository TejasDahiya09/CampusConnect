import { useState } from 'react';
import { Button } from '../../components/ui';
import { lostFoundApi } from './lost-found-service';

export function LostFoundBookmarkButton({
  initialBookmarked,
  reportId,
  onChange,
  presentation = 'default',
}: {
  readonly initialBookmarked: boolean;
  readonly reportId: string;
  readonly onChange: (value: boolean) => void;
  readonly presentation?: 'default' | 'compact' | 'detail';
}) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <div
      className={presentation === 'default' ? undefined : `cc-lf-save cc-lf-save--${presentation}`}
    >
      <Button
        aria-pressed={bookmarked}
        aria-label={bookmarked ? 'Remove from saved reports' : 'Save report'}
        title={bookmarked ? 'Remove from saved reports' : 'Save report'}
        icon={presentation === 'default' ? undefined : 'bookmark'}
        disabled={pending}
        onClick={() => {
          setPending(true);
          setError(null);
          const operation = bookmarked
            ? lostFoundApi.removeBookmark(reportId)
            : lostFoundApi.addBookmark(reportId);
          void operation
            .then(() => {
              setBookmarked(!bookmarked);
              onChange(!bookmarked);
            })
            .catch((reason: unknown) =>
              setError(
                reason instanceof Error ? reason.message : 'Saved state could not be updated.',
              ),
            )
            .finally(() => setPending(false));
        }}
        type="button"
        variant="secondary"
      >
        {presentation === 'compact' ? (
          <span className="sr-only">{pending ? 'Updating…' : bookmarked ? 'Saved' : 'Save'}</span>
        ) : presentation === 'detail' ? (
          pending ? (
            'Saving…'
          ) : bookmarked ? (
            'Saved'
          ) : (
            'Save'
          )
        ) : pending ? (
          'Updating…'
        ) : bookmarked ? (
          'Remove bookmark'
        ) : (
          'Save report'
        )}
      </Button>
      {error ? (
        <p className="mt-2 text-xs text-[var(--cc-danger)]" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
