const contactPatterns = [
  /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu,
  /(?:https?:\/\/|www\.)\S+/iu,
  /(?:\+?\d[\s().-]*){7,}/u,
  /(^|\s)@[a-z0-9_.-]{2,}/iu,
  /\b(?:call|contact|dm|e-?mail|instagram|message me|phone|snapchat|telegram|whats?app)\b/iu,
];
const lostFoundSensitivePatterns = [
  /\b(?:belong(?:s|ing)? to|enrollment|owner(?:'s)? name|roll no|student id)\b/iu,
  /\b(?:hostel|room)\s*(?:no\.?\s*)?[a-z0-9-]+\b/iu,
];
const hasControlCharacters = (value: string): boolean =>
  [...value].some((character) => {
    const codePoint = character.codePointAt(0);
    return codePoint !== undefined && (codePoint < 32 || codePoint === 127);
  });

export const isSafeLandingTitle = (title: string, lostFound = false): boolean => {
  const normalized = title.trim();
  if (normalized.length < 3 || normalized.length > 180 || hasControlCharacters(normalized))
    return false;
  if (contactPatterns.some((pattern) => pattern.test(normalized))) return false;
  return !lostFound || !lostFoundSensitivePatterns.some((pattern) => pattern.test(normalized));
};

export const safeLandingMetadata = (value: string | null, lostFound = false): string | null => {
  if (value === null) return null;
  const normalized = value.trim();
  if (normalized.length < 1 || normalized.length > 100 || hasControlCharacters(normalized))
    return null;
  if (contactPatterns.some((pattern) => pattern.test(normalized))) return null;
  if (lostFound && lostFoundSensitivePatterns.some((pattern) => pattern.test(normalized)))
    return null;
  return normalized;
};
