import { apiRequest, apiRequestWithMeta } from '../../services/api-client';
import type {
  ClaimStatus,
  LostFoundClaim,
  LostFoundDraft,
  LostFoundFilters,
  LostFoundMatchResponse,
  LostFoundMediaAuthorization,
  LostFoundPageResult,
  LostFoundReport,
  LostFoundStatus,
} from './lost-found.types';

type Request = typeof apiRequest;
type RequestWithMeta = typeof apiRequestWithMeta;

const reportPath = (id: string) => `/api/lost-found/reports/${encodeURIComponent(id)}`;

export const createLostFoundApi = (request: Request, requestWithMeta: RequestWithMeta) => ({
  addBookmark: async (id: string): Promise<void> => {
    await request<{ readonly bookmarked: true }>(`${reportPath(id)}/bookmark`, { method: 'POST' });
  },
  cancelClaim: async (reportId: string, claimId: string): Promise<LostFoundClaim> =>
    (
      await request<{ readonly claim: LostFoundClaim }>(
        `${reportPath(reportId)}/claims/${encodeURIComponent(claimId)}/cancel`,
        { method: 'PATCH' },
      )
    ).claim,
  createReport: async (input: LostFoundDraft): Promise<LostFoundReport> =>
    (
      await request<{ readonly report: LostFoundReport }>('/api/lost-found/reports', {
        body: JSON.stringify(input),
        method: 'POST',
      })
    ).report,
  getBookmarkState: async (id: string): Promise<boolean> =>
    (await request<{ readonly bookmarked: boolean }>(`${reportPath(id)}/bookmark`)).bookmarked,
  getClaims: async (id: string, signal?: AbortSignal): Promise<readonly LostFoundClaim[]> =>
    (
      await request<{ readonly claims: readonly LostFoundClaim[] }>(`${reportPath(id)}/claims`, {
        signal,
      })
    ).claims,
  getMatches: async (id: string, signal?: AbortSignal): Promise<LostFoundMatchResponse> =>
    request<LostFoundMatchResponse>(`${reportPath(id)}/matches`, { signal }),
  getMyReports: async (signal?: AbortSignal): Promise<readonly LostFoundReport[]> =>
    (
      await request<{ readonly reports: readonly LostFoundReport[] }>(
        '/api/lost-found/my-reports',
        {
          signal,
        },
      )
    ).reports,
  getReport: async (id: string): Promise<LostFoundReport> =>
    (await request<{ readonly report: LostFoundReport }>(reportPath(id))).report,
  getReports: async (
    filters: LostFoundFilters,
    signal?: AbortSignal,
  ): Promise<LostFoundPageResult> => {
    const query = new URLSearchParams({
      limit: String(filters.limit),
      page: String(filters.page),
      sort: filters.sort,
    });
    for (const [key, value] of Object.entries(filters)) {
      if (!['limit', 'page', 'sort'].includes(key) && value !== '') query.set(key, String(value));
    }
    const response = await requestWithMeta<{
      readonly reports: readonly LostFoundReport[];
    }>(`/api/lost-found/reports?${query.toString()}`, { signal });
    return {
      pagination: {
        limit: Number(response.meta?.limit ?? filters.limit),
        page: Number(response.meta?.page ?? filters.page),
        total: Number(response.meta?.total ?? 0),
        totalPages: Number(response.meta?.totalPages ?? 0),
      },
      reports: response.data.reports,
    };
  },
  getSavedReports: async (page: number, limit: number): Promise<LostFoundPageResult> => {
    const response = await requestWithMeta<{ readonly reports: readonly LostFoundReport[] }>(
      `/api/lost-found/bookmarks?page=${page}&limit=${limit}`,
    );
    return {
      pagination: {
        limit: Number(response.meta?.limit ?? limit),
        page: Number(response.meta?.page ?? page),
        total: Number(response.meta?.total ?? 0),
        totalPages: Number(response.meta?.totalPages ?? 0),
      },
      reports: response.data.reports,
    };
  },
  removeBookmark: async (id: string): Promise<void> => {
    await request<{ readonly bookmarked: false; readonly removed: boolean }>(
      `${reportPath(id)}/bookmark`,
      { method: 'DELETE' },
    );
  },
  reviewClaim: async (
    reportId: string,
    claimId: string,
    status: Extract<ClaimStatus, 'APPROVED' | 'REJECTED'>,
  ): Promise<LostFoundClaim> =>
    (
      await request<{ readonly claim: LostFoundClaim }>(
        `${reportPath(reportId)}/claims/${encodeURIComponent(claimId)}/review`,
        { body: JSON.stringify({ status }), method: 'PATCH' },
      )
    ).claim,
  submitClaim: async (id: string, message: string): Promise<LostFoundClaim> =>
    (
      await request<{ readonly claim: LostFoundClaim }>(`${reportPath(id)}/claims`, {
        body: JSON.stringify({ message }),
        method: 'POST',
      })
    ).claim,
  transitionReport: async (id: string, status: LostFoundStatus): Promise<LostFoundReport> =>
    (
      await request<{ readonly report: LostFoundReport }>(`${reportPath(id)}/status`, {
        body: JSON.stringify({ status }),
        method: 'PATCH',
      })
    ).report,
  updateReport: async (id: string, input: Omit<LostFoundDraft, 'type'>): Promise<LostFoundReport> =>
    (
      await request<{ readonly report: LostFoundReport }>(reportPath(id), {
        body: JSON.stringify(input),
        method: 'PATCH',
      })
    ).report,
  deleteMedia: async (reportId: string, mediaId: string): Promise<void> => {
    await request<{ readonly deleted: true }>(
      `${reportPath(reportId)}/media/${encodeURIComponent(mediaId)}`,
      { method: 'DELETE' },
    );
  },
  reorderMedia: async (
    reportId: string,
    mediaIds: readonly string[],
  ): Promise<LostFoundReport['images']> =>
    (
      await request<{ readonly media: LostFoundReport['images'] }>(
        `${reportPath(reportId)}/media/order`,
        { body: JSON.stringify({ mediaIds }), method: 'PATCH' },
      )
    ).media,
  uploadMedia: async (
    reportId: string,
    file: File,
    onProgress: (percentage: number) => void,
  ): Promise<LostFoundReport['images'][number]> => {
    const authorization = await request<LostFoundMediaAuthorization>(
      `${reportPath(reportId)}/media/upload-url`,
      {
        body: JSON.stringify({ contentType: file.type, fileName: file.name, size: file.size }),
        method: 'POST',
      },
    );
    await new Promise<void>((resolve, reject) => {
      const upload = new XMLHttpRequest();
      upload.open('PUT', authorization.uploadUrl);
      for (const [name, value] of Object.entries(authorization.requiredHeaders))
        upload.setRequestHeader(name, value);
      upload.upload.addEventListener('progress', (event) => {
        if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
      });
      upload.addEventListener('load', () => {
        if (upload.status >= 200 && upload.status < 300) resolve();
        else reject(new Error('S3 rejected the image upload. Request a new URL and retry.'));
      });
      upload.addEventListener('error', () => reject(new Error('The direct image upload failed.')));
      upload.addEventListener('abort', () => reject(new Error('The image upload was cancelled.')));
      upload.send(file);
    });
    return (
      await request<{ readonly media: LostFoundReport['images'][number] }>(
        `${reportPath(reportId)}/media/${encodeURIComponent(authorization.mediaId)}/complete`,
        { body: JSON.stringify({ objectKey: authorization.objectKey }), method: 'POST' },
      )
    ).media;
  },
});

export const lostFoundApi = createLostFoundApi(apiRequest, apiRequestWithMeta);
