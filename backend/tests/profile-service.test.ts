import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { AppError } from '../src/errors/app-error.js';
import { calculateProfileCompletion } from '../src/modules/profile/profile-completion.js';
import type { ProfileRepository } from '../src/modules/profile/profile.repository.js';
import { createProfileService } from '../src/modules/profile/profile.service.js';
import type { ProfileRecord } from '../src/modules/profile/profile.types.js';

const ownerId = '11111111-1111-4111-8111-111111111111';
const otherUserId = '33333333-3333-4333-8333-333333333333';
const skillId = '44444444-4444-4444-8444-444444444444';
const interestId = '55555555-5555-4555-8555-555555555555';
const achievementId = '66666666-6666-4666-8666-666666666666';
const portfolioLinkId = '77777777-7777-4777-8777-777777777777';

const createRecord = (overrides: Partial<ProfileRecord> = {}): ProfileRecord => ({
  academicYear: null,
  achievements: [],
  avatar: null,
  bio: null,
  department: null,
  email: 'student@university.edu',
  emailVerifiedAt: new Date('2026-09-01T00:00:00.000Z'),
  fullName: 'Student User',
  interests: [],
  location: null,
  portfolio: [],
  profileCompletion: 0,
  skillProficiencies: {},
  skills: [],
  userId: ownerId,
  ...overrides,
});

const createRepository = (overrides: Partial<ProfileRepository> = {}): ProfileRepository => ({
  addInterest: () => Promise.resolve(),
  addSkill: () => Promise.resolve(),
  createAchievement: () => Promise.resolve(),
  createPortfolioLink: () => Promise.resolve(),
  deleteAchievement: () => Promise.resolve(true),
  deletePortfolioLink: () => Promise.resolve(true),
  findByUserId: () => Promise.resolve(createRecord()),
  getOptions: () => Promise.resolve({ departments: [], interests: [], skills: [] }),
  removeInterest: () => Promise.resolve(true),
  removeSkill: () => Promise.resolve(true),
  updateAchievement: () => Promise.resolve(true),
  updateCompletion: () => Promise.resolve(),
  updatePortfolioLink: () => Promise.resolve(true),
  updateProfile: () => Promise.resolve(),
  updateSkill: () => Promise.resolve(true),
  ...overrides,
});

void describe('profile service', () => {
  void it('calculates completion deterministically from ten documented criteria', () => {
    const completion = calculateProfileCompletion(
      createRecord({
        achievements: [
          { awardedAt: null, description: null, id: achievementId, title: 'Hackathon finalist' },
        ],
        avatar: { id: 'campus-indigo', type: 'predefined' },
        bio: 'Student builder',
        department: 'Computer Science',
        interests: ['Robotics'],
        portfolio: [
          { id: portfolioLinkId, label: 'Portfolio', sortOrder: 0, url: 'https://example.com/' },
        ],
        skills: ['TypeScript'],
        academicYear: 3,
      }),
    );

    assert.equal(completion.completed, 10);
    assert.equal(completion.total, 10);
    assert.equal(completion.percentage, 100);
  });

  void it('returns a public profile without private account fields', async () => {
    const service = createProfileService(
      createRepository({
        findByUserId: () =>
          Promise.resolve(
            createRecord({
              avatar: { id: 'campus-cyan', type: 'predefined' },
              location: 'North Campus',
              skillProficiencies: { typescript: 4 },
              skills: ['TypeScript', 'Legacy skill'],
            }),
          ),
      }),
    );
    const profile = await service.getPublicProfile(ownerId);

    assert.equal(profile.userId, ownerId);
    assert.equal(profile.universityDomain, 'university.edu');
    assert.equal('universityEmail' in profile, false);
    assert.equal('role' in profile, false);
    assert.equal('status' in profile, false);
    assert.equal('completion' in profile, false);
    assert.equal(profile.location, 'North Campus');
    assert.deepEqual(profile.avatar, { id: 'campus-cyan', type: 'predefined' });
    assert.equal(profile.skills[0]?.proficiency, 4);
    assert.equal(profile.skills[1]?.proficiency, null);
  });

  void it('updates only the authenticated profile identity supplied by the service caller', async () => {
    let updatedUserId: string | undefined;
    const repository = createRepository({
      updateProfile: (userId) => {
        updatedUserId = userId;
        return Promise.resolve();
      },
    });
    const service = createProfileService(repository);

    await service.updateOwnProfile(ownerId, { fullName: 'Updated Student' });

    assert.equal(updatedUserId, ownerId);
  });

  void it('prevents duplicate skills while supporting update and removal', async () => {
    const taxonomy = new Map<string, string>();
    let updated = false;
    let removed = false;
    const repository = createRepository({
      addSkill: (_userId, input) => {
        taxonomy.set(input.name.toLowerCase(), input.name);
        return Promise.resolve();
      },
      removeSkill: (userId, id) => {
        removed = userId === ownerId && id === skillId;
        return Promise.resolve(removed);
      },
      updateSkill: (userId, id, proficiency) => {
        updated = userId === ownerId && id === skillId && proficiency === 5;
        return Promise.resolve(updated);
      },
    });
    const service = createProfileService(repository);

    await service.addSkill(ownerId, { name: 'TypeScript', proficiency: 4 });
    await service.addSkill(ownerId, { name: 'typescript', proficiency: 5 });
    await service.updateSkill(ownerId, skillId, 5);
    await service.removeSkill(ownerId, skillId);

    assert.equal(taxonomy.size, 1);
    assert.equal(updated, true);
    assert.equal(removed, true);
  });

  void it('prevents duplicate interests and removes only the owned relationship', async () => {
    const taxonomy = new Set<string>();
    let removed = false;
    const repository = createRepository({
      addInterest: (_userId, name) => {
        taxonomy.add(name.toLowerCase());
        return Promise.resolve();
      },
      removeInterest: (userId, id) => {
        removed = userId === ownerId && id === interestId;
        return Promise.resolve(removed);
      },
    });
    const service = createProfileService(repository);

    await service.addInterest(ownerId, 'Robotics');
    await service.addInterest(ownerId, 'robotics');
    await service.removeInterest(ownerId, interestId);

    assert.equal(taxonomy.size, 1);
    assert.equal(removed, true);
  });

  void it('rejects achievement modification when ownership does not match', async () => {
    const service = createProfileService(
      createRepository({
        updateAchievement: (userId) => Promise.resolve(userId === ownerId),
      }),
    );

    await assert.rejects(
      service.updateAchievement(otherUserId, achievementId, { title: 'Changed' }),
      (error: unknown) => error instanceof AppError && error.code === 'ACHIEVEMENT_NOT_FOUND',
    );
  });

  void it('rejects portfolio modification when ownership does not match', async () => {
    const service = createProfileService(
      createRepository({
        updatePortfolioLink: (userId) => Promise.resolve(userId === ownerId),
      }),
    );

    await assert.rejects(
      service.updatePortfolioLink(otherUserId, portfolioLinkId, { label: 'Changed' }),
      (error: unknown) => error instanceof AppError && error.code === 'PORTFOLIO_LINK_NOT_FOUND',
    );
  });
});

void it('public profile projections exclude newly introduced professional details', async () => {
  const record = {
    ...createRecord(),
    professionalDetails: { headline: 'Owner-only private headline' },
  };
  const service = createProfileService(
    createRepository({ findByUserId: () => Promise.resolve(record) }),
  );
  const view = await service.getPublicProfile(ownerId);
  assert.ok(!JSON.stringify(view).includes('Owner-only private headline'));
  assert.ok(!('professionalDetails' in view));
});
