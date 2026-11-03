import { useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { groupSearchResults, normalizeSearchQuery, searchApi } from './search-service';
import { SearchResultItem } from './SearchResultItem';
import type { SearchResult } from './search.types';

const groupLabels = {
  STUDENT: 'Students',
  MARKETPLACE: 'Marketplace',
  LOST_FOUND: 'Lost & Found',
  TEAMUP: 'TeamUp',
  SERVICE: 'Services',
} as const;

export function GlobalSearch({
  autoFocus = false,
  onDismiss,
}: {
  readonly autoFocus?: boolean;
  readonly onDismiss?: () => void;
}) {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [items, setItems] = useState<readonly SearchResult[]>([]);
  const [state, setState] = useState<'error' | 'idle' | 'loading' | 'ready'>('idle');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const request = useRef(0);
  const root = useRef<HTMLDivElement>(null);
  const normalized = normalizeSearchQuery(query);
  const grouped = useMemo(() => groupSearchResults(items), [items]);

  useEffect(() => {
    if (normalized.length < 2) return;
    const sequence = ++request.current;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      setState('loading');
      void searchApi
        .search(normalized, 'ALL', 1, 3, controller.signal)
        .then((result) => {
          if (sequence !== request.current) return;
          setItems(result.items);
          setState('ready');
          setOpen(true);
          setActive(-1);
        })
        .catch(() => {
          if (!controller.signal.aborted && sequence === request.current) setState('error');
        });
    }, 300);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [normalized]);

  useEffect(() => {
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [onDismiss]);

  const viewAll = () => {
    if (normalized.length >= 2) void navigate(`/search?q=${encodeURIComponent(normalized)}`);
    setOpen(false);
    onDismiss?.();
  };
  const keyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Escape') {
      setOpen(false);
      onDismiss?.();
      return;
    }
    if (!open || items.length === 0) return;
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((value) => Math.min(items.length - 1, value + 1));
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((value) => Math.max(-1, value - 1));
    }
    if (event.key === 'Enter' && active >= 0) {
      event.preventDefault();
      void navigate(items[active].navigationTarget);
      setOpen(false);
      onDismiss?.();
    }
  };

  return (
    <div className="cc-global-search relative ml-auto w-full max-w-md" ref={root}>
      <form
        className="cc-global-search-form"
        onSubmit={(event: FormEvent) => {
          event.preventDefault();
          viewAll();
        }}
        role="search"
      >
        <label className="sr-only" htmlFor="global-search">
          Search CampusConnect
        </label>
        <Icon className="cc-global-search-icon size-4" name="search" />
        <input
          aria-autocomplete="list"
          aria-controls="global-search-results"
          aria-expanded={open}
          autoFocus={autoFocus}
          autoComplete="off"
          className="cc-global-search-input"
          id="global-search"
          maxLength={100}
          onChange={(event) => {
            const value = event.target.value;
            setQuery(value);
            if (normalizeSearchQuery(value).length < 2) {
              setItems([]);
              setState('idle');
            }
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={keyDown}
          placeholder="Search CampusConnect"
          role="combobox"
          value={query}
        />
      </form>
      {open && normalized.length >= 2 ? (
        <section
          aria-label="Search suggestions"
          className="cc-global-search-results cc-popover absolute right-0 top-12 z-50 max-h-[min(70vh,34rem)] w-[min(92vw,31rem)] overflow-y-auto rounded-[var(--cc-radius-lg)] shadow-[var(--cc-shadow-lg)]"
          id="global-search-results"
          role="listbox"
        >
          {state === 'loading' ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--cc-muted)]">
              Searching CampusConnect…
            </p>
          ) : null}
          {state === 'error' ? (
            <div className="px-4 py-5 text-center">
              <p className="text-sm text-[var(--cc-danger)]">Search is temporarily unavailable.</p>
              <button
                className="mt-2 text-xs text-[var(--cc-primary)]"
                onClick={() => setQuery((value) => `${value} `)}
                type="button"
              >
                Retry
              </button>
            </div>
          ) : null}
          {state === 'ready' && items.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm text-[var(--cc-muted)]">
              No results found.
            </p>
          ) : null}
          {state === 'ready'
            ? Object.entries(grouped).map(([type, results]) =>
                results?.length ? (
                  <div
                    className="border-b last:border-0 [border-color:var(--cc-border)]"
                    key={type}
                  >
                    <p className="px-4 pb-1 pt-3 text-[.65rem] font-bold uppercase tracking-wider text-[var(--cc-muted)]">
                      {groupLabels[type as keyof typeof groupLabels]}
                    </p>
                    {results.map((result) => (
                      <SearchResultItem
                        compact
                        key={`${result.type}-${result.id}`}
                        onNavigate={() => {
                          setOpen(false);
                          onDismiss?.();
                        }}
                        result={result}
                      />
                    ))}
                  </div>
                ) : null,
              )
            : null}
          {state === 'ready' ? (
            <Link
              className="block px-4 py-3 text-center text-sm font-medium text-[var(--cc-primary)] hover:bg-[var(--cc-hover)]"
              onClick={() => {
                setOpen(false);
                onDismiss?.();
              }}
              to={`/search?q=${encodeURIComponent(normalized)}`}
            >
              View all results
            </Link>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}
