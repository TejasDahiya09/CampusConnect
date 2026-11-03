import assert from 'node:assert/strict';
import { targetName, type TemplateObject } from './professional-test-safety.mjs';
import type { RetainedSchema } from './professional-http-safety.mjs';
export function retainedCatalogMock(
  snapshot: RetainedSchema,
  options: {
    owner?: string;
    role?: string;
    port?: number;
    metadata?: unknown;
    extra?: TemplateObject;
    records?: boolean;
    sessions?: number;
    largeObjects?: boolean;
  } = {},
) {
  const calls: string[] = [];
  const members: TemplateObject[] = [
    ...[
      ['plpgsql_call_handler', '', 'language_handler'],
      ['plpgsql_inline_handler', 'internal', 'void'],
      ['plpgsql_validator', 'oid', 'void'],
    ].map(([name, args, result], i) => ({
      oid: 15000 + i,
      kind: 'function',
      schema: 'pg_catalog',
      name: name!,
      args: args!,
      result: result!,
      extension: 'plpgsql',
      language: 'c',
      binary: '$libdir/plpgsql',
      source: name!,
    })),
    {
      oid: 15003,
      kind: 'language',
      schema: 'pg_catalog',
      name: 'plpgsql',
      extension: 'plpgsql',
      trusted: true,
      handler: 'plpgsql_call_handler',
      inline: 'plpgsql_inline_handler',
      validator: 'plpgsql_validator',
    },
    ...snapshot.publicObjects,
    ...snapshot.derivedToast.flatMap((r) => [
      { oid: r.table_oid, kind: 'relation', schema: 'pg_toast', name: String(r.name) },
      { oid: r.index_oid, kind: 'relation', schema: 'pg_toast', name: String(r.index_name) },
      ...(r.row_type_oid === '0'
        ? []
        : [{ oid: r.row_type_oid, kind: 'type', schema: 'pg_toast', name: 'derived' }]),
    ]),
    ...(options.extra ? [options.extra] : []),
  ];
  const replies: readonly Record<string, unknown>[][] = [
    [
      {
        name: targetName,
        owner: options.owner ?? 'postgres',
        role: options.role ?? 'postgres',
        session_role: 'postgres',
        address: '127.0.0.1',
        port: options.port ?? 5433,
        version: '17.11',
      },
    ],
    snapshot.schemas.map((name) => ({ name })),
    [...snapshot.extensions],
    members.map((object) => ({ object })),
    [...snapshot.derivedToast],
    [options.metadata ?? snapshot.metadata] as Record<string, unknown>[],
    [],
    [{ other_sessions: options.sessions ?? 0 }],
    [{ present: options.largeObjects ?? false }],
    [{ tablename: 'professional_profiles' }],
    [{ present: options.records ?? false }],
  ];
  return {
    calls,
    responses: replies,
    query: (sql: string) => {
      calls.push(sql);
      assert.match(sql.trim(), /^(?:SELECT|WITH)\b/, 'Safety helper must be read-only');
      const rows = replies[calls.length - 1];
      assert.ok(rows, 'Unexpected query');
      return Promise.resolve({ rows });
    },
  };
}
