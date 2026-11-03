import { useEffect, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Button, Card, EmptyState, PageHeader, Skeleton, Tabs } from '../../components/ui';
import { normalizeSearchQuery, searchApi } from './search-service';
import { SearchResultItem } from './SearchResultItem';
import { searchTypes, type SearchResponse, type SearchType } from './search.types';

const tabs = [
  { id: 'ALL', label: 'All' },
  { id: 'STUDENT', label: 'Students' },
  { id: 'MARKETPLACE', label: 'Marketplace' },
  { id: 'LOST_FOUND', label: 'Lost & Found' },
  { id: 'TEAMUP', label: 'TeamUp' },
  { id: 'SERVICE', label: 'Services' },
];
const validType = (value: string | null): SearchType =>
  searchTypes.includes(value as SearchType) ? (value as SearchType) : 'ALL';

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const query = normalizeSearchQuery(params.get('q') ?? '');
  const type = validType(params.get('type')?.toUpperCase() ?? null);
  const page = Math.max(1, Number.parseInt(params.get('page') ?? '1', 10) || 1);
  const [input, setInput] = useState(query);
  const [result, setResult] = useState<SearchResponse | null>(null);
  const [retry, setRetry] = useState(0);
  const [state, setState] = useState<'error' | 'idle' | 'loading' | 'ready'>(
    query.length >= 2 ? 'loading' : 'idle',
  );

  useEffect(() => {
    if (query.length < 2) return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState('loading');
      void searchApi
        .search(query, type, page, type === 'ALL' ? 5 : 12, controller.signal)
        .then((value) => {
          setResult(value);
          setState('ready');
        })
        .catch(() => {
          if (!controller.signal.aborted) setState('error');
        });
    }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [page, query, retry, type]);

  const update = (nextType: SearchType, nextPage = 1, nextQuery = query) => {
    setInput(nextQuery);
    setParams({
      q: nextQuery,
      ...(nextType === 'ALL' ? {} : { type: nextType }),
      ...(nextPage === 1 ? {} : { page: String(nextPage) }),
    });
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeSearchQuery(input);
    if (next.length >= 2) update(type, 1, next);
  };

  return (
    <div className="cc-page">
      <PageHeader
        description="Find students, listings, reports, projects, and student services from one place."
        eyebrow="Campus discovery"
        title="Search CampusConnect"
      />
      <Card className="mt-6 p-4 sm:p-5">
        <form className="flex flex-col gap-3 sm:flex-row" onSubmit={submit} role="search">
          <label className="sr-only" htmlFor="search-page-input">
            Search CampusConnect
          </label>
          <input
            className="cc-field cc-search-page-input min-w-0 flex-1"
            id="search-page-input"
            maxLength={100}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Search campus"
            value={input}
          />
          <Button disabled={normalizeSearchQuery(input).length < 2} icon="search" type="submit">
            Search
          </Button>
        </form>
        <div className="mt-4">
          <Tabs active={type} items={tabs} onChange={(value) => update(value as SearchType)} />
        </div>
      </Card>
      {state === 'idle' ? (
        <Card className="mt-6">
          <EmptyState
            description="Enter at least two characters to search across CampusConnect."
            icon="search"
            title="What are you looking for?"
          />
        </Card>
      ) : null}
      {state === 'loading' ? (
        <div aria-label="Loading search results" className="mt-6 grid gap-3">
          {[0, 1, 2, 3].map((item) => (
            <Skeleton className="h-24 rounded-xl" key={item} />
          ))}
        </div>
      ) : null}
      {state === 'error' ? (
        <Card className="mt-6">
          <EmptyState
            action={
              <Button onClick={() => setRetry((value) => value + 1)} variant="secondary">
                Retry
              </Button>
            }
            description="The search request could not be completed."
            icon="warning"
            title="Search unavailable"
          />
        </Card>
      ) : null}
      {state === 'ready' && result?.items.length === 0 ? (
        <Card className="mt-6">
          <EmptyState
            description="Try a broader term or another result type."
            icon="search"
            title="No results found"
          />
        </Card>
      ) : null}
      {state === 'ready' && result && result.items.length > 0 ? (
        <>
          <p className="mt-6 text-sm text-slate-400">
            <strong className="text-slate-100">{result.total}</strong> results for “{query}”
          </p>
          <Card className="mt-3 divide-y divide-white/[.06] overflow-hidden">
            {result.items.map((item) => (
              <SearchResultItem key={`${item.type}-${item.id}`} result={item} />
            ))}
          </Card>
          {result.totalPages > 1 ? (
            <nav
              aria-label="Search result pages"
              className="mt-5 flex items-center justify-center gap-3"
            >
              <Button
                disabled={page <= 1}
                onClick={() => update(type, page - 1)}
                variant="secondary"
              >
                Previous
              </Button>
              <span className="text-sm text-slate-400">
                Page {page} of {result.totalPages}
              </span>
              <Button
                disabled={page >= result.totalPages}
                onClick={() => update(type, page + 1)}
                variant="secondary"
              >
                Next
              </Button>
            </nav>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
