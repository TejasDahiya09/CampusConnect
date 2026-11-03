const defaultAuthenticatedPath = '/home';

export const passwordConfirmationError = (password: string, confirmation: string): string | null =>
  password === confirmation ? null : 'Passwords do not match.';

export const toLoginRedirect = (pathname: string, search = '', hash = ''): string => {
  const intendedPath = `${pathname}${search}${hash}`;
  return `/login?redirect=${encodeURIComponent(intendedPath)}`;
};

export const readSafeRedirect = (value: string | null): string => {
  if (value === null || !value.startsWith('/') || value.startsWith('//')) {
    return defaultAuthenticatedPath;
  }

  return value;
};

export const redirectFromSearch = (search: string): string =>
  readSafeRedirect(new URLSearchParams(search).get('redirect'));

export const oauthCallbackError = (search: string, hash = ''): string | null => {
  const query = new URLSearchParams(search);
  const fragment = new URLSearchParams(hash.replace(/^#/, ''));
  if (
    !query.has('error') &&
    !query.has('error_description') &&
    !fragment.has('error') &&
    !fragment.has('error_description')
  )
    return null;
  return 'Google sign-in could not be completed. Please try again.';
};
