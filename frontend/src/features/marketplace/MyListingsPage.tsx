import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Button, EmptyState, PageHeader } from '../../components/ui';
import { ListingCard } from './ListingCard';
import { getMyListings } from './marketplace-service';
import type { ListingPageResult } from './marketplace.types';

export function MyListingsPage() {
  const navigate = useNavigate();
  const [page, setPage] = useState(1);
  const [attempt, setAttempt] = useState(0);
  const [result, setResult] = useState<ListingPageResult | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    void getMyListings(page, controller.signal)
      .then((value) => {
        if (!controller.signal.aborted) setResult(value);
      })
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [page, attempt]);
  const changePage = (value: number) => {
    setResult(null);
    setPage(value);
  };
  return (
    <div className="cc-page">
      <PageHeader
        title="My listings"
        description="Your visible active and sold Marketplace listings. Open a listing to manage it."
        actions={
          <Link className="cc-button cc-button--secondary" to="/marketplace">
            Browse Marketplace
          </Link>
        }
      />
      {error ? (
        <div className="cc-alert cc-alert--danger mt-6" role="alert">
          Your listings could not be loaded.
          <Button
            onClick={() => {
              setError(false);
              setAttempt((value) => value + 1);
            }}
          >
            Retry
          </Button>
        </div>
      ) : !result ? (
        <p className="mt-6" role="status">
          Loading your listings…
        </p>
      ) : result.listings.length ? (
        <div className="mt-6 grid grid-cols-1 gap-4 min-[360px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {result.listings.map((listing) => (
            <ListingCard
              key={listing.id}
              listing={listing}
              onOpen={(id) => {
                void navigate(`/marketplace/${id}`);
              }}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          title="No listings yet"
          description="Your eligible listings will appear here after you publish them."
          action={
            <Link className="cc-button cc-button--primary" to="/marketplace/new">
              Sell an item
            </Link>
          }
        />
      )}
      {result && result.pagination.totalPages > 1 ? (
        <nav
          className="mt-6 flex flex-wrap items-center justify-center gap-4"
          aria-label="My listings pagination"
        >
          <Button variant="secondary" disabled={page <= 1} onClick={() => changePage(page - 1)}>
            Previous
          </Button>
          <span>
            Page {page} of {result.pagination.totalPages}
          </span>
          <Button
            variant="secondary"
            disabled={page >= result.pagination.totalPages}
            onClick={() => changePage(page + 1)}
          >
            Next
          </Button>
        </nav>
      ) : null}
    </div>
  );
}
