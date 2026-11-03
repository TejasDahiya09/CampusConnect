import type { CatalogClient, RetainedSchema, HttpParent } from './professional-http-safety.mjs';
export interface TargetHttpConnection {
  connectionString: string;
  application_name: string;
  connectionTimeoutMillis: number;
  options: string;
}
export interface LockClient extends CatalogClient {
  connect(): Promise<void>;
  end(): Promise<void>;
}
export function targetHttpConnection(
  raw: string | undefined,
  application: string,
  readOnly?: boolean,
): TargetHttpConnection;
export function runTargetHttp(options: {
  raw: string | undefined;
  application: string;
  snapshot: RetainedSchema;
  createClient: (options: TargetHttpConnection) => LockClient;
  runChild: (parent: HttpParent) => Promise<number>;
  verify?: (client: CatalogClient, snapshot: RetainedSchema) => Promise<unknown>;
}): Promise<number>;
