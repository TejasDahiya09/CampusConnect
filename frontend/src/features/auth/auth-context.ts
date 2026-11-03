import { createContext } from 'react';
import type { AuthState, LoginInput, RegisterInput } from './auth.types';

export interface AuthContextValue extends AuthState {
  readonly login: (input: LoginInput) => Promise<void>;
  readonly logout: () => Promise<void>;
  readonly register: (input: RegisterInput) => Promise<void>;
  readonly requestPasswordReset: (email: string) => Promise<void>;
  readonly signInWithGoogle: (destination: string) => Promise<void>;
  readonly updatePassword: (password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextValue | undefined>(undefined);
