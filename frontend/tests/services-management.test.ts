import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { ServiceFeaturedConsent } from '../src/features/services/ServiceFeaturedConsent.js';
import {
  ServiceManagementCard,
  ServiceRequestCard,
} from '../src/features/services/ServiceManagementCards.js';
import {
  addServiceSkill,
  changedServiceFields,
  emptyServiceDraft,
  normalizeServiceDraft,
  serviceDraftFrom,
  validateServiceDraft,
  lifecycleTargets,
  canReviewServiceRequest,
  serviceConversationInput,
} from '../src/features/services/services-management-state.js';
import {
  serializeServiceDraft,
  serializeServicePatch,
} from '../src/features/services/services-service.js';
import type { ServiceRequest, StudentService } from '../src/features/services/services.types.js';
const service: StudentService = {
  id: '10000000-1111-4111-8111-111111111111',
  title: 'Design support',
  description: 'Actual description with adequate detail.\n\n[campusconnect-examiner-demo-v1]',
  category: 'Creative',
  price: '500.00',
  pricingType: 'FIXED',
  skills: ['Design'],
  location: null,
  providerId: 'provider',
  provider: {
    id: 'provider',
    avatar: null,
    department: null,
    displayName: 'CampusConnect student',
  },
  featuredOnLanding: true,
  status: 'ACTIVE',
  createdAt: '2026-10-22T12:00:00Z',
  updatedAt: '2026-10-22T12:00:00Z',
  requestCount: 1,
  viewerIsProvider: true,
  viewerRequestStatus: null,
};
const draft = serviceDraftFrom(service);
const request: ServiceRequest = {
  id: 'actual-request-id',
  requesterId: 'requester',
  requester: {
    id: 'requester',
    avatar: null,
    department: null,
    displayName: 'CampusConnect student',
  },
  service,
  status: 'PENDING',
  message: 'Original request note',
  createdAt: '2026-10-23T12:00:00Z',
  updatedAt: '',
  reviewedAt: null,
};
const render = (node: ReturnType<typeof createElement>) =>
  renderToStaticMarkup(createElement(MemoryRouter, null, node));
void test('Management create defaults consent false and prefill preserves actual stored fields', () => {
  assert.equal(emptyServiceDraft.featuredOnLanding, false);
  assert.equal(draft.featuredOnLanding, true);
  assert.equal(draft.description, service.description);
  assert.equal(draft.location, '');
  assert.deepEqual(draft.skills, service.skills);
  assert.deepEqual(validateServiceDraft(draft), {});
});
void test('Management validation mirrors backend text and fixed price limits', () => {
  for (const [field, value] of [
    ['title', 'ab'],
    ['category', 'a'],
    ['description', 'short'],
    ['location', 'x'.repeat(181)],
  ] as const)
    assert.ok(validateServiceDraft({ ...draft, [field]: value })[field]);
  for (const price of ['0', '-1', '1.234', '10000001', '1e3'])
    assert.ok(validateServiceDraft({ ...draft, price }).price);
  assert.equal(validateServiceDraft({ ...draft, price: '10000000' }).price, undefined);
  assert.ok(validateServiceDraft(emptyServiceDraft).title);
});
void test('Management skills enforce trim, case-insensitive uniqueness, size and count without losing selection', () => {
  assert.deepEqual(addServiceSkill(['Design'], '  Research ').skills, ['Design', 'Research']);
  for (const input of [' design ', 'a'.repeat(51), ''])
    assert.ok(addServiceSkill(['Design'], input).error);
  const twelve = Array.from({ length: 12 }, (_, i) => 'Skill ' + i);
  assert.ok(addServiceSkill(twelve, 'Extra').error);
  assert.deepEqual(addServiceSkill(twelve, 'Extra').skills, twelve);
  assert.ok(validateServiceDraft({ ...draft, skills: ['Design', 'design'] }).skills);
});
void test('Management pricing normalization and wire payloads never carry obsolete amounts', () => {
  const free = { ...draft, pricingType: 'FREE' as const, price: '999' };
  assert.equal(normalizeServiceDraft(free).price, '0');
  assert.equal((JSON.parse(serializeServiceDraft(free)) as { price: string }).price, '0');
  const negotiable = { ...draft, pricingType: 'NEGOTIABLE' as const, price: '999' };
  assert.equal((JSON.parse(serializeServiceDraft(negotiable)) as { price: null }).price, null);
  assert.equal((JSON.parse(serializeServiceDraft(draft)) as { price: string }).price, '500.00');
});
void test('Management edit patches include only changed supported fields and always pair pricing', () => {
  assert.deepEqual(changedServiceFields(draft, draft), {});
  assert.deepEqual(changedServiceFields(draft, { ...draft, title: 'New title' }), {
    title: 'New title',
  });
  assert.deepEqual(changedServiceFields(draft, { ...draft, featuredOnLanding: false }), {
    featuredOnLanding: false,
  });
  assert.deepEqual(changedServiceFields(draft, { ...draft, price: '500' }), {});
  assert.deepEqual(changedServiceFields(draft, { ...draft, price: '600' }), {
    pricingType: 'FIXED',
    price: '600',
  });
  const patch = changedServiceFields(draft, { ...draft, pricingType: 'NEGOTIABLE', price: '999' });
  assert.deepEqual(JSON.parse(serializeServicePatch(patch)), {
    pricingType: 'NEGOTIABLE',
    price: null,
  });
  assert.deepEqual(JSON.parse(serializeServicePatch({ title: 'New title' })), {
    title: 'New title',
  });
});
void test('Management serialization strips unsupported ownership and lifecycle fields', () => {
  const input = { ...draft, providerId: 'attacker', status: 'ARCHIVED' };
  const body = JSON.parse(serializeServiceDraft(input)) as Record<string, unknown>;
  assert.equal('providerId' in body, false);
  assert.equal('status' in body, false);
  assert.equal(Object.keys(body).length, 8);
});
void test('Management lifecycle remains owner-only and archived terminal', () => {
  assert.deepEqual(lifecycleTargets(service), ['PAUSED', 'ARCHIVED']);
  assert.deepEqual(lifecycleTargets({ ...service, status: 'PAUSED' }), ['ACTIVE', 'ARCHIVED']);
  assert.deepEqual(lifecycleTargets({ ...service, status: 'ARCHIVED' }), []);
  assert.deepEqual(lifecycleTargets({ ...service, viewerIsProvider: false }), []);
});
void test('Management review rules preserve historical rejection/completion and active acceptance', () => {
  assert.equal(canReviewServiceRequest(request, 'ACCEPTED'), true);
  assert.equal(
    canReviewServiceRequest({ ...request, service: { ...service, status: 'PAUSED' } }, 'ACCEPTED'),
    false,
  );
  assert.equal(
    canReviewServiceRequest(
      { ...request, service: { ...service, status: 'ARCHIVED' } },
      'REJECTED',
    ),
    true,
  );
  assert.equal(
    canReviewServiceRequest(
      { ...request, status: 'ACCEPTED', service: { ...service, status: 'ARCHIVED' } },
      'COMPLETED',
    ),
    true,
  );
  assert.equal(canReviewServiceRequest({ ...request, status: 'REJECTED' }, 'COMPLETED'), false);
  assert.equal(
    canReviewServiceRequest(
      { ...request, service: { ...service, viewerIsProvider: false } },
      'ACCEPTED',
    ),
    false,
  );
});
void test('Management messaging preserves exact request ID and participant direction', () => {
  assert.equal(serviceConversationInput(request, true), null);
  const accepted = { ...request, status: 'ACCEPTED' as const };
  assert.deepEqual(serviceConversationInput(accepted, true), {
    contextType: 'SERVICE',
    contextId: 'actual-request-id',
    targetUserId: 'requester',
  });
  assert.equal(serviceConversationInput(accepted, false), null);
  assert.deepEqual(
    serviceConversationInput(
      { ...accepted, service: { ...service, viewerIsProvider: false } },
      false,
    ),
    { contextType: 'SERVICE', contextId: 'actual-request-id', targetUserId: 'provider' },
  );
});
void test('Management consent disclosure is complete, unchecked by default and withdrawable', () => {
  const html = renderToStaticMarkup(
    createElement(ServiceFeaturedConsent, { value: false, onChange: () => {} }),
  );
  assert.doesNotMatch(html, /checked=""/);
  assert.match(html, /Allow this service/);
  assert.match(html, /<summary>Learn more/);
  assert.match(html, /uncached homepage responses/);
  assert.match(html, /private contact information/);
  const selected = renderToStaticMarkup(
    createElement(ServiceFeaturedConsent, { value: true, eligible: false, onChange: () => {} }),
  );
  assert.match(selected, /checked=""/);
  assert.match(selected, /not currently eligible/);
});
void test('Management cards use actual data, neutral identity and permission-aware actions', () => {
  const html = render(
    createElement(ServiceManagementCard, {
      service: { ...service, status: 'ARCHIVED' },
      requests: 1,
      pending: null,
      disabled: false,
      onTransition: () => {},
      onReview: () => {},
    }),
  );
  assert.doesNotMatch(html, /Resume|Pause|Edit service|Delete/);
  assert.match(html, /Archived/);
  assert.match(html, /1 request/);
  const incoming = render(
    createElement(ServiceRequestCard, {
      request,
      received: true,
      pending: null,
      disabled: true,
      onAct: () => {},
      onMessage: () => {},
    }),
  );
  assert.match(incoming, /CampusConnect student/);
  assert.match(incoming, /Original request note/);
  assert.match(incoming, /disabled=""/);
  assert.doesNotMatch(incoming, /Message requester/);
});
