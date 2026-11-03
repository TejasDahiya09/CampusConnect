export interface ApiSuccessResponse<T> {
  readonly data: T;
  readonly meta?: Readonly<Record<string, boolean | null | number | string>>;
  readonly success: true;
}

export interface ApiErrorResponse {
  readonly error: {
    readonly code: string;
    readonly message: string;
  };
  readonly success: false;
}

export type ApiResponse<T> = ApiSuccessResponse<T> | ApiErrorResponse;
