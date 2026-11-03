import type { Response } from 'express';
import type {
  ApiErrorResponse,
  ApiMetadata,
  ApiSuccessResponse,
  ApiValidationIssue,
} from '../types/api-response.js';

interface SuccessResponseOptions {
  readonly meta?: ApiMetadata;
  readonly statusCode?: number;
}

interface ErrorResponseOptions {
  readonly details?: readonly ApiValidationIssue[];
  readonly statusCode?: number;
}

export const sendSuccess = <T>(
  response: Response<ApiSuccessResponse<T>>,
  data: T,
  options: SuccessResponseOptions = {},
) => {
  const body: ApiSuccessResponse<T> =
    options.meta === undefined
      ? { success: true, data }
      : { success: true, data, meta: options.meta };

  return response.status(options.statusCode ?? 200).json(body);
};

export const sendError = (
  response: Response<ApiErrorResponse>,
  code: string,
  message: string,
  options: ErrorResponseOptions = {},
) => {
  const error =
    options.details === undefined ? { code, message } : { code, message, details: options.details };

  return response.status(options.statusCode ?? 500).json({ success: false, error });
};
