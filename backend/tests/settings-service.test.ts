import assert from 'node:assert/strict';
import test from 'node:test';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import type { SettingsRepository } from '../src/modules/settings/settings.repository.js';
import { createSettingsService } from '../src/modules/settings/settings.service.js';

const userId = '11111111-1111-4111-8111-111111111111';
const state = { active: true };
const repository: SettingsRepository = {
  findAccount: () =>
    Promise.resolve({
      email: 'student@example.test',
      id: userId,
      profile: { fullName: 'Campus Student' },
      role: UserRole.STUDENT,
      status: state.active ? AccountStatus.ACTIVE : AccountStatus.DEACTIVATED,
    }),
  deactivate: () => {
    if (!state.active) return Promise.resolve({ count: 0 });
    state.active = false;
    return Promise.resolve({ count: 1 });
  },
};

void test('settings returns a controlled authenticated account projection', async () => {
  state.active = true;
  const account = await createSettingsService(repository).account(userId);
  assert.deepEqual(account, {
    displayName: 'Campus Student',
    email: 'student@example.test',
    id: userId,
    role: UserRole.STUDENT,
    status: AccountStatus.ACTIVE,
  });
  const serialized = JSON.stringify(account);
  for (const privateField of ['password', 'token', 'metadata', 'secret'])
    assert.equal(serialized.includes(privateField), false);
});

void test('self-deactivation is persisted and repeated deactivation is rejected', async () => {
  state.active = true;
  const service = createSettingsService(repository);
  assert.deepEqual(await service.deactivate(userId), { deactivated: true });
  assert.equal(state.active, false);
  await assert.rejects(() => service.deactivate(userId), /already unavailable/);
});
