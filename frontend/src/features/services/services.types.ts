export type PricingType = 'FREE' | 'FIXED' | 'NEGOTIABLE';
export type ServiceStatus = 'ACTIVE' | 'PAUSED' | 'ARCHIVED';
export type ServiceRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';
export interface ServicePerson {
  readonly avatar: unknown;
  readonly department: string | null;
  readonly displayName: string;
  readonly id: string;
}
export interface StudentService {
  readonly category: string;
  readonly createdAt: string;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly id: string;
  readonly location: string | null;
  readonly price: string | null;
  readonly pricingType: PricingType;
  readonly provider: ServicePerson;
  readonly providerId: string;
  readonly requestCount: number;
  readonly skills: readonly string[];
  readonly status: ServiceStatus;
  readonly title: string;
  readonly updatedAt: string;
  readonly viewerIsProvider: boolean;
  readonly viewerCanRequest?: boolean;
  readonly viewerRequestStatus: ServiceRequestStatus | null;
}
export interface ServiceRequest {
  readonly createdAt: string;
  readonly id: string;
  readonly message: string | null;
  readonly requester: ServicePerson;
  readonly requesterId: string;
  readonly reviewedAt: string | null;
  readonly service?: StudentService;
  readonly status: ServiceRequestStatus;
  readonly updatedAt: string;
}
export interface ServiceDraft {
  readonly category: string;
  readonly description: string;
  readonly featuredOnLanding: boolean;
  readonly location: string;
  readonly price: string;
  readonly pricingType: PricingType;
  readonly skills: readonly string[];
  readonly title: string;
}
export interface ServicesWorkspace {
  readonly provided: readonly StudentService[];
  readonly received: readonly ServiceRequest[];
  readonly requested: readonly ServiceRequest[];
}
export const pricingLabel = (service: Pick<StudentService, 'price' | 'pricingType'>) =>
  service.pricingType === 'FREE'
    ? 'Free'
    : service.pricingType === 'NEGOTIABLE'
      ? 'Negotiable'
      : `₹${Number(service.price).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const canRequestService = (
  service: Pick<
    StudentService,
    'status' | 'viewerIsProvider' | 'viewerRequestStatus' | 'viewerCanRequest'
  >,
): boolean =>
  !service.viewerIsProvider &&
  service.status === 'ACTIVE' &&
  (service.viewerCanRequest ??
    !['PENDING', 'ACCEPTED'].includes(service.viewerRequestStatus ?? ''));
