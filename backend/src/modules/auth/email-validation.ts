import { ValidationError } from '../../errors/app-error.js';

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const normalizeEmail = (email: string): string => email.trim().toLowerCase();

export const getEmailDomain = (email: string): string | undefined => {
  const normalizedEmail = normalizeEmail(email);

  if (!emailPattern.test(normalizedEmail)) {
    return undefined;
  }

  return normalizedEmail.split('@')[1];
};

export const requireValidEmail = (email: string): string => {
  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail.length > 254 || getEmailDomain(normalizedEmail) === undefined) {
    throw new ValidationError('A valid email address is required.', [
      { field: 'email', message: 'Enter a valid email address.' },
    ]);
  }
  return normalizedEmail;
};
