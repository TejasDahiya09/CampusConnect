import type { ContentVisualKind } from './landing-presentation';

const artwork: Readonly<Record<ContentVisualKind, readonly string[]>> = {
  calculator: [
    'M19 9h26v46H19z',
    'M23 14h18v10H23z',
    'M24 31h2m6 0h2m6 0h1M24 38h2m6 0h2m6 0h1M24 45h2m6 0h2m6 0h1',
  ],
  book: [
    'M17 12h29v43H17a5 5 0 0 1-5-5V17a5 5 0 0 1 5-5z',
    'M18 12v36m-6 2a5 5 0 0 1 5-5h29M25 23h14m-14 6h10',
  ],
  bag: [
    'M24 15v-3a8 8 0 0 1 16 0v3',
    'M20 15h24l5 13v26H15V28z',
    'M23 35h18v13H23zM20 23h24M24 23v5m16-5v5',
  ],
  device: ['M12 13h40v29H12z', 'M8 50h48l-4-8H12zM26 22l-5 5 5 5m12-10 5 5-5 5'],
  cycle: [
    'M25 44a10 10 0 1 1-20 0 10 10 0 0 1 20 0Zm34 0a10 10 0 1 1-20 0 10 10 0 0 1 20 0Z',
    'm15 44 11-22 11 22H15m11-22h17l6 22M22 17h9m9 0h7l-4 5',
  ],
  furniture: ['M18 12h28v23H18z', 'M13 35h38v8H13zM19 43v13m26-13v13M13 25v10m38-10v10'],
  keys: ['M30 23a11 11 0 1 1-22 0 11 11 0 0 1 22 0Z', 'm28 29 24 24m-7-7 6-6m-14-2 6-6M17 21h.1'],
  wallet: ['M12 19h40v33H12z', 'm12 19 33-9v9M39 29h17v14H39zM45 36h.1'],
  identity: [
    'M10 15h44v36H10z',
    'M32 15v-5m-14 26a6 6 0 1 0 12 0 6 6 0 0 0-12 0ZM16 46c0-6 16-6 16 0M39 29h9m-9 7h9',
  ],
  project: ['M12 13h40v38H12z', 'M12 22h40m-33-4h.1m5 0h.1m5 0h.1M26 30l-6 6 6 6m12-12 6 6-6 6'],
  design: [
    'm14 43 25-25 10 10-25 25-14 4z',
    'm34 23 10 10M15 43l9 10M12 12h12m-12 0v12M52 52H40m12 0V40',
  ],
  tutoring: ['m6 24 26-12 26 12-26 12z', 'M16 30v15c10 8 22 8 32 0V30M56 25v20'],
  service: ['M24 18v-7h16v7', 'M10 18h44v34H10zM10 30h44M27 30v7h10v-7'],
  item: ['m10 21 22-11 22 11v26L32 58 10 47z', 'm10 21 22 12 22-12M32 33v25M21 15l22 12'],
};

export function ContentVisual({
  kind,
  compact = false,
}: {
  readonly kind: ContentVisualKind;
  readonly compact?: boolean;
}) {
  return (
    <div
      className={`cc-content-visual${compact ? ' cc-content-visual--compact' : ''}`}
      data-visual={kind}
      aria-hidden="true"
    >
      <span className="cc-visual-grid" />
      <svg
        viewBox="0 0 64 64"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        {artwork[kind].map((path) => (
          <path d={path} key={path} />
        ))}
      </svg>
      {!compact ? <span className="cc-visual-caption">Category illustration</span> : null}
    </div>
  );
}
