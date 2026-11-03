// Keep the optimistic state change and its rollback paired for every consumer.
export async function toggleMarketplaceBookmark(
  previous: boolean,
  persist: (next: boolean) => Promise<void>,
  apply: (next: boolean) => void,
): Promise<boolean> {
  const next = !previous;
  apply(next);
  try {
    await persist(next);
    return next;
  } catch (error) {
    apply(previous);
    throw error;
  }
}
