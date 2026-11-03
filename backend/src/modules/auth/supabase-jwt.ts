import {
  createRemoteJWKSet,
  errors as joseErrors,
  jwtVerify,
  type JWTPayload,
  type JWTVerifyGetKey,
} from 'jose';
import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import type { VerifyAccessToken } from './auth.types.js';

const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

let remoteJwks: ReturnType<typeof createRemoteJWKSet> | undefined;

const getSupabaseConfiguration = () => {
  if (env.supabaseUrl === undefined) {
    throw new AppError({
      code: 'AUTH_CONFIGURATION_ERROR',
      expose: false,
      message: 'Supabase authentication is not configured.',
      statusCode: 503,
    });
  }

  return {
    issuer: `${env.supabaseUrl}/auth/v1`,
    jwksUrl: new URL(`${env.supabaseUrl}/auth/v1/.well-known/jwks.json`),
  };
};

const getRemoteJwks = () => {
  if (remoteJwks === undefined) {
    remoteJwks = createRemoteJWKSet(getSupabaseConfiguration().jwksUrl, {
      cooldownDuration: 30_000,
      timeoutDuration: 5_000,
    });
  }

  return remoteJwks;
};

interface SupabaseVerifierOptions {
  readonly audience: string;
  readonly issuer: string;
  readonly keyResolver: JWTVerifyGetKey;
}

const getMetadata = (payload: JWTPayload): Readonly<Record<string, unknown>> => {
  const metadata = payload.user_metadata;
  return typeof metadata === 'object' && metadata !== null && !Array.isArray(metadata)
    ? (metadata as Readonly<Record<string, unknown>>)
    : {};
};

const isEmailVerified = (payload: JWTPayload): boolean => payload.email_verified === true;

export const createSupabaseAccessTokenVerifier =
  ({ audience, issuer, keyResolver }: SupabaseVerifierOptions): VerifyAccessToken =>
  async (accessToken) => {
    try {
      const { payload } = await jwtVerify(accessToken, keyResolver, {
        algorithms: ['ES256', 'RS256'],
        audience,
        issuer,
      });
      const metadata = getMetadata(payload);
      const email = typeof payload.email === 'string' ? payload.email.trim().toLowerCase() : '';

      if (
        payload.sub === undefined ||
        !uuidPattern.test(payload.sub) ||
        !email ||
        payload.is_anonymous === true
      ) {
        throw new AppError({
          code: 'INVALID_ACCESS_TOKEN',
          message: 'The access token is invalid.',
          statusCode: 401,
        });
      }

      return {
        email,
        emailVerified: isEmailVerified(payload),
        id: payload.sub,
        metadata,
      };
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }

      if (error instanceof joseErrors.JOSEError) {
        throw new AppError({
          code: 'INVALID_ACCESS_TOKEN',
          message: 'The access token is invalid or expired.',
          statusCode: 401,
        });
      }

      throw new AppError({
        code: 'AUTH_SERVICE_UNAVAILABLE',
        expose: false,
        message: 'Authentication verification is temporarily unavailable.',
        statusCode: 503,
      });
    }
  };

export const verifySupabaseAccessToken: VerifyAccessToken = (accessToken) => {
  const configuration = getSupabaseConfiguration();
  return createSupabaseAccessTokenVerifier({
    audience: env.supabaseJwtAudience,
    issuer: configuration.issuer,
    keyResolver: getRemoteJwks(),
  })(accessToken);
};
