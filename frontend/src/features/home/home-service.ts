import type { IconName } from '../../components/Icon';
import { apiRequest } from '../../services/api-client';

export type HomeItemKind = 'LOST_FOUND' | 'MARKETPLACE' | 'MESSAGING' | 'SERVICE' | 'TEAMUP';
export interface HomeItem {
  readonly actionLabel?: string;
  readonly description?: string;
  readonly id: string;
  readonly kind: HomeItemKind;
  readonly meta?: string;
  readonly path: string;
  readonly title: string;
}
export interface HomeData {
  readonly attentionItems: readonly HomeItem[];
  readonly continueItems: readonly HomeItem[];
  readonly discoverItems: readonly HomeItem[];
  readonly greetingIdentity: { readonly displayName: string };
  readonly profileCompletion: number;
}
export interface HomeQuickAction {
  readonly description: string;
  readonly icon: IconName;
  readonly kind: Exclude<HomeItemKind, 'MESSAGING'>;
  readonly label: string;
  readonly path: string;
}
export const homeQuickActions: readonly HomeQuickAction[] = [
  {
    description: 'Create a listing',
    icon: 'store',
    kind: 'MARKETPLACE',
    label: 'Sell something',
    path: '/marketplace/new',
  },
  {
    description: 'Report a missing item',
    icon: 'search',
    kind: 'LOST_FOUND',
    label: 'Lost something?',
    path: '/lost-found/new',
  },
  {
    description: 'Start a project',
    icon: 'team',
    kind: 'TEAMUP',
    label: 'Find teammates',
    path: '/teamup/new',
  },
  {
    description: 'Share what you do',
    icon: 'briefcase',
    kind: 'SERVICE',
    label: 'Offer a service',
    path: '/services/new',
  },
];
export const firstName = (name: string) => name.trim().split(/\s+/)[0] || 'Student';
export const greetingForHour = (hour: number) =>
  hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
export const shouldPromptForProfile = (completion: number) => completion < 80;
export type HomeLayoutState = 'ATTENTION' | 'CONTINUE' | 'FIRST_SESSION';
export const homeLayoutState = (
  data: Pick<HomeData, 'attentionItems' | 'continueItems'>,
): HomeLayoutState =>
  data.attentionItems.length > 0
    ? 'ATTENTION'
    : data.continueItems.length > 0
      ? 'CONTINUE'
      : 'FIRST_SESSION';
export const homeApi = { get: () => apiRequest<HomeData>('/api/home') };
