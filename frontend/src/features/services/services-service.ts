import { apiRequest, apiRequestWithMeta } from '../../services/api-client';
import type {
  PricingType,
  ServiceDraft,
  ServiceRequest,
  ServicesWorkspace,
  StudentService,
  ServiceStatus,
} from './services.types';

export const mergeServiceRequestMutation = (
  current: ServiceRequest,
  mutation: {
    readonly request: Omit<ServiceRequest, 'requester' | 'service'> &
      Partial<Pick<ServiceRequest, 'requester' | 'service'>>;
    readonly service: StudentService;
  },
): ServiceRequest => ({
  ...current,
  ...mutation.request,
  requester: current.requester,
  service: mutation.service,
});

const path = (id: string) => `/api/services/${encodeURIComponent(id)}`;
export const serializeServicePatch = (draft: Partial<ServiceDraft>): string => {
  if (
    (draft.price !== undefined && draft.pricingType === undefined) ||
    (draft.pricingType === 'FIXED' && draft.price === undefined)
  ) {
    throw new Error('Update pricing type and price together.');
  }
  const body: Record<string, unknown> = {};
  for (const key of [
    'title',
    'category',
    'description',
    'skills',
    'location',
    'featuredOnLanding',
    'pricingType',
  ] as const) {
    if (draft[key] !== undefined) body[key] = draft[key];
  }
  if (draft.pricingType !== undefined)
    body.price =
      draft.pricingType === 'FREE' ? '0' : draft.pricingType === 'NEGOTIABLE' ? null : draft.price;
  return JSON.stringify(body);
};
export const serializeServiceDraft = (draft: ServiceDraft): string => serializeServicePatch(draft);
export const servicesApi = {
  list: async (
    filters: {
      search: string;
      category: string;
      pricingType: '' | PricingType;
      status: '' | ServiceStatus;
      sort: string;
      page: number;
      limit: number;
      minPrice?: string;
      maxPrice?: string;
    },
    signal?: AbortSignal,
  ) => {
    const query = new URLSearchParams();
    for (const [key, value] of Object.entries(filters))
      if (value !== '' && value !== undefined) query.set(key, String(value));
    const result = await apiRequestWithMeta<{ readonly services: readonly StudentService[] }>(
      `/api/services?${query}`,
      { signal },
    );
    return {
      services: result.data.services,
      totalPages: Number(result.meta?.totalPages ?? 0),
      total: Number(result.meta?.total ?? 0),
      page: Number(result.meta?.page ?? filters.page),
      limit: Number(result.meta?.limit ?? filters.limit),
    };
  },
  get: async (id: string, signal?: AbortSignal) =>
    (await apiRequest<{ readonly service: StudentService }>(path(id), { signal })).service,
  create: async (draft: ServiceDraft) =>
    (
      await apiRequest<{ readonly service: StudentService }>('/api/services', {
        method: 'POST',
        body: serializeServiceDraft(draft),
      })
    ).service,
  update: async (id: string, draft: Partial<ServiceDraft>) =>
    (
      await apiRequest<{ readonly service: StudentService }>(path(id), {
        method: 'PATCH',
        body: serializeServicePatch(draft),
      })
    ).service,
  request: async (id: string, message: string) =>
    (
      await apiRequest<{ readonly request: ServiceRequest }>(`${path(id)}/requests`, {
        method: 'POST',
        body: JSON.stringify({ message: message.trim() || null }),
      })
    ).request,
  transition: async (id: string, status: ServiceStatus) =>
    (
      await apiRequest<{ readonly service: StudentService }>(`${path(id)}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status }),
      })
    ).service,
  workspace: (signal?: AbortSignal) =>
    apiRequest<ServicesWorkspace>('/api/services/workspace', { signal }),
  review: (serviceId: string, requestId: string, status: 'ACCEPTED' | 'REJECTED') =>
    apiRequest<{ readonly request: ServiceRequest; readonly service: StudentService }>(
      `${path(serviceId)}/requests/${requestId}/review`,
      { method: 'PATCH', body: JSON.stringify({ status }) },
    ),
  complete: (serviceId: string, requestId: string) =>
    apiRequest<{ readonly request: ServiceRequest; readonly service: StudentService }>(
      `${path(serviceId)}/requests/${requestId}/complete`,
      { method: 'PATCH', body: JSON.stringify({}) },
    ),
};
