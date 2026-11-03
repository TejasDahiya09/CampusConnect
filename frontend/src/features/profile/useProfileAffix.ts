import { useEffect, useRef } from 'react';

/** Profile-local, bounded visual affix. Does not replace the window scroller or use fixed portals. */
export function useProfileAffix() {
  const workspace = useRef<HTMLDivElement>(null);
  const rail = useRef<HTMLElement>(null);
  const completion = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = workspace.current;
    if (!root) return;
    const header = document.querySelector<HTMLElement>('.cc-top-nav');
    let frame = 0;
    let offset = 0;
    const update = () => {
      frame = 0;
      const side = rail.current;
      if (!side) return;
      const extra = completion.current;
      const sideBox = side.getBoundingClientRect();
      const extraBox = extra?.getBoundingClientRect();
      const rootBox = root.getBoundingClientRect();
      const headerBox = header?.getBoundingClientRect();
      // Read normal-flow coordinates by subtracting our previous visual translation.
      const start = sideBox.top - offset;
      const end = (extraBox?.bottom ?? sideBox.bottom) - offset;
      const height = end - start;
      const maxHeader = (headerBox?.height ?? 0) + 16;
      const visibleHeader = Math.max(0, headerBox?.bottom ?? 0) + 16;
      const fits = innerWidth >= 1100 && height + maxHeader + 16 <= innerHeight;
      const visible = root.getClientRects().length > 0 && sideBox.height > 0;
      // The pair must be contiguous; otherwise preserve ordinary layout.
      const gap = extraBox ? extraBox.top - sideBox.bottom : 0;
      const contiguous = !extraBox || (gap >= 0 && gap <= 40);
      const limit = Math.max(0, rootBox.bottom - end);
      const next =
        fits && visible && contiguous ? Math.min(limit, Math.max(0, visibleHeader - start)) : 0;
      if (Math.abs(next - offset) > 0.1) {
        const wasAffixed = offset > 0;
        offset = next;
        root.style.setProperty('--sp-affix-offset', `${offset}px`);
        // If expansion/resizing disables affix, keep the current focused control visible.
        const active = document.activeElement;
        if (
          wasAffixed &&
          !fits &&
          active instanceof HTMLElement &&
          (side.contains(active) || extra?.contains(active))
        ) {
          active.scrollIntoView({ block: 'nearest', behavior: 'instant' });
        }
      }
      root.dataset.affixMode = offset > 0.1 ? 'bounded' : 'flow';
      root.dataset.affixEligible = String(fits && visible && contiguous && limit > 0);
    };
    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };
    const observer = new ResizeObserver(schedule);
    for (const node of [root, rail.current, completion.current, header])
      if (node) observer.observe(node);
    window.addEventListener('scroll', schedule, { passive: true });
    window.addEventListener('resize', schedule);
    schedule();
    return () => {
      observer.disconnect();
      window.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      cancelAnimationFrame(frame);
      root.style.removeProperty('--sp-affix-offset');
    };
  }, []);
  return { workspace, rail, completion };
}
