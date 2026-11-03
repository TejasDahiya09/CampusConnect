const MAX_BYTES = 5 * 1024 * 1024;
const allowedTypes = new Set([
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

export const validateResumeSelection = (file: File): string | null => {
  const extension = file.name.toLowerCase().match(/\.[^.]+$/u)?.[0];
  if (!allowedTypes.has(file.type) || (extension !== '.pdf' && extension !== '.docx')) {
    return 'Choose a PDF or DOCX resume.';
  }
  if (file.size > MAX_BYTES) return 'The resume must be 5 MiB or smaller.';
  if (file.size === 0) return 'The selected resume is empty.';
  return null;
};
