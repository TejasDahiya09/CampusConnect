import type { PricingType } from './services.types';

export interface ServicesDiscovery {
  search: string;
  category: string;
  pricingType: '' | PricingType;
  minPrice: string;
  maxPrice: string;
  sort: 'newest' | 'oldest' | 'price_asc' | 'price_desc';
  page: number;
}
export const defaultServicesDiscovery: ServicesDiscovery = {
  search: '',
  category: '',
  pricingType: '',
  minPrice: '',
  maxPrice: '',
  sort: 'newest',
  page: 1,
};
export function serviceFilterErrors(
  state: ServicesDiscovery,
): Partial<Record<keyof ServicesDiscovery, string>> {
  const errors: Partial<Record<keyof ServicesDiscovery, string>> = {};
  for (const key of ['minPrice', 'maxPrice'] as const) {
    if (
      state[key] &&
      (!/^\d{1,8}(\.\d{1,2})?$/.test(state[key]) || Number(state[key]) > 10_000_000)
    )
      errors[key] = 'Use an amount from 0 to 10,000,000, with up to two decimals.';
  }
  if (state.minPrice && state.maxPrice && Number(state.minPrice) > Number(state.maxPrice))
    errors.minPrice = 'Minimum must not exceed maximum.';
  if (state.pricingType === 'NEGOTIABLE' && (state.minPrice || state.maxPrice))
    errors.pricingType = 'Clear price bounds to browse negotiable services.';
  if (state.pricingType === 'FREE' && Number(state.minPrice) > 0)
    errors.minPrice = 'Free services need a range that includes zero.';
  if (state.pricingType === 'FIXED' && state.maxPrice && Number(state.maxPrice) === 0)
    errors.maxPrice = 'Fixed prices must be greater than zero.';
  return errors;
}
export function readServicesDiscovery(params: URLSearchParams): ServicesDiscovery {
  const state = { ...defaultServicesDiscovery };
  for (const key of ['search', 'category'] as const)
    state[key] = (params.get(key) ?? '').trim().slice(0, 100);
  const pricing = params.get('pricingType');
  if (pricing === 'FREE' || pricing === 'FIXED' || pricing === 'NEGOTIABLE')
    state.pricingType = pricing;
  const sort = params.get('sort');
  if (sort === 'oldest' || sort === 'price_asc' || sort === 'price_desc') state.sort = sort;
  const page = params.get('page') ?? '';
  if (/^\d{1,7}$/.test(page) && Number(page) > 0 && Number(page) <= 1_000_000)
    state.page = Number(page);
  for (const key of ['minPrice', 'maxPrice'] as const) {
    const value = params.get(key) ?? '';
    if (/^\d{1,8}(\.\d{1,2})?$/.test(value) && Number(value) <= 10_000_000) state[key] = value;
  }
  if (Object.keys(serviceFilterErrors(state)).length) {
    state.minPrice = '';
    state.maxPrice = '';
  }
  return state;
}
export function writeServicesDiscovery(state: ServicesDiscovery): URLSearchParams {
  const params = new URLSearchParams();
  for (const key of ['search', 'category', 'pricingType', 'minPrice', 'maxPrice'] as const)
    if (state[key]) params.set(key, state[key]);
  if (state.sort !== 'newest') params.set('sort', state.sort);
  if (state.page > 1) params.set('page', String(state.page));
  return params;
}
export const hasServicesCriteria = (state: ServicesDiscovery) =>
  Boolean(state.search || state.category || state.pricingType || state.minPrice || state.maxPrice);
