import {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ModerationVisibility,
  ProjectStatus,
  ServiceStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';

const variants = (query: string) => [
  ...new Set([
    query,
    query.toLowerCase(),
    query.toUpperCase(),
    query.replace(/\b\w/g, (c) => c.toUpperCase()),
  ]),
];
const textMatch = (query: string): Prisma.StringFilter => ({
  contains: query,
  mode: 'insensitive',
});

export const searchRepository = {
  students: (query: string, take: number) =>
    prisma.profile.findMany({
      orderBy: [{ updatedAt: 'desc' }, { userId: 'desc' }],
      select: {
        avatar: true,
        bio: true,
        department: true,
        fullName: true,
        interests: true,
        skills: true,
        userId: true,
      },
      take,
      where: {
        moderationVisibility: ModerationVisibility.VISIBLE,
        user: { status: AccountStatus.ACTIVE },
        OR: [
          { fullName: textMatch(query) },
          { department: textMatch(query) },
          { bio: textMatch(query) },
          { skills: { hasSome: variants(query) } },
          { interests: { hasSome: variants(query) } },
        ],
      },
    }),
  marketplace: (query: string, take: number) =>
    prisma.marketplace.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        category: true,
        createdAt: true,
        currency: true,
        description: true,
        id: true,
        images: true,
        location: true,
        price: true,
        title: true,
      },
      take,
      where: {
        moderationVisibility: ModerationVisibility.VISIBLE,
        seller: { status: AccountStatus.ACTIVE },
        status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] },
        OR: [
          { title: textMatch(query) },
          { description: textMatch(query) },
          { category: textMatch(query) },
          { location: textMatch(query) },
        ],
      },
    }),
  lostFound: (query: string, take: number) =>
    prisma.lostFound.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        category: true,
        createdAt: true,
        description: true,
        id: true,
        images: true,
        location: true,
        status: true,
        title: true,
        type: true,
      },
      take,
      where: {
        moderationVisibility: ModerationVisibility.VISIBLE,
        reporter: { status: AccountStatus.ACTIVE },
        status: {
          in: [LostFoundStatus.OPEN, LostFoundStatus.MATCHED, LostFoundStatus.CLAIM_PENDING],
        },
        OR: [
          { title: textMatch(query) },
          { description: textMatch(query) },
          { category: textMatch(query) },
          { location: textMatch(query) },
        ],
      },
    }),
  teamUp: (query: string, take: number) =>
    prisma.teamUp.findMany({
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: {
        category: true,
        createdAt: true,
        description: true,
        id: true,
        maxMembers: true,
        members: true,
        requiredSkills: true,
        title: true,
      },
      take,
      where: {
        moderationVisibility: ModerationVisibility.VISIBLE,
        owner: { status: AccountStatus.ACTIVE },
        status: { in: [ProjectStatus.OPEN, ProjectStatus.FULL] },
        OR: [
          { title: textMatch(query) },
          { description: textMatch(query) },
          { category: textMatch(query) },
          { requiredSkills: { hasSome: variants(query) } },
        ],
      },
    }),
  services: (query: string, take: number) =>
    prisma.service
      .findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        select: {
          category: true,
          createdAt: true,
          description: true,
          id: true,
          images: true,
          location: true,
          price: true,
          provider: {
            select: { profile: { select: { fullName: true, moderationVisibility: true } } },
          },
          skills: true,
          title: true,
        },
        take,
        where: {
          moderationVisibility: ModerationVisibility.VISIBLE,
          provider: { status: AccountStatus.ACTIVE },
          status: ServiceStatus.ACTIVE,
          OR: [
            { title: textMatch(query) },
            { description: textMatch(query) },
            { category: textMatch(query) },
            { location: textMatch(query) },
            { skills: { hasSome: variants(query) } },
          ],
        },
      })
      .then((rows) =>
        rows.map((row) => ({
          ...row,
          provider: {
            profile:
              row.provider.profile?.moderationVisibility === ModerationVisibility.VISIBLE
                ? { fullName: row.provider.profile.fullName }
                : null,
          },
        })),
      ),
};

export interface SearchRepository {
  readonly students: (
    query: string,
    take: number,
  ) => Promise<Awaited<ReturnType<typeof searchRepository.students>>>;
  readonly marketplace: (
    query: string,
    take: number,
  ) => Promise<Awaited<ReturnType<typeof searchRepository.marketplace>>>;
  readonly lostFound: (
    query: string,
    take: number,
  ) => Promise<Awaited<ReturnType<typeof searchRepository.lostFound>>>;
  readonly teamUp: (
    query: string,
    take: number,
  ) => Promise<Awaited<ReturnType<typeof searchRepository.teamUp>>>;
  readonly services: (
    query: string,
    take: number,
  ) => Promise<Awaited<ReturnType<typeof searchRepository.services>>>;
}
