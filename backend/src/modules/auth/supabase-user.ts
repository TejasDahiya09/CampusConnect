import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import type { SupabaseIdentity } from './auth.types.js';

interface SupabaseUserResponse {
  readonly email: string;
  readonly email_confirmed_at: string;
  readonly id: string;
}

interface SupabaseEmailConfirmerOptions {
  readonly fetcher?: typeof fetch;
  readonly publishableKey: string;
  readonly supabaseUrl: string;
}

const isConfirmedUserResponse = (value: unknown): value is SupabaseUserResponse => {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false;
  }

  const user = value as Record<string, unknown>;
  return (
    typeof user.id === 'string' &&
    typeof user.email === 'string' &&
    typeof user.email_confirmed_at === 'string' &&
    !Number.isNaN(Date.parse(user.email_confirmed_at))
  );
};

export const createSupabaseEmailConfirmer =
  ({ fetcher = fetch, publishableKey, supabaseUrl }: SupabaseEmailConfirmerOptions) =>
  async (accessToken: string, identity: SupabaseIdentity): Promise<SupabaseIdentity> => {
    let response: Response;

    try {
      response = await fetcher(`${supabaseUrl}/auth/v1/user`, {
        headers: {
          apikey: publishableKey,
          authorization: `Bearer ${accessToken}`,
        },
        signal: AbortSignal.timeout(5_000),
      });
    } catch {
      throw new AppError({
        code: 'AUTH_SERVICE_UNAVAILABLE',
        expose: false,
        message: 'Email verification is temporarily unavailable.',
        statusCode: 503,
      });
    }

    if (!response.ok) {
      throw new AppError({
        code: 'INVALID_ACCESS_TOKEN',
        message: 'The access token is invalid or expired.',
        statusCode: 401,
      });
    }

    let user: unknown;

    try {
      user = await response.json();
    } catch {
      throw new AppError({
        code: 'AUTH_SERVICE_UNAVAILABLE',
        expose: false,
        message: 'Email verification is temporarily unavailable.',
        statusCode: 503,
      });
    }

    if (
      !isConfirmedUserResponse(user) ||
      user.id !== identity.id ||
      user.email.trim().toLowerCase() !== identity.email
    ) {
      throw new AppError({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email address before continuing.',
        statusCode: 403,
      });
    }

    return { ...identity, emailVerified: true };
  };

export const confirmSupabaseEmail = (
  accessToken: string,
  identity: SupabaseIdentity,
): Promise<SupabaseIdentity> => {
  if (env.supabaseUrl === undefined || env.supabasePublishableKey === undefined) {
    throw new AppError({
      code: 'AUTH_CONFIGURATION_ERROR',
      expose: false,
      message: 'Supabase user verification is not configured.',
      statusCode: 503,
    });
  }

  return createSupabaseEmailConfirmer({
    publishableKey: env.supabasePublishableKey,
    supabaseUrl: env.supabaseUrl,
  })(accessToken, identity);
};
