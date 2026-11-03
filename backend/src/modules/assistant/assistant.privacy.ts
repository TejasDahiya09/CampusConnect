const emailPattern = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/giu;
const urlPattern = /\b(?:https?:\/\/|www\.)\S+/giu;
const phonePattern = /(?<![\p{L}\p{N}])(?:\+?\d[\s().-]*){7,15}(?![\p{L}\p{N}])/gu;
const handlePattern = /(?<![\p{L}\p{N}])@[A-Z0-9_]{2,32}\b/giu;

export const redactPublicText = (value: string): string =>
  value
    .replace(urlPattern, '[redacted link]')
    .replace(emailPattern, '[redacted contact]')
    .replace(phonePattern, '[redacted contact]')
    .replace(handlePattern, '[redacted contact]')
    .replace(/\s+/g, ' ')
    .trim();

export const boundedPublicText = (value: string, maximum: number): string => {
  const redacted = redactPublicText(value);
  if (redacted.length <= maximum) return redacted;
  const shortened = redacted.slice(0, Math.max(0, maximum - 1)).trimEnd();
  return `${shortened}…`;
};
