import type { Session } from '@supabase/supabase-js';
import { getSupabaseClient } from '../../lib/supabase';
import { apiRequest } from '../../services/api-client';
import type { ApplicationUser, LoginInput, RegisterInput } from './auth.types';
import { readSafeRedirect } from './auth-routing';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

interface GoogleOAuthResult {
  readonly error: Error | null;
}

type GoogleOAuthSignIn = (input: {
  readonly options: { readonly redirectTo: string };
  readonly provider: 'google';
}) => Promise<GoogleOAuthResult>;

export const googleOAuthCallbackUrl = (origin: string, destination: string): string => {
  const callback = new URL('/auth/callback', new URL(origin).origin);
  callback.searchParams.set('redirect', readSafeRedirect(destination));
  return callback.toString();
};

export const signInWithGoogle = async (
  destination: string,
  signIn: GoogleOAuthSignIn = (input) => getSupabaseClient().auth.signInWithOAuth(input),
  origin: string = window.location.origin,
): Promise<void> => {
  const { error } = await signIn({
    options: { redirectTo: googleOAuthCallbackUrl(origin, destination) },
    provider: 'google',
  });
  if (error !== null) throw error;
};

export const normalizeValidEmail = (email: string): string => {
  const normalizedEmail = email.trim().toLowerCase();
  if (normalizedEmail.length > 254 || !emailPattern.test(normalizedEmail)) {
    throw new Error('Enter a valid email address.');
  }
  return normalizedEmail;
};

const validatePassword = (password: string): void => {
  if (password.length < 8 || password.length > 128) {
    throw new Error('Password must contain between 8 and 128 characters.');
  }
};

export const register = async ({ displayName, email, password }: RegisterInput): Promise<void> => {
  const normalizedDisplayName = displayName.trim();

  if (normalizedDisplayName.length < 2 || normalizedDisplayName.length > 120) {
    throw new Error('Display name must contain between 2 and 120 characters.');
  }

  validatePassword(password);
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signUp({
    email: normalizeValidEmail(email),
    options: {
      data: { display_name: normalizedDisplayName },
      emailRedirectTo: `${window.location.origin}/auth/callback`,
    },
    password,
  });

  if (error !== null) {
    throw error;
  }

  if (data.session !== null) {
    await supabase.auth.signOut();
    throw new Error('Email verification must be enabled before CampusConnect sign-in.');
  }
};

export const login = async ({ email, password }: LoginInput): Promise<Session> => {
  const supabase = getSupabaseClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: normalizeValidEmail(email),
    password,
  });

  if (error !== null || data.session === null || !data.user.email_confirmed_at) {
    if (data.session !== null) {
      await supabase.auth.signOut();
    }

    throw error ?? new Error('Confirm your email address before signing in.');
  }

  return data.session;
};

export const logout = async (): Promise<void> => {
  const { error } = await getSupabaseClient().auth.signOut();

  if (error !== null) {
    throw new Error('Sign out could not be completed. Try again.');
  }
};

export const requestPasswordReset = async (email: string): Promise<void> => {
  const { error } = await getSupabaseClient().auth.resetPasswordForEmail(
    normalizeValidEmail(email),
    { redirectTo: `${window.location.origin}/auth/reset-password` },
  );

  if (error !== null) {
    throw error;
  }
};

export const updatePassword = async (password: string): Promise<void> => {
  validatePassword(password);
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  if (data.session === null) {
    throw new Error('This reset link is invalid or has expired. Request a new one and try again.');
  }
  const { error } = await supabase.auth.updateUser({ password });

  if (error !== null) {
    throw new Error('The password could not be updated. Request a new reset link and try again.');
  }
};

export const hasRecoverySession = async (): Promise<boolean> => {
  const { data } = await getSupabaseClient().auth.getSession();
  return data.session !== null;
};

export const synchronizeApplicationUser = async (): Promise<ApplicationUser> => {
  const { user } = await apiRequest<{ readonly user: ApplicationUser }>('/api/auth/sync', {
    body: JSON.stringify({}),
    method: 'POST',
  });
  return user;
};

export const getApplicationUser = async (): Promise<ApplicationUser> => {
  const { user } = await apiRequest<{ readonly user: ApplicationUser }>('/api/auth/me');
  return user;
};
