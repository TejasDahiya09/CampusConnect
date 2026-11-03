import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/api-response.js';
import { servicesService, type ServicesService } from './services.service.js';
import {
  parseRequestCreate,
  parseRequestDecision,
  parseServiceCreate,
  parseServiceId,
  parseServiceQuery,
  parseServiceStatus,
  parseServiceUpdate,
} from './services.validation.js';
const user = (request: Parameters<RequestHandler>[0]) => {
  if (!request.auth) throw new Error('Authentication context unavailable.');
  return request.auth.user.id;
};
export const createServicesController = (service: ServicesService = servicesService) => ({
  create: (async (req, res) =>
    sendSuccess(
      res,
      { service: await service.create(user(req), parseServiceCreate(req.body)) },
      { statusCode: 201 },
    )) satisfies RequestHandler,
  get: (async (req, res) =>
    sendSuccess(res, {
      service: await service.get(parseServiceId('id', req.params.id), req.auth?.user.id),
    })) satisfies RequestHandler,
  list: (async (req, res) => {
    const result = await service.list(parseServiceQuery(req.query), req.auth?.user.id);
    return sendSuccess(
      res,
      { services: result.items },
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
  request: (async (req, res) =>
    sendSuccess(
      res,
      {
        request: await service.request(
          user(req),
          parseServiceId('id', req.params.id),
          parseRequestCreate(req.body),
        ),
      },
      { statusCode: 201 },
    )) satisfies RequestHandler,
  review: (async (req, res) =>
    sendSuccess(
      res,
      await service.mutate(
        user(req),
        parseServiceId('id', req.params.id),
        parseServiceId('requestId', req.params.requestId),
        parseRequestDecision(req.body),
      ),
    )) satisfies RequestHandler,
  complete: (async (req, res) =>
    sendSuccess(
      res,
      await service.mutate(
        user(req),
        parseServiceId('id', req.params.id),
        parseServiceId('requestId', req.params.requestId),
        'COMPLETED',
      ),
    )) satisfies RequestHandler,
  transition: (async (req, res) =>
    sendSuccess(res, {
      service: await service.transition(
        user(req),
        parseServiceId('id', req.params.id),
        parseServiceStatus(req.body),
      ),
    })) satisfies RequestHandler,
  update: (async (req, res) =>
    sendSuccess(res, {
      service: await service.update(
        user(req),
        parseServiceId('id', req.params.id),
        parseServiceUpdate(req.body),
      ),
    })) satisfies RequestHandler,
  workspace: (async (req, res) =>
    sendSuccess(res, await service.workspace(user(req)))) satisfies RequestHandler,
});
export const servicesController = createServicesController();
