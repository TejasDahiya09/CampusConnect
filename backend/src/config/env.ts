import 'dotenv/config';

const nodeEnvironments = ['development', 'test', 'production'] as const;

type NodeEnvironment = (typeof nodeEnvironments)[number];

export interface Environment {
  readonly adminAllowedUserId: string | undefined;
  readonly aiServiceEnabled: boolean;
  readonly aiServiceApiKey: string | undefined;
  readonly aiLostFoundCandidateLimit: number;
  readonly aiLostFoundTopK: number;
  readonly aiLostFoundMultimodalEnabled: boolean;
  readonly aiServiceTimeoutMs: number;
  readonly aiServiceGenerationTimeoutMs: number;
  readonly aiServiceUrl: string | undefined;
  readonly awsAccessKeyId: string | undefined;
  readonly awsCloudFrontBaseUrl: string | undefined;
  readonly awsRegion: string | undefined;
  readonly awsS3Bucket: string | undefined;
  readonly awsSecretAccessKey: string | undefined;
  readonly databaseConnectionTimeoutMs: number;
  readonly databasePoolMax: number;
  readonly databaseUrl: string | undefined;
  readonly frontendUrl: string;
  readonly isDevelopment: boolean;
  readonly isProduction: boolean;
  readonly isTest: boolean;
  readonly messageEncryptionKey: Buffer | undefined;
  readonly resumeAnalysisTimeoutMs: number;
  readonly resumeMaxBytes: number;
  readonly nodeEnv: NodeEnvironment;
  readonly port: number;
  readonly supabaseJwtAudience: string;
  readonly supabasePublishableKey: string | undefined;
  readonly supabaseUrl: string | undefined;
}

export const parseAdminAllowedUserId = (value: string | undefined): string | undefined => {
  const normalized = value?.trim().toLowerCase();
  return normalized &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u.test(normalized)
    ? normalized
    : undefined;
};

const parseNodeEnvironment = (value: string | undefined): NodeEnvironment => {
  const nodeEnvironment = value ?? 'development';

  if (!nodeEnvironments.includes(nodeEnvironment as NodeEnvironment)) {
    throw new Error(`NODE_ENV must be one of: ${nodeEnvironments.join(', ')}.`);
  }

  return nodeEnvironment as NodeEnvironment;
};

const parsePort = (value: string | undefined): number => {
  const port = Number(value ?? 3000);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error('PORT must be an integer between 1 and 65535.');
  }

  return port;
};

export const parseMessageEncryptionKey = (value: string | undefined): Buffer | undefined => {
  if (value === undefined || value.trim() === '') return undefined;
  const normalized = value.trim();
  if (!/^[A-Za-z0-9+/]{43}=$/.test(normalized)) {
    throw new Error('MESSAGE_ENCRYPTION_KEY must be a Base64-encoded 32-byte key.');
  }
  const key = Buffer.from(normalized, 'base64');
  if (key.length !== 32 || key.toString('base64') !== normalized) {
    throw new Error('MESSAGE_ENCRYPTION_KEY must be a Base64-encoded 32-byte key.');
  }
  return key;
};

const parsePositiveInteger = (
  name: string,
  value: string | undefined,
  defaultValue: number,
): number => {
  const parsedValue = Number(value ?? defaultValue);

  if (!Number.isInteger(parsedValue) || parsedValue < 1) {
    throw new Error(`${name} must be a positive integer.`);
  }

  return parsedValue;
};

const parseBoundedPositiveInteger = (
  name: string,
  value: string | undefined,
  defaultValue: number,
  maximum: number,
): number => {
  const parsedValue = parsePositiveInteger(name, value, defaultValue);

  if (parsedValue > maximum) {
    throw new Error(`${name} must not exceed ${maximum}.`);
  }

  return parsedValue;
};

const parseBoolean = (name: string, value: string | undefined, defaultValue: boolean): boolean => {
  if (value === undefined) return defaultValue;
  if (value === 'true') return true;
  if (value === 'false') return false;
  throw new Error(`${name} must be either true or false.`);
};

const parseUrl = (name: string, value: string): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid absolute URL.`);
  }

  if (!['http:', 'https:'].includes(url.protocol)) {
    throw new Error(`${name} must use the http or https protocol.`);
  }

  return url.origin;
};

const parseDatabaseUrl = (value: string): string => {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error('DATABASE_URL must be a valid PostgreSQL connection URL.');
  }

  if (!['postgres:', 'postgresql:'].includes(url.protocol)) {
    throw new Error('DATABASE_URL must use the postgres or postgresql protocol.');
  }

  return value;
};

const parseNonEmptyString = (name: string, value: string | undefined): string | undefined => {
  const normalizedValue = value?.trim();

  if (value !== undefined && !normalizedValue) {
    throw new Error(`${name} must not be empty when configured.`);
  }

  return normalizedValue;
};

const parseInternalServiceKey = (value: string | undefined): string | undefined => {
  const key = parseNonEmptyString('AI_SERVICE_API_KEY', value);
  if (key !== undefined && key.length < 16) {
    throw new Error('AI_SERVICE_API_KEY must contain at least 16 characters.');
  }
  return key;
};

const nodeEnv = parseNodeEnvironment(process.env.NODE_ENV);
const configuredFrontendUrl = process.env.FRONTEND_URL?.trim();
const configuredDatabaseUrl = process.env.DATABASE_URL?.trim();
const configuredSupabaseUrl = process.env.SUPABASE_URL?.trim();
const configuredSupabasePublishableKey = process.env.SUPABASE_PUBLISHABLE_KEY?.trim();
const configuredAwsRegion = process.env.AWS_REGION?.trim();
const configuredAwsS3Bucket = process.env.AWS_S3_BUCKET?.trim();
const configuredAwsAccessKeyId = process.env.AWS_ACCESS_KEY_ID?.trim();
const configuredAwsSecretAccessKey = process.env.AWS_SECRET_ACCESS_KEY?.trim();
const configuredAwsCloudFrontDomain = process.env.AWS_CLOUDFRONT_DOMAIN?.trim();
const configuredAiServiceUrl = process.env.AI_SERVICE_URL?.trim();
const configuredAiServiceApiKey = process.env.AI_SERVICE_API_KEY?.trim();
const aiServiceEnabled = parseBoolean('AI_SERVICE_ENABLED', process.env.AI_SERVICE_ENABLED, false);
if (aiServiceEnabled && !configuredAiServiceUrl) {
  throw new Error('AI_SERVICE_URL is required when AI_SERVICE_ENABLED is true.');
}
if (aiServiceEnabled && !configuredAiServiceApiKey) {
  throw new Error('AI_SERVICE_API_KEY is required when AI_SERVICE_ENABLED is true.');
}

if ((configuredAwsAccessKeyId === undefined) !== (configuredAwsSecretAccessKey === undefined)) {
  throw new Error('AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be configured together.');
}

const parseCloudFrontDomain = (value: string | undefined): string | undefined => {
  const normalized = parseNonEmptyString('AWS_CLOUDFRONT_DOMAIN', value);
  if (normalized === undefined) return undefined;
  const candidate = normalized.includes('://') ? normalized : `https://${normalized}`;
  const url = new URL(candidate);
  if (url.protocol !== 'https:' || url.pathname !== '/' || url.search || url.hash) {
    throw new Error('AWS_CLOUDFRONT_DOMAIN must be an HTTPS domain without a path.');
  }
  return url.origin;
};

if (
  nodeEnv === 'production' &&
  (!configuredAwsRegion || !configuredAwsS3Bucket || !configuredAwsCloudFrontDomain)
) {
  throw new Error(
    'AWS_REGION, AWS_S3_BUCKET, and AWS_CLOUDFRONT_DOMAIN are required in production.',
  );
}

if (nodeEnv === 'production' && !configuredFrontendUrl) {
  throw new Error('FRONTEND_URL is required when NODE_ENV is production.');
}

if (nodeEnv === 'production' && !configuredDatabaseUrl) {
  throw new Error('DATABASE_URL is required when NODE_ENV is production.');
}

if (nodeEnv === 'production' && !configuredSupabaseUrl) {
  throw new Error('SUPABASE_URL is required when NODE_ENV is production.');
}

if (nodeEnv === 'production' && !configuredSupabasePublishableKey) {
  throw new Error('SUPABASE_PUBLISHABLE_KEY is required when NODE_ENV is production.');
}

if (nodeEnv === 'production' && !process.env.MESSAGE_ENCRYPTION_KEY?.trim()) {
  throw new Error('MESSAGE_ENCRYPTION_KEY is required when NODE_ENV is production.');
}

export const env: Environment = Object.freeze({
  adminAllowedUserId: parseAdminAllowedUserId(process.env.ADMIN_ALLOWED_USER_ID),
  aiServiceEnabled,
  aiServiceApiKey: parseInternalServiceKey(configuredAiServiceApiKey),
  aiLostFoundCandidateLimit: parseBoundedPositiveInteger(
    'AI_LOST_FOUND_CANDIDATE_LIMIT',
    process.env.AI_LOST_FOUND_CANDIDATE_LIMIT,
    100,
    100,
  ),
  aiLostFoundTopK: parseBoundedPositiveInteger(
    'AI_LOST_FOUND_TOP_K',
    process.env.AI_LOST_FOUND_TOP_K,
    5,
    20,
  ),
  aiLostFoundMultimodalEnabled: parseBoolean(
    'AI_LOST_FOUND_MULTIMODAL_ENABLED',
    process.env.AI_LOST_FOUND_MULTIMODAL_ENABLED,
    false,
  ),
  aiServiceTimeoutMs: parsePositiveInteger(
    'AI_SERVICE_TIMEOUT_MS',
    process.env.AI_SERVICE_TIMEOUT_MS,
    3000,
  ),
  aiServiceGenerationTimeoutMs: parseBoundedPositiveInteger(
    'AI_SERVICE_GENERATION_TIMEOUT_MS',
    process.env.AI_SERVICE_GENERATION_TIMEOUT_MS,
    25_000,
    60_000,
  ),
  aiServiceUrl:
    configuredAiServiceUrl === undefined
      ? undefined
      : parseUrl('AI_SERVICE_URL', configuredAiServiceUrl),
  awsAccessKeyId: parseNonEmptyString('AWS_ACCESS_KEY_ID', configuredAwsAccessKeyId),
  awsCloudFrontBaseUrl: parseCloudFrontDomain(configuredAwsCloudFrontDomain),
  awsRegion: parseNonEmptyString('AWS_REGION', configuredAwsRegion),
  awsS3Bucket: parseNonEmptyString('AWS_S3_BUCKET', configuredAwsS3Bucket),
  awsSecretAccessKey: parseNonEmptyString('AWS_SECRET_ACCESS_KEY', configuredAwsSecretAccessKey),
  databaseConnectionTimeoutMs: parsePositiveInteger(
    'DATABASE_CONNECTION_TIMEOUT_MS',
    process.env.DATABASE_CONNECTION_TIMEOUT_MS,
    5000,
  ),
  databasePoolMax: parsePositiveInteger('DATABASE_POOL_MAX', process.env.DATABASE_POOL_MAX, 10),
  databaseUrl:
    configuredDatabaseUrl === undefined ? undefined : parseDatabaseUrl(configuredDatabaseUrl),
  frontendUrl: parseUrl('FRONTEND_URL', configuredFrontendUrl ?? 'http://localhost:5173'),
  isDevelopment: nodeEnv === 'development',
  isProduction: nodeEnv === 'production',
  isTest: nodeEnv === 'test',
  messageEncryptionKey: parseMessageEncryptionKey(process.env.MESSAGE_ENCRYPTION_KEY),
  resumeAnalysisTimeoutMs: parseBoundedPositiveInteger(
    'RESUME_ANALYSIS_TIMEOUT_MS',
    process.env.RESUME_ANALYSIS_TIMEOUT_MS,
    15_000,
    30_000,
  ),
  resumeMaxBytes: parseBoundedPositiveInteger(
    'RESUME_MAX_BYTES',
    process.env.RESUME_MAX_BYTES,
    5_242_880,
    10_485_760,
  ),
  nodeEnv,
  port: parsePort(process.env.PORT),
  supabaseJwtAudience:
    parseNonEmptyString('SUPABASE_JWT_AUDIENCE', process.env.SUPABASE_JWT_AUDIENCE) ??
    'authenticated',
  supabasePublishableKey: parseNonEmptyString(
    'SUPABASE_PUBLISHABLE_KEY',
    configuredSupabasePublishableKey,
  ),
  supabaseUrl:
    configuredSupabaseUrl === undefined
      ? undefined
      : parseUrl('SUPABASE_URL', configuredSupabaseUrl),
});
