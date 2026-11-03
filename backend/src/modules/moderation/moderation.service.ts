import { AppError } from '../../errors/app-error.js';
import { ReportStatus, type UserRole } from '../../generated/prisma/client.js';
import { notificationsService } from '../notifications/notifications.service.js';
import { moderationRepository } from './moderation.repository.js';
import { analyzeSafetyText } from './spam-detection.js';
import {
  moderationTargetTypes,
  type ModerationDecision,
  type ModerationQuery,
  type ReportSubmission,
} from './moderation.types.js';

const problem = (code: string, message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });

export const moderationService = {
  submit: async (reporterId: string, input: ReportSubmission) => {
    const target = await moderationRepository.target(input.targetType, input.targetId);
    if (!target)
      throw problem('REPORT_TARGET_NOT_FOUND', 'The reportable content was not found.', 404);
    if (target.ownerId === reporterId)
      throw problem(
        'SELF_REPORT_NOT_ALLOWED',
        'You cannot report yourself or your own content.',
        409,
      );
    const result = await moderationRepository.create(reporterId, input);
    if (result.kind === 'duplicate')
      throw problem(
        'REPORT_ALREADY_SUBMITTED',
        'You already have an active report for this content.',
        409,
      );
    if (result.kind === 'rate-limited')
      throw problem(
        'REPORT_RATE_LIMITED',
        'Too many reports were submitted. Please try again later.',
        429,
      );
    const moderators = await moderationRepository.moderatorIds();
    await Promise.all(
      moderators.map(({ id }) =>
        notificationsService.createSafely({
          description: 'A new student report is ready for review.',
          entityId: result.report.id,
          entityType: 'MODERATION',
          eventId: result.report.id,
          kind: 'REPORT_SUBMITTED',
          recipientId: id,
          title: 'New moderation report',
        }),
      ),
    );
    return { report: result.report };
  },
  overview: () => moderationRepository.overview(),
  list: async (query: ModerationQuery) => {
    const result = await moderationRepository.list(query);
    return {
      reports: result.items,
      pagination: {
        limit: query.limit,
        page: query.page,
        total: result.total,
        totalPages: Math.ceil(result.total / query.limit),
      },
    };
  },
  detail: async (id: string) => {
    const result = await moderationRepository.detail(id);
    if (!result) throw problem('REPORT_NOT_FOUND', 'The moderation report was not found.', 404);
    const targetType = moderationTargetTypes.find(
      (candidate) => candidate === result.report.targetType,
    );
    const target = targetType
      ? await moderationRepository.target(targetType, result.report.targetId)
      : null;
    return {
      ...result,
      safetySignals: analyzeSafetyText(
        `${target?.preview.title ?? ''}\n${target?.preview.description ?? ''}`,
      ),
      target: target?.preview ?? null,
    };
  },
  decide: async (
    actor: { id: string; role: UserRole },
    reportId: string,
    decision: ModerationDecision,
  ) => {
    if (decision.status === ReportStatus.UNDER_REVIEW && !decision.resolutionNote)
      throw problem('MODERATION_REASON_REQUIRED', 'A review note is required.', 400);
    const result = await moderationRepository.decide(actor.id, reportId, decision);
    if (result === 'not-found')
      throw problem('REPORT_NOT_FOUND', 'The moderation report was not found.', 404);
    if (result === 'finalized')
      throw problem('REPORT_ALREADY_FINALIZED', 'This report already has a final decision.', 409);
    if (result === 'conflict')
      throw problem(
        'REPORT_UPDATE_CONFLICT',
        'This report changed during review. Refresh and try again.',
        409,
      );
    if (decision.status === ReportStatus.RESOLVED || decision.status === ReportStatus.DISMISSED)
      await notificationsService.createSafely({
        description:
          'Your report has been reviewed. Confidential moderation details are not disclosed.',
        entityId: result.report.id,
        entityType: 'NOTIFICATIONS',
        eventId: `${result.report.id}:${decision.status}`,
        kind: 'REPORT_RESOLVED',
        recipientId: result.report.reporter.id,
        title: 'Report review completed',
      });
    return { report: result.report };
  },
};
