import type { MessageView } from './messaging.types';

export interface RecoveryPage {
  messages: readonly MessageView[];
  readReceipt: string;
  nextCursor: string;
  hasMore: boolean;
}
/** At most ten 100-record pages per recovery. Callers retain progress for explicit continuation. */
export async function recoverMessages(
  cursor: string,
  fetchPage: (after: string) => Promise<RecoveryPage>,
  consume: (page: RecoveryPage) => Promise<void> | void,
  active: () => boolean,
  maxPages = 10,
) {
  for (let page = 0; page < maxPages && active(); page++) {
    const result = await fetchPage(cursor);
    if (!active()) return { cursor, complete: false };
    if (result.hasMore && result.nextCursor === cursor)
      throw new Error('Recovery cursor did not advance.');
    await consume(result);
    cursor = result.nextCursor;
    if (!result.hasMore) return { cursor, complete: true };
  }
  return { cursor, complete: false };
}

/** Collapse simultaneous invalidations; one trailing run covers changes during a request. */
export function coalesceAsync(operation: () => Promise<void>) {
  let running: Promise<void> | undefined;
  let again = false;
  return () => {
    if (running) {
      again = true;
      return running;
    }
    running = Promise.resolve()
      .then(async () => {
        do {
          again = false;
          await operation();
        } while (again);
      })
      .finally(() => {
        running = undefined;
      });
    return running;
  };
}
