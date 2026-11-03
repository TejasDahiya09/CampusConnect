import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ServiceRequestControls } from '../src/features/services/ServicePages.js';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, it } from 'node:test';
import {
  mergeServiceRequestMutation,
  serializeServiceDraft,
} from '../src/features/services/services-service.js';
import {
  pricingLabel,
  canRequestService,
  type ServiceRequest,
  type StudentService,
} from '../src/features/services/services.types.js';
const service: StudentService = {
  category: 'Tutoring',
  createdAt: '',
  description: 'description',
  id: 'id',
  location: null,
  price: '500.00',
  pricingType: 'FIXED',
  provider: { avatar: null, department: null, displayName: 'Provider', id: 'provider' },
  providerId: 'provider',
  requestCount: 0,
  skills: [],
  status: 'ACTIVE',
  title: 'Tutoring',
  updatedAt: '',
  viewerIsProvider: false,
  viewerRequestStatus: null,
};
void describe('Services frontend presentation', () => {
  void it('formats all pricing modes truthfully', () => {
    assert.equal(pricingLabel(service), '₹500.00');
    assert.equal(pricingLabel({ ...service, price: '0.00', pricingType: 'FREE' }), 'Free');
    assert.equal(
      pricingLabel({ ...service, price: null, pricingType: 'NEGOTIABLE' }),
      'Negotiable',
    );
  });
  void it('does not model payment or messaging fields', () => {
    assert.equal('payment' in service, false);
    assert.equal('conversationId' in service, false);
  });

  void it('preserves populated workspace projections after accepting a request', () => {
    const requester = {
      avatar: null,
      department: 'Computer Science',
      displayName: 'Requester',
      id: 'requester',
    };
    const current: ServiceRequest = {
      createdAt: '2026-10-08T00:00:00.000Z',
      id: 'request',
      message: 'Please help with revision.',
      requester,
      requesterId: requester.id,
      reviewedAt: null,
      service,
      status: 'PENDING',
      updatedAt: '2026-10-08T00:00:00.000Z',
    };
    const updatedService = { ...service, requestCount: 1 };
    const { requester: _requester, service: _service, ...bareRequest } = current;
    const updated = mergeServiceRequestMutation(current, {
      request: {
        ...bareRequest,
        status: 'ACCEPTED',
      },
      service: updatedService,
    });

    assert.equal(updated.status, 'ACCEPTED');
    assert.equal(updated.requester, requester);
    assert.equal(updated.service, updatedService);
  });

  void it('keeps empty and failed workspaces recoverable instead of rendering a blank page', () => {
    const source = readFileSync(
      new URL('../src/features/services/ServicesWorkspace.tsx', import.meta.url),
      'utf8',
    );
    assert.match(source, /You have not offered a service yet/);
    assert.match(source, /No requests here/);
    assert.match(source, /Workspace unavailable/);
    assert.match(source, /Try again/);
  });

  void it('preserves explicit Featured Posts consent in service payloads', () => {
    const payload = JSON.parse(
      serializeServiceDraft({
        category: 'Tutoring',
        description: 'Structured exam preparation for students.',
        featuredOnLanding: true,
        location: 'Library',
        price: '500',
        pricingType: 'FIXED',
        skills: ['Teaching'],
        title: 'Exam preparation',
      }),
    ) as Record<string, unknown>;
    assert.equal(payload.featuredOnLanding, true);
    assert.equal(payload.price, '500');
    const optedOut = JSON.parse(
      serializeServiceDraft({
        category: 'Tutoring',
        description: 'Updated exam preparation for students.',
        featuredOnLanding: false,
        location: 'Library',
        price: '',
        pricingType: 'FREE',
        skills: ['Teaching'],
        title: 'Exam preparation',
      }),
    ) as Record<string, unknown>;
    assert.equal(optedOut.featuredOnLanding, false);
  });
});

void it('permits re-request after finalized history while honoring authoritative eligibility', () => {
  for (const status of ['REJECTED', 'COMPLETED'] as const)
    assert.equal(canRequestService({ ...service, viewerRequestStatus: status }), true);
  for (const status of ['PENDING', 'ACCEPTED'] as const)
    assert.equal(canRequestService({ ...service, viewerRequestStatus: status }), false);
  assert.equal(
    canRequestService({ ...service, viewerCanRequest: false, viewerRequestStatus: 'COMPLETED' }),
    false,
  );
  assert.equal(
    canRequestService({ ...service, viewerCanRequest: true, viewerIsProvider: true }),
    false,
  );
  assert.equal(
    canRequestService({ ...service, viewerCanRequest: true, status: 'ARCHIVED' }),
    false,
  );
});

void it('renders historical re-request controls, authoritative denial and pending submission accessibly', () => {
  const render = (overrides: Partial<StudentService> = {}, pending = false) =>
    renderToStaticMarkup(
      createElement(ServiceRequestControls, {
        service: { ...service, ...overrides },
        note: 'Synthetic request',
        requesting: pending,
        onNoteChange: () => {},
        onRequest: () => {},
      }),
    );
  for (const status of ['REJECTED', 'COMPLETED'] as const) {
    const html = render({ viewerRequestStatus: status });
    assert.match(html, new RegExp(status));
    assert.match(html, /Request service/);
    assert.match(html, /aria-label="Optional request details"/);
  }
  for (const status of ['PENDING', 'ACCEPTED'] as const)
    assert.doesNotMatch(render({ viewerRequestStatus: status }), /Request service|textarea/);
  assert.doesNotMatch(
    render({ viewerCanRequest: false, viewerRequestStatus: 'COMPLETED' }),
    /textarea/,
  );
  assert.match(render({}, true), /disabled=""/);
});
