import type { ListingCondition, ListingDiscoveryStatus, ListingStatus } from './marketplace.types';

export const conditions: readonly ListingCondition[] = ['NEW', 'LIKE_NEW', 'GOOD', 'FAIR', 'POOR'];
export const statuses: readonly ListingStatus[] = ['ACTIVE', 'SOLD', 'ARCHIVED'];
export const discoveryStatuses: readonly ListingDiscoveryStatus[] = ['ACTIVE', 'SOLD'];

export const readableEnum = (value: string): string =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

export const formatPrice = (price: string, currency: string): string => {
  try {
    return new Intl.NumberFormat(undefined, { currency, style: 'currency' }).format(Number(price));
  } catch {
    return `${currency} ${price}`;
  }
};

export const formatDate = (value: string): string =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' }).format(new Date(value));
