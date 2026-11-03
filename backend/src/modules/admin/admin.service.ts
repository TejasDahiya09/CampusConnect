import { env } from '../../config/env.js';
import { AppError } from '../../errors/app-error.js';
import { aiClient } from '../../integrations/ai/ai-client.js';
import { adminRepository } from './admin.repository.js';
import { notificationsService } from '../notifications/notifications.service.js';
import type {
  AdminAccountDecision,
  AdminAuditQuery,
  AdminContentQuery,
  AdminEnforcementDecision,
  AdminEnforcementTargetType,
  AdminUserQuery,
} from './admin.types.js';

const problem = (code: string, message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });

export const adminService = {
  access: () => ({ authorized: true as const }),
  overview: () => adminRepository.overview(),
  users: (query: AdminUserQuery) => adminRepository.users(query),
  userDetail: async (id: string) => {
    const user = await adminRepository.userDetail(id);
    if (!user) throw problem('ADMIN_USER_NOT_FOUND', 'The user account was not found.', 404);
    return { user };
  },
  updateAccount: async (actorId: string, targetId: string, decision: AdminAccountDecision) => {
    if (actorId === targetId)
      throw problem(
        'ADMIN_SELF_ACTION_DENIED',
        'The designated administrator cannot suspend their own account.',
        409,
      );
    const result = await adminRepository.updateAccount(actorId, targetId, decision);
    if (result === 'not-found')
      throw problem('ADMIN_USER_NOT_FOUND', 'The user account was not found.', 404);
    if (result === 'unchanged')
      throw problem('ACCOUNT_STATUS_UNCHANGED', 'The account already has this status.', 409);
    return result;
  },
  content: (query: AdminContentQuery) => adminRepository.content(query),
  audit: (query: AdminAuditQuery) => adminRepository.audit(query),
  system: async () => {
    const [health, readiness, version, announcementCount] = await Promise.all([
      aiClient.getHealth(),
      aiClient.getReadiness(),
      aiClient.getVersion(),
      adminRepository.announcementCapability(),
    ]);
    return {
      ai: {
        configured: env.aiServiceEnabled,
        health,
        readiness,
        version,
      },
      capabilities: {
        announcements: {
          existingCount: announcementCount,
          mode: 'DEFERRED' as const,
          reason: 'Bulk delivery requires a bounded background delivery workflow.',
        },
        contentModerationState: 'MIGRATION_PENDING' as const,
        messageInspection: 'UNAVAILABLE_ENCRYPTED_PRIVATE_CONTENT' as const,
      },
      configuration: {
        aiServiceEnabled: env.aiServiceEnabled,
        cloudFrontConfigured: env.awsCloudFrontBaseUrl !== undefined,
        messageEncryptionConfigured: env.messageEncryptionKey !== undefined,
        nodeEnvironment: env.nodeEnv,
        objectStorageConfigured: Boolean(env.awsRegion && env.awsS3Bucket),
        singleAdministratorConfigured: env.adminAllowedUserId !== undefined,
      },
    };
  },
  enforceContent: async (
    actorId: string,
    targetType: AdminEnforcementTargetType,
    targetId: string,
    decision: AdminEnforcementDecision,
  ) => {
    const result = await adminRepository.enforceContent(actorId, targetType, targetId, decision);
    if (result === 'not-found')
      throw problem('ADMIN_CONTENT_NOT_FOUND', 'The content was not found.', 404);
    if (result === 'conflict')
      throw problem(
        'ADMIN_VISIBILITY_CONFLICT',
        `The content is already ${decision.visibility.toLowerCase()}.`,
        409,
      );
    await notificationsService.createSafely({
      description: `${targetType.replace('_', ' ')} “${result.title}” was ${decision.visibility === 'HIDDEN' ? 'hidden' : 'restored'}. Reason: ${decision.reason}`,
      entityId: targetId,
      entityType: 'NOTIFICATIONS',
      eventId: `${targetType}:${targetId}:${decision.visibility}:${result.moderatedAt}`,
      kind: decision.visibility === 'HIDDEN' ? 'CONTENT_HIDDEN' : 'CONTENT_RESTORED',
      recipientId: result.ownerId,
      title:
        decision.visibility === 'HIDDEN'
          ? 'Content hidden by administration'
          : 'Content restored by administration',
    });
    return { content: result };
  },
  enforcementHistory: async (targetType: AdminEnforcementTargetType, targetId: string) => ({
    history: await adminRepository.enforcementHistory(targetType, targetId),
  }),
};
