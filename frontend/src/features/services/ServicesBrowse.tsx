import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button, Modal } from '../../components/ui';
import { ApiClientError } from '../../services/api-client';
import { servicesApi } from './services-service';
import { ServicesBrowseCard } from './ServicesBrowseCard';
import {
  defaultServicesDiscovery,
  hasServicesCriteria,
  readServicesDiscovery,
  serviceFilterErrors,
  writeServicesDiscovery,
  type ServicesDiscovery,
} from './services-discovery';
import './services-browse.css';

function Filters({
  state,
  onApply,
  onClear,
  prefix,
}: {
  readonly state: ServicesDiscovery;
  readonly onApply: (state: ServicesDiscovery) => void;
  readonly onClear: () => void;
  readonly prefix: string;
}) {
  const [draft, setDraft] = useState(state);
  const [submitted, setSubmitted] = useState(false);
  const errors = serviceFilterErrors(draft);
  const field = (key: 'category' | 'minPrice' | 'maxPrice', label: string) => (
    <label htmlFor={`${prefix}-${key}`}>
      {label}
      <input
        id={`${prefix}-${key}`}
        className="cc-field"
        value={draft[key]}
        inputMode={key === 'category' ? 'text' : 'decimal'}
        maxLength={key === 'category' ? 100 : 11}
        placeholder={key === 'category' ? 'e.g. Tutoring' : key === 'minPrice' ? '0' : 'Any'}
        aria-invalid={submitted && !!errors[key]}
        aria-describedby={submitted && errors[key] ? `${prefix}-${key}-error` : undefined}
        onChange={(e) => setDraft({ ...draft, [key]: e.target.value })}
      />
      {submitted && errors[key] ? (
        <span className="cc-sv-field-error" id={`${prefix}-${key}-error`}>
          {errors[key]}
        </span>
      ) : null}
    </label>
  );
  return (
    <form
      className="cc-sv-filters"
      onSubmit={(e) => {
        e.preventDefault();
        setSubmitted(true);
        if (!Object.keys(errors).length) onApply(draft);
      }}
      noValidate
    >
      {field('category', 'Category')}
      <p className="cc-sv-hint">Matches the provider’s category exactly.</p>
      <label htmlFor={`${prefix}-pricing`}>
        Pricing type
        <select
          id={`${prefix}-pricing`}
          className="cc-field"
          value={draft.pricingType}
          aria-invalid={submitted && !!errors.pricingType}
          aria-describedby={submitted && errors.pricingType ? `${prefix}-pricing-error` : undefined}
          onChange={(e) =>
            setDraft({ ...draft, pricingType: e.target.value as ServicesDiscovery['pricingType'] })
          }
        >
          <option value="">All pricing</option>
          <option value="FREE">Free</option>
          <option value="FIXED">Fixed price</option>
          <option value="NEGOTIABLE">Negotiable</option>
        </select>
        {submitted && errors.pricingType ? (
          <span className="cc-sv-field-error" id={`${prefix}-pricing-error`}>
            {errors.pricingType}
          </span>
        ) : null}
      </label>
      <fieldset>
        <legend>Price range · INR</legend>
        <div className="cc-sv-price-fields">
          {field('minPrice', 'Minimum')}
          {field('maxPrice', 'Maximum')}
        </div>
        <p className="cc-sv-hint">
          Numeric bounds apply to priced services. Clear them for negotiable pricing.
        </p>
      </fieldset>
      {submitted && Object.keys(errors).length ? (
        <p role="alert" className="cc-sv-field-error">
          Check the highlighted filters before applying.
        </p>
      ) : null}
      <Button type="submit">Apply filters</Button>
      <Button type="button" variant="ghost" onClick={onClear}>
        Clear filters
      </Button>
    </form>
  );
}

export default function ServicesBrowse() {
  const [params, setParams] = useSearchParams();
  const state = useMemo(() => readServicesDiscovery(params), [params]);
  const canonical = writeServicesDiscovery(state).toString();
  const actual = params.toString();
  const [input, setInput] = useState({ key: canonical, value: state.search });
  const search = input.key === canonical ? input.value : state.search;
  const pendingSearch = search.trim() !== state.search;
  const [attempt, setAttempt] = useState(0);
  const [record, setRecord] = useState<{
    key: string;
    data: Awaited<ReturnType<typeof servicesApi.list>> | null;
    error: string | null;
  } | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const closeFilters = useCallback(() => setFiltersOpen(false), []);
  const key = `${canonical}|${attempt}`;
  const change = useCallback(
    (next: ServicesDiscovery, replace = false) =>
      setParams(writeServicesDiscovery(next), { replace }),
    [setParams],
  );
  const clear = () => {
    setInput({ key: '', value: '' });
    change({ ...defaultServicesDiscovery });
    closeFilters();
  };
  useEffect(() => {
    if (actual !== canonical) setParams(new URLSearchParams(canonical), { replace: true });
  }, [actual, canonical, setParams]);
  useEffect(() => {
    if (!pendingSearch) return;
    const timer = window.setTimeout(
      () =>
        change({
          ...readServicesDiscovery(new URLSearchParams(canonical)),
          search: search.trim(),
          page: 1,
        }),
      350,
    );
    return () => window.clearTimeout(timer);
  }, [canonical, change, pendingSearch, search]);
  useEffect(() => {
    if (pendingSearch) return;
    const controller = new AbortController();
    let current = true;
    const filters = readServicesDiscovery(new URLSearchParams(canonical));
    void servicesApi
      .list({ ...filters, status: 'ACTIVE', limit: 12 }, controller.signal)
      .then((data) => {
        if (!current) return;
        if (filters.page > Math.max(1, data.totalPages)) {
          change({ ...filters, page: Math.max(1, data.totalPages) }, true);
          return;
        }
        setRecord({ key, data, error: null });
      })
      .catch((reason: unknown) => {
        if (!current || controller.signal.aborted) return;
        setRecord({
          key,
          data: null,
          error:
            reason instanceof ApiClientError
              ? reason.message
              : 'Could not load services. Check your connection and try again.',
        });
      });
    return () => {
      current = false;
      controller.abort();
    };
  }, [canonical, change, key, pendingSearch]);
  useEffect(() => {
    const media = window.matchMedia('(min-width: 1100px)');
    const close = () => {
      if (media.matches) closeFilters();
    };
    media.addEventListener('change', close);
    return () => media.removeEventListener('change', close);
  }, [closeFilters]);
  const settled = record?.key === key && !pendingSearch;
  const data = settled ? record.data : null;
  const issue = settled ? record.error : null;
  const loading = !settled;
  const submitSearch = (e: FormEvent) => {
    e.preventDefault();
    change({ ...state, search: search.trim(), page: 1 });
  };
  const count = [state.category, state.pricingType, state.minPrice, state.maxPrice].filter(
    Boolean,
  ).length;
  return (
    <div className="cc-page cc-sv-browse">
      <header className="cc-sv-header">
        <div>
          <h1>Campus Services</h1>
          <p className="cc-sv-tagline">Student skills. Real opportunities.</p>
          <p>Find help, share your skills, and work with students across campus.</p>
        </div>
        <div className="cc-sv-header-actions">
          <Link to="/services/saved" className="cc-button cc-button--secondary">
            My services &amp; requests
          </Link>
          <Link to="/services/new" className="cc-button cc-button--primary">
            <Icon name="plus" />
            Offer a service
          </Link>
        </div>
      </header>
      <section className="cc-sv-hero" aria-labelledby="sv-hero-title">
        <div>
          <p className="cc-sv-eyebrow">Made of student talent</p>
          <h2 id="sv-hero-title">
            Find the right skill,
            <br />
            right here on campus.
          </h2>
          <p>
            Explore services offered by fellow students, from creative work to technical help and
            more.
          </p>
        </div>
        <svg viewBox="0 0 460 220" aria-hidden="true" className="cc-sv-hero-art" fill="none">
          <circle cx="270" cy="110" r="96" stroke="currentColor" opacity=".12" />
          <path
            d="M95 70 245 110 365 52M90 170l155-60 120 65"
            stroke="currentColor"
            opacity=".3"
            strokeWidth="2"
          />
          <rect x="199" y="63" width="92" height="94" rx="23" fill="currentColor" opacity=".1" />
          <path
            d="m225 112 14 14 30-33"
            stroke="currentColor"
            strokeWidth="5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          {[
            [75, 50],
            [345, 32],
            [70, 150],
            [345, 155],
          ].map(([x, y]) => (
            <rect
              key={`${x}-${y}`}
              x={x}
              y={y}
              width="40"
              height="40"
              rx="12"
              stroke="currentColor"
              opacity=".4"
            />
          ))}
          <path
            d="m86 70 8-8 8 8-8 8-8-8m270-18h19m-19 7h12M82 170h17m-9-8v16m266-3 7-7 7 7"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </section>
      <div className="cc-sv-workspace">
        <aside className="cc-sv-filter-rail" aria-label="Service filters">
          <h2>
            <Icon name="filter" />
            Refine your search
          </h2>
          <Filters
            key={canonical}
            state={state}
            prefix="sv-desktop"
            onApply={(draft) =>
              change({ ...draft, search: search.trim(), sort: state.sort, page: 1 })
            }
            onClear={clear}
          />
          <p className="cc-sv-rail-note">
            <Icon name="team" />
            Discover skills within your campus community.
          </p>
        </aside>
        <div className="cc-sv-catalog">
          <div className="cc-sv-toolbar">
            <form className="cc-sv-search" role="search" onSubmit={submitSearch}>
              <Icon name="search" />
              <input
                aria-label="Search services"
                maxLength={100}
                placeholder="What can we help you find?"
                value={search}
                onChange={(e) => setInput({ key: canonical, value: e.target.value })}
              />
              {search ? (
                <button
                  aria-label="Clear search"
                  type="button"
                  onClick={() => {
                    setInput({ key: canonical, value: '' });
                    change({ ...state, search: '', page: 1 });
                  }}
                >
                  <Icon name="close" />
                </button>
              ) : null}
              <button type="submit" aria-label="Search campus services">
                <Icon name="arrow" />
              </button>
            </form>
            <div className="cc-sv-toolbar-controls">
              <Button
                className="cc-sv-filter-trigger"
                icon="filter"
                variant="secondary"
                aria-haspopup="dialog"
                aria-expanded={filtersOpen}
                onClick={() => setFiltersOpen(true)}
              >
                Filters{count ? ` (${count})` : ''}
              </Button>
              <label className="cc-sv-sort">
                <span className="sr-only">Sort services</span>
                <select
                  aria-label="Sort services"
                  className="cc-field"
                  value={state.sort}
                  onChange={(e) =>
                    change({ ...state, sort: e.target.value as ServicesDiscovery['sort'], page: 1 })
                  }
                >
                  <option value="newest">Newest</option>
                  <option value="oldest">Oldest</option>
                  <option value="price_asc">Price: Low to High</option>
                  <option value="price_desc">Price: High to Low</option>
                </select>
              </label>
            </div>
          </div>
          {hasServicesCriteria(state) ? (
            <div className="cc-sv-active-filters" aria-label="Applied filters">
              {(['search', 'category', 'pricingType', 'minPrice', 'maxPrice'] as const)
                .filter((field) => state[field])
                .map((field) => (
                  <button
                    type="button"
                    key={field}
                    aria-label={`Remove ${field} filter`}
                    onClick={() => change({ ...state, [field]: '', page: 1 })}
                  >
                    <span>
                      {field === 'minPrice'
                        ? 'Min ₹'
                        : field === 'maxPrice'
                          ? 'Max ₹'
                          : field === 'pricingType'
                            ? 'Pricing: '
                            : `${field}: `}
                      {state[field]}
                    </span>
                    <Icon name="close" />
                  </button>
                ))}
              <button type="button" onClick={clear}>
                Clear all
              </button>
            </div>
          ) : null}
          <section className="cc-sv-results" aria-labelledby="sv-results-title" aria-busy={loading}>
            <div className="cc-sv-results-heading">
              <div>
                <h2 id="sv-results-title">
                  {hasServicesCriteria(state) ? 'Matching services' : 'Explore services'}
                </h2>
                <p role="status" aria-live="polite">
                  {loading
                    ? 'Finding student services…'
                    : issue
                      ? 'Services could not be loaded'
                      : `${data?.total ?? 0} ${data?.total === 1 ? 'service' : 'services'}`}
                </p>
              </div>
              <span className="cc-sv-community">
                <Icon name="briefcase" />
                Skills worth sharing
              </span>
            </div>
            {loading ? (
              <div className="cc-sv-grid" aria-hidden="true">
                {[0, 1, 2, 3].map((n) => (
                  <div className="cc-sv-skeleton" key={n}>
                    <span />
                    <span />
                    <span />
                    <span />
                  </div>
                ))}
              </div>
            ) : issue ? (
              <div className="cc-sv-state" role="alert">
                <Icon name="warning" />
                <h3>Services unavailable</h3>
                <p>{issue}</p>
                <Button variant="secondary" onClick={() => setAttempt((value) => value + 1)}>
                  Retry
                </Button>
              </div>
            ) : !data?.services.length ? (
              <div className="cc-sv-state">
                <Icon name="briefcase" />
                <h3>
                  {hasServicesCriteria(state) ? 'No matching services' : 'A place for your skills'}
                </h3>
                <p>
                  {hasServicesCriteria(state)
                    ? 'Try another category or adjust your pricing filters.'
                    : 'No published services are available yet. Share a skill with your campus community.'}
                </p>
                {hasServicesCriteria(state) ? (
                  <Button variant="secondary" onClick={clear}>
                    Clear filters
                  </Button>
                ) : (
                  <Link to="/services/new" className="cc-button cc-button--primary">
                    Offer a service
                  </Link>
                )}
              </div>
            ) : (
              <>
                <div className="cc-sv-grid">
                  {data.services.map((service) => (
                    <ServicesBrowseCard key={service.id} service={service} />
                  ))}
                </div>
                <nav className="cc-sv-pagination" aria-label="Services pages">
                  <Button
                    variant="secondary"
                    disabled={data.page <= 1}
                    onClick={() => change({ ...state, page: data.page - 1 })}
                  >
                    Previous
                  </Button>
                  <span>
                    Page {data.page} of {Math.max(1, data.totalPages)}
                  </span>
                  <Button
                    variant="secondary"
                    disabled={data.page >= data.totalPages}
                    onClick={() => change({ ...state, page: data.page + 1 })}
                  >
                    Next
                  </Button>
                </nav>
              </>
            )}
          </section>
        </div>
      </div>
      <Modal
        title="Filter services"
        description="Find the right skills and pricing for you."
        open={filtersOpen}
        onClose={closeFilters}
      >
        <div className="cc-sv-drawer">
          <Filters
            key={canonical}
            state={state}
            prefix="sv-mobile"
            onClear={clear}
            onApply={(draft) => {
              change({ ...draft, search: search.trim(), sort: state.sort, page: 1 });
              closeFilters();
            }}
          />
        </div>
      </Modal>
    </div>
  );
}
