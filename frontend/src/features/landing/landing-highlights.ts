import { frontendEnv } from '../../config/env';

export type LandingHighlightKind = 'LOST_FOUND' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP';

interface LandingHighlightBase {
  readonly createdAt: string;
  readonly id: string;
  readonly route: string;
  readonly summary: string;
  readonly title: string;
}

export interface MarketplaceLandingHighlight extends LandingHighlightBase {
  readonly kind: 'MARKETPLACE';
  readonly metadata: {
    readonly category: string;
    readonly condition: 'FAIR' | 'GOOD' | 'LIKE_NEW' | 'NEW' | 'POOR';
    readonly currency: string;
    readonly price: string;
  };
}

export interface LostFoundLandingHighlight extends LandingHighlightBase {
  readonly kind: 'LOST_FOUND';
  readonly metadata: {
    readonly category: string | null;
    readonly reportType: 'FOUND' | 'LOST';
    readonly status: 'OPEN';
  };
}

export interface TeamUpLandingHighlight extends LandingHighlightBase {
  readonly kind: 'TEAMUP';
  readonly metadata: {
    readonly category: string | null;
    readonly requiredSkills: readonly string[];
    readonly status: 'OPEN';
  };
}

export interface ServiceLandingHighlight extends LandingHighlightBase {
  readonly kind: 'SERVICE';
  readonly metadata: {
    readonly category: string | null;
    readonly currency: string;
    readonly price: string | null;
    readonly pricingType: 'FIXED' | 'FREE' | 'NEGOTIABLE';
    readonly skills: readonly string[];
  };
}

export type LandingHighlight =
  | LostFoundLandingHighlight
  | MarketplaceLandingHighlight
  | ServiceLandingHighlight
  | TeamUpLandingHighlight;

const routePrefixes: Readonly<Record<LandingHighlightKind, string>> = {
  LOST_FOUND: '/lost-found/',
  MARKETPLACE: '/marketplace/',
  SERVICE: '/services/',
  TEAMUP: '/teamup/',
};
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const text = (value: unknown, maximum = 500): value is string =>
  typeof value === 'string' && value.length > 0 && value.length <= maximum;
const nullableText = (value: unknown): value is string | null => value === null || text(value, 120);
const stringList = (value: unknown): value is readonly string[] =>
  Array.isArray(value) && value.length <= 4 && value.every((item) => text(item, 80));

const validBase = (value: Record<string, unknown>, kind: LandingHighlightKind): boolean =>
  text(value.id, 36) &&
  uuid.test(value.id) &&
  text(value.title, 180) &&
  text(value.summary, 500) &&
  text(value.createdAt, 40) &&
  !Number.isNaN(Date.parse(value.createdAt)) &&
  value.route === `${routePrefixes[kind]}${value.id}`;

export const parseLandingHighlight = (value: unknown): LandingHighlight | null => {
  if (!record(value) || !record(value.metadata) || typeof value.kind !== 'string') return null;
  if (!['LOST_FOUND', 'MARKETPLACE', 'SERVICE', 'TEAMUP'].includes(value.kind)) return null;
  const kind = value.kind as LandingHighlightKind;
  const metadata = value.metadata;
  if (!validBase(value, kind)) return null;
  const common = {
    createdAt: value.createdAt as string,
    id: value.id as string,
    route: value.route as string,
    summary: value.summary as string,
    title: value.title as string,
  };
  if (
    kind === 'MARKETPLACE' &&
    text(metadata.category, 120) &&
    ['FAIR', 'GOOD', 'LIKE_NEW', 'NEW', 'POOR'].includes(String(metadata.condition)) &&
    text(metadata.currency, 8) &&
    text(metadata.price, 40)
  )
    return {
      ...common,
      kind,
      metadata: {
        category: metadata.category,
        condition: metadata.condition as MarketplaceLandingHighlight['metadata']['condition'],
        currency: metadata.currency,
        price: metadata.price,
      },
    };
  if (
    kind === 'LOST_FOUND' &&
    nullableText(metadata.category) &&
    ['FOUND', 'LOST'].includes(String(metadata.reportType)) &&
    metadata.status === 'OPEN'
  )
    return {
      ...common,
      kind,
      metadata: {
        category: metadata.category,
        reportType: metadata.reportType as LostFoundLandingHighlight['metadata']['reportType'],
        status: 'OPEN',
      },
    };
  if (
    kind === 'TEAMUP' &&
    nullableText(metadata.category) &&
    stringList(metadata.requiredSkills) &&
    metadata.status === 'OPEN'
  )
    return {
      ...common,
      kind,
      metadata: {
        category: metadata.category,
        requiredSkills: metadata.requiredSkills,
        status: 'OPEN',
      },
    };
  if (
    kind === 'SERVICE' &&
    nullableText(metadata.category) &&
    text(metadata.currency, 8) &&
    (metadata.price === null || text(metadata.price, 40)) &&
    ['FIXED', 'FREE', 'NEGOTIABLE'].includes(String(metadata.pricingType)) &&
    stringList(metadata.skills)
  )
    return {
      ...common,
      kind,
      metadata: {
        category: metadata.category,
        currency: metadata.currency,
        price: metadata.price,
        pricingType: metadata.pricingType as ServiceLandingHighlight['metadata']['pricingType'],
        skills: metadata.skills,
      },
    };
  return null;
};

export const parseLandingHighlightsResponse = (value: unknown): readonly LandingHighlight[] => {
  if (!record(value) || value.success !== true || !record(value.data)) return [];
  const highlights = value.data.highlights;
  if (!Array.isArray(highlights)) return [];
  return highlights.slice(0, 8).flatMap((item) => {
    const parsed = parseLandingHighlight(item);
    return parsed === null ? [] : [parsed];
  });
};

export const fetchLandingHighlights = async (
  options: {
    readonly fetcher?: typeof fetch;
    readonly signal?: AbortSignal;
    readonly timeoutMs?: number;
  } = {},
): Promise<readonly LandingHighlight[]> => {
  const controller = new AbortController();
  const timeout = globalThis.setTimeout(() => controller.abort(), options.timeoutMs ?? 5000);
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  try {
    const response = await (options.fetcher ?? fetch)(
      `${frontendEnv.apiBaseUrl}/api/public/landing-highlights?limit=8`,
      {
        cache: 'no-store',
        credentials: 'omit',
        headers: { accept: 'application/json' },
        signal: controller.signal,
      },
    );
    if (!response.ok) return [];
    return parseLandingHighlightsResponse(await response.json());
  } catch {
    return [];
  } finally {
    globalThis.clearTimeout(timeout);
    options.signal?.removeEventListener('abort', abort);
  }
};

export const highlightsOfKind = <Kind extends LandingHighlightKind>(
  highlights: readonly LandingHighlight[],
  kind: Kind,
): readonly Extract<LandingHighlight, { readonly kind: Kind }>[] =>
  highlights.filter(
    (highlight): highlight is Extract<LandingHighlight, { readonly kind: Kind }> =>
      highlight.kind === kind,
  );
