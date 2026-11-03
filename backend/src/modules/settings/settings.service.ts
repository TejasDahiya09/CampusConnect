import { AppError } from '../../errors/app-error.js';
import { settingsRepository, type SettingsRepository } from './settings.repository.js';

export const createSettingsService = (repository: SettingsRepository = settingsRepository) => ({
  async account(userId: string) {
    const account = await repository.findAccount(userId);
    if (!account) {
      throw new AppError({
        code: 'ACCOUNT_NOT_FOUND',
        message: 'The account could not be found.',
        statusCode: 404,
      });
    }
    return {
      displayName: account.profile?.fullName ?? 'CampusConnect student',
      email: account.email,
      id: account.id,
      role: account.role,
      status: account.status,
    };
  },
  async deactivate(userId: string) {
    const result = await repository.deactivate(userId);
    if (result.count !== 1) {
      throw new AppError({
        code: 'ACCOUNT_DEACTIVATION_CONFLICT',
        message: 'The account is already unavailable.',
        statusCode: 409,
      });
    }
    return { deactivated: true as const };
  },
});

export const settingsService = createSettingsService();
