import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  ServiceOverview,
  ServiceProvider,
  ServiceInformation,
  ServiceRequestControls,
} from '../src/features/services/ServiceDetailPanels.js';
import {
  latestServiceConversationRequest,
  requestMessageError,
  serviceDetailPrice,
  validServiceDetailId,
} from '../src/features/services/service-detail-state.js';
import type { StudentService, ServiceRequest } from '../src/features/services/services.types.js';
export const detailService: StudentService = {
  id: '10000000-1111-4111-8111-111111111111',
  category: 'Creative support',
  title: 'Student design support',
  description: 'First paragraph.\n\nSecond paragraph.\n[campusconnect-examiner-demo-v1]',
  skills: ['Design', 'Research'],
  price: '500',
  pricingType: 'FIXED',
  location: 'Campus library',
  createdAt: '2026-10-20T12:00:00Z',
  updatedAt: '2026-10-21T12:00:00Z',
  providerId: 'provider',
  provider: {
    id: 'provider',
    avatar: null,
    department: null,
    displayName: 'CampusConnect student',
  },
  status: 'ACTIVE',
  requestCount: 42,
  viewerIsProvider: false,
  viewerRequestStatus: null,
  viewerCanRequest: true,
};
const render = (element: ReturnType<typeof createElement>) => renderToStaticMarkup(element);
const controls = (
  overrides: Partial<StudentService> = {},
  note = '',
  requesting = false,
  disabled = false,
) =>
  render(
    createElement(ServiceRequestControls, {
      service: { ...detailService, ...overrides },
      note,
      requesting,
      disabled,
      onNoteChange: () => {},
      onRequest: () => {},
    }),
  );
void test('Service Details pricing distinguishes genuine free, fixed, negotiable and missing values', () => {
  assert.equal(serviceDetailPrice(detailService), '₹500.00');
  assert.equal(serviceDetailPrice({ ...detailService, pricingType: 'FREE', price: '0' }), 'Free');
  assert.equal(
    serviceDetailPrice({ ...detailService, pricingType: 'NEGOTIABLE', price: null }),
    'Negotiable',
  );
  assert.equal(serviceDetailPrice({ ...detailService, price: null }), 'Price unavailable');
});
void test('Service Details preserves complete descriptions and escapes user content', () => {
  const html = render(
    createElement(ServiceOverview, {
      service: { ...detailService, title: '<script>unsafe</script>' },
    }),
  );
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /First paragraph\.\n\nSecond paragraph\./);
  assert.match(html, /\[campusconnect-examiner-demo-v1\]/);
  assert.doesNotMatch(html, /<script>/);
});
void test('Service provider panel preserves neutral redaction without extra private identity or profile links', () => {
  const html = render(createElement(ServiceProvider, { service: detailService }));
  assert.match(html, /CampusConnect student/);
  assert.doesNotMatch(html, />provider<|mailto:|Verified|<img|href=/);
  assert.doesNotMatch(html, /42/);
});
void test('Service request states preserve re-request eligibility and block active duplicates', () => {
  for (const status of ['REJECTED', 'COMPLETED'] as const) {
    const html = controls({ viewerRequestStatus: status });
    assert.match(html, new RegExp(status));
    assert.match(html, /Request service/);
  }
  for (const status of ['PENDING', 'ACCEPTED'] as const) {
    const html = controls({ viewerRequestStatus: status, viewerCanRequest: false });
    assert.match(html, new RegExp(status));
    assert.doesNotMatch(html, /<textarea/);
  }
  for (const status of ['PAUSED', 'ARCHIVED'] as const)
    assert.doesNotMatch(controls({ status }), /<textarea/);
  assert.doesNotMatch(controls({ viewerIsProvider: true }), /<textarea/);
  assert.doesNotMatch(controls({ viewerCanRequest: false }), /<textarea/);
});
void test('Service request controls label optional input, enforce length, and disable during submission or reconciliation', () => {
  assert.equal(requestMessageError(''), null);
  assert.equal(requestMessageError('a'.repeat(1000)), null);
  assert.ok(requestMessageError('a'.repeat(1001)));
  assert.match(controls(), /<label for=/);
  assert.match(controls(), /maxLength="1000"/);
  assert.match(controls({}, '', true), /Submitting…/);
  assert.match(controls({}, '', false, true), /disabled=""/);
  assert.match(controls({}, 'a'.repeat(1001)), /role="alert"/);
});
void test('Messaging request selection uses latest caller-scoped history, exact service/provider and actual request ID', () => {
  const service = { ...detailService, viewerRequestStatus: 'ACCEPTED' as const };
  const row: ServiceRequest = {
    id: 'request-actual',
    service,
    createdAt: '2026-10-22T12:00:00Z',
    updatedAt: '',
    requester: { id: 'requester', avatar: null, department: null, displayName: 'Requester' },
    requesterId: 'requester',
    message: null,
    reviewedAt: null,
    status: 'ACCEPTED',
  };
  assert.equal(latestServiceConversationRequest(service, [row])?.id, 'request-actual');
  assert.equal(
    latestServiceConversationRequest(service, [
      row,
      { ...row, id: 'pending', createdAt: '2026-10-23T12:00:00Z', status: 'PENDING' },
    ]),
    null,
  );
  assert.equal(
    latestServiceConversationRequest(service, [
      { ...row, service: { ...service, providerId: 'other' } },
    ]),
    null,
  );
  assert.equal(
    latestServiceConversationRequest({ ...service, viewerIsProvider: true }, [row]),
    null,
  );
  assert.equal(
    latestServiceConversationRequest({ ...service, viewerRequestStatus: 'REJECTED' }, [row]),
    null,
  );
});
void test('Service information uses existing metadata and truthful sparse states', () => {
  const html = render(createElement(ServiceInformation, { service: detailService }));
  assert.match(html, /Campus library/);
  assert.match(html, /Published/);
  assert.match(html, /Updated/);
  assert.match(html, /Design/);
  assert.doesNotMatch(html, /Deadline|Rating/);
  const sparse = render(
    createElement(ServiceInformation, {
      service: { ...detailService, skills: [], location: null, createdAt: '', updatedAt: '' },
    }),
  );
  assert.match(sparse, /No specific skills listed/);
  assert.match(sparse, /No additional information/);
});
void test('Invalid detail links are rejected locally without changing UUID contract', () => {
  assert.equal(validServiceDetailId(detailService.id), true);
  for (const id of ['', 'not-an-id', '../workspace']) assert.equal(validServiceDetailId(id), false);
});
