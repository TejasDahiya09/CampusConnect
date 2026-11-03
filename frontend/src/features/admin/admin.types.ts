export type AdminSection = 'audit' | 'content' | 'overview' | 'system' | 'users';
export interface AdminPagination {
  readonly limit: number;
  readonly page: number;
  readonly total: number;
  readonly totalPages: number;
}
export interface AdminOverview {
  readonly contentTrends: readonly { count: number; date: string; type: string }[];
  readonly messaging: { conversations: number; messages: number };
  readonly metrics: {
    readonly activeUsers: number;
    readonly lostFound: number;
    readonly marketplace: number;
    readonly pendingReports: number;
    readonly services: number;
    readonly suspendedUsers: number;
    readonly teamUp: number;
    readonly totalUsers: number;
  };
  readonly recentActivity: readonly AdminAuditItem[];
  readonly registrations: readonly { count: number; date: string }[];
}
export interface AdminUser {
  readonly createdAt: string;
  readonly department: string | null;
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly profileModeratedAt: string | null;
  readonly profileModerationReason: string | null;
  readonly profileModerationVisibility: 'HIDDEN' | 'VISIBLE';
  readonly role: 'ADMIN' | 'MODERATOR' | 'STUDENT';
  readonly status: 'ACTIVE' | 'DEACTIVATED' | 'SUSPENDED';
}
export interface AdminContentItem {
  readonly category: string | null;
  readonly createdAt: string;
  readonly id: string;
  readonly metadata: string;
  readonly moderatedAt: string | null;
  readonly moderationReason: string | null;
  readonly moderationVisibility: 'HIDDEN' | 'VISIBLE';
  readonly owner: { readonly displayName: string; readonly id: string };
  readonly reportCount: number;
  readonly status: string;
  readonly title: string;
  readonly type: 'LOST_FOUND' | 'MARKETPLACE' | 'SERVICE' | 'TEAMUP';
}
export interface AdminAuditItem {
  readonly actor: { readonly displayName: string; readonly id: string } | null;
  readonly createdAt: string;
  readonly entityId: string | null;
  readonly entityType: string | null;
  readonly event: string;
  readonly id: string;
}
