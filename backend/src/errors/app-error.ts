import type { ApiValidationIssue } from '../types/api-response.js';

interface AppErrorOptions {
  readonly code: string;
  readonly details?: readonly ApiValidationIssue[];
  readonly expose?: boolean;
  readonly message: string;
  readonly statusCode: number;
}

export class AppError extends Error {
  readonly code: string;
  readonly details: readonly ApiValidationIssue[] | undefined;
  readonly expose: boolean;
  readonly isOperational = true;
  readonly statusCode: number;

  constructor(options: AppErrorOptions) {
    super(options.message);
    this.name = 'AppError';
    this.code = options.code;
    this.details = options.details;
    this.expose = options.expose ?? options.statusCode < 500;
    this.statusCode = options.statusCode;
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details: readonly ApiValidationIssue[]) {
    super({
      code: 'VALIDATION_ERROR',
      details,
      message,
      statusCode: 400,
    });
    this.name = 'ValidationError';
  }
}
