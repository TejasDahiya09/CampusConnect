const parseOptionalUrl = (name: string, value: string | undefined): string | undefined => {
  const normalizedValue = value?.trim();

  if (!normalizedValue) {
    return undefined;
  }

  try {
    const url = new URL(normalizedValue);

    if (!['http:', 'https:'].includes(url.protocol)) {
      throw new Error();
    }

    return url.origin;
  } catch {
    throw new Error(`${name} must be a valid HTTP(S) URL.`);
  }
};

const supabaseUrl = parseOptionalUrl('VITE_SUPABASE_URL', import.meta.env?.VITE_SUPABASE_URL);
const supabasePublishableKey = import.meta.env?.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
const publicAppUrl = parseOptionalUrl('VITE_PUBLIC_APP_URL', import.meta.env?.VITE_PUBLIC_APP_URL);

if ((supabaseUrl === undefined) !== !supabasePublishableKey) {
  throw new Error(
    'VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY must be configured together.',
  );
}

export const frontendEnv = Object.freeze({
  apiBaseUrl:
    parseOptionalUrl('VITE_API_BASE_URL', import.meta.env?.VITE_API_BASE_URL) ??
    'http://localhost:3000',
  authConfigured: supabaseUrl !== undefined && Boolean(supabasePublishableKey),
  publicAppUrl,
  supabasePublishableKey,
  supabaseUrl,
});
