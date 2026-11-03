import { conditions, discoveryStatuses } from './marketplace-format';
import type { ListingCondition, ListingDiscoveryStatus, ListingSort } from './marketplace.types';
import type { MarketplaceCategory } from './marketplace.types';

const categoryIdPattern = /^[a-z0-9][a-z0-9-]{0,99}$/i;
const pricePattern = /^\d{1,10}(?:\.\d{1,2})?$/;
const sorts: readonly ListingSort[] = ['newest', 'price_asc', 'price_desc'];

export interface MarketplaceDiscoveryState {
  readonly categoryId: string;
  readonly condition: ListingCondition | '';
  readonly maxPrice: string;
  readonly minPrice: string;
  readonly page: number;
  readonly search: string;
  readonly sort: ListingSort;
  readonly status: ListingDiscoveryStatus | '';
}

export const defaultMarketplaceDiscovery: MarketplaceDiscoveryState = {
  categoryId: '',
  condition: '',
  maxPrice: '',
  minPrice: '',
  page: 1,
  search: '',
  sort: 'newest',
  status: '',
};

const isCondition = (value: string | null): value is ListingCondition =>
  value !== null && conditions.some((condition) => condition === value);

const isDiscoveryStatus = (value: string | null): value is ListingDiscoveryStatus =>
  value !== null && discoveryStatuses.some((status) => status === value);

const isSort = (value: string | null): value is ListingSort =>
  value !== null && sorts.some((sort) => sort === value);

const validPrice = (value: string | null): string =>
  value !== null && pricePattern.test(value) ? value : '';

export const readMarketplaceDiscovery = (
  searchString: string,
  categories?: readonly Pick<MarketplaceCategory, 'id'>[],
): MarketplaceDiscoveryState => {
  const parameters = new URLSearchParams(searchString);
  const search = (parameters.get('search') ?? '').trim();
  const categoryId = parameters.get('categoryId') ?? '';
  const pageValue = parameters.get('page');
  const page = pageValue !== null && /^\d+$/.test(pageValue) ? Number(pageValue) : 1;
  const condition = parameters.get('condition');
  const status = parameters.get('status');
  const sort = parameters.get('sort');

  return {
    categoryId:
      categoryIdPattern.test(categoryId) &&
      (categories === undefined || categories.some(({ id }) => id === categoryId))
        ? categoryId
        : '',
    condition: isCondition(condition) ? condition : '',
    maxPrice: validPrice(parameters.get('maxPrice')),
    minPrice: validPrice(parameters.get('minPrice')),
    page: page >= 1 && page <= 1_000_000 ? page : 1,
    search: search.length <= 100 ? search : '',
    sort: isSort(sort) ? sort : 'newest',
    status: isDiscoveryStatus(status) ? status : '',
  };
};

export const hasMarketplaceFilters = (state: MarketplaceDiscoveryState): boolean =>
  Boolean(
    state.search ||
    state.categoryId ||
    state.condition ||
    state.status ||
    state.minPrice ||
    state.maxPrice ||
    state.sort !== 'newest',
  );

export const updateMarketplaceDiscovery = (
  state: MarketplaceDiscoveryState,
  patch: Partial<MarketplaceDiscoveryState>,
): MarketplaceDiscoveryState => ({ ...state, page: 1, ...patch });

export const marketplacePriceRangeError = (min: string, max: string): string | null => {
  if ((min && !pricePattern.test(min)) || (max && !pricePattern.test(max)))
    return 'Enter non-negative prices with up to two decimal places.';
  return min && max && Number(min) > Number(max)
    ? 'Maximum price must be at least the minimum price.'
    : null;
};

export const writeMarketplaceDiscovery = (state: MarketplaceDiscoveryState): string => {
  const parameters = new URLSearchParams();
  if (state.search) parameters.set('search', state.search);
  if (state.categoryId) parameters.set('categoryId', state.categoryId);
  if (state.condition) parameters.set('condition', state.condition);
  if (state.minPrice) parameters.set('minPrice', state.minPrice);
  if (state.maxPrice) parameters.set('maxPrice', state.maxPrice);
  if (state.status) parameters.set('status', state.status);
  if (state.sort !== 'newest') parameters.set('sort', state.sort);
  if (state.page !== 1) parameters.set('page', String(state.page));
  const query = parameters.toString();
  return query ? `/marketplace?${query}` : '/marketplace';
};
