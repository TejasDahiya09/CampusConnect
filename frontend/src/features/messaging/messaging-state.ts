import type { MessageView } from './messaging.types';

/** Merge offset pages and realtime deliveries without discarding either source. */
export function mergeMessages(
  ...groups: readonly (readonly MessageView[])[]
): readonly MessageView[] {
  const unique = new Map<string, MessageView>();
  for (const group of groups) for (const message of group) unique.set(message.id, message);
  return [...unique.values()].sort(
    (a, b) => a.sentAt.localeCompare(b.sentAt) || a.id.localeCompare(b.id),
  );
}

export const nearLatest = (
  element: Pick<HTMLElement, 'scrollHeight' | 'scrollTop' | 'clientHeight'>,
) => element.scrollHeight - element.scrollTop - element.clientHeight < 96;

export function clearSentDraft(draft: string | undefined, sent: string) {
  return draft?.trim() === sent ? '' : (draft ?? '');
}
