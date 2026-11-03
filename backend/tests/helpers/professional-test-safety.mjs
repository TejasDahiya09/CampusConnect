import { createHash } from 'node:crypto';
export const targetName = 'campusconnect_professional_test_13b8b_20261101_01';
export function verifyTarget(raw) {
  if (!raw) throw new Error('PROFESSIONAL_TEST_DATABASE_URL is required; no fallback is allowed.');
  let url;
  try {
    url = new URL(raw);
  } catch {
    throw new Error('Invalid professional test connection configuration.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    url.hostname !== '127.0.0.1' ||
    url.port !== '5433' ||
    url.username !== 'postgres' ||
    url.pathname !== '/' + targetName ||
    url.search ||
    url.hash
  )
    throw new Error('Professional test database identity rejected.');
  return url;
}
export const sqlHash = (sql) => createHash('sha256').update(sql).digest('hex');
export function verifyApproval(args, hash) {
  const recovery = args.includes('--recover-untouched');
  const known = new Set([
    '--target',
    '--migration-sha256',
    '--approve-create',
    '--approve-migration',
    '--recover-untouched',
    '--approve-recovery',
  ]);
  const flags = args.filter((value) => value.startsWith('--'));
  if (flags.some((flag) => !known.has(flag)) || new Set(flags).size !== flags.length)
    throw new Error('Unknown or ambiguous execution approval arguments.');
  const value = (name) => args[args.indexOf(name) + 1];
  if (
    (recovery
      ? !args.includes('--approve-recovery') || args.includes('--approve-create')
      : !args.includes('--approve-create') || args.includes('--approve-recovery')) ||
    !args.includes('--approve-migration') ||
    !args.includes('--target') ||
    value('--target') !== targetName ||
    !args.includes('--migration-sha256') ||
    value('--migration-sha256') !== hash
  )
    throw new Error(
      'Exact target, SQL hash, migration approval and independent creation OR untouched-recovery approval are required. No database operation performed.',
    );
  return recovery ? 'recover' : 'create';
}
export function verifyDatabaseExistence(exists, mode) {
  if (mode === 'create' && exists)
    throw new Error('Target already exists. Explicit untouched recovery approval is required.');
  if (mode === 'recover' && !exists)
    throw new Error('Recovery target is absent. Recovery never creates or substitutes a database.');
  if (mode !== 'create' && mode !== 'recover') throw new Error('Unsupported execution mode.');
}
export function verifyServer(row) {
  if (row.address !== '127.0.0.1' || row.port !== 5433 || !/^17\./.test(row.version))
    throw new Error('Unexpected PostgreSQL server.');
}

export class TemplateSafetyError extends Error {
  constructor(message, unexpected = []) {
    super(message);
    this.name = 'TemplateSafetyError';
    this.unexpected = unexpected;
  }
}

/** PostgreSQL unsigned 32-bit OID representation, not an object-trust decision. */
export function normalizeOid(value) {
  const number =
    typeof value === 'number'
      ? value
      : typeof value === 'string' && /^(?:0|[1-9][0-9]{0,9})$/.test(value)
        ? Number(value)
        : NaN;
  if (!Number.isSafeInteger(number) || Object.is(number, -0) || number < 0 || number > 4294967295)
    throw new TemplateSafetyError('Invalid PostgreSQL OID representation.');
  return number;
}

export function verifyDatabaseOwner(row) {
  verifyServer(row);
  if (row.name !== targetName || row.owner !== 'postgres')
    throw new TemplateSafetyError('Unexpected disposable database identity or owner.', [
      `database=${JSON.stringify(row.name)} owner=${JSON.stringify(row.owner)}`,
    ]);
}

// PostgreSQL 17 transam.h / system-catalog-initial-data.html:
// initdb-created objects occupy OIDs < FirstNormalObjectId (16384).
// Namespaces alone are NOT evidence that an object is a built-in.
const coreSchemas = new Set(['pg_catalog', 'information_schema', 'pg_toast']);
const requiredSchemas = [...coreSchemas, 'public'];
const managedTemporarySchema = /^pg_(?:toast_)?temp_[1-9][0-9]*$/;
const plpgsqlFunctions = new Map([
  ['plpgsql_call_handler', { args: '', result: 'language_handler' }],
  ['plpgsql_inline_handler', { args: 'internal', result: 'void' }],
  ['plpgsql_validator', { args: 'oid', result: 'void' }],
]);

export function verifyTemplateCatalog(catalog) {
  // Normalize every object, including extension members, BEFORE any trust branch.
  const objects = catalog.objects.map((object) => ({ ...object, oid: normalizeOid(object.oid) }));
  const unexpected = [];
  const schemas = new Set(catalog.schemas.map((row) => row.name));
  for (const name of requiredSchemas)
    if (!schemas.has(name)) unexpected.push(`missing standard schema ${name}`);
  for (const name of schemas)
    if (!requiredSchemas.includes(name) && !managedTemporarySchema.test(name))
      unexpected.push(`schema ${JSON.stringify(name)}`);
  if (
    catalog.extensions.length !== 1 ||
    catalog.extensions[0].name !== 'plpgsql' ||
    catalog.extensions[0].schema !== 'pg_catalog' ||
    catalog.extensions[0].version !== '1.0'
  )
    unexpected.push(
      'extensions ' +
        JSON.stringify(
          catalog.extensions.map(({ name, schema, version }) => ({ name, schema, version })),
        ),
    );
  const members = objects
    .filter((object) => object.extension === 'plpgsql')
    .map((object) => `${object.kind}:${object.name}`)
    .sort();
  const expectedMembers = [
    'function:plpgsql_call_handler',
    'function:plpgsql_inline_handler',
    'function:plpgsql_validator',
    'language:plpgsql',
  ].sort();
  if (JSON.stringify(members) !== JSON.stringify(expectedMembers))
    unexpected.push('missing or unexpected plpgsql extension members');
  for (const object of objects) {
    if (object.oid === 0) {
      unexpected.push(`invalid catalog object OID for ${JSON.stringify(object.name)}`);
      continue;
    }
    if (object.extension === 'plpgsql') {
      const signature = plpgsqlFunctions.get(object.name);
      if (
        object.kind === 'function' &&
        object.schema === 'pg_catalog' &&
        signature &&
        object.args === signature.args &&
        object.result === signature.result &&
        object.language === 'c' &&
        object.binary === '$libdir/plpgsql' &&
        object.source === object.name
      )
        continue;
      if (
        object.kind === 'language' &&
        object.schema === 'pg_catalog' &&
        object.name === 'plpgsql' &&
        object.trusted === true &&
        object.handler === 'plpgsql_call_handler' &&
        object.inline === 'plpgsql_inline_handler' &&
        object.validator === 'plpgsql_validator'
      )
        continue;
    } else if (
      !object.extension &&
      coreSchemas.has(object.schema) &&
      Number.isInteger(object.oid) &&
      object.oid > 0 &&
      object.oid < 16384
    )
      continue;
    unexpected.push(
      `${object.kind} ${JSON.stringify(object.schema)}.${JSON.stringify(object.name)} oid=${object.oid}`,
    );
  }
  if (unexpected.length)
    throw new TemplateSafetyError(
      'Unexpected template objects; no provisioning SQL was executed.',
      unexpected,
    );
}

// Read-only catalog queries. Call immediately after connecting to the newly created target.
// This gate must complete BEFORE BEGIN/CREATE EXTENSION/baseline/migration statements.
export async function verifyPristineTarget(client) {
  const identity = await client.query(`
    SELECT current_database() AS name, r.rolname AS owner,
           host(inet_server_addr()) AS address, inet_server_port() AS port,
           current_setting('server_version') AS version
    FROM pg_catalog.pg_database d
    JOIN pg_catalog.pg_roles r ON r.oid = d.datdba
    WHERE d.datname = current_database()`);
  if (identity.rows.length !== 1)
    throw new TemplateSafetyError('Cannot resolve target database owner.');
  verifyDatabaseOwner(identity.rows[0]);
  verifyTemplateCatalog(await readTemplateCatalog(client));
}

export async function readTemplateCatalog(client) {
  const schemas = (await client.query('SELECT nspname AS name FROM pg_catalog.pg_namespace')).rows;
  const extensions = (
    await client.query(`
    SELECT e.extname AS name, n.nspname AS schema, e.extversion AS version
    FROM pg_catalog.pg_extension e JOIN pg_catalog.pg_namespace n ON n.oid=e.extnamespace`)
  ).rows;
  const objects = (await client.query(templateObjectQuery)).rows.map((row) => row.object);
  return { schemas, extensions, objects };
}

export async function verifyNoOtherTargetSessions(client) {
  // PostgreSQL caches activity snapshots within a transaction; each recheck must be fresh.
  await client.query('SELECT pg_catalog.pg_stat_clear_snapshot()');
  const result = await client.query(`SELECT count(*)::int AS other_sessions
    FROM pg_catalog.pg_stat_activity
    WHERE datname=current_database() AND pid<>pg_backend_pid()`);
  if (result.rows.length !== 1 || result.rows[0].other_sessions !== 0)
    throw new TemplateSafetyError(
      'Untouched recovery requires no other target sessions. Nothing was disconnected.',
    );
}

// Recovery only; caller must already be inside the provisioning transaction.
// These are per-database catalog locks, not cluster-wide role/database locks.
// NOWAIT fails rather than waiting on another writer. No connection is killed.
// Shared catalogs (including pg_subscription) are deliberately not locked cluster-wide.
export async function verifyRecoveryBeforeProvisioning(client) {
  await verifyNoOtherTargetSessions(client);
  await client.query(`LOCK TABLE pg_catalog.pg_namespace, pg_catalog.pg_class,
    pg_catalog.pg_proc, pg_catalog.pg_type, pg_catalog.pg_extension,
    pg_catalog.pg_depend, pg_catalog.pg_language, pg_catalog.pg_operator,
    pg_catalog.pg_opclass, pg_catalog.pg_opfamily, pg_catalog.pg_collation,
    pg_catalog.pg_conversion, pg_catalog.pg_ts_config, pg_catalog.pg_ts_dict,
    pg_catalog.pg_ts_parser, pg_catalog.pg_ts_template,
    pg_catalog.pg_foreign_data_wrapper, pg_catalog.pg_foreign_server,
    pg_catalog.pg_event_trigger, pg_catalog.pg_publication,
    pg_catalog.pg_am, pg_catalog.pg_largeobject,
    pg_catalog.pg_largeobject_metadata IN SHARE MODE NOWAIT`);
  await verifyNoOtherTargetSessions(client);
  await verifyPristineTarget(client);
  // With all application objects rejected, large objects are the remaining
  // ordinary user-record storage that can exist without a new application table.
  const records = await client.query(`SELECT
    (EXISTS(SELECT 1 FROM pg_catalog.pg_largeobject_metadata) OR
     EXISTS(SELECT 1 FROM pg_catalog.pg_largeobject)) AS unexpected_records`);
  if (records.rows.length !== 1 || records.rows[0].unexpected_records !== false)
    throw new TemplateSafetyError(
      'Recovery target contains unexpected records. Nothing was removed.',
    );
}

// Include all relations (tables, views, matviews, foreign tables, sequences, indexes),
// functions/procedures/aggregates, types and other namespace/global object catalogs.
// pg_depend membership is checked rather than trusting a PL/pgSQL-like object name.
const templateObjectQuery = `
  WITH objects AS (
    SELECT 'pg_class'::regclass AS classid, c.oid, n.nspname AS schema, c.relname AS name,
           'relation' AS kind, jsonb_build_object('subtype', c.relkind) AS extra
    FROM pg_catalog.pg_class c JOIN pg_catalog.pg_namespace n ON n.oid=c.relnamespace
    UNION ALL
    SELECT 'pg_proc'::regclass, p.oid, n.nspname, p.proname, 'function',
           jsonb_build_object('args',pg_catalog.oidvectortypes(p.proargtypes),
             'result',pg_catalog.format_type(p.prorettype,NULL),'language',l.lanname,
             'binary',p.probin,'source',p.prosrc)
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_namespace n ON n.oid=p.pronamespace
    JOIN pg_catalog.pg_language l ON l.oid=p.prolang
    UNION ALL
    SELECT 'pg_type'::regclass, t.oid, n.nspname, t.typname, 'type', '{}'::jsonb
    FROM pg_catalog.pg_type t JOIN pg_catalog.pg_namespace n ON n.oid=t.typnamespace
    UNION ALL
    SELECT 'pg_language'::regclass, l.oid, 'pg_catalog', l.lanname, 'language',
           jsonb_build_object('trusted',l.lanpltrusted,'handler',h.proname,'inline',i.proname,'validator',v.proname)
    FROM pg_catalog.pg_language l LEFT JOIN pg_catalog.pg_proc h ON h.oid=l.lanplcallfoid
    LEFT JOIN pg_catalog.pg_proc i ON i.oid=l.laninline LEFT JOIN pg_catalog.pg_proc v ON v.oid=l.lanvalidator
    UNION ALL
    SELECT 'pg_operator'::regclass, o.oid, n.nspname, o.oprname, 'operator', '{}'::jsonb
    FROM pg_catalog.pg_operator o JOIN pg_catalog.pg_namespace n ON n.oid=o.oprnamespace
    UNION ALL
    SELECT 'pg_opclass'::regclass, o.oid, n.nspname, o.opcname, 'operator_class', '{}'::jsonb
    FROM pg_catalog.pg_opclass o JOIN pg_catalog.pg_namespace n ON n.oid=o.opcnamespace
    UNION ALL
    SELECT 'pg_opfamily'::regclass, o.oid, n.nspname, o.opfname, 'operator_family', '{}'::jsonb
    FROM pg_catalog.pg_opfamily o JOIN pg_catalog.pg_namespace n ON n.oid=o.opfnamespace
    UNION ALL
    SELECT 'pg_collation'::regclass, c.oid, n.nspname, c.collname, 'collation', '{}'::jsonb
    FROM pg_catalog.pg_collation c JOIN pg_catalog.pg_namespace n ON n.oid=c.collnamespace
    UNION ALL
    SELECT 'pg_conversion'::regclass, c.oid, n.nspname, c.conname, 'conversion', '{}'::jsonb
    FROM pg_catalog.pg_conversion c JOIN pg_catalog.pg_namespace n ON n.oid=c.connamespace
    UNION ALL
    SELECT 'pg_ts_config'::regclass, c.oid, n.nspname, c.cfgname, 'text_search_configuration', '{}'::jsonb
    FROM pg_catalog.pg_ts_config c JOIN pg_catalog.pg_namespace n ON n.oid=c.cfgnamespace
    UNION ALL
    SELECT 'pg_ts_dict'::regclass, c.oid, n.nspname, c.dictname, 'text_search_dictionary', '{}'::jsonb
    FROM pg_catalog.pg_ts_dict c JOIN pg_catalog.pg_namespace n ON n.oid=c.dictnamespace
    UNION ALL
    SELECT 'pg_ts_parser'::regclass, c.oid, n.nspname, c.prsname, 'text_search_parser', '{}'::jsonb
    FROM pg_catalog.pg_ts_parser c JOIN pg_catalog.pg_namespace n ON n.oid=c.prsnamespace
    UNION ALL
    SELECT 'pg_ts_template'::regclass, c.oid, n.nspname, c.tmplname, 'text_search_template', '{}'::jsonb
    FROM pg_catalog.pg_ts_template c JOIN pg_catalog.pg_namespace n ON n.oid=c.tmplnamespace
    UNION ALL
    SELECT 'pg_foreign_data_wrapper'::regclass, f.oid, 'pg_catalog', f.fdwname, 'foreign_data_wrapper', '{}'::jsonb FROM pg_catalog.pg_foreign_data_wrapper f
    UNION ALL
    SELECT 'pg_foreign_server'::regclass, f.oid, 'pg_catalog', f.srvname, 'foreign_server', '{}'::jsonb FROM pg_catalog.pg_foreign_server f
    UNION ALL
    SELECT 'pg_event_trigger'::regclass, e.oid, 'pg_catalog', e.evtname, 'event_trigger', '{}'::jsonb FROM pg_catalog.pg_event_trigger e
    UNION ALL
    SELECT 'pg_publication'::regclass, p.oid, 'pg_catalog', p.pubname, 'publication', '{}'::jsonb FROM pg_catalog.pg_publication p
    UNION ALL
    SELECT 'pg_subscription'::regclass, s.oid, 'pg_catalog', s.subname, 'subscription', '{}'::jsonb FROM pg_catalog.pg_subscription s
    UNION ALL
    SELECT 'pg_am'::regclass, a.oid, 'pg_catalog', a.amname, 'access_method', '{}'::jsonb FROM pg_catalog.pg_am a
  )
  SELECT jsonb_build_object('oid',o.oid,'schema',o.schema,'name',o.name,'kind',o.kind,'extension',e.extname) || o.extra AS object
  FROM objects o
  LEFT JOIN pg_catalog.pg_depend d ON d.classid=o.classid AND d.objid=o.oid AND d.objsubid=0
    AND d.refclassid='pg_extension'::regclass AND d.deptype='e'
  LEFT JOIN pg_catalog.pg_extension e ON e.oid=d.refobjid`;
