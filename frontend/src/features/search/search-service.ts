import { apiRequest } from '../../services/api-client';
import type { SearchResponse, SearchResult, SearchType } from './search.types';
export const normalizeSearchQuery = (value: string) =>
  value.trim().replace(/\s+/g, ' ').slice(0, 100);
export const searchUrl = (query: string, type: SearchType = 'ALL', page = 1, limit = 12) => {
  const params = new URLSearchParams({
    limit: String(limit),
    page: String(page),
    q: normalizeSearchQuery(query),
    type,
  });
  return `/api/search?${params.toString()}`;
};
export const internalSearchTarget = (value: string) =>
  /^\/(profile|marketplace|lost-found|teamup|services)\/[0-9a-f-]+$/i.test(value)
    ? value
    : '/search';
export const groupSearchResults = (items: readonly SearchResult[]) =>
  items.reduce<Partial<Record<SearchResult['type'], SearchResult[]>>>((groups, item) => {
    (groups[item.type] ??= []).push(item);
    return groups;
  }, {});
export const searchApi = {
  search: (query: string, type: SearchType, page: number, limit: number, signal?: AbortSignal) =>
    apiRequest<SearchResponse>(searchUrl(query, type, page, limit), { signal }),
};
