export const targetName: string;
export function verifyTarget(raw: string | undefined): URL;
export function sqlHash(sql: string | Uint8Array): string;
export function verifyApproval(args: string[], hash: string): 'create' | 'recover';
export function verifyDatabaseExistence(exists: boolean, mode: 'create' | 'recover'): void;
export function normalizeOid(value: unknown): number;
export function verifyServer(row: { address: string; port: number; version: string }): void;
export interface DatabaseIdentity {
  name: string;
  owner: string;
  address: string;
  port: number;
  version: string;
}
export interface TemplateObject {
  oid: unknown;
  kind: string;
  schema: string;
  name: string;
  extension?: string | null;
  subtype?: string;
  args?: string;
  result?: string;
  language?: string;
  binary?: string;
  source?: string;
  trusted?: boolean;
  handler?: string;
  inline?: string;
  validator?: string;
}
export interface TemplateCatalog {
  schemas: readonly { name: string }[];
  extensions: readonly { name: string; schema: string; version: string }[];
  objects: readonly TemplateObject[];
}
export class TemplateSafetyError extends Error {
  readonly unexpected: readonly string[];
  constructor(message: string, unexpected?: string[]);
}
export function verifyDatabaseOwner(row: DatabaseIdentity): void;
export function verifyTemplateCatalog(catalog: TemplateCatalog): void;
export function verifyPristineTarget(client: {
  query(sql: string): Promise<{ rows: readonly Record<string, unknown>[] }>;
}): Promise<void>;

export function verifyNoOtherTargetSessions(client: {
  query(sql: string): Promise<{ rows: readonly Record<string, unknown>[] }>;
}): Promise<void>;
export function verifyRecoveryBeforeProvisioning(client: {
  query(sql: string): Promise<{ rows: readonly Record<string, unknown>[] }>;
}): Promise<void>;

export function readTemplateCatalog(client: {
  query(sql: string): Promise<{ rows: readonly Record<string, unknown>[] }>;
}): Promise<TemplateCatalog>;
