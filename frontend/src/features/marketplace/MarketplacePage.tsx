import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { MarketplaceBrowse } from './MarketplaceBrowse';
import {
  defaultMarketplaceDiscovery,
  readMarketplaceDiscovery,
  updateMarketplaceDiscovery,
  writeMarketplaceDiscovery,
  type MarketplaceDiscoveryState,
} from './marketplace-discovery';
import { getListings, getMarketplaceCategories } from './marketplace-service';
import type { ListingPageResult, MarketplaceCategory } from './marketplace.types';
import './marketplace.css';

export function MarketplacePage({ navigate }: { readonly navigate: (path: string) => void }) {
  const [params, setParams] = useSearchParams();
  const [categories, setCategories] = useState<readonly MarketplaceCategory[] | null>(null);
  const [categoryError, setCategoryError] = useState(false);
  const [result, setResult] = useState<(ListingPageResult & { key: string }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const [categoryRetry, setCategoryRetry] = useState(0);

  useEffect(() => {
    let active = true;
    void getMarketplaceCategories()
      .then((values) => {
        if (active) {
          setCategories(values);
          setCategoryError(false);
        }
      })
      .catch(() => {
        if (active) setCategoryError(true);
      });
    return () => {
      active = false;
    };
  }, [categoryRetry]);

  const state = useMemo(
    () => readMarketplaceDiscovery(params.toString(), categories ?? undefined),
    [params, categories],
  );
  const url = writeMarketplaceDiscovery(state);
  const canonicalQuery = new URL(url, 'https://campus.invalid').searchParams.toString();
  const actualQuery = params.toString();
  const queryKey = `${url}|${retry}`;

  useEffect(() => {
    const canonical = new URL(url, 'https://campus.invalid').searchParams;
    if (categories && params.toString() !== canonical.toString())
      setParams(canonical, { replace: true });
  }, [categories, params, setParams, url]);

  useEffect(() => {
    if (!categories || actualQuery !== canonicalQuery) return;
    const controller = new AbortController();
    queueMicrotask(() => {
      if (!controller.signal.aborted) setError(null);
    });
    void getListings(
      {
        limit: 12,
        page: state.page,
        sort: state.sort,
        ...(state.search ? { search: state.search } : {}),
        ...(state.categoryId ? { categoryId: state.categoryId } : {}),
        ...(state.condition ? { condition: state.condition } : {}),
        ...(state.status ? { status: state.status } : {}),
        ...(state.minPrice ? { minPrice: state.minPrice } : {}),
        ...(state.maxPrice ? { maxPrice: state.maxPrice } : {}),
      },
      controller.signal,
    )
      .then((value) => {
        if (controller.signal.aborted) return;
        if (state.page > Math.max(1, value.pagination.totalPages)) {
          const next = { ...state, page: Math.max(1, value.pagination.totalPages) };
          setParams(
            new URL(writeMarketplaceDiscovery(next), 'https://campus.invalid').searchParams,
            { replace: true },
          );
          return;
        }
        setResult({ ...value, key: queryKey });
      })
      .catch(() => {
        if (!controller.signal.aborted) setError('Listings could not be loaded. Please try again.');
      });
    return () => controller.abort();
  }, [categories, queryKey, setParams, state, actualQuery, canonicalQuery]);

  const update = (patch: Partial<MarketplaceDiscoveryState>) => {
    const next = updateMarketplaceDiscovery(state, patch);
    setParams(new URL(writeMarketplaceDiscovery(next), 'https://campus.invalid').searchParams);
  };
  const loading = result?.key !== queryKey || !categories;
  return (
    <MarketplaceBrowse
      categories={categories ?? []}
      categoryError={categoryError}
      error={error}
      loading={loading}
      state={state}
      listings={result?.key === queryKey ? result.listings : []}
      pagination={result?.key === queryKey ? result.pagination : null}
      onUpdate={update}
      onClear={() => update(defaultMarketplaceDiscovery)}
      navigate={navigate}
      onRetry={() => {
        setError(null);
        setRetry((value) => value + 1);
      }}
      onCategoryRetry={() => setCategoryRetry((value) => value + 1)}
    />
  );
}
