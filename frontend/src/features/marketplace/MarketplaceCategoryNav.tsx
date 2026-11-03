import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon } from '../../components/Icon';
import { categoryCellWidth, categoryScrollState, categoryScrollTarget } from './category-carousel';
import type { MarketplaceCategory } from './marketplace.types';

const categoryPaths: Readonly<Record<string, string>> = {
  'books-study-material':
    'M4 4h6a3 3 0 0 1 2 1 3 3 0 0 1 2-1h6v15h-6a3 3 0 0 0-2 1 3 3 0 0 0-2-1H4ZM12 5v15',
  electronics: 'M3 4h18v12H3ZM8 21h8m-4-5v5',
  calculators: 'M6 2h12v20H6ZM9 5h6v4H9Zm0 8h.01M15 13h.01M9 17h.01M15 17h.01',
  cycles:
    'M6 12a4 4 0 1 0 0 8 4 4 0 0 0 0-8Zm12 0a4 4 0 1 0 0 8 4 4 0 0 0 0-8ZM6 16l4-9 8 9M9 7h5m2-3h3l-1 12',
  'clothing-accessories': 'm8 3-6 4 3 5 3-2v11h8V10l3 2 3-5-6-4a4 4 0 0 1-8 0Z',
  furniture: 'M5 13V5h14v8M3 11v7h18v-7M5 18v4m14-4v4M3 15h18',
  'hostel-essentials': 'M3 21V4m0 12h18v5m-18-9h18v4M6 8h5v4m10 0V8h-7v4',
  'lab-equipment': 'M9 2h6m-5 0v7L4 20q-1 2 2 2h12q3 0 2-2L14 9V2M7 15h10',
  gaming: 'M7 7h10l4 11q0 3-3 1l-3-3H9l-3 3q-3 2-3-1ZM7 10v5m-2-2h4m6-1h.01m3 2h.01',
  automotive: 'M3 12l3-7h12l3 7v8h-3v-3H6v3H3Zm0 0h18M6 14h2m8 0h2',
  'music-instruments':
    'M9 18V5l11-3v13M9 8l11-3M9 18a3 3 0 1 1-3-3 3 3 0 0 1 3 3Zm11-3a3 3 0 1 1-3-3 3 3 0 0 1 3 3Z',
};

export function MarketplaceCategoryNav({
  categories,
  selected,
  onSelect,
}: {
  readonly categories: readonly MarketplaceCategory[];
  readonly selected: string;
  readonly onSelect: (id: string) => void;
}) {
  const rail = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const id = useId();
  const [edges, setEdges] = useState({ overflow: false, previous: false, next: false });
  const reveal = useCallback((element: HTMLElement) => {
    const container = rail.current;
    if (!container) return;
    const item = element.getBoundingClientRect();
    const bounds = container.getBoundingClientRect();
    const delta =
      item.left < bounds.left + 2
        ? item.left - bounds.left - 2
        : item.right > bounds.right - 2
          ? item.right - bounds.right + 2
          : 0;
    if (delta) container.scrollBy({ left: delta, behavior: 'instant' });
  }, []);
  useEffect(() => {
    const container = rail.current;
    if (!container || !track.current) return;
    const content = track.current;
    const geometry = () => {
      const minimum = parseFloat(
        getComputedStyle(container).getPropertyValue('--market-category-min'),
      );
      const gap = parseFloat(getComputedStyle(content).columnGap);
      const natural = content.children.length * (minimum + gap) - gap;
      const fits = natural <= (container.parentElement?.clientWidth ?? 0) - 4 + 1;
      return { minimum, gap, fits };
    };
    const measure = () => {
      const fitsWithoutArrows = geometry().fits;
      const next = fitsWithoutArrows
        ? { overflow: false, previous: false, next: false }
        : categoryScrollState(container.scrollLeft, container.scrollWidth, container.clientWidth);
      setEdges((previous) =>
        previous.overflow === next.overflow &&
        previous.previous === next.previous &&
        previous.next === next.next
          ? previous
          : next,
      );
    };
    const resized = () => {
      const { minimum, gap, fits } = geometry();
      const width = fits ? minimum : categoryCellWidth(container.clientWidth - 4, minimum, gap);
      const value = `${width}px`;
      if (container.style.getPropertyValue('--market-category-cell') !== value)
        container.style.setProperty('--market-category-cell', value);
      const focused = document.activeElement;
      const active =
        focused instanceof HTMLElement && container.contains(focused)
          ? focused
          : container.querySelector<HTMLElement>('[aria-pressed="true"]');
      if (active) reveal(active);
      measure();
    };
    container.addEventListener('scroll', measure, { passive: true });
    const observer = new ResizeObserver(resized);
    observer.observe(container);
    observer.observe(track.current);
    resized();
    return () => {
      container.removeEventListener('scroll', measure);
      observer.disconnect();
    };
  }, [categories, reveal]);
  useEffect(() => {
    const active = rail.current?.querySelector<HTMLElement>('[aria-pressed="true"]');
    if (active) reveal(active);
  }, [selected, categories, reveal]);
  const scroll = (direction: -1 | 1) => {
    const container = rail.current;
    if (!container) return;
    container.scrollTo({
      left: categoryScrollTarget(
        container.scrollLeft,
        container.scrollWidth,
        container.clientWidth,
        direction,
        (track.current?.children[0]?.getBoundingClientRect().width ?? 0) +
          parseFloat(getComputedStyle(track.current ?? container).columnGap),
        parseFloat(getComputedStyle(track.current ?? container).columnGap),
      ),
      behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
        ? 'instant'
        : 'smooth',
    });
  };
  return (
    <nav
      className="cc-market-categories"
      data-overflow={edges.overflow}
      aria-label="Browse Marketplace categories"
    >
      <button
        className="cc-market-category-arrow cc-market-category-arrow--previous"
        type="button"
        aria-label="Previous categories"
        aria-controls={id}
        hidden={!edges.overflow}
        disabled={!edges.previous}
        onClick={() => scroll(-1)}
      >
        <Icon name="chevron" />
      </button>
      <div
        ref={rail}
        id={id}
        className="cc-market-category-rail"
        role="group"
        aria-label="Categories"
        tabIndex={0}
        onFocusCapture={(event) => {
          if (event.target !== event.currentTarget) reveal(event.target);
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const options = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[aria-pressed]'),
          );
          const index = options.indexOf(event.target as HTMLButtonElement);
          if (index < 0) {
            if (event.key === 'Home' || event.key === 'End')
              event.currentTarget.scrollTo({
                left: event.key === 'Home' ? 0 : event.currentTarget.scrollWidth,
                behavior: 'instant',
              });
            else scroll(event.key === 'ArrowLeft' ? -1 : 1);
          } else {
            const next =
              event.key === 'Home'
                ? 0
                : event.key === 'End'
                  ? options.length - 1
                  : Math.max(
                      0,
                      Math.min(options.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)),
                    );
            options[next]?.focus({ preventScroll: true });
            if (options[next]) reveal(options[next]);
          }
        }}
      >
        <div ref={track} className="cc-market-category-track">
          {[{ id: '', name: 'All' }, ...categories].map((category) => (
            <button
              type="button"
              className="cc-market-category-option"
              key={category.id}
              aria-pressed={selected === category.id}
              aria-label={category.name}
              title={category.name}
              onClick={() => onSelect(category.id)}
            >
              <span>
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path
                    d={
                      category.id
                        ? (categoryPaths[category.id] ?? 'M4 4h16v16H4ZM8 8h8m-8 4h8m-8 4h5')
                        : 'M3 3h7v7H3ZM14 3h7v7h-7ZM3 14h7v7H3ZM14 14h7v7h-7Z'
                    }
                  />
                </svg>
              </span>
              <span className="cc-market-category-label">{category.name}</span>
            </button>
          ))}
        </div>
      </div>
      <button
        className="cc-market-category-arrow"
        type="button"
        aria-label="Next categories"
        aria-controls={id}
        hidden={!edges.overflow}
        disabled={!edges.next}
        onClick={() => scroll(1)}
      >
        <Icon name="chevron" />
      </button>
    </nav>
  );
}
