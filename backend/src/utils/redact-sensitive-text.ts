const redactionPatterns: readonly [RegExp, string][] = [
  [/Bearer\s+[A-Za-z0-9._~-]{20,}/gi, 'Bearer [REDACTED]'],
  [/postgres(?:ql)?:\/\/[^\s]+/gi, '[REDACTED_DATABASE_URL]'],
  [/(?:DATABASE_URL|DIRECT_URL|SUPABASE_SERVICE_ROLE_KEY)\s*[=:]\s*[^\s]+/gi, '[REDACTED_SECRET]'],
];

export const redactSensitiveText = (value: string): string =>
  redactionPatterns.reduce(
    (redactedValue, [pattern, replacement]) => redactedValue.replace(pattern, replacement),
    value,
  );
