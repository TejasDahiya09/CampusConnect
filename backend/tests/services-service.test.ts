import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { ServiceStatus } from '../src/generated/prisma/client.js';
import {
  servicesRepository,
  type ServicesRepository,
} from '../src/modules/services/services.repository.js';
import { createServicesService } from '../src/modules/services/services.service.js';
import { parseServiceCreate } from '../src/modules/services/services.validation.js';
import type { ServiceView } from '../src/modules/services/services.types.js';
const service: ServiceView = {
  category: 'Tutoring',
  createdAt: '2026-10-07T00:00:00Z',
  description: 'Detailed student tutoring service for acceptance testing.',
  id: '11111111-1111-4111-8111-111111111111',
  location: null,
  price: '500.00',
  pricingType: 'FIXED',
  provider: { avatar: null, department: 'CSE', displayName: 'Provider', id: 'provider' },
  providerId: 'provider',
  requestCount: 0,
  skills: ['Algorithms'],
  status: ServiceStatus.ACTIVE,
  title: 'Algorithms tutoring',
  updatedAt: '2026-10-07T00:00:00Z',
  viewerIsProvider: true,
  viewerRequestStatus: null,
};
const repo = (overrides: Partial<ServicesRepository> = {}): ServicesRepository => ({
  ...servicesRepository,
  create: () => Promise.resolve(service),
  find: () => Promise.resolve(service),
  list: () => Promise.resolve({ items: [service], total: 1 }),
  update: () => Promise.resolve(service),
  request: () =>
    Promise.resolve({
      notificationTarget: { providerId: service.providerId, title: service.title },
      createdAt: service.createdAt,
      id: '22222222-2222-4222-8222-222222222222',
      message: null,
      requesterId: 'student',
      reviewedAt: null,
      status: 'PENDING',
      updatedAt: service.updatedAt,
    }),
  mutateRequest: () =>
    Promise.resolve({
      kind: 'request',
      request: {
        createdAt: service.createdAt,
        id: 'request',
        message: null,
        requesterId: 'student',
        reviewedAt: service.updatedAt,
        status: 'ACCEPTED',
        updatedAt: service.updatedAt,
      },
      service,
    }),
  workspace: () => Promise.resolve({ provided: [service], received: [], requested: [] }),
  transition: () => Promise.resolve(service),
  ...overrides,
});
void describe('Services pricing validation', () => {
  void it('normalizes FREE, FIXED and NEGOTIABLE', () => {
    const base = {
      category: 'Tutoring',
      description: service.description,
      location: null,
      skills: [],
      title: service.title,
    };
    assert.equal(parseServiceCreate({ ...base, price: null, pricingType: 'FREE' }).price, '0');
    assert.equal(
      parseServiceCreate({ ...base, price: '500', pricingType: 'FIXED' }).price,
      '500.00',
    );
    assert.equal(
      parseServiceCreate({ ...base, price: null, pricingType: 'NEGOTIABLE' }).price,
      null,
    );
  });
  void it('rejects invalid pricing and client provider identity', () => {
    assert.throws(
      () =>
        parseServiceCreate({
          category: 'Tutoring',
          description: service.description,
          location: null,
          price: null,
          pricingType: 'FIXED',
          providerId: 'x',
          skills: [],
          title: service.title,
        }),
      { code: 'VALIDATION_ERROR' },
    );
  });
});
void describe('Services workflow rules', () => {
  void it('derives provider from caller and paginates', async () => {
    let provider = '';
    const api = createServicesService(
      repo({
        create: (id) => {
          provider = id;
          return Promise.resolve(service);
        },
      }),
    );
    await api.create('authenticated', {
      category: 'Tutoring',
      description: service.description,
      location: null,
      price: '0',
      pricingType: 'FREE',
      skills: [],
      title: service.title,
    });
    assert.equal(provider, 'authenticated');
    assert.equal((await api.list({ limit: 1, page: 1, sort: 'newest' })).totalPages, 1);
  });
  void it('rejects own, duplicate and unavailable requests', async () => {
    for (const [result, code] of [
      ['forbidden', 'SERVICE_REQUEST_FORBIDDEN'],
      ['conflict', 'SERVICE_REQUEST_EXISTS'],
      ['not-found', 'SERVICE_UNAVAILABLE'],
    ] as const) {
      await assert.rejects(
        createServicesService(repo({ request: () => Promise.resolve(result) })).request(
          'student',
          service.id,
          null,
        ),
        { code },
      );
    }
  });
  void it('enforces review/completion transitions and ownership', async () => {
    const denied = createServicesService(
      repo({ mutateRequest: () => Promise.resolve({ kind: 'forbidden' }) }),
    );
    await assert.rejects(denied.mutate('other', service.id, 'request', 'ACCEPTED'), {
      code: 'SERVICE_REQUEST_FORBIDDEN',
    });
    const invalid = createServicesService(
      repo({ mutateRequest: () => Promise.resolve({ kind: 'conflict' }) }),
    );
    await assert.rejects(invalid.mutate('provider', service.id, 'request', 'COMPLETED'), {
      code: 'INVALID_SERVICE_REQUEST_TRANSITION',
    });
  });
});
