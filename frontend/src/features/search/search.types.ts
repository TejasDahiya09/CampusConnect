export const searchTypes = [
  'ALL',
  'STUDENT',
  'MARKETPLACE',
  'LOST_FOUND',
  'TEAMUP',
  'SERVICE',
] as const;
export type SearchType = (typeof searchTypes)[number];
export interface SearchResult {
  readonly description: string | null;
  readonly id: string;
  readonly image: string | null;
  readonly metadata: Readonly<Record<string, number | string | readonly string[] | null>>;
  readonly navigationTarget: string;
  readonly subtitle: string | null;
  readonly title: string;
  readonly type: Exclude<SearchType, 'ALL'>;
}
export interface SearchResponse {
  readonly items: readonly SearchResult[];
  readonly limit: number;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
  readonly totals: Readonly<Record<Exclude<SearchType, 'ALL'>, number>>;
}
