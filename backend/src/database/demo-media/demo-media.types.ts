export type DemoMediaModule = 'MARKETPLACE' | 'LOST_FOUND';

export interface DemoMediaAsset {
  readonly fileName: string;
  readonly license: 'Unsplash License';
  readonly module: DemoMediaModule;
  readonly recordId: string;
  readonly recordTitle: string;
  readonly sourcePage: string;
  readonly sourceUrl: string;
}

export interface DemoMediaRecord {
  readonly description: string;
  readonly existingFileNames: readonly string[];
  readonly id: string;
  readonly ownerId: string;
  readonly title: string;
}

export interface DownloadedDemoAsset {
  readonly bytes: Uint8Array;
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp';
}

export interface DemoMediaAuthorization {
  readonly mediaId: string;
  readonly objectKey: string;
  readonly requiredHeaders: Readonly<Record<string, string>>;
  readonly uploadUrl: string;
}

export interface DemoMediaGateway {
  authorize(
    asset: DemoMediaAsset,
    ownerId: string,
    file: DownloadedDemoAsset,
  ): Promise<DemoMediaAuthorization>;
  complete(
    asset: DemoMediaAsset,
    ownerId: string,
    authorization: DemoMediaAuthorization,
  ): Promise<void>;
  deleteObject(objectKey: string): Promise<void>;
  download(asset: DemoMediaAsset): Promise<DownloadedDemoAsset>;
  findRecords(assets: readonly DemoMediaAsset[]): Promise<ReadonlyMap<string, DemoMediaRecord>>;
  hasAssociation(asset: DemoMediaAsset): Promise<boolean>;
  upload(authorization: DemoMediaAuthorization, file: DownloadedDemoAsset): Promise<void>;
}

export interface DemoMediaResult {
  readonly attached: number;
  readonly failed: number;
  readonly preserved: number;
  readonly skippedExisting: number;
}
