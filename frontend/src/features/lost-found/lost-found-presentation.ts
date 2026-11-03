import type { LostFoundFilters, LostFoundImage } from './lost-found.types';

// Existing report-form suggestions. Category filtering remains free text, as in the API.
export const lostFoundCategories = [
  'Electronics',
  'Identity card',
  'Accessories',
  'Books',
  'Clothing',
  'Other',
] as const;
export const publicReportStatuses = ['OPEN', 'MATCHED', 'CLAIM_PENDING', 'RESOLVED'] as const;
export const lostFoundSorts = ['newest', 'incident_newest', 'oldest'] as const;
export const defaultLostFoundFilters: LostFoundFilters = {
  category: '',
  dateFrom: '',
  dateTo: '',
  keyword: '',
  limit: 12,
  location: '',
  page: 1,
  sort: 'newest',
  status: '',
  type: '',
};
export const reportLabel = (value: string): string =>
  value
    .toLowerCase()
    .replaceAll('_', ' ')
    .replace(/^./, (char) => char.toUpperCase());
export const reportDate = (value: string | null, dateOnly = false): string => {
  if (!value) return 'Not shared';
  const date = new Date(dateOnly ? `${value}T00:00:00.000Z` : value);
  return Number.isNaN(date.getTime())
    ? 'Not shared'
    : new Intl.DateTimeFormat(undefined, {
        dateStyle: 'medium',
        ...(dateOnly ? { timeZone: 'UTC' } : {}),
      }).format(date);
};
const isDeliveryUrl = (value: unknown): value is string => {
  if (typeof value !== 'string' || !value.trim()) return false;
  try {
    const url = new URL(value, 'https://campusconnect.invalid');
    return /^(https?:\/\/|\/)/i.test(value.trim()) && ['https:', 'http:'].includes(url.protocol);
  } catch {
    return false;
  }
};
export const reportPhotoCandidates = (images: readonly LostFoundImage[]) => [
  ...new Map(
    [...images]
      .sort((a, b) => a.position - b.position)
      .filter((image) => isDeliveryUrl(image.url))
      .map((image) => [image.url!, image]),
  ).values(),
];
const validDate = (value: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(value) &&
  !Number.isNaN(new Date(`${value}T00:00:00Z`).getTime()) &&
  new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
export function lostFoundDateError(from: string, to: string): string | null {
  if ((from && !validDate(from)) || (to && !validDate(to))) return 'Choose valid incident dates.';
  return from && to && from > to ? 'The end date must be on or after the start date.' : null;
}
export function parseLostFoundSearch(params: URLSearchParams): LostFoundFilters {
  const from = params.get('dateFrom') ?? '',
    to = params.get('dateTo') ?? '';
  const sort = params.get('sort') ?? '';
  const status = params.get('status') ?? '';
  const type = params.get('type') ?? '';
  const page = Number(params.get('page'));
  return {
    ...defaultLostFoundFilters,
    category: (params.get('category') ?? '').trim().slice(0, 100),
    location: (params.get('location') ?? '').trim().slice(0, 180),
    keyword: (params.get('keyword') ?? '').trim().slice(0, 100),
    dateFrom: from && validDate(from) ? from : '',
    dateTo: to && validDate(to) ? to : '',
    sort: lostFoundSorts.includes(sort as LostFoundFilters['sort'])
      ? (sort as LostFoundFilters['sort'])
      : 'newest',
    status: publicReportStatuses.includes(status as (typeof publicReportStatuses)[number])
      ? (status as LostFoundFilters['status'])
      : '',
    type: type === 'LOST' || type === 'FOUND' ? type : '',
    page: Number.isSafeInteger(page) && page > 0 ? page : 1,
  };
}
export function lostFoundSearch(filters: LostFoundFilters): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (
      key === 'limit' ||
      value === '' ||
      (key === 'page' && value === 1) ||
      (key === 'sort' && value === 'newest')
    )
      continue;
    params.set(key, String(value));
  }
  return params;
}
