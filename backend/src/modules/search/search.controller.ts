import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { searchService } from './search.service.js';
import { parseSearchQuery } from './search.validation.js';

export const searchController = {
  search: (async (request, response) => {
    sendSuccess(response, await searchService.search(parseSearchQuery(request.query)));
  }) satisfies RequestHandler,
};
