import { getSupabaseClient } from '../../lib/supabase';
import { apiRequest } from '../../services/api-client';

export interface SettingsAccount {
  readonly displayName: string;
  readonly email: string;
  readonly id: string;
  readonly role: 'ADMIN' | 'MODERATOR' | 'STUDENT';
  readonly status: 'ACTIVE' | 'DEACTIVATED' | 'SUSPENDED';
}

export const validateNewPassword = (password: string, confirmation: string): string | null => {
  if (password.length < 8 || password.length > 128)
    return 'Password must contain between 8 and 128 characters.';
  if (password !== confirmation) return 'The passwords do not match.';
  return null;
};

export const settingsApi = {
  account: () => apiRequest<SettingsAccount>('/api/settings'),
  changePassword: async (password: string, confirmation: string) => {
    const validation = validateNewPassword(password, confirmation);
    if (validation) throw new Error(validation);
    const { error } = await getSupabaseClient().auth.updateUser({ password });
    if (error) throw new Error('The password could not be updated. Please try again.');
  },
  deactivate: () =>
    apiRequest<{ readonly deactivated: true }>('/api/settings/deactivate', {
      body: JSON.stringify({}),
      method: 'POST',
    }),
};
