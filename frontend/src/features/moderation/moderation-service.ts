import { apiRequest } from '../../services/api-client';
import type {
  ModerationReport,
  ModerationTargetType,
  ReportReason,
  ReportStatus,
} from './moderation.types';

export const moderationApi = {
  submit: (input: {
    description: string | null;
    reason: ReportReason;
    targetId: string;
    targetType: ModerationTargetType;
  }) =>
    apiRequest<{ report: ModerationReport }>('/api/moderation/reports', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  overview: () =>
    apiRequest<{
      counts: { dismissed: number; open: number; resolved: number; underReview: number };
      recent: readonly unknown[];
    }>('/api/moderation/overview'),
  list: async (filters: {
    page: number;
    reason: string;
    search: string;
    status: string;
    targetType: string;
  }) => {
    const query = new URLSearchParams({ limit: '20', page: String(filters.page) });
    for (const key of ['reason', 'search', 'status', 'targetType'] as const)
      if (filters[key]) query.set(key, filters[key]);
    return apiRequest<{
      pagination: { limit: number; page: number; total: number; totalPages: number };
      reports: readonly ModerationReport[];
    }>(`/api/moderation/reports?${query}`);
  },
  detail: (id: string) =>
    apiRequest<{
      report: ModerationReport;
      safetySignals: readonly { code: string; explanation: string }[];
      target: { description: string | null; status: string; title: string } | null;
    }>(`/api/moderation/reports/${encodeURIComponent(id)}`),
  decide: (id: string, status: Exclude<ReportStatus, 'OPEN'>, resolutionNote: string) =>
    apiRequest<{ report: ModerationReport }>(`/api/moderation/reports/${encodeURIComponent(id)}`, {
      method: 'PATCH',
      body: JSON.stringify({ resolutionNote, status }),
    }),
};
