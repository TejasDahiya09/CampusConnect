import type { ServiceRequest, StudentService } from './services.types';
import { pricingLabel } from './services.types';

export const serviceDetailPrice = (service: Pick<StudentService, 'price' | 'pricingType'>) =>
  service.pricingType === 'FIXED' &&
  (service.price === null || !Number.isFinite(Number(service.price)))
    ? 'Price unavailable'
    : pricingLabel(service);
export const requestMessageError = (message: string): string | null =>
  message.length > 1000 ? 'Use no more than 1,000 characters.' : null;
export const serviceStatusLabel = (status: string) =>
  status === 'ACTIVE' ? 'Available' : status === 'PAUSED' ? 'Paused' : 'Archived';
export const requestExplanations = {
  PENDING: 'Your request is pending. The provider has not decided yet.',
  ACCEPTED:
    'Your request was accepted. You can continue the conversation with the provider when messaging is available.',
  REJECTED:
    'Your previous request was declined. You can send a new request if this service is accepting requests.',
  COMPLETED: 'Your previous request is complete. You can request this service again when eligible.',
} as const;

/** Workspace.requested is caller-scoped by the existing API. Never use a listing ID as context. */
export function latestServiceConversationRequest(
  service: StudentService,
  requests: readonly ServiceRequest[],
): ServiceRequest | null {
  if (
    service.viewerIsProvider ||
    !['ACCEPTED', 'COMPLETED'].includes(service.viewerRequestStatus ?? '')
  )
    return null;
  const history = requests.filter(
    (request) =>
      request.service?.id === service.id && request.service.providerId === service.providerId,
  );
  let latest: ServiceRequest | null = null;
  for (const request of history) {
    const time = Date.parse(request.createdAt);
    if (!latest || (Number.isFinite(time) && time >= Date.parse(latest.createdAt)))
      latest = request;
  }
  return latest &&
    latest.status === service.viewerRequestStatus &&
    ['ACCEPTED', 'COMPLETED'].includes(latest.status)
    ? latest
    : null;
}
export const validServiceDetailId = (id: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id);
export const serviceDate = (value: string) =>
  Number.isFinite(Date.parse(value))
    ? new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(
        new Date(value),
      )
    : null;
