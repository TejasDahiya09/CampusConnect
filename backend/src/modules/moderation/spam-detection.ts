import type { SafetySignal } from './moderation.types.js';

const linkPattern = /https?:\/\/[^\s]+|www\.[^\s]+/giu;
const scamPatterns = [
  /\bguaranteed\s+(?:profit|returns?)\b/iu,
  /\bpay\s+(?:an?\s+)?advance\s+fee\b/iu,
  /\bshare\s+(?:your\s+)?(?:otp|password)\b/iu,
  /\b(?:urgent|immediate)\s+payment\s+required\b/iu,
] as const;

export const analyzeSafetyText = (input: string): readonly SafetySignal[] => {
  const text = input.slice(0, 10_000).replace(/\s+/gu, ' ').trim();
  if (!text) return [];
  const signals: SafetySignal[] = [];
  const links = text.match(linkPattern)?.length ?? 0;
  if (links > 2)
    signals.push({
      code: 'EXCESSIVE_LINKS',
      explanation: `Contains ${links} promotional-style links; human review is recommended.`,
    });
  if (scamPatterns.some((pattern) => pattern.test(text)))
    signals.push({
      code: 'COMMON_SCAM_LANGUAGE',
      explanation: 'Contains language commonly associated with credential or advance-fee scams.',
    });
  const words = text.toLowerCase().match(/[\p{L}\p{N}]+/gu) ?? [];
  if (words.length >= 12) {
    const trigrams = new Map<string, number>();
    for (let index = 0; index <= words.length - 3; index += 1) {
      const phrase = words.slice(index, index + 3).join(' ');
      trigrams.set(phrase, (trigrams.get(phrase) ?? 0) + 1);
    }
    if ([...trigrams.values()].some((count) => count >= 4))
      signals.push({
        code: 'REPETITIVE_CONTENT',
        explanation:
          'Contains an unusually repeated phrase; this is a review signal, not a violation.',
      });
  }
  return signals;
};
