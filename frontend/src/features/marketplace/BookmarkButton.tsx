import { useState } from 'react';
import { Icon } from '../../components/Icon';
import { toggleMarketplaceBookmark } from './marketplace-bookmark-state';
import { removeListingBookmark, saveListingBookmark } from './marketplace-service';

interface BookmarkButtonProps {
  readonly presentation?: 'default' | 'commerce';
  readonly initialBookmarked: boolean;
  readonly listingId: string;
  readonly onChange?: (bookmarked: boolean) => void;
}

export function BookmarkButton({
  initialBookmarked,
  listingId,
  onChange,
  presentation = 'default',
}: BookmarkButtonProps) {
  const [bookmarked, setBookmarked] = useState(initialBookmarked);
  const [isPending, setIsPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const toggle = async () => {
    setIsPending(true);
    setError(null);
    try {
      const next = await toggleMarketplaceBookmark(
        bookmarked,
        async (value) => {
          if (value) await saveListingBookmark(listingId);
          else await removeListingBookmark(listingId);
        },
        setBookmarked,
      );
      onChange?.(next);
    } catch (toggleError) {
      setError(
        toggleError instanceof Error ? toggleError.message : 'Saved state could not be updated.',
      );
    } finally {
      setIsPending(false);
    }
  };

  const label = bookmarked ? 'Remove from saved listings' : 'Save listing';
  return (
    <>
      <button
        aria-label={label}
        aria-pressed={bookmarked}
        className={`cc-bookmark-control ${bookmarked ? 'cc-bookmark-control--active' : ''}`}
        disabled={isPending}
        onClick={() => void toggle()}
        title={error ?? label}
        type="button"
      >
        {presentation === 'commerce' ? (
          <Icon name="bookmark" />
        ) : (
          <span className="text-xl leading-none" aria-hidden="true">
            {bookmarked ? '♥' : '♡'}
          </span>
        )}
      </button>
      {presentation === 'commerce' ? (
        <span
          className={error ? 'cc-market-save-feedback' : 'sr-only'}
          aria-live="polite"
          role="status"
        >
          {error ?? (bookmarked ? 'Saved to your listings' : '')}
        </span>
      ) : error ? (
        <span className="sr-only">{error}</span>
      ) : null}
    </>
  );
}
