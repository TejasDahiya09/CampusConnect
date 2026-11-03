import type { PhotoAvatar } from '../profile/profile-avatar-value.js';
import type { AccountStatus, UserRole } from '../../generated/prisma/client.js';

export interface SupabaseIdentity {
  readonly email: string;
  readonly emailVerified: boolean;
  readonly id: string;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface AuthenticatedProfile {
  readonly avatar?: PhotoAvatar;
  readonly displayName: string;
  readonly id: string;
}

export interface AuthenticatedUser {
  readonly email: string;
  readonly emailVerifiedAt: Date | null;
  readonly id: string;
  readonly profile: AuthenticatedProfile | null;
  readonly role: UserRole;
  readonly status: AccountStatus;
}

export interface RequestAuthentication {
  readonly identity: SupabaseIdentity;
  readonly user: AuthenticatedUser;
}

export type VerifyAccessToken = (accessToken: string) => Promise<SupabaseIdentity>;
