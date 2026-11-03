import type { ProfileAvatar } from '../profile/profile.types';
import type { Session, User } from '@supabase/supabase-js';

export type ApplicationRole = 'STUDENT' | 'MODERATOR' | 'ADMIN';
export type AccountStatus = 'PENDING_VERIFICATION' | 'ACTIVE' | 'SUSPENDED' | 'DEACTIVATED';

export interface ApplicationUser {
  readonly email: string;
  readonly emailVerifiedAt: string | null;
  readonly id: string;
  readonly profile: {
    readonly displayName: string;
    readonly id: string;
    readonly avatar?: ProfileAvatar;
  } | null;
  readonly role: ApplicationRole;
  readonly status: AccountStatus;
  readonly universityEmail: string | null;
  readonly universityEmailVerifiedAt: string | null;
}

export interface RegisterInput {
  readonly displayName: string;
  readonly email: string;
  readonly password: string;
}

export interface LoginInput {
  readonly email: string;
  readonly password: string;
}

export interface AuthState {
  readonly applicationUser: ApplicationUser | null;
  readonly error: string | null;
  readonly isAuthenticated: boolean;
  readonly isLoading: boolean;
  readonly session: Session | null;
  readonly user: User | null;
}
