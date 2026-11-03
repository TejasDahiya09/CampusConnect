export type HomeItemKind = 'LOST_FOUND' | 'MARKETPLACE' | 'MESSAGING' | 'SERVICE' | 'TEAMUP';

export interface HomeSourceItem {
  readonly id: string;
  readonly status: string;
  readonly title: string;
  readonly updatedAt: Date;
}

export interface HomeSourceData {
  readonly displayName: string;
  readonly profileCompletion: number;
  readonly lostFound: readonly (HomeSourceItem & { readonly claims: unknown })[];
  readonly marketplace: readonly HomeSourceItem[];
  readonly services: readonly (HomeSourceItem & { readonly bookings: unknown })[];
  readonly teamUp: readonly (HomeSourceItem & {
    readonly applications: unknown;
    readonly maxMembers: number;
    readonly members: unknown;
  })[];
  readonly unreadMessages: number;
  readonly discover: readonly (HomeSourceItem & {
    readonly kind: Exclude<HomeItemKind, 'MESSAGING'>;
  })[];
}

export interface HomeAttentionItem {
  readonly actionLabel: string;
  readonly description: string;
  readonly entityKey?: string;
  readonly id: string;
  readonly kind: HomeItemKind;
  readonly path: string;
  readonly priority: number;
  readonly title: string;
}
