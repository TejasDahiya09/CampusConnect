import { AppError } from '../../errors/app-error.js';
import { aiClient, type AiClient } from '../../integrations/ai/ai-client.js';
import type { AiLostFoundReport } from '../../integrations/ai/ai.types.js';
import { env } from '../../config/env.js';
import { s3StorageService } from '../../services/storage/s3-storage.service.js';
import type { StorageService } from '../../services/storage/storage.types.js';
import {
  LostFoundStatus,
  LostFoundType,
  UserRole,
  type ClaimStatus,
  type LostFoundStatus as LostFoundStatusValue,
} from '../../generated/prisma/client.js';
import {
  lostFoundRepository,
  type ClaimMutationResult,
  type LostFoundRepository,
} from './lost-found.repository.js';
import type {
  LostFoundBookmarkQuery,
  LostFoundClaim,
  LostFoundCreateInput,
  LostFoundMatchesView,
  LostFoundQuery,
  LostFoundReportView,
  LostFoundUpdateInput,
  LostFoundViewer,
  PaginatedLostFoundReports,
} from './lost-found.types.js';
import { notificationsService } from '../notifications/notifications.service.js';

const error = (code: string, message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });
const notFound = () => error('LOST_FOUND_NOT_FOUND', 'The Lost & Found report was not found.', 404);
const forbidden = () => error('LOST_FOUND_FORBIDDEN', 'You cannot modify this report.', 403);
const claimError = (result: ClaimMutationResult): never => {
  if (result.kind === 'forbidden')
    throw error('CLAIM_FORBIDDEN', 'You cannot manage this claim.', 403);
  if (result.kind === 'conflict')
    throw error('CLAIM_CONFLICT', 'The claim cannot be changed in its current state.', 409);
  throw error('CLAIM_NOT_FOUND', 'The claim was not found.', 404);
};

const transitions: Record<LostFoundStatusValue, readonly LostFoundStatusValue[]> = {
  ARCHIVED: [],
  CLAIM_PENDING: [LostFoundStatus.RESOLVED, LostFoundStatus.MATCHED, LostFoundStatus.OPEN],
  MATCHED: [LostFoundStatus.CLAIM_PENDING, LostFoundStatus.OPEN, LostFoundStatus.ARCHIVED],
  OPEN: [LostFoundStatus.MATCHED, LostFoundStatus.ARCHIVED, LostFoundStatus.REMOVED],
  REMOVED: [],
  RESOLVED: [LostFoundStatus.ARCHIVED],
};

const canModerate = (viewer: LostFoundViewer): boolean =>
  viewer.role === UserRole.ADMIN || viewer.role === UserRole.MODERATOR;

export interface LostFoundService {
  addBookmark(userId: string, reportId: string): Promise<void>;
  cancelClaim(viewer: LostFoundViewer, reportId: string, claimId: string): Promise<LostFoundClaim>;
  createReport(reporterId: string, input: LostFoundCreateInput): Promise<LostFoundReportView>;
  getBookmarkState(userId: string, reportId: string): Promise<boolean>;
  getMatches(viewer: LostFoundViewer, reportId: string): Promise<LostFoundMatchesView>;
  getReport(id: string, viewer?: LostFoundViewer): Promise<LostFoundReportView>;
  listBookmarks(userId: string, query: LostFoundBookmarkQuery): Promise<PaginatedLostFoundReports>;
  listClaims(viewer: LostFoundViewer, reportId: string): Promise<readonly LostFoundClaim[]>;
  listMyReports(userId: string): Promise<readonly LostFoundReportView[]>;
  listReports(query: LostFoundQuery, viewer?: LostFoundViewer): Promise<PaginatedLostFoundReports>;
  removeBookmark(userId: string, reportId: string): Promise<boolean>;
  reviewClaim(
    viewer: LostFoundViewer,
    reportId: string,
    claimId: string,
    status: ClaimStatus,
  ): Promise<LostFoundClaim>;
  submitClaim(viewer: LostFoundViewer, reportId: string, message: string): Promise<LostFoundClaim>;
  transitionReport(
    reporterId: string,
    id: string,
    status: LostFoundStatusValue,
  ): Promise<LostFoundReportView>;
  updateReport(
    reporterId: string,
    id: string,
    input: LostFoundUpdateInput,
  ): Promise<LostFoundReportView>;
}

export const createLostFoundService = (
  repository: LostFoundRepository = lostFoundRepository,
  matchingClient: AiClient = aiClient,
  storage: Pick<StorageService, 'readObject'> = s3StorageService,
  multimodalEnabled: boolean = env.aiLostFoundMultimodalEnabled,
  notificationService: Pick<typeof notificationsService, 'createSafely'> = repository ===
  lostFoundRepository
    ? notificationsService
    : { createSafely: () => Promise.resolve(null) },
): LostFoundService => {
  const notifyMatches = async (
    source: LostFoundReportView,
    matches: LostFoundMatchesView['matches'],
    matcherVersion: LostFoundMatchesView['matcherVersion'],
  ): Promise<void> => {
    for (const match of matches) {
      if (match.confidence === 'LOW') continue;
      const pairId = [source.id, match.report.id].sort().join(':');
      const eventId = `${pairId}:${matcherVersion}`;
      const recipients = [
        { reportId: source.id, userId: source.reporterId },
        { reportId: match.report.id, userId: match.report.reporterId },
      ].filter(
        (recipient, index, all) =>
          recipient.userId !== '' &&
          all.findIndex((candidate) => candidate.userId === recipient.userId) === index,
      );
      for (const recipient of recipients) {
        await notificationService.createSafely({
          description: 'A possible match was found for your Lost & Found report.',
          entityId: recipient.reportId,
          entityType: 'LOST_FOUND',
          eventId,
          kind: 'LOST_FOUND_MATCH',
          recipientId: recipient.userId,
          title: 'Possible Lost & Found match',
        });
      }
    }
  };

  const matchReport = async (source: LostFoundReportView): Promise<LostFoundMatchesView> => {
    const oppositeType = source.type === 'LOST' ? 'FOUND' : 'LOST';
    const candidates = await repository.listMatchCandidates(
      source.id,
      oppositeType,
      env.aiLostFoundCandidateLimit,
      source.reporterId,
    );
    const supportedMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp']);
    const maximumImageBytes = 2 * 1024 * 1024;
    const maximumImagesPerReport = 3;
    const maximumRequestBytes = 8 * 1024 * 1024;
    let requestBytes = 0;
    const imageEvidence = async (report: LostFoundReportView) => {
      if (!multimodalEnabled || storage.readObject === undefined) return [];
      const images = [];
      for (const image of report.images.slice(0, maximumImagesPerReport)) {
        if (
          !supportedMimeTypes.has(image.mimeType) ||
          image.size < 1 ||
          image.size > maximumImageBytes ||
          requestBytes + image.size > maximumRequestBytes
        )
          continue;
        try {
          const bytes = await storage.readObject(image.key, maximumImageBytes);
          if (bytes === null || requestBytes + bytes.byteLength > maximumRequestBytes) continue;
          requestBytes += bytes.byteLength;
          images.push({
            contentBase64: Buffer.from(bytes).toString('base64'),
            mimeType: image.mimeType as 'image/jpeg' | 'image/png' | 'image/webp',
          });
        } catch {
          // A media failure removes only that evidence; semantic matching remains available.
        }
      }
      return images;
    };
    const toAiReport = async (report: LostFoundReportView): Promise<AiLostFoundReport> => ({
      category: report.category,
      description: report.description,
      id: report.id,
      incidentAt: report.incidentDate,
      location: report.location,
      title: report.title,
      type: report.type === LostFoundType.LOST ? 'LOST' : 'FOUND',
      images: await imageEvidence(report),
    });
    const aiCandidates = [];
    for (const candidate of candidates) aiCandidates.push(await toAiReport(candidate));
    const result = await matchingClient.matchLostFound({
      candidates: aiCandidates,
      query: await toAiReport(source),
      topK: Math.min(env.aiLostFoundTopK, candidates.length || 1),
    });
    if (result.status !== 'AVAILABLE')
      throw error(
        'AI_MATCHING_UNAVAILABLE',
        'Lost & Found matching is currently unavailable.',
        503,
      );
    const candidatesById = new Map(candidates.map((candidate) => [candidate.id, candidate]));
    const returnedCandidateIds = new Set<string>();
    return {
      matcherVersion: result.data.matcherVersion,
      matches: result.data.matches.flatMap((match) => {
        const candidate = candidatesById.get(match.reportId);
        if (candidate === undefined || returnedCandidateIds.has(match.reportId)) return [];
        returnedCandidateIds.add(match.reportId);
        return [{ ...match, report: candidate }];
      }),
    };
  };

  return {
    addBookmark: async (userId, reportId) => {
      if ((await repository.addBookmark(userId, reportId)) === null) throw notFound();
    },
    cancelClaim: async (viewer, reportId, claimId) => {
      const result = await repository.cancelClaim(viewer.id, reportId, claimId);
      if (result.kind !== 'claim') return claimError(result);
      return result.claim;
    },
    createReport: async (reporterId, input) => {
      const created = await repository.create(reporterId, input);
      try {
        const matched = await matchReport(created);
        await notifyMatches(created, matched.matches, matched.matcherVersion);
      } catch (matchingError) {
        console.warn('Automatic Lost & Found matching was unavailable after report creation.', {
          category: matchingError instanceof AppError ? matchingError.code : 'UNEXPECTED_ERROR',
        });
      }
      return created;
    },
    getBookmarkState: async (userId, reportId) => {
      const report = await repository.findById(reportId, userId);
      if (
        report === null ||
        report.status === LostFoundStatus.ARCHIVED ||
        report.status === LostFoundStatus.REMOVED
      )
        throw notFound();
      return report.isBookmarked;
    },
    getMatches: async (viewer, reportId) => {
      const source = await repository.findById(reportId, viewer.id);
      if (source === null) throw notFound();
      if (source.reporterId !== viewer.id && !canModerate(viewer)) throw forbidden();
      if (
        source.status !== LostFoundStatus.OPEN &&
        source.status !== LostFoundStatus.MATCHED &&
        source.status !== LostFoundStatus.CLAIM_PENDING
      )
        throw error('LOST_FOUND_NOT_MATCHABLE', 'This report is not eligible for matching.', 409);
      const matched = await matchReport(source);
      if (source.reporterId === viewer.id) {
        await notifyMatches(source, matched.matches, matched.matcherVersion);
      }
      return matched;
    },
    getReport: async (id, viewer) => {
      const report = await repository.findById(id, viewer?.id);
      if (report === null) throw notFound();
      if (
        (report.status === LostFoundStatus.ARCHIVED || report.status === LostFoundStatus.REMOVED) &&
        viewer?.id !== report.reporterId &&
        (viewer === undefined || !canModerate(viewer))
      )
        throw notFound();
      return report;
    },
    listBookmarks: async (userId, query) => {
      const { items, total } = await repository.listBookmarks(userId, query);
      return {
        items,
        limit: query.limit,
        page: query.page,
        total,
        totalPages: Math.ceil(total / query.limit),
      };
    },
    listClaims: async (viewer, reportId) => {
      const report = await repository.findById(reportId, viewer.id);
      if (report === null) throw notFound();
      const claims = await repository.listClaims(reportId);
      if (claims === null) throw notFound();
      return report.reporterId === viewer.id || canModerate(viewer)
        ? claims
        : claims.filter((claim) => claim.claimantId === viewer.id);
    },
    listMyReports: (userId) => repository.listMyReports(userId),
    listReports: async (query, viewer) => {
      const { items, total } = await repository.list(query, viewer?.id);
      return {
        items,
        limit: query.limit,
        page: query.page,
        total,
        totalPages: Math.ceil(total / query.limit),
      };
    },
    removeBookmark: (userId, reportId) => repository.removeBookmark(userId, reportId),
    reviewClaim: async (viewer, reportId, claimId, status) => {
      const report = await repository.findById(reportId, viewer.id);
      const claim = (await repository.listClaims(reportId))?.find(({ id }) => id === claimId);
      const result = await repository.reviewClaim(
        viewer.id,
        canModerate(viewer),
        reportId,
        claimId,
        status,
      );
      if (result.kind !== 'claim') return claimError(result);
      if (report && claim) {
        await notificationService.createSafely({
          description: `${report.title} claim was ${status === 'APPROVED' ? 'accepted' : 'rejected'}`,
          entityId: reportId,
          entityType: 'LOST_FOUND',
          eventId: `${claimId}:${status}`,
          kind: status === 'APPROVED' ? 'LOST_FOUND_CLAIM_ACCEPTED' : 'LOST_FOUND_CLAIM_REJECTED',
          recipientId: claim.claimantId,
          title: `Lost & Found claim ${status === 'APPROVED' ? 'accepted' : 'rejected'}`,
        });
      }
      return result.claim;
    },
    submitClaim: async (viewer, reportId, message) => {
      const report = await repository.findById(reportId, viewer.id);
      const result = await repository.submitClaim(viewer.id, reportId, message);
      if (result.kind !== 'claim') return claimError(result);
      if (report) {
        await notificationService.createSafely({
          description: `A student submitted a claim for ${report.title}`,
          entityId: reportId,
          entityType: 'LOST_FOUND',
          eventId: result.claim.id,
          kind: 'LOST_FOUND_CLAIM_SUBMITTED',
          recipientId: report.reporterId,
          title: 'New Lost & Found claim',
        });
      }
      return result.claim;
    },
    transitionReport: async (reporterId, id, status) => {
      const report = await repository.findById(id, reporterId);
      if (report === null) throw notFound();
      if (report.reporterId !== reporterId) throw forbidden();
      if (!transitions[report.status].includes(status))
        throw error(
          'INVALID_LOST_FOUND_STATUS_TRANSITION',
          `A ${report.status.toLowerCase()} report cannot transition to ${status.toLowerCase()}.`,
          409,
        );
      const resolvedAt = status === LostFoundStatus.RESOLVED ? new Date() : null;
      const updated = await repository.transitionOwned(id, reporterId, status, resolvedAt);
      if (updated === null) throw notFound();
      return updated;
    },
    updateReport: async (reporterId, id, input) => {
      const report = await repository.findById(id, reporterId);
      if (report === null) throw notFound();
      if (report.reporterId !== reporterId) throw forbidden();
      if (report.status !== LostFoundStatus.OPEN && report.status !== LostFoundStatus.MATCHED)
        throw error('LOST_FOUND_NOT_EDITABLE', 'This report can no longer be edited.', 409);
      const updated = await repository.updateOwned(id, reporterId, input);
      if (updated === null) throw notFound();
      return updated;
    },
  };
};

export const lostFoundService = createLostFoundService();
