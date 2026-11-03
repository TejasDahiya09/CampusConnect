import type { TemplateCatalog } from './professional-test-safety.mjs';
export interface CatalogClient {
  query(sql: string, values?: unknown[]): Promise<{ rows: readonly Record<string, unknown>[] }>;
}
export interface RetainedSchema {
  publicObjects: TemplateCatalog['objects'];
  derivedToast: readonly Record<string, unknown>[];
  schemas: string[];
  extensions: TemplateCatalog['extensions'];
  metadata: Record<string, unknown>;
}
export const nativeMigrationHash: string;
export function schemaDigest(snapshot: unknown): string;
export function verifyHttpApproval(args: string[], expectedHash: string): void;
export function readRetainedSchema(client: CatalogClient): Promise<RetainedSchema>;
export function verifyRetainedForHttp(
  client: CatalogClient,
  expected: RetainedSchema,
  parent?: HttpParent,
): Promise<RetainedSchema>;

export interface HttpParent {
  pid: number;
  started: string;
  application: string;
}
export const prerequisiteHashes: Readonly<Record<string, string>>;
export function verifyMigrationFiles(directory: URL): Promise<void>;
export function validateParent(parent: HttpParent): void;
export function readHttpConnectionIdentity(client: CatalogClient): Promise<HttpParent>;
export function verifyHttpSessions(client: CatalogClient, parent: HttpParent): Promise<void>;
export function cleanupHttpRecords(
  client: CatalogClient,
  snapshot: RetainedSchema,
  parent: HttpParent,
  ids: readonly string[],
): Promise<void>;
