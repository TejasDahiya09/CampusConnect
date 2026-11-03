import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AccountStatus, UserRole } from '../src/generated/prisma/client.js';
import type {
  AuthUserRepository,
  SynchronizeUserInput,
} from '../src/modules/auth/auth.repository.js';
import { synchronizeAuthenticatedUser } from '../src/modules/auth/auth.service.js';
import type { AuthenticatedUser, SupabaseIdentity } from '../src/modules/auth/auth.types.js';

const identity: SupabaseIdentity = {
  email: 'student@personal-mail.example',
  emailVerified: true,
  id: '11111111-1111-4111-8111-111111111111',
  metadata: { display_name: 'Student User' },
};

class InMemoryAuthUserRepository implements AuthUserRepository {
  readonly users = new Map<string, AuthenticatedUser>();

  findById(id: string): Promise<AuthenticatedUser | null> {
    return Promise.resolve(this.users.get(id) ?? null);
  }

  synchronize(input: SynchronizeUserInput): Promise<AuthenticatedUser> {
    const existing = this.users.get(input.identity.id);

    if (existing !== undefined) {
      return Promise.resolve(existing);
    }

    const user: AuthenticatedUser = {
      email: input.email,
      emailVerifiedAt: input.verifiedAt,
      id: input.identity.id,
      profile: {
        displayName: input.displayName,
        id: '22222222-2222-4222-8222-222222222222',
      },
      role: UserRole.STUDENT,
      status: AccountStatus.ACTIVE,
    };
    this.users.set(user.id, user);
    return Promise.resolve(user);
  }
}

void describe('authenticated user synchronization', () => {
  void it('creates the application user and profile from a verified identity', async () => {
    const repository = new InMemoryAuthUserRepository();
    const user = await synchronizeAuthenticatedUser(identity, {}, repository);

    assert.equal(user.id, identity.id);
    assert.equal(user.profile?.displayName, 'Student User');
    assert.equal(user.role, UserRole.STUDENT);
    assert.equal(repository.users.size, 1);
  });

  void it('initializes a first-time Google identity from full_name metadata as STUDENT', async () => {
    const repository = new InMemoryAuthUserRepository();
    const user = await synchronizeAuthenticatedUser(
      { ...identity, metadata: { full_name: 'Google Student' } },
      {},
      repository,
    );
    assert.equal(user.profile?.displayName, 'Google Student');
    assert.equal(user.role, UserRole.STUDENT);
    assert.equal(user.status, AccountStatus.ACTIVE);
  });

  void it('is idempotent when the same identity synchronizes twice', async () => {
    const repository = new InMemoryAuthUserRepository();
    const first = await synchronizeAuthenticatedUser(identity, {}, repository);
    const second = await synchronizeAuthenticatedUser(identity, {}, repository);

    assert.equal(first.id, second.id);
    assert.equal(repository.users.size, 1);
  });

  void it('does not overwrite an existing profile with later provider metadata', async () => {
    const repository = new InMemoryAuthUserRepository();
    const first = await synchronizeAuthenticatedUser(identity, {}, repository);
    const second = await synchronizeAuthenticatedUser(
      { ...identity, metadata: { full_name: 'Changed Google Name' } },
      {},
      repository,
    );
    assert.equal(second.profile?.displayName, first.profile?.displayName);
    assert.equal(repository.users.size, 1);
  });

  void it('accepts arbitrary valid verified email domains', async () => {
    const repository = new InMemoryAuthUserRepository();
    const user = await synchronizeAuthenticatedUser(
      { ...identity, email: ' Student@Gmail.com ' },
      {},
      repository,
    );
    assert.equal(user.email, 'student@gmail.com');
  });

  void it('rejects malformed verified identity emails', async () => {
    await assert.rejects(
      synchronizeAuthenticatedUser(
        { ...identity, email: 'not-an-email' },
        {},
        new InMemoryAuthUserRepository(),
      ),
      (error: unknown) =>
        error instanceof Error && error.message === 'A valid email address is required.',
    );
  });

  void it('does not reactivate or synchronize a deactivated account into the application', async () => {
    const repository = new InMemoryAuthUserRepository();
    repository.users.set(identity.id, {
      email: identity.email,
      emailVerifiedAt: new Date(),
      id: identity.id,
      profile: { displayName: 'Student User', id: identity.id },
      role: UserRole.STUDENT,
      status: AccountStatus.DEACTIVATED,
    });
    await assert.rejects(
      synchronizeAuthenticatedUser(identity, {}, repository),
      (error: unknown) =>
        error instanceof Error && error.message === 'This account is not available.',
    );
    assert.equal(repository.users.get(identity.id)?.status, AccountStatus.DEACTIVATED);
  });
});
