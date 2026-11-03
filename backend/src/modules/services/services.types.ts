import type { ServiceStatus } from '../../generated/prisma/client.js';
export type PricingType = 'FREE' | 'FIXED' | 'NEGOTIABLE';
export type ServiceRequestStatus = 'PENDING' | 'ACCEPTED' | 'REJECTED' | 'COMPLETED';
export interface ServicePerson {
  readonly avatar: unknown;
  readonly department: string | null;
  readonly displayName: string;
  readonly id: string;
}
export interface ServiceRequestRecord {
  readonly createdAt: string;
  readonly id: string;
  readonly message: string | null;
  readonly requesterId: string;
  readonly reviewedAt: string | null;
  readonly status: ServiceRequestStatus;
  readonly updatedAt: string;
}
export interface ServiceRequestView extends ServiceRequestRecord {
  readonly requester: ServicePerson;
  readonly service?: ServiceView;
}
export interface ServiceView {
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
export interface ServiceCreateInput {
  readonly category: string;
  readonly description: string;
  readonly featuredOnLanding?: boolean;
  readonly location: string | null;
  readonly price: string | null;
  readonly pricingType: PricingType;
  readonly skills: readonly string[];
  readonly title: string;
}
export type ServiceUpdateInput = Partial<ServiceCreateInput>;
export interface ServiceQuery {
  readonly category?: string;
  readonly limit: number;
  readonly maxPrice?: string;
  readonly minPrice?: string;
  readonly page: number;
  readonly pricingType?: PricingType;
  readonly search?: string;
  readonly sort: 'newest' | 'oldest' | 'price_asc' | 'price_desc';
  readonly status?: ServiceStatus;
}
export interface ServicesWorkspace {
  readonly provided: readonly ServiceView[];
  readonly received: readonly ServiceRequestView[];
  readonly requested: readonly ServiceRequestView[];
}
