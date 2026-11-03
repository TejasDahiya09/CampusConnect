export const aiUnavailableCodes = [
  'AI_SERVICE_HTTP_ERROR',
  'AI_SERVICE_INVALID_RESPONSE',
  'AI_SERVICE_NETWORK_ERROR',
  'AI_SERVICE_TIMEOUT',
] as const;

export type AiUnavailableCode = (typeof aiUnavailableCodes)[number];
