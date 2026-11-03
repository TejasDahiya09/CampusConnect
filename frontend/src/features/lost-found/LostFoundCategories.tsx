import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Icon, type IconName } from '../../components/Icon';
import {
  categoryCellWidth,
  categoryScrollState,
  categoryScrollTarget,
} from '../marketplace/category-carousel';
import { lostFoundCategories } from './lost-found-presentation';

const icons: Readonly<Record<string, IconName>> = {
  Electronics: 'monitor',
  'Identity card': 'profile',
  Accessories: 'briefcase',
  Books: 'copy',
  Clothing: 'store',
  Other: 'inbox',
};
export function LostFoundCategories({
  selected,
  onSelect,
}: {
  readonly selected: string;
  readonly onSelect: (category: string) => void;
}) {
  const rail = useRef<HTMLDivElement>(null),
    track = useRef<HTMLDivElement>(null),
    nav = useRef<HTMLElement>(null);
  const id = useId();
  const [edges, setEdges] = useState({ overflow: false, previous: false, next: false });
  const reveal = useCallback((element: HTMLElement) => {
    const parent = rail.current;
    if (!parent) return;
    const item = element.getBoundingClientRect(),
      bounds = parent.getBoundingClientRect();
    const delta =
      item.left < bounds.left + 2
        ? item.left - bounds.left - 2
        : item.right > bounds.right - 2
          ? item.right - bounds.right + 2
          : 0;
    if (delta) parent.scrollBy({ left: delta, behavior: 'instant' });
  }, []);
  useEffect(() => {
    const element = rail.current,
      content = track.current,
      parent = nav.current;
    if (!element || !content || !parent) return;
    const measure = () => {
      const min = parseFloat(getComputedStyle(element).getPropertyValue('--lf-category-min'));
      const gap = parseFloat(getComputedStyle(content).columnGap);
      const overflow =
        (lostFoundCategories.length + 1) * (min + gap) - gap > parent.clientWidth - 4;
      const width = overflow ? categoryCellWidth(element.clientWidth - 4, min, gap) : min;
      const value = `${width}px`;
      if (element.style.getPropertyValue('--lf-category-cell') !== value)
        element.style.setProperty('--lf-category-cell', value);
      const state = overflow
        ? categoryScrollState(element.scrollLeft, element.scrollWidth, element.clientWidth)
        : { overflow: false, previous: false, next: false };
      setEdges((old) => (JSON.stringify(old) === JSON.stringify(state) ? old : state));
    };
    const resized = () => {
      measure();
      const active = element.querySelector<HTMLElement>('[aria-pressed=true]');
      if (active) reveal(active);
    };
    const observer = new ResizeObserver(resized);
    observer.observe(element);
    observer.observe(parent);
    element.addEventListener('scroll', measure, { passive: true });
    resized();
    return () => {
      observer.disconnect();
      element.removeEventListener('scroll', measure);
    };
  }, [reveal]);
  useEffect(() => {
    const active = rail.current?.querySelector<HTMLElement>('[aria-pressed=true]');
    if (active) reveal(active);
  }, [selected, reveal, edges.overflow]);
  const scroll = (direction: -1 | 1) => {
    const element = rail.current,
      content = track.current;
    if (!element || !content) return;
    const gap = parseFloat(getComputedStyle(content).columnGap),
      stride = (content.firstElementChild?.getBoundingClientRect().width ?? 0) + gap;
    element.scrollTo({
      left: categoryScrollTarget(
        element.scrollLeft,
        element.scrollWidth,
        element.clientWidth,
        direction,
        stride,
        gap,
      ),
      behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'instant' : 'smooth',
    });
  };
  return (
    <nav
      ref={nav}
      className="cc-lf-categories"
      aria-label="Browse report categories"
      data-overflow={edges.overflow}
    >
      <button
        className="cc-lf-category-arrow cc-lf-category-previous"
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
        className="cc-lf-category-rail"
        role="group"
        aria-label="Report categories"
        tabIndex={0}
        onFocusCapture={(event) => {
          if (event.target !== event.currentTarget) reveal(event.target);
        }}
        onKeyDown={(event) => {
          if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
          event.preventDefault();
          const buttons = Array.from(
            event.currentTarget.querySelectorAll<HTMLButtonElement>('[aria-pressed]'),
          );
          const index = buttons.indexOf(event.target as HTMLButtonElement);
          if (index < 0) {
            scroll(event.key === 'ArrowLeft' || event.key === 'Home' ? -1 : 1);
            return;
          }
          const next =
            event.key === 'Home'
              ? 0
              : event.key === 'End'
                ? buttons.length - 1
                : Math.max(
                    0,
                    Math.min(buttons.length - 1, index + (event.key === 'ArrowLeft' ? -1 : 1)),
                  );
          buttons[next]?.focus({ preventScroll: true });
          if (buttons[next]) reveal(buttons[next]);
        }}
      >
        <div ref={track} className="cc-lf-category-track">
          {['', ...lostFoundCategories].map((category) => (
            <button
              key={category}
              className="cc-lf-category"
              type="button"
              aria-pressed={selected === category}
              aria-label={category || 'All categories'}
              onClick={() => onSelect(category)}
            >
              <span>
                <Icon name={category ? icons[category] : 'dashboard'} />
              </span>
              <span>{category || 'All'}</span>
            </button>
          ))}
        </div>
      </div>
      <button
        className="cc-lf-category-arrow"
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
