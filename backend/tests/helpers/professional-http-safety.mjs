import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import {
  verifyDatabaseOwner,
  verifyNoOtherTargetSessions,
  readTemplateCatalog,
  verifyTemplateCatalog,
  normalizeOid,
  targetName,
} from './professional-test-safety.mjs';
export const nativeMigrationHash =
  '8ed9e94167382e9c37086d6740a7e529482e457cdcaa17c1bda9ffc70ce0aa1f';
export const prerequisiteHashes = {
  '20261007000000_current_schema_baseline':
    'ad6e3b8c876c758633b20121b2539cc66cbb036e5b0473ab2e1ea058095d599b',
  '20261007010000_profile_location_skill_proficiency':
    '0adbf51d8e764a35836236b57b38d01547751ef249d020a3d7a9aff7aacf4f34',
  '20261007020000_messaging_encrypted_conversations':
    '41d1d67a4c78897ed59eeb7bba6e348c215ff0b7f4b42e71b42aa7591dbff09d',
  '20261007030000_notification_updated_at':
    '551d0ef462a57e662d3c44a46932f973b96d663be0639ebc771ae72c8d40e0d8',
  '20261024010000_content_moderation_visibility':
    '47e497ae8438893e1fae312cc30b1caa396cc53aa7f5d94f3d9810d61edde046',
  '20261025010000_landing_feature_opt_in':
    '0d1fb1633dd9c2468ea013e7ff91779750cc274a9d36bb223fb48b6e732de40f',
};
export async function verifyMigrationFiles(directory) {
  for (const [name, expected] of Object.entries({
    ...prerequisiteHashes,
    '20261101020000_native_professional_details': nativeMigrationHash,
  })) {
    const actual = createHash('sha256')
      .update(await readFile(new URL(name + '/migration.sql', directory)))
      .digest('hex');
    if (actual !== expected)
      throw new Error('Reviewed migration file identity differs. No execution allowed.');
  }
}
export const schemaDigest = (snapshot) =>
  createHash('sha256').update(JSON.stringify(snapshot)).digest('hex');
export function verifyHttpApproval(args, expectedHash) {
  const allowed = ['--target', '--schema-sha256', '--approve-synthetic-http'];
  if (
    args.length !== 5 ||
    args[0] !== '--target' ||
    args[1] !== targetName ||
    args[2] !== '--schema-sha256' ||
    args[3] !== expectedHash ||
    args[4] !== '--approve-synthetic-http' ||
    args.filter((x) => x.startsWith('--')).some((x) => !allowed.includes(x))
  )
    throw new Error(
      'Exact retained-target schema hash and independent synthetic-HTTP approval are required.',
    );
}
export async function readRetainedSchema(client) {
  const identity = (
    await client.query(`SELECT current_database() AS name,r.rolname AS owner,
    current_user AS role,session_user AS session_role,host(inet_server_addr()) AS address,
    inet_server_port() AS port,current_setting('server_version') AS version
    FROM pg_catalog.pg_database d JOIN pg_catalog.pg_roles r ON r.oid=d.datdba WHERE d.datname=current_database()`)
  ).rows[0];
  verifyDatabaseOwner(identity);
  if (identity.role !== 'postgres' || identity.session_role !== 'postgres')
    throw new Error('Unexpected retained-target session role.');
  const catalog = await readTemplateCatalog(client);
  const { objects, extensions } = catalog;
  // Public application/extension objects are matched by the full retained fingerprint below.
  // Every non-public object still passes the original PG17 initialization/extension rules.
  const derivedToast = (
    await client.query(`SELECT a.relname AS owner,t.relname AS name,t.oid::text AS table_oid,t.reltype::text AS row_type_oid,x.relname AS index_name,x.oid::text AS index_oid
    FROM pg_class a JOIN pg_namespace n ON n.oid=a.relnamespace
    JOIN pg_class t ON t.oid=a.reltoastrelid LEFT JOIN pg_index i ON i.indrelid=t.oid
    LEFT JOIN pg_class x ON x.oid=i.indexrelid WHERE n.nspname='public' ORDER BY a.relname,x.relname`)
  ).rows;
  const derived = new Set();
  for (const row of derivedToast) {
    derived.add('relation:' + normalizeOid(row.table_oid));
    if (row.index_oid !== null) derived.add('relation:' + normalizeOid(row.index_oid));
    if (normalizeOid(row.row_type_oid) !== 0) derived.add('type:' + normalizeOid(row.row_type_oid));
  }
  verifyTemplateCatalog({
    ...catalog,
    objects: objects.filter(
      (o) => o.schema !== 'public' && !derived.has(o.kind + ':' + normalizeOid(o.oid)),
    ),
    extensions: extensions.filter((e) => e.name !== 'citext'),
  });
  const metadata = (
    await client.query(`SELECT
    (SELECT jsonb_agg(jsonb_build_object('name',nspname,'owner',pg_get_userbyid(nspowner),'acl',nspacl::text) ORDER BY nspname) FROM pg_namespace WHERE nspname='public') AS namespaces,
    (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'definition',pg_get_triggerdef(t.oid)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND NOT t.tgisinternal) AS triggers,
    (SELECT jsonb_agg(jsonb_build_object('name',c.relname,'kind',c.relkind,'owner',pg_get_userbyid(c.relowner),'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text) ORDER BY c.relname)
     FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS relations,
    (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'required',a.attnotnull,'default',pg_get_expr(d.adbin,d.adrelid)) ORDER BY c.relname,a.attnum)
     FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid JOIN pg_namespace n ON n.oid=c.relnamespace LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='public' AND a.attnum>0 AND NOT a.attisdropped) AS columns,
    (SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',k.conname,'definition',pg_get_constraintdef(k.oid)) ORDER BY c.relname,k.conname)
     FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public') AS constraints,
    (SELECT jsonb_agg(jsonb_build_object('name',indexname,'definition',indexdef) ORDER BY indexname) FROM pg_indexes WHERE schemaname='public') AS indexes,
    (SELECT jsonb_agg(jsonb_build_object('name',p.proname,'args',oidvectortypes(p.proargtypes),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'securityDefiner',p.prosecdef,'config',p.proconfig,'definition',CASE WHEN p.prokind='a' THEN (SELECT row_to_json(a)::text FROM pg_aggregate a WHERE a.aggfnoid=p.oid) ELSE pg_get_functiondef(p.oid) END) ORDER BY p.proname,oidvectortypes(p.proargtypes))
     FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public') AS functions,
    (SELECT jsonb_agg(jsonb_build_object('name',t.typname,'kind',t.typtype,'category',t.typcategory,'base',format_type(t.typbasetype,NULL)) ORDER BY t.typname) FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS types,
    (SELECT jsonb_agg(jsonb_build_object('name',t.typname,'label',e.enumlabel) ORDER BY t.typname,e.enumsortorder) FROM pg_enum e JOIN pg_type t ON t.oid=e.enumtypid JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname='public') AS enums,
    (SELECT jsonb_agg(jsonb_build_object('table',tablename,'name',policyname,'command',cmd,'roles',roles,'qual',qual,'check',with_check) ORDER BY tablename,policyname) FROM pg_policies WHERE schemaname='public') AS policies`)
  ).rows[0];
  return {
    publicObjects: objects
      .filter((o) => o.schema === 'public')
      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
    derivedToast,
    schemas: catalog.schemas
      .map((s) => s.name)
      .filter((n) => !/^pg_(?:toast_)?temp_[0-9]+$/.test(n))
      .sort(),
    extensions: [...extensions].sort((a, b) => a.name.localeCompare(b.name)),
    metadata,
  };
}
export async function verifyRetainedForHttp(client, expected, parent) {
  const snapshot = await readRetainedSchema(client);
  if (schemaDigest(snapshot) !== schemaDigest(expected))
    throw new Error(
      'Retained schema/object fingerprint differs. No repair or schema writes allowed.',
    );
  if (parent) await verifyHttpSessions(client, parent);
  else await verifyNoOtherTargetSessions(client);
  const lo = (
    await client.query(
      'SELECT EXISTS(SELECT 1 FROM pg_catalog.pg_largeobject_metadata) OR EXISTS(SELECT 1 FROM pg_catalog.pg_largeobject) AS present',
    )
  ).rows[0];
  if (lo?.present !== false) throw new Error('Unexpected retained large-object records.');
  const tables = (
    await client.query(
      "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname='public' ORDER BY tablename",
    )
  ).rows;
  for (const { tablename } of tables) {
    const result = await client.query(
      `SELECT EXISTS(SELECT 1 FROM public."${tablename.replaceAll('"', '""')}") AS present`,
    );
    if (result.rows[0]?.present !== false)
      throw new Error('Retained target contains preexisting records. Nothing was removed.');
  }
  return snapshot;
}

// This connection is always the allowlisted target; returned session identity binds the lock.
export async function readHttpConnectionIdentity(client) {
  const row = (
    await client.query(`SELECT current_database() AS name,r.rolname AS owner,
    current_user AS role,session_user AS session_role,host(inet_server_addr()) AS address,
    inet_server_port() AS port,current_setting('server_version') AS version,
    pg_backend_pid() AS pid,a.backend_start::text AS started,a.application_name AS application
    FROM pg_database d JOIN pg_roles r ON r.oid=d.datdba
    JOIN pg_stat_activity a ON a.pid=pg_backend_pid() WHERE d.datname=current_database()`)
  ).rows[0];
  verifyDatabaseOwner(row);
  if (row.role !== 'postgres' || row.session_role !== 'postgres')
    throw new Error('Unexpected HTTP test role.');
  validateParent(row);
  return { pid: row.pid, started: row.started, application: row.application };
}
export function validateParent(parent) {
  if (
    !Number.isSafeInteger(parent?.pid) ||
    parent.pid <= 0 ||
    typeof parent.started !== 'string' ||
    !parent.started ||
    !/^cc-prof-http-[a-f0-9-]{36}$/.test(parent.application ?? '')
  )
    throw new Error('Invalid verified lock-session identity.');
}
export async function verifyHttpSessions(client, parent) {
  validateParent(parent);
  await client.query('SELECT pg_catalog.pg_stat_clear_snapshot()');
  const rows = (
    await client.query(`SELECT a.pid,a.usename AS role,a.datname AS name,
    host(a.client_addr) AS address,a.application_name AS application,a.backend_start::text AS started,
    EXISTS(SELECT 1 FROM pg_locks l WHERE l.locktype='advisory' AND l.classid=13808
      AND l.objid=1 AND l.objsubid=2 AND l.granted AND l.pid=a.pid
      AND l.database=(SELECT oid FROM pg_database WHERE datname=current_database()))
      AND NOT EXISTS(SELECT 1 FROM pg_locks other WHERE other.locktype='advisory'
        AND other.classid=13808 AND other.objid=1 AND other.objsubid=2 AND other.granted AND other.pid<>a.pid) AS held
    FROM pg_stat_activity a WHERE a.datname=current_database() AND a.pid<>pg_backend_pid()`)
  ).rows;
  if (rows.length !== 1) throw new Error('Unexpected target sessions; nothing was disconnected.');
  const row = rows[0];
  if (
    row.pid !== parent.pid ||
    row.role !== 'postgres' ||
    row.name !== targetName ||
    row.address !== '127.0.0.1' ||
    row.application !== parent.application ||
    row.started !== parent.started ||
    row.held !== true
  )
    throw new Error('Verified target lock session is missing or changed.');
}
export async function cleanupHttpRecords(client, snapshot, parent, ids) {
  if (
    !Array.isArray(ids) ||
    ids.length > 2 ||
    new Set(ids).size !== ids.length ||
    ids.some(
      (id) =>
        typeof id !== 'string' ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(id),
    )
  )
    throw new Error('Invalid invocation-owned cleanup identities.');
  if (schemaDigest(await readRetainedSchema(client)) !== schemaDigest(snapshot))
    throw new Error('Schema/identity changed; cleanup refused.');
  await verifyHttpSessions(client, parent);
  // Refuse unexpected records, even if an external client attached them to our synthetic users.
  const tables = snapshot.metadata.relations.filter((row) => row.kind === 'r');
  for (const { name } of tables) {
    const column =
      name === 'users'
        ? 'id'
        : name === 'profiles' || name === 'professional_profiles'
          ? 'user_id'
          : null;
    const quoted = 'public."' + name.replaceAll('"', '""') + '"';
    const result = await client.query(
      'SELECT EXISTS(SELECT 1 FROM ' +
        quoted +
        (column ? ' WHERE NOT ("' + column + '"=ANY($1::uuid[]))' : '') +
        ') AS unexpected',
      column ? [ids] : [],
    );
    if (result.rows[0]?.unexpected !== false)
      throw new Error('Unexpected records block cleanup. Nothing was removed.');
  }
  if (ids.length) await client.query('DELETE FROM public.users WHERE id=ANY($1::uuid[])', [ids]);
  await verifyRetainedForHttp(client, snapshot, parent);
}
