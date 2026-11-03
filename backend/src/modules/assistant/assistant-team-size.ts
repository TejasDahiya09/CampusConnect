import type { TeamSizeQuery } from './assistant.types.js';

export function teamSizeIntent(
  question: string,
  history: readonly string[] = [],
): { ambiguous: boolean; query?: TeamSizeQuery; search: string } | null {
  let q = question.toLowerCase();
  if (
    /^(?:total|maximum|capacity|current|currently|additional|more)(?:\s+(?:members|teammates))?[.!]?$/i.test(
      q,
    ) &&
    history.at(-1)
  )
    q = `${history.at(-1)} ${q}`.toLowerCase();
  if (!/\b(?:project|teamup|team|teammates|members)\b/.test(q)) return null;
  const words: Record<string, number> = {
    one: 1,
    two: 2,
    three: 3,
    four: 4,
    five: 5,
    six: 6,
    seven: 7,
    eight: 8,
    nine: 9,
    ten: 10,
  };
  const number = /\b(\d{1,4}|one|two|three|four|five|six|seven|eight|nine|ten)\b/.exec(q)?.[1];
  if (!number || !/\b(?:members?|teammates?|size|capacity|team)\b/.test(q)) return null;
  const count = words[number] ?? Number(number);
  const modes = [
    /\b(?:additional|more|openings|vacancies)\b/.test(q) ? 'additional' : null,
    /\b(?:total|maximum|max|capacity|target)\b|\bteam size\b/.test(q) ? 'total' : null,
    /\b(?:current|currently|already|existing)\b/.test(q) ? 'current' : null,
  ].filter(Boolean);
  const search = q
    .replace(
      /\b(?:\d+|one|two|three|four|five|six|seven|eight|nine|ten|of|with|members?|teammates?|additional|more|openings|vacancies|total|maximum|max|capacity|target|current|currently|already|existing|team|size|project|teamup|need|needs|needing|seeking|looking|for)\b/g,
      ' ',
    )
    .replace(/\s+/g, ' ')
    .trim();
  if (count < 1 || count > 100 || modes.length !== 1) return { ambiguous: true, search };
  return { ambiguous: false, query: { count, mode: modes[0] as TeamSizeQuery['mode'] }, search };
}
