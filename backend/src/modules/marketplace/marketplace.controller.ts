import type { RequestHandler } from 'express';
import { marketplaceRepository, type MarketplaceRepository } from './marketplace.repository.js';
import { sendSuccess } from '../../utils/api-response.js';
import { marketplaceService, type MarketplaceService } from './marketplace.service.js';
import {
  marketplaceBookmarkService,
  type MarketplaceBookmarkService,
} from './marketplace-bookmark.service.js';
import { parseBookmarkBody, parseBookmarkQuery } from './marketplace-bookmark.validation.js';
import {
  marketplaceMediaService,
  type MarketplaceMediaService,
} from './marketplace-media.service.js';
import {
  parseMediaCompletionRequest,
  parseMediaId,
  parseMediaOrder,
  parseMediaUploadRequest,
} from './marketplace-media.validation.js';
import {
  parseListingCreate,
  parseListingId,
  parseListingQuery,
  parseListingUpdate,
} from './marketplace.validation.js';
import { getMarketplaceRecommendations } from './marketplace-recommendation.service.js';
import { marketplaceViewService, type MarketplaceViewService } from './marketplace-view.service.js';

const authenticatedUserId = (request: Parameters<RequestHandler>[0]): string => {
  if (request.auth === undefined) throw new Error('Authentication context is unavailable.');
  return request.auth.user.id;
};

const optionalUserId = (request: Parameters<RequestHandler>[0]): string | undefined =>
  request.auth?.user.id;

export const createMyListingsController =
  (repository: Pick<MarketplaceRepository, 'list'> = marketplaceRepository): RequestHandler =>
  async (request, response) => {
    const userId = authenticatedUserId(request);
    const query = { ...parseBookmarkQuery(request.query), sort: 'newest' as const };
    const { items, total } = await repository.list(query, userId, userId);
    return sendSuccess(
      response,
      { listings: items },
      { meta: { ...query, total, totalPages: Math.ceil(total / query.limit) } },
    );
  };
export const myListingsController = createMyListingsController();

export const createMarketplaceController = (
  service: MarketplaceService = marketplaceService,
  mediaService: MarketplaceMediaService = marketplaceMediaService,
  bookmarkService: MarketplaceBookmarkService = marketplaceBookmarkService,
  viewService: MarketplaceViewService = marketplaceViewService,
) => ({
  addBookmark: (async (request, response) => {
    parseBookmarkBody(request.body);
    await bookmarkService.save(authenticatedUserId(request), parseListingId(request.params.id));
    return sendSuccess(response, { bookmarked: true });
  }) satisfies RequestHandler,

  authorizeMediaUpload: (async (request, response) => {
    const authorization = await mediaService.authorizeUpload(
      authenticatedUserId(request),
      parseListingId(request.params.id),
      parseMediaUploadRequest(request.body),
    );
    return sendSuccess(response, authorization, { statusCode: 201 });
  }) satisfies RequestHandler,

  completeMediaUpload: (async (request, response) => {
    const media = await mediaService.completeUpload(
      authenticatedUserId(request),
      parseListingId(request.params.id),
      parseMediaId('mediaId', request.params.mediaId),
      parseMediaCompletionRequest(request.body),
    );
    return sendSuccess(response, { media }, { statusCode: 201 });
  }) satisfies RequestHandler,
  createListing: (async (request, response) => {
    const listing = await service.createListing(
      authenticatedUserId(request),
      parseListingCreate(request.body),
    );
    return sendSuccess(response, { listing }, { statusCode: 201 });
  }) satisfies RequestHandler,

  deleteListing: (async (request, response) => {
    await service.deleteListing(authenticatedUserId(request), parseListingId(request.params.id));
    return sendSuccess(response, { deleted: true });
  }) satisfies RequestHandler,

  getBookmarkState: (async (request, response) => {
    const bookmarked = await bookmarkService.getState(
      authenticatedUserId(request),
      parseListingId(request.params.id),
    );
    return sendSuccess(response, { bookmarked });
  }) satisfies RequestHandler,

  deleteMedia: (async (request, response) => {
    await mediaService.deleteMedia(
      authenticatedUserId(request),
      parseListingId(request.params.id),
      parseMediaId('mediaId', request.params.mediaId),
    );
    return sendSuccess(response, { deleted: true });
  }) satisfies RequestHandler,

  getListing: (async (request, response) => {
    const listing = await service.getListing(
      parseListingId(request.params.id),
      optionalUserId(request),
    );
    return sendSuccess(response, { listing });
  }) satisfies RequestHandler,

  recordListingView: (async (request, response) => {
    try {
      await viewService.record(authenticatedUserId(request), parseListingId(request.params.id));
    } catch {
      console.error('Marketplace personalized view recording failed.');
    }
    return sendSuccess(response, { accepted: true });
  }) satisfies RequestHandler,

  listCategories: (async (_request, response) => {
    const categories = await service.listCategories();
    return sendSuccess(response, { categories });
  }) satisfies RequestHandler,

  listListings: (async (request, response) => {
    const result = await service.listListings(
      parseListingQuery(request.query),
      optionalUserId(request),
    );
    return sendSuccess(
      response,
      { listings: result.items },
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

  listBookmarks: (async (request, response) => {
    const result = await bookmarkService.list(
      authenticatedUserId(request),
      parseBookmarkQuery(request.query),
    );
    return sendSuccess(
      response,
      { listings: result.items },
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
    parseBookmarkBody(request.body);
    const removed = await bookmarkService.remove(
      authenticatedUserId(request),
      parseListingId(request.params.id),
    );
    return sendSuccess(response, { bookmarked: false, removed });
  }) satisfies RequestHandler,

  reorderMedia: (async (request, response) => {
    const media = await mediaService.reorderMedia(
      authenticatedUserId(request),
      parseListingId(request.params.id),
      parseMediaOrder(request.body),
    );
    return sendSuccess(response, { media });
  }) satisfies RequestHandler,

  updateListing: (async (request, response) => {
    const listing = await service.updateListing(
      authenticatedUserId(request),
      parseListingId(request.params.id),
      parseListingUpdate(request.body),
    );
    return sendSuccess(response, { listing });
  }) satisfies RequestHandler,
});

export const marketplaceController = createMarketplaceController();

export const marketplaceRecommendationsController = (async (request, response) =>
  sendSuccess(
    response,
    await getMarketplaceRecommendations(authenticatedUserId(request)),
  )) satisfies RequestHandler;
