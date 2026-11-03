import type { ApiResponse } from '../types/api';
import { frontendEnv } from '../config/env';
import { getSupabaseClient } from '../lib/supabase';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(code: string, message: string, status: number) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
  }
}

export const apiRequestWithMeta = async <T>(
  path: string,
  init: RequestInit = {},
): Promise<{
  readonly data: T;
  readonly meta?: Readonly<Record<string, boolean | null | number | string>>;
}> => {
  const headers = new Headers(init.headers);
  const supabase = getSupabaseClient();
  const { data } = await supabase.auth.getSession();
  const accessToken = data.session?.access_token;
  if (accessToken === undefined) {
    throw new ApiClientError('AUTHENTICATION_REQUIRED', 'Authentication is required.', 401);
  }
  headers.set('authorization', `Bearer ${accessToken}`);

  if (init.body !== undefined && !(init.body instanceof FormData) && !headers.has('content-type')) {
    headers.set('content-type', 'application/json');
  }

  const response = await fetch(`${frontendEnv.apiBaseUrl}${path}`, { ...init, headers });
  const body = (await response.json()) as ApiResponse<T>;

  if (!response.ok || !body.success) {
    if (response.status === 401) {
      await supabase.auth.signOut({ scope: 'local' });
    }

    const error = body.success
      ? { code: 'API_REQUEST_FAILED', message: 'The request could not be completed.' }
      : body.error;
    throw new ApiClientError(error.code, error.message, response.status);
  }

  return body.meta === undefined ? { data: body.data } : { data: body.data, meta: body.meta };
};

export const apiRequest = async <T>(path: string, init: RequestInit = {}): Promise<T> =>
  (await apiRequestWithMeta<T>(path, init)).data;
