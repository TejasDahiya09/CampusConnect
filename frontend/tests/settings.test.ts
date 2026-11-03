import assert from 'node:assert/strict';
import test from 'node:test';
import { validateNewPassword } from '../src/features/settings/settings-service';

void test('settings password validation enforces policy and confirmation', () => {
  assert.equal(
    validateNewPassword('short', 'short'),
    'Password must contain between 8 and 128 characters.',
  );
  assert.equal(
    validateNewPassword('valid-password', 'different-password'),
    'The passwords do not match.',
  );
  assert.equal(validateNewPassword('valid-password', 'valid-password'), null);
});
