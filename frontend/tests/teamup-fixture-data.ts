import type { TeamUpProject } from '../src/features/teamup/teamup.types';
export const teamUpFixtureProject: TeamUpProject = {
  id: '11111111-1111-4111-8111-111111111111',
  title: 'Campus resource exchange',
  description:
    'Synthetic QA project — not a real student record. Build a simple way for students to share useful campus resources.',
  category: 'Student initiative',
  requiredSkills: ['React', 'Research', 'UI/UX'],
  status: 'OPEN',
  maxMembers: 4,
  currentMemberCount: 1,
  deadline: '2026-12-01',
  createdAt: '2026-10-26T09:00:00Z',
  updatedAt: '2026-10-26T09:00:00Z',
  ownerId: '22222222-2222-4222-8222-222222222222',
  owner: {
    id: '22222222-2222-4222-8222-222222222222',
    displayName: 'Synthetic QA owner',
    avatar: null,
    department: null,
  },
  viewerApplicationStatus: null,
  viewerIsMember: false,
  viewerIsOwner: false,
};
