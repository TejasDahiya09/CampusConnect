import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Modal } from '../../components/ui';
import { LostFoundHero } from './LostFoundHero';
import { LostFoundCategories } from './LostFoundCategories';
import { LostFoundFilters } from './LostFoundFilters';
import { LostFoundCard } from './LostFoundCard';
import { lostFoundApi } from './lost-found-service';
import {
  defaultLostFoundFilters,
  lostFoundSearch,
  parseLostFoundSearch,
  reportLabel,
} from './lost-found-presentation';
import type { LostFoundFilters as Filters, LostFoundReport } from './lost-found.types';
import './lost-found.css';

export function LostFoundPage() {
  const [search, setSearch] = useSearchParams();
  const searchKey = search.toString();
  const filters = useMemo(() => parseLostFoundSearch(new URLSearchParams(searchKey)), [searchKey]);
  const [keyword, setKeyword] = useState(filters.keyword),
    [filtersOpen, setFiltersOpen] = useState(false);
  const [reports, setReports] = useState<readonly LostFoundReport[]>([]),
    [total, setTotal] = useState(0),
    [totalPages, setTotalPages] = useState(0);
  const [loadedKey, setLoadedKey] = useState<string | null>(null),
    [storedError, setError] = useState<string | null>(null),
    [retry, setRetry] = useState(0);
  const [keywordSource, setKeywordSource] = useState(filters.keyword);
  if (keywordSource !== filters.keyword) {
    setKeywordSource(filters.keyword);
    setKeyword(filters.keyword);
  }
  const requestKey = `${searchKey}:${retry}`;
  const loading = loadedKey !== requestKey;
  const error = loading ? null : storedError;
  useEffect(() => {
    const controller = new AbortController();
    void lostFoundApi
      .getReports(filters, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setError(null);
        setReports(result.reports);
        setTotal(result.pagination.total);
        setTotalPages(result.pagination.totalPages);
      })
      .catch((reason: unknown) => {
        if (!controller.signal.aborted)
          setError(reason instanceof Error ? reason.message : 'Reports could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoadedKey(requestKey);
      });
    return () => controller.abort();
  }, [filters, requestKey]);
  const update = (patch: Partial<Filters>) =>
    setSearch(lostFoundSearch({ ...filters, ...patch, page: patch.page ?? 1 }));
  // Typing replaces the current history entry; explicit filter/page changes remain navigable.
  useEffect(() => {
    if (keyword.trim() === filters.keyword) return;
    const timer = setTimeout(
      () =>
        setSearch(lostFoundSearch({ ...filters, keyword: keyword.trim(), page: 1 }), {
          replace: true,
        }),
      350,
    );
    return () => clearTimeout(timer);
  }, [keyword, filters, setSearch]);
  const clear = () => {
    setKeyword('');
    setSearch(lostFoundSearch(defaultLostFoundFilters));
    setFiltersOpen(false);
  };
  const chips = (
    ['keyword', 'type', 'category', 'status', 'location', 'dateFrom', 'dateTo'] as const
  )
    .filter((key) => filters[key])
    .map((key) => ({
      key,
      label:
        key === 'type' || key === 'status'
          ? reportLabel(filters[key])
          : key === 'dateFrom'
            ? `From ${filters[key]}`
            : key === 'dateTo'
              ? `To ${filters[key]}`
              : filters[key],
    }));
  const filterForm = (mobile: boolean) => (
    <LostFoundFilters
      key={`${searchKey}-${mobile}`}
      value={filters}
      onApply={(value) => {
        update({ ...value, keyword: filters.keyword, sort: filters.sort });
        setFiltersOpen(false);
      }}
      onClear={clear}
    />
  );
  return (
    <div className="cc-page cc-lf-browse">
      <header className="cc-lf-header">
        <div>
          <h1>Lost &amp; Found</h1>
          <p>Helping lost belongings find their way home.</p>
        </div>
        <div className="cc-lf-header-actions">
          <Link className="cc-button cc-button--secondary" to="/lost-found/saved">
            <Icon name="bookmark" />
            Saved reports
          </Link>
          <Link className="cc-button cc-button--secondary" to="/lost-found/my-reports">
            <Icon name="search" />
            My reports
          </Link>
          <Link className="cc-button cc-button--primary" to="/lost-found/new?type=lost">
            <Icon name="plus" />
            Report lost
          </Link>
          <Link className="cc-button cc-button--primary" to="/lost-found/new?type=found">
            <Icon name="plus" />
            Report found
          </Link>
        </div>
      </header>
      <LostFoundHero />
      <div className="cc-lf-browse-layout">
        <aside className="cc-lf-filter-rail" aria-label="Lost and Found filters">
          {filterForm(false)}
          <p className="cc-lf-rail-note">
            <Icon name="shield" />
            Help belongings find their way back to students.
          </p>
        </aside>
        <div className="cc-lf-results-workspace">
          <LostFoundCategories
            selected={filters.category}
            onSelect={(category) => update({ category })}
          />
          <div className="cc-lf-toolbar">
            <form
              role="search"
              className="cc-lf-search"
              onSubmit={(event) => {
                event.preventDefault();
                update({ keyword: keyword.trim() });
              }}
            >
              <Icon name="search" />
              <label className="sr-only" htmlFor="lf-report-search">
                Search reports
              </label>
              <input
                id="lf-report-search"
                type="search"
                maxLength={100}
                placeholder="Item, category, or location"
                value={keyword}
                onChange={(event) => setKeyword(event.target.value)}
              />
              <button type="submit" aria-label="Search reports">
                <Icon name="arrow" />
              </button>
            </form>
            <div className="cc-lf-toolbar-actions">
              <Button
                className="cc-lf-filter-trigger"
                variant="secondary"
                icon="filter"
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(true)}
              >
                Filters
                {chips.length ? <span className="cc-lf-filter-count">{chips.length}</span> : null}
              </Button>
              <label className="cc-lf-sort">
                <span className="sr-only">Sort reports</span>
                <select
                  className="cc-field"
                  value={filters.sort}
                  onChange={(event) => update({ sort: event.target.value as Filters['sort'] })}
                >
                  <option value="newest">Newest reports</option>
                  <option value="incident_newest">Latest incident</option>
                  <option value="oldest">Oldest reports</option>
                </select>
              </label>
            </div>
          </div>
          {chips.length ? (
            <div className="cc-lf-active-filters" aria-label="Active report filters">
              {chips.map(({ key, label }) => (
                <button
                  className="cc-filter-chip"
                  type="button"
                  key={key}
                  aria-label={`Remove ${label} filter`}
                  onClick={() => {
                    if (key === 'keyword') setKeyword('');
                    update({ [key]: '' });
                  }}
                >
                  <span>{label}</span>
                  <Icon name="close" />
                </button>
              ))}
              <Button variant="ghost" onClick={clear}>
                Clear all
              </Button>
            </div>
          ) : null}
          <section
            className="cc-lf-results"
            aria-labelledby="lf-results-heading"
            aria-busy={loading}
          >
            <div className="cc-lf-results-heading">
              <h2 id="lf-results-heading">All reports</h2>
              <p role="status">
                {loading
                  ? 'Finding reports…'
                  : error
                    ? 'Reports unavailable'
                    : `${total} ${chips.length ? 'matching ' : ''}report${total === 1 ? '' : 's'}`}
              </p>
            </div>
            {error ? (
              <div className="cc-lf-feedback" role="alert">
                <Icon name="warning" />
                <h3>We couldn’t load these reports</h3>
                <p>{error}</p>
                <Button variant="secondary" onClick={() => setRetry((value) => value + 1)}>
                  Retry reports
                </Button>
              </div>
            ) : loading ? (
              <div className="cc-lf-grid" aria-label="Loading reports">
                {Array.from({ length: 6 }, (_, index) => (
                  <div className="cc-lf-card-skeleton" key={index}>
                    <div className="cc-skeleton" />
                    <div className="cc-skeleton" />
                    <div className="cc-skeleton" />
                  </div>
                ))}
              </div>
            ) : reports.length ? (
              <div className="cc-lf-grid">
                {reports.map((report) => (
                  <LostFoundCard key={report.id} report={report} variant="discovery" />
                ))}
              </div>
            ) : (
              <div className="cc-lf-feedback">
                <Icon name="search" />
                <h3>No reports found</h3>
                <p>
                  {chips.length
                    ? 'Try another search or clear your filters.'
                    : 'Report a lost or found belonging to help your campus community.'}
                </p>
                {chips.length ? (
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                ) : (
                  <Link className="cc-button cc-button--primary" to="/lost-found/new?type=lost">
                    Report an item
                  </Link>
                )}
              </div>
            )}
            {!loading && !error && totalPages > 1 ? (
              <nav className="cc-lf-pagination" aria-label="Lost and Found pagination">
                <Button
                  variant="secondary"
                  disabled={filters.page <= 1}
                  onClick={() => update({ page: Math.max(1, filters.page - 1) })}
                >
                  Previous
                </Button>
                <span>
                  Page {filters.page} of {totalPages}
                </span>
                <Button
                  variant="secondary"
                  disabled={filters.page >= totalPages}
                  onClick={() => update({ page: filters.page + 1 })}
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
        title="Find a lost or found item"
        description="Refine reports by their shared details and incident date."
      >
        {filtersOpen ? filterForm(true) : null}
      </Modal>
    </div>
  );
}
