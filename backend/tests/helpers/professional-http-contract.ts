import assert from 'node:assert/strict';
import type { AccountStatus } from '../../src/generated/prisma/client.js';
import type { ProfessionalDetails } from '../../src/modules/profile/professional-profile.js';
export interface HttpContractContext {
  base: string;
  owner: string;
  other: string;
  token: (id: string) => Promise<string>;
  setStatus: (id: string, status: AccountStatus) => Promise<void>;
  stored: (id: string) => Promise<unknown>;
}
const initial: ProfessionalDetails = {
  headline: 'Private synthetic professional headline',
  education: [{ institution: 'Synthetic College', qualification: 'Computing' }],
  experience: [
    {
      role: 'Contributor',
      organization: 'Synthetic team',
      description: 'Private synthetic experience',
    },
  ],
};
const endpoint = '/api/profile/me/professional';
export const professionalHttpCases: readonly {
  name: string;
  run: (ctx: HttpContractContext) => Promise<void>;
}[] = [
  {
    name: 'ACTIVE owner GET, conditional PUT, authoritative version and fresh GET',
    run: async (c) => {
      const token = await c.token(c.owner),
        headers = { authorization: `Bearer ${token}` };
      const first = await fetch(c.base + endpoint, { headers });
      assert.equal(first.status, 200);
      assert.match(first.headers.get('cache-control') ?? '', /private.*no-store/);
      const before = ((await first.json()) as Envelope).data.professional;
      const save = await fetch(c.base + endpoint, {
        method: 'PUT',
        headers: {
          ...headers,
          'content-type': 'application/json',
          'if-match': `"${before.version}"`,
        },
        body: JSON.stringify(initial),
      });
      assert.equal(save.status, 200);
      const saved = ((await save.json()) as Envelope).data.professional;
      assert.notEqual(saved.version, before.version);
      assert.deepEqual(saved.details, initial);
      const fresh = await fetch(c.base + endpoint, { headers });
      assert.deepEqual(((await fresh.json()) as Envelope).data.professional, saved);
      assert.deepEqual(await c.stored(c.owner), initial);
    },
  },
  {
    name: 'missing If-Match is 428 and cannot mutate',
    run: async (c) => {
      const before = await c.stored(c.owner);
      const response = await fetch(c.base + endpoint, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await c.token(c.owner)}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify(initial),
      });
      assert.equal(response.status, 428);
      assert.deepEqual(await c.stored(c.owner), before);
    },
  },
  {
    name: 'stale If-Match is 409 and cannot replace committed data',
    run: async (c) => {
      const headers = {
        authorization: `Bearer ${await c.token(c.owner)}`,
        'content-type': 'application/json',
      };
      const read = await fetch(c.base + endpoint, { headers });
      const state = ((await read.json()) as Envelope).data.professional;
      const next = { ...initial, headline: 'Newer committed synthetic details' };
      const save = await fetch(c.base + endpoint, {
        method: 'PUT',
        headers: { ...headers, 'if-match': `"${state.version}"` },
        body: JSON.stringify(next),
      });
      assert.equal(save.status, 200);
      const stale = await fetch(c.base + endpoint, {
        method: 'PUT',
        headers: { ...headers, 'if-match': `"${state.version}"` },
        body: JSON.stringify(initial),
      });
      assert.equal(stale.status, 409);
      assert.deepEqual(await c.stored(c.owner), next);
    },
  },
  {
    name: 'malformed payload, ownership spoof and malformed version are 400',
    run: async (c) => {
      const headers = {
        authorization: `Bearer ${await c.token(c.owner)}`,
        'content-type': 'application/json',
      };
      const before = await c.stored(c.owner);
      for (const body of [
        { ...initial, userId: c.other },
        { headline: 'Missing collections' },
        { ...initial, education: Array(6).fill({ institution: 'Synthetic', qualification: '' }) },
      ])
        assert.equal(
          (await fetch(c.base + endpoint, { method: 'PUT', headers, body: JSON.stringify(body) }))
            .status,
          400,
        );
      assert.equal(
        (
          await fetch(c.base + endpoint, {
            method: 'PUT',
            headers: { ...headers, 'if-match': 'bad' },
            body: JSON.stringify(initial),
          })
        ).status,
        400,
      );
      assert.deepEqual(await c.stored(c.owner), before);
    },
  },
  {
    name: 'missing, malformed and forged authentication are 401',
    run: async (c) => {
      for (const headers of [
        {},
        { authorization: 'bad' },
        { authorization: 'Bearer forged.synthetic.token' },
      ])
        assert.equal((await fetch(c.base + endpoint, { headers })).status, 401);
    },
  },
  {
    name: 'SUSPENDED and DEACTIVATED actors cannot GET or PUT',
    run: async (c) => {
      const before = await c.stored(c.owner);
      const token = await c.token(c.owner);
      for (const status of ['SUSPENDED', 'DEACTIVATED'] as const) {
        await c.setStatus(c.owner, status);
        for (const method of ['GET', 'PUT'])
          assert.equal(
            (
              await fetch(c.base + endpoint, {
                method,
                headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
                ...(method === 'PUT' ? { body: JSON.stringify(initial) } : {}),
              })
            ).status,
            403,
          );
      }
      await c.setStatus(c.owner, 'ACTIVE');
      assert.deepEqual(await c.stored(c.owner), before);
    },
  },
  {
    name: 'other ACTIVE owner cannot read first owners document or target it by URL',
    run: async (c) => {
      const response = await fetch(c.base + endpoint, {
        headers: { authorization: `Bearer ${await c.token(c.other)}` },
      });
      assert.equal(response.status, 200);
      assert.equal(((await response.json()) as Envelope).data.professional.details, null);
      const firstOwnerBefore = await c.stored(c.owner);
      const otherState = await fetch(c.base + endpoint, {
        headers: { authorization: `Bearer ${await c.token(c.other)}` },
      });
      const otherVersion = ((await otherState.json()) as Envelope).data.professional.version;
      const ownDocument = { ...initial, headline: 'Second synthetic account only' };
      const ownSave = await fetch(c.base + endpoint, {
        method: 'PUT',
        headers: {
          authorization: `Bearer ${await c.token(c.other)}`,
          'content-type': 'application/json',
          'if-match': `"${otherVersion}"`,
        },
        body: JSON.stringify(ownDocument),
      });
      assert.equal(ownSave.status, 200);
      assert.deepEqual(await c.stored(c.other), ownDocument);
      assert.deepEqual(await c.stored(c.owner), firstOwnerBefore);
      assert.equal(
        (
          await fetch(c.base + endpoint + '/' + c.owner, {
            headers: { authorization: `Bearer ${await c.token(c.other)}` },
          })
        ).status,
        404,
      );
    },
  },
  {
    name: 'actual public profile route excludes persisted professional additions',
    run: async (c) => {
      const response = await fetch(c.base + '/api/profile/' + c.owner);
      assert.equal(response.status, 200);
      const text = await response.text();
      assert.ok(!text.includes('committed synthetic details'));
      assert.ok(!text.includes('Private synthetic'));
      assert.ok(!text.includes('professional'));
      assert.ok(!text.includes('synthetic@example.test'));
    },
  },
];
interface Envelope {
  data: {
    professional: { available: boolean; version: string; details: ProfessionalDetails | null };
  };
}
