import type { ErrorRequestHandler, RequestHandler } from 'express';
import { AppError } from '../errors/app-error.js';
import { sendError } from '../utils/api-response.js';
import { redactSensitiveText } from '../utils/redact-sensitive-text.js';

const getSafeLogDetails = (error: unknown) => {
  if (!(error instanceof Error)) {
    return { errorType: typeof error };
  }

  return {
    message: redactSensitiveText(error.message),
    name: error.name,
    stack: error.stack === undefined ? undefined : redactSensitiveText(error.stack),
  };
};

export const notFoundHandler: RequestHandler = (_request, response) => {
  sendError(response, 'ROUTE_NOT_FOUND', 'The requested resource was not found.', {
    statusCode: 404,
  });
};

export const errorHandler: ErrorRequestHandler = (error: unknown, _request, response, _next) => {
  if (error instanceof AppError) {
    console.error('Operational request error:', {
      ...getSafeLogDetails(error),
      code: error.code,
      statusCode: error.statusCode,
    });

    const responseOptions =
      error.expose && error.details !== undefined
        ? { details: error.details, statusCode: error.statusCode }
        : { statusCode: error.statusCode };

    return sendError(
      response,
      error.code,
      error.expose ? error.message : 'An unexpected error occurred.',
      responseOptions,
    );
  }

  console.error('Unhandled request error:', getSafeLogDetails(error));

  return sendError(response, 'INTERNAL_SERVER_ERROR', 'An unexpected error occurred.', {
    statusCode: 500,
  });
};
