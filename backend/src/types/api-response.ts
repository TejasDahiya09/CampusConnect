export interface ApiMetadata {
  readonly [key: string]: boolean | null | number | string;
}

export interface ApiValidationIssue {
  readonly field: string;
  readonly message: string;
}

export interface ApiSuccessResponse<T> {
  readonly success: true;
  readonly data: T;
  readonly meta?: ApiMetadata;
}

export interface ApiErrorResponse {
  readonly success: false;
  readonly error: {
    readonly code: string;
    readonly message: string;
    readonly details?: readonly ApiValidationIssue[];
  };
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
