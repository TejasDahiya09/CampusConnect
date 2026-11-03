/** Bounded workflow context derived from student questions, never stored or treated as authority. */
export const itemAliases = [
  ['bag', 'backpack', 'rucksack'],
  ['calculator'],
  ['id card', 'identity card', 'student id'],
  ['wallet', 'purse'],
  ['phone', 'mobile'],
  ['laptop', 'notebook computer'],
  ['keys', 'key'],
  ['bottle', 'flask'],
  ['book', 'textbook'],
  ['headphones', 'earphones', 'earbuds'],
] as const;
export const containsItemTerm = (text: string, term: string) =>
  new RegExp(
    `(?:^|[^\\p{L}\\p{N}])${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?:s)?(?:$|[^\\p{L}\\p{N}])`,
    'iu',
  ).test(text.normalize('NFKC'));

export interface LostFoundContext {
  kind: 'LOST' | 'FOUND';
  item: readonly string[];
  details: readonly string[];
  theft: boolean;
  followUp: boolean;
}
const loss =
  /\b(?:(?:i (?:have )?)?(?:lost|forgot|misplaced) my|i (?:have )?(?:lost|misplaced)|my .{1,60}?(?:got|is|was|went|has gone) (?:lost|missing)|(?:someone )?(?:stole|stolen) my|i (?:can'?t|cannot|can not) find my)\b/i;
const found = /\b(?:i (?:have )?found|someone (?:has )?left|(?:i|we) (?:picked up|came across))\b/i;
export const isSimilarReportRequest = (q: string) =>
  /\b(?:find|search|show|check|look for)\b.*\b(?:reports?|matches|similar|found items?)\b/i.test(q);
const detail =
  /^(?:it (?:was|is|had)|(?:near|at|in|outside|by)\b|(?:a|an|the) (?:black|blue|red|green|brown|white|bag|backpack)\b)/i;

export function lostFoundContext(
  question: string,
  history: readonly string[] = [],
): LostFoundContext | null {
  let context: LostFoundContext | null = null;
  for (const [index, raw] of [...history.slice(-4), question].entries()) {
    const q = raw
      .normalize('NFKC')
      .replace(/\u2019/g, "'")
      .trim()
      .toLowerCase();
    const kind = loss.test(q) ? 'LOST' : found.test(q) ? 'FOUND' : null;
    if (kind) {
      context = {
        kind,
        item:
          itemAliases.find((aliases) => aliases.some((term) => containsItemTerm(q, term))) ?? [],
        details: [q.slice(0, 300)],
        theft: /\b(?:stole|stolen)\b/.test(q),
        followUp: false,
      };
    } else if (context && (detail.test(q) || isSimilarReportRequest(q))) {
      const previous: LostFoundContext = context;
      context = {
        ...previous,
        details: [...previous.details, ...(detail.test(q) ? [q.slice(0, 160)] : [])].slice(-4),
        followUp: index === Math.min(history.length, 4),
      };
    } else context = null;
  }
  return context;
}
