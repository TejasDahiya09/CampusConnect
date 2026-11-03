export interface UploadAuthorization {
  readonly expiresAt: string;
  readonly objectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly uploadUrl: string;
}

export interface StoredObjectMetadata {
  readonly byteSize: number;
  readonly contentType: string | undefined;
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CreateUploadAuthorizationInput {
  readonly contentType: string;
  readonly expectedSize: number;
  readonly listingId: string;
  readonly mediaId: string;
  readonly objectKey: string;
  readonly originalName: string;
  readonly uploaderId: string;
}

export interface StorageService {
  createUploadAuthorization(input: CreateUploadAuthorizationInput): Promise<UploadAuthorization>;
  deleteObject(objectKey: string): Promise<void>;
  getDeliveryUrl(objectKey: string): string;
  headObject(objectKey: string): Promise<StoredObjectMetadata | null>;
  readObject?(objectKey: string, maximumBytes: number): Promise<Uint8Array | null>;
  promoteObject(sourceObjectKey: string, destinationObjectKey: string): Promise<void>;
}
