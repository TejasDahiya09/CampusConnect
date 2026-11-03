export const authErrorMessage = (error: unknown, fallback: string): string => {
  if (!(error instanceof Error)) return fallback;

  const message = error.message.toLowerCase();
  if (message.includes('invalid login credentials')) {
    return 'The email or password is incorrect.';
  }
  if (message.includes('email not confirmed')) {
    return 'Confirm your email address before signing in.';
  }
  if (message.includes('already registered') || message.includes('already been registered')) {
    return 'An account with this email already exists. Try signing in instead.';
  }
  if (message.includes('password') && message.includes('weak')) {
    return 'Choose a stronger password and try again.';
  }
  if (message.includes('network') || message.includes('fetch')) {
    return 'We could not reach the authentication service. Check your connection and try again.';
  }

  return fallback;
};
