import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Modal } from '../../components/ui';
import { ListingCard } from './ListingCard';
import { MarketplaceFilters } from './MarketplaceFilters';
import { MarketplaceSearch } from './MarketplaceSearch';
import { MarketplaceHero } from './MarketplaceHero';
import { MarketplaceCategoryNav } from './MarketplaceCategoryNav';
import { hasMarketplaceFilters, type MarketplaceDiscoveryState } from './marketplace-discovery';
import { readableEnum } from './marketplace-format';
import type {
  ListingPageResult,
  ListingSort,
  MarketplaceCategory,
  MarketplaceListing,
} from './marketplace.types';

export interface MarketplaceBrowseProps {
  readonly categories: readonly MarketplaceCategory[];
  readonly state: MarketplaceDiscoveryState;
  readonly listings: readonly MarketplaceListing[];
  readonly pagination: ListingPageResult['pagination'] | null;
  readonly loading: boolean;
  readonly categoryError: boolean;
  readonly error: string | null;
  readonly onUpdate: (patch: Partial<MarketplaceDiscoveryState>) => void;
  readonly onClear: () => void;
  readonly onRetry: () => void;
  readonly onCategoryRetry: () => void;
  readonly navigate: (path: string) => void;
}

export function MarketplaceSkeletons({ count = 4 }: { readonly count?: number }) {
  return (
    <div className="cc-market-grid" aria-label="Loading listings" role="status">
      <span className="sr-only">Loading Marketplace listings</span>
      {Array.from({ length: count }, (_, index) => (
        <div className="cc-market-skeleton" key={index} aria-hidden="true">
          <div className="cc-skeleton cc-market-skeleton-media" />
          <div className="cc-market-product-body">
            <div className="cc-skeleton h-6 w-24" />
            <div className="cc-skeleton mt-3 h-4 w-full" />
            <div className="cc-skeleton mt-2 h-4 w-2/3" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function MarketplaceBrowse(props: MarketplaceBrowseProps) {
  const {
    categories,
    state,
    onUpdate,
    onClear,
    loading,
    error,
    categoryError,
    pagination,
    listings,
    navigate,
  } = props;
  const [filtersOpen, setFiltersOpen] = useState(false);
  const filtered = hasMarketplaceFilters(state);
  const stateKey = JSON.stringify(state);
  const category = categories.find(({ id }) => id === state.categoryId);
  useEffect(() => {
    if (!filtersOpen) return;
    const media = window.matchMedia('(min-width: 1100px)');
    const closeOnDesktop = (event: MediaQueryListEvent) => {
      if (event.matches) setFiltersOpen(false);
    };
    media.addEventListener('change', closeOnDesktop);
    return () => media.removeEventListener('change', closeOnDesktop);
  }, [filtersOpen]);
  const chips: { key: keyof MarketplaceDiscoveryState; label: string }[] = [
    ...(state.search ? [{ key: 'search' as const, label: `Search: ${state.search}` }] : []),
    ...(category ? [{ key: 'categoryId' as const, label: category.name }] : []),
    ...(state.condition
      ? [{ key: 'condition' as const, label: readableEnum(state.condition) }]
      : []),
    ...(state.status ? [{ key: 'status' as const, label: readableEnum(state.status) }] : []),
    ...(state.minPrice ? [{ key: 'minPrice' as const, label: `Min ${state.minPrice}` }] : []),
    ...(state.maxPrice ? [{ key: 'maxPrice' as const, label: `Max ${state.maxPrice}` }] : []),
  ];
  const filterForm = (mobile: boolean) => (
    <MarketplaceFilters
      key={`${stateKey}-${mobile}`}
      categories={categories}
      state={state}
      onApply={(patch) => {
        onUpdate(patch);
        setFiltersOpen(false);
      }}
      onClear={() => {
        onClear();
        setFiltersOpen(false);
      }}
    />
  );
  return (
    <div className="cc-page cc-marketplace">
      <header className="cc-market-header">
        <div>
          <h1>Marketplace</h1>
          <p>Useful finds, closer to campus.</p>
        </div>
        <div className="cc-market-header-actions">
          <Link className="cc-button cc-button--secondary" to="/marketplace/my-listings">
            <Icon name="store" />
            My listings
          </Link>
          <Link className="cc-button cc-button--secondary" to="/marketplace/saved">
            <Icon name="bookmark" />
            Saved listings
          </Link>
          <Link className="cc-button cc-button--primary" to="/marketplace/new">
            <Icon name="plus" />
            Sell an item
          </Link>
        </div>
      </header>
      <MarketplaceHero />
      <div className="cc-market-layout">
        <aside className="cc-market-filter-rail" aria-label="Marketplace filters">
          {!categoryError && categories.length ? (
            filterForm(false)
          ) : (
            <p className="cc-market-hint">
              {categoryError ? 'Categories are unavailable.' : 'Loading filters…'}
            </p>
          )}
          <p className="cc-market-rail-note">
            <Icon name="store" />
            Buy and sell with your campus community.
          </p>
        </aside>
        <div className="cc-market-workspace">
          <MarketplaceCategoryNav
            categories={categories}
            selected={state.categoryId}
            onSelect={(categoryId) => onUpdate({ categoryId })}
          />
          <div className="cc-market-toolbar">
            <MarketplaceSearch
              key={stateKey}
              initialValue={state.search}
              onSearch={(search) => onUpdate({ search })}
            />
            <div className="cc-market-toolbar-actions">
              <Button
                className="cc-market-filter-trigger"
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                variant="secondary"
                onClick={() => setFiltersOpen(true)}
                disabled={!categories.length}
              >
                <Icon name="filter" />
                Filters
                {chips.filter(({ key }) => key !== 'search').length ? (
                  <span className="cc-market-filter-count">
                    {chips.filter(({ key }) => key !== 'search').length}
                  </span>
                ) : null}
              </Button>
              <label className="cc-market-sort">
                <span className="sr-only">Sort listings</span>
                <select
                  className="cc-field"
                  value={state.sort}
                  onChange={(event) => onUpdate({ sort: event.target.value as ListingSort })}
                >
                  <option value="newest">Newest first</option>
                  <option value="price_asc">Price: low to high</option>
                  <option value="price_desc">Price: high to low</option>
                </select>
              </label>
            </div>
          </div>
          {chips.length || state.sort !== 'newest' ? (
            <div className="cc-market-active-filters" aria-label="Active filters">
              {chips.map(({ key, label }) => (
                <button
                  className="cc-filter-chip"
                  key={key}
                  type="button"
                  aria-label={`Remove ${label} filter`}
                  onClick={() => onUpdate({ [key]: '' })}
                >
                  {label}
                  <Icon name="close" />
                </button>
              ))}
              <button type="button" className="cc-market-clear" onClick={onClear}>
                Clear all
              </button>
            </div>
          ) : null}
          {categoryError ? (
            <div className="cc-market-feedback" role="alert">
              <Icon name="warning" />
              <p>Marketplace categories could not be loaded.</p>
              <Button variant="secondary" onClick={props.onCategoryRetry}>
                Retry filters
              </Button>
            </div>
          ) : null}
          <section
            className="cc-market-results"
            aria-labelledby="market-results-title"
            aria-busy={loading && !error && !categoryError}
          >
            <div className="cc-market-section-heading">
              <div>
                <h2 id="market-results-title">All listings</h2>
                <p aria-live="polite">
                  {loading && !error && !categoryError
                    ? 'Finding listings…'
                    : pagination
                      ? `${pagination.total} ${filtered ? 'matching ' : ''}listing${pagination.total === 1 ? '' : 's'}`
                      : 'Browse student listings'}
                </p>
              </div>
            </div>
            {error ? (
              <div className="cc-market-feedback" role="alert">
                <Icon name="warning" />
                <h3>We couldn’t load these listings</h3>
                <p>{error}</p>
                <Button variant="secondary" onClick={props.onRetry}>
                  Retry listings
                </Button>
              </div>
            ) : categoryError ? null : loading ? (
              <MarketplaceSkeletons count={6} />
            ) : listings.length ? (
              <div className="cc-market-grid">
                {listings.map((listing) => (
                  <ListingCard
                    variant="commerce"
                    listing={listing}
                    key={listing.id}
                    onOpen={(id) => navigate(`/marketplace/${id}`)}
                  />
                ))}
              </div>
            ) : (
              <div className="cc-market-feedback">
                <Icon name={filtered ? 'search' : 'store'} />
                <h3>{filtered ? 'No finds just yet' : 'Make the first listing'}</h3>
                <p>
                  {filtered
                    ? 'Try another search or clear your filters to explore more.'
                    : 'Pass something useful on to another student.'}
                </p>
                <Button onClick={filtered ? onClear : () => navigate('/marketplace/new')}>
                  {filtered ? 'Clear filters' : 'Sell an item'}
                </Button>
              </div>
            )}
            {!loading && !error && pagination && pagination.totalPages > 1 ? (
              <nav className="cc-market-pagination" aria-label="Marketplace pagination">
                <Button
                  variant="secondary"
                  disabled={state.page === 1}
                  onClick={() => onUpdate({ page: state.page - 1 })}
                >
                  Previous
                </Button>
                <span>
                  Page {state.page} of {pagination.totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={state.page >= pagination.totalPages}
                  onClick={() => onUpdate({ page: state.page + 1 })}
                >
                  Next
                </Button>
              </nav>
            ) : null}
          </section>
        </div>
      </div>
      <Modal
        open={filtersOpen}
        onClose={() => setFiltersOpen(false)}
        title="Find your next campus essential"
        description="Choose your filters, then apply them to the catalog."
      >
        {filterForm(true)}
      </Modal>
    </div>
  );
}
