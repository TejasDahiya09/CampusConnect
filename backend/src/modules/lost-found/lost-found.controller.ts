import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { lostFoundService, type LostFoundService } from './lost-found.service.js';
import { lostFoundMediaService, type LostFoundMediaService } from './lost-found-media.service.js';
import type { LostFoundViewer } from './lost-found.types.js';
import {
  parseClaimCreate,
  parseClaimReview,
  parseEmptyBody,
  parseLostFoundBookmarkQuery,
  parseLostFoundCreate,
  parseLostFoundId,
  parseLostFoundQuery,
  parseLostFoundTransition,
  parseLostFoundUpdate,
} from './lost-found.validation.js';
import {
  parseLostFoundMediaCompletion,
  parseLostFoundMediaId,
  parseLostFoundMediaOrder,
  parseLostFoundMediaUpload,
} from './lost-found-media.validation.js';

const viewer = (request: Parameters<RequestHandler>[0]): LostFoundViewer => {
  if (request.auth === undefined) throw new Error('Authentication context is unavailable.');
  return { id: request.auth.user.id, role: request.auth.user.role };
};
const optionalViewer = (request: Parameters<RequestHandler>[0]): LostFoundViewer | undefined =>
  request.auth === undefined ? undefined : viewer(request);

export const createLostFoundController = (
  service: LostFoundService = lostFoundService,
  mediaService: LostFoundMediaService = lostFoundMediaService,
) => ({
  authorizeMediaUpload: (async (request, response) => {
    const authorization = await mediaService.authorizeUpload(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
      parseLostFoundMediaUpload(request.body),
    );
    return sendSuccess(response, authorization, { statusCode: 201 });
  }) satisfies RequestHandler,
  addBookmark: (async (request, response) => {
    parseEmptyBody(request.body);
    await service.addBookmark(viewer(request).id, parseLostFoundId('id', request.params.id));
    return sendSuccess(response, { bookmarked: true });
  }) satisfies RequestHandler,
  cancelClaim: (async (request, response) => {
    parseEmptyBody(request.body);
    const claim = await service.cancelClaim(
      viewer(request),
      parseLostFoundId('id', request.params.id),
      parseLostFoundId('claimId', request.params.claimId),
    );
    return sendSuccess(response, { claim });
  }) satisfies RequestHandler,
  createReport: (async (request, response) => {
    const report = await service.createReport(
      viewer(request).id,
      parseLostFoundCreate(request.body),
    );
    return sendSuccess(response, { report }, { statusCode: 201 });
  }) satisfies RequestHandler,
  completeMediaUpload: (async (request, response) => {
    const media = await mediaService.completeUpload(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
      parseLostFoundMediaId('mediaId', request.params.mediaId),
      parseLostFoundMediaCompletion(request.body),
    );
    return sendSuccess(response, { media }, { statusCode: 201 });
  }) satisfies RequestHandler,
  deleteMedia: (async (request, response) => {
    await mediaService.deleteMedia(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
      parseLostFoundMediaId('mediaId', request.params.mediaId),
    );
    return sendSuccess(response, { deleted: true });
  }) satisfies RequestHandler,
  getBookmarkState: (async (request, response) => {
    const bookmarked = await service.getBookmarkState(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
    );
    return sendSuccess(response, { bookmarked });
  }) satisfies RequestHandler,
  getMatches: (async (request, response) => {
    const result = await service.getMatches(
      viewer(request),
      parseLostFoundId('id', request.params.id),
    );
    return sendSuccess(response, result);
  }) satisfies RequestHandler,
  getReport: (async (request, response) => {
    const report = await service.getReport(
      parseLostFoundId('id', request.params.id),
      optionalViewer(request),
    );
    return sendSuccess(response, { report });
  }) satisfies RequestHandler,
  listBookmarks: (async (request, response) => {
    const result = await service.listBookmarks(
      viewer(request).id,
      parseLostFoundBookmarkQuery(request.query),
    );
    return sendSuccess(
      response,
      { reports: result.items },
      {
        meta: {
          limit: result.limit,
          page: result.page,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
    );
  }) satisfies RequestHandler,
  listClaims: (async (request, response) => {
    const claims = await service.listClaims(
      viewer(request),
      parseLostFoundId('id', request.params.id),
    );
    return sendSuccess(response, { claims });
  }) satisfies RequestHandler,
  listMyReports: (async (request, response) => {
    const reports = await service.listMyReports(viewer(request).id);
    return sendSuccess(response, { reports });
  }) satisfies RequestHandler,
  listReports: (async (request, response) => {
    const result = await service.listReports(
      parseLostFoundQuery(request.query),
      optionalViewer(request),
    );
    return sendSuccess(
      response,
      { reports: result.items },
      {
        meta: {
          limit: result.limit,
          page: result.page,
          total: result.total,
          totalPages: result.totalPages,
        },
      },
    );
  }) satisfies RequestHandler,
  removeBookmark: (async (request, response) => {
    parseEmptyBody(request.body);
    const removed = await service.removeBookmark(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
    );
    return sendSuccess(response, { bookmarked: false, removed });
  }) satisfies RequestHandler,
  reorderMedia: (async (request, response) => {
    const media = await mediaService.reorderMedia(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
      parseLostFoundMediaOrder(request.body),
    );
    return sendSuccess(response, { media });
  }) satisfies RequestHandler,
  reviewClaim: (async (request, response) => {
    const claim = await service.reviewClaim(
      viewer(request),
      parseLostFoundId('id', request.params.id),
      parseLostFoundId('claimId', request.params.claimId),
      parseClaimReview(request.body),
    );
    return sendSuccess(response, { claim });
  }) satisfies RequestHandler,
  submitClaim: (async (request, response) => {
    const claim = await service.submitClaim(
      viewer(request),
      parseLostFoundId('id', request.params.id),
      parseClaimCreate(request.body),
    );
    return sendSuccess(response, { claim }, { statusCode: 201 });
  }) satisfies RequestHandler,
  transitionReport: (async (request, response) => {
    const report = await service.transitionReport(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
      parseLostFoundTransition(request.body),
    );
    return sendSuccess(response, { report });
  }) satisfies RequestHandler,
  updateReport: (async (request, response) => {
    const report = await service.updateReport(
      viewer(request).id,
      parseLostFoundId('id', request.params.id),
      parseLostFoundUpdate(request.body),
    );
    return sendSuccess(response, { report });
  }) satisfies RequestHandler,
});

export const lostFoundController = createLostFoundController();
