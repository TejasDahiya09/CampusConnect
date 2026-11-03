import { apiRequest } from '../../services/api-client';
import type {
  AdminAuditItem,
  AdminContentItem,
  AdminOverview,
  AdminPagination,
  AdminUser,
} from './admin.types';

const query = (values: Readonly<Record<string, number | string>>) => {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values))
    if (value !== '') params.set(key, String(value));
  return params.toString();
};

export const adminApi = {
  access: () => apiRequest<{ authorized: true }>('/api/admin/access'),
  overview: () => apiRequest<AdminOverview>('/api/admin/overview'),
  users: (filters: { page: number; role: string; search: string; status: string }) =>
    apiRequest<{ items: readonly AdminUser[]; pagination: AdminPagination }>(
      `/api/admin/users?${query({ limit: 20, ...filters })}`,
    ),
  updateUser: (id: string, status: 'ACTIVE' | 'SUSPENDED', reason: string) =>
    apiRequest<{ updated: { id: string; status: string } }>(
      `/api/admin/users/${encodeURIComponent(id)}/status`,
      { body: JSON.stringify({ reason, status }), method: 'PATCH' },
    ),
  enforceProfile: (id: string, visibility: 'HIDDEN' | 'VISIBLE', reason: string) =>
    apiRequest<{ content: { moderationVisibility: 'HIDDEN' | 'VISIBLE' } }>(
      `/api/admin/content/PROFILE/${encodeURIComponent(id)}/${visibility === 'HIDDEN' ? 'hide' : 'restore'}`,
      { body: JSON.stringify({ reason }), method: 'POST' },
    ),
  content: (filters: {
    page: number;
    search: string;
    status: string;
    type: string;
    visibility: string;
  }) =>
    apiRequest<{ items: readonly AdminContentItem[]; pagination: AdminPagination }>(
      `/api/admin/content?${query({ limit: 20, ...filters })}`,
    ),
  enforceContent: (
    type: AdminContentItem['type'] | 'PROFILE',
    id: string,
    visibility: 'HIDDEN' | 'VISIBLE',
    reason: string,
  ) =>
    apiRequest<{ content: { moderationVisibility: 'HIDDEN' | 'VISIBLE' } }>(
      `/api/admin/content/${encodeURIComponent(type)}/${encodeURIComponent(id)}/${visibility === 'HIDDEN' ? 'hide' : 'restore'}`,
      { body: JSON.stringify({ reason }), method: 'POST' },
    ),
  audit: (filters: { event: string; page: number; search: string }) =>
    apiRequest<{ items: readonly AdminAuditItem[]; pagination: AdminPagination }>(
      `/api/admin/audit?${query({ limit: 20, ...filters })}`,
    ),
  system: () =>
    apiRequest<{
      ai: {
        configured: boolean;
        health: { status: string };
        readiness: { status: string };
        version: { data?: { capabilities: readonly string[] }; status: string };
      };
      capabilities: {
        announcements: { existingCount: number; mode: 'DEFERRED'; reason: string };
        contentModerationState: string;
        messageInspection: string;
      };
      configuration: Readonly<Record<string, boolean | string>>;
    }>('/api/admin/system'),
};
