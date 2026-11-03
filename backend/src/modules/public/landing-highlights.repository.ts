import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ModerationVisibility,
  ProjectStatus,
  ServiceStatus,
} from '../../generated/prisma/client.js';
import type { LandingHighlightCandidates } from './landing-highlights.types.js';

const candidateLimit = 12;

export const landingHighlightsRepository = {
  findCandidates: async (): Promise<LandingHighlightCandidates> => {
    const [marketplace, lostFound, teamUp, services] = await Promise.all([
      prisma.marketplace.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          category: true,
          condition: true,
          createdAt: true,
          currency: true,
          id: true,
          price: true,
          title: true,
        },
        take: candidateLimit,
        where: {
          featuredOnLanding: true,
          moderationVisibility: ModerationVisibility.VISIBLE,
          seller: { status: AccountStatus.ACTIVE },
          status: ListingStatus.ACTIVE,
        },
      }),
      prisma.lostFound.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: { category: true, createdAt: true, id: true, title: true, type: true },
        take: candidateLimit,
        where: {
          featuredOnLanding: true,
          moderationVisibility: ModerationVisibility.VISIBLE,
          reporter: { status: AccountStatus.ACTIVE },
          status: LostFoundStatus.OPEN,
        },
      }),
      prisma.teamUp.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          category: true,
          createdAt: true,
          id: true,
          requiredSkills: true,
          title: true,
        },
        take: candidateLimit,
        where: {
          featuredOnLanding: true,
          moderationVisibility: ModerationVisibility.VISIBLE,
          owner: { status: AccountStatus.ACTIVE },
          status: ProjectStatus.OPEN,
        },
      }),
      prisma.service.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          category: true,
          createdAt: true,
          currency: true,
          id: true,
          price: true,
          skills: true,
          title: true,
        },
        take: candidateLimit,
        where: {
          featuredOnLanding: true,
          moderationVisibility: ModerationVisibility.VISIBLE,
          provider: { status: AccountStatus.ACTIVE },
          status: ServiceStatus.ACTIVE,
        },
      }),
    ]);
    return { lostFound, marketplace, services, teamUp };
  },
};

export type LandingHighlightsRepository = typeof landingHighlightsRepository;
