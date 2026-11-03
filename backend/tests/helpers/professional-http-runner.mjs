import { verifyTarget } from './professional-test-safety.mjs';
import { readHttpConnectionIdentity, verifyRetainedForHttp } from './professional-http-safety.mjs';
export function targetHttpConnection(raw, application, readOnly = true) {
  const target = verifyTarget(raw);
  if (!/^cc-prof-http-[a-f0-9-]{36}$/.test(application))
    throw new Error('Invalid isolated application name.');
  return {
    connectionString: target.toString(),
    application_name: application,
    connectionTimeoutMillis: 3000,
    options: readOnly
      ? '-c default_transaction_read_only=on -c statement_timeout=10000'
      : '-c statement_timeout=10000',
  };
}
/** One target lock connection. The child closes its own connections before returning. */
export async function runTargetHttp({
  raw,
  application,
  snapshot,
  createClient,
  runChild,
  verify = verifyRetainedForHttp,
}) {
  const client = createClient(targetHttpConnection(raw, application, true));
  let locked = false;
  try {
    await client.connect();
    const parent = await readHttpConnectionIdentity(client);
    locked =
      (await client.query('SELECT pg_try_advisory_lock(13808,1) AS locked')).rows[0]?.locked ===
      true;
    if (!locked) throw new Error('A conflicting target test lock blocks execution.');
    await verify(client, snapshot);
    // Recheck that the same verified session still holds the target-scoped lock.
    const held = (
      await client.query(`SELECT EXISTS(SELECT 1 FROM pg_locks WHERE locktype='advisory'
      AND classid=13808 AND objid=1 AND objsubid=2 AND granted AND pid=pg_backend_pid()
      AND database=(SELECT oid FROM pg_database WHERE datname=current_database()))
      AND NOT EXISTS(SELECT 1 FROM pg_locks other WHERE other.locktype='advisory' AND other.classid=13808 AND other.objid=1 AND other.objsubid=2 AND other.granted AND other.pid<>pg_backend_pid()) AS held`)
    ).rows[0]?.held;
    if (held !== true)
      throw new Error(
        'Target lock was lost or a conflicting test lock appeared before child execution.',
      );
    const status = await runChild(parent);
    await verify(client, snapshot);
    return status;
  } finally {
    try {
      if (locked) {
        const row = (await client.query('SELECT pg_advisory_unlock(13808,1) AS released')).rows[0];
        if (row?.released !== true) throw new Error('Target lock release was not confirmed.');
      }
    } finally {
      await client.end();
    }
  }
}
