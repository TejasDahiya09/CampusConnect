import { useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/useAuth';
import { ApiClientError } from '../../services/api-client';
import { deleteListing, getListing, recordListingView, updateListing } from './marketplace-service';
import { messagingService } from '../messaging/messaging-service';
import { listingDetailPermissions } from './listing-detail-permissions';
import {
  ListingDetailFeedback,
  MarketplaceListingDetail,
  type ListingDetailOperation,
} from './MarketplaceListingDetail';
import type { MarketplaceListing } from './marketplace.types';
import './marketplace-detail.css';

const messageFor = (error: unknown) =>
  error instanceof ApiClientError
    ? error.message
    : 'The request could not be completed. Please try again.';
type DetailResult = {
  readonly key: string;
  readonly listing: MarketplaceListing | null;
  readonly error?: string;
  readonly unavailable?: boolean;
};

export function ListingDetailPage({
  id,
  navigate,
}: {
  readonly id: string;
  readonly navigate: (path: string) => void;
}) {
  const { applicationUser } = useAuth();
  const viewerId = applicationUser?.id ?? null;
  const active = applicationUser?.status === 'ACTIVE';
  const [result, setResult] = useState<DetailResult | null>(null);
  const [retry, setRetry] = useState(0);
  const [pending, setPending] = useState<ListingDetailOperation>(null);
  const [error, setError] = useState<{ key: string; message: string } | null>(null);
  const inFlight = useRef(false);
  const key = `${id}:${viewerId ?? ''}:${retry}`;
  useEffect(() => {
    let current = true;
    void getListing(id)
      .then((listing) => {
        if (!current) return;
        setResult({ key, listing });
        if (viewerId !== null && viewerId !== listing.sellerId)
          void recordListingView(id).catch(() => undefined);
      })
      .catch((loadError: unknown) => {
        if (current)
          setResult({
            key,
            listing: null,
            error: messageFor(loadError),
            unavailable:
              loadError instanceof ApiClientError && [403, 404].includes(loadError.status),
          });
      });
    return () => {
      current = false;
    };
  }, [id, key, viewerId]);
  if (result?.key !== key) return <ListingDetailFeedback loading />;
  if (!result.listing)
    return (
      <ListingDetailFeedback
        error={result.error}
        unavailable={result.unavailable}
        onRetry={() => setRetry((value) => value + 1)}
      />
    );
  const listing = result.listing;
  const permissions = listingDetailPermissions(listing, viewerId, active);
  const mutate = async (
    action: ListingDetailOperation,
    operation: () => Promise<void>,
  ): Promise<boolean> => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setPending(action);
    setError(null);
    try {
      await operation();
      return true;
    } catch (mutationError) {
      setError({ key, message: messageFor(mutationError) });
      return false;
    } finally {
      inFlight.current = false;
      setPending(null);
    }
  };
  return (
    <MarketplaceListingDetail
      key={id}
      listing={listing}
      viewerId={viewerId}
      active={active}
      pending={pending}
      error={error?.key === key ? error.message : null}
      onBookmarkChange={(isBookmarked) =>
        setResult((previous) =>
          previous?.key === key && previous.listing
            ? { ...previous, listing: { ...previous.listing, isBookmarked } }
            : previous,
        )
      }
      onMessage={() =>
        permissions.canMessage
          ? mutate('message', async () => {
              const conversation = await messagingService.open({
                contextId: listing.id,
                contextType: 'MARKETPLACE',
                targetUserId: listing.sellerId,
              });
              navigate(`/messages/${conversation.id}`);
            })
          : Promise.resolve(false)
      }
      onSold={() =>
        permissions.canEdit
          ? mutate('sold', async () => {
              const updated = await updateListing(listing.id, { status: 'SOLD' });
              setResult((previous) =>
                previous?.key === key ? { key, listing: updated } : previous,
              );
            })
          : Promise.resolve(false)
      }
      onArchive={() =>
        permissions.canArchive
          ? mutate('archive', async () => {
              await deleteListing(listing.id);
              navigate('/marketplace');
            })
          : Promise.resolve(false)
      }
    />
  );
}
