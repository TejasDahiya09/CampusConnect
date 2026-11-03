import { boundedPublicText } from './assistant.privacy.js';
import { publicTeamCount } from './assistant-facts.js';
import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ListingStatus,
  LostFoundStatus,
  ModerationVisibility,
  ProjectStatus,
  ServiceStatus,
  type Prisma,
} from '../../generated/prisma/client.js';
import type { AssistantCandidate, AssistantSourceType } from './assistant.types.js';

const textMatch = (term: string): Prisma.StringFilter => ({
  contains: term,
  mode: 'insensitive',
});

const arrayVariants = (terms: readonly string[]) => [
  ...new Set(terms.flatMap((term) => [term, term.toLowerCase(), term.toUpperCase()])),
];

export const buildMarketplaceAssistantWhere = (
  terms: readonly string[],
): Prisma.MarketplaceWhereInput => ({
  moderationVisibility: ModerationVisibility.VISIBLE,
  ...(terms.length
    ? {
        OR: terms.flatMap((term) => [
          { title: textMatch(term) },
          { description: textMatch(term) },
          { category: textMatch(term) },
          { location: textMatch(term) },
        ]),
      }
    : {}),
  seller: { status: AccountStatus.ACTIVE },
  status: { in: [ListingStatus.ACTIVE, ListingStatus.SOLD] },
});

export const buildLostFoundAssistantWhere = (
  terms: readonly string[],
): Prisma.LostFoundWhereInput => ({
  moderationVisibility: ModerationVisibility.VISIBLE,
  ...(terms.length
    ? {
        OR: terms.flatMap((term) => [
          { title: textMatch(term) },
          { description: textMatch(term) },
          { category: textMatch(term) },
          { location: textMatch(term) },
        ]),
      }
    : {}),
  reporter: { status: AccountStatus.ACTIVE },
  status: {
    in: [LostFoundStatus.OPEN, LostFoundStatus.MATCHED, LostFoundStatus.CLAIM_PENDING],
  },
});

export const buildTeamUpAssistantWhere = (terms: readonly string[]): Prisma.TeamUpWhereInput => ({
  moderationVisibility: ModerationVisibility.VISIBLE,
  ...(terms.length
    ? {
        OR: [
          ...terms.flatMap((term) => [
            { title: textMatch(term) },
            { description: textMatch(term) },
            { category: textMatch(term) },
          ]),
          { requiredSkills: { hasSome: arrayVariants(terms) } },
        ],
      }
    : {}),
  owner: { status: AccountStatus.ACTIVE },
  status: { in: [ProjectStatus.OPEN, ProjectStatus.FULL] },
});

export const buildServiceAssistantWhere = (terms: readonly string[]): Prisma.ServiceWhereInput => ({
  moderationVisibility: ModerationVisibility.VISIBLE,
  ...(terms.length
    ? {
        OR: [
          ...terms.flatMap((term) => [
            { title: textMatch(term) },
            { description: textMatch(term) },
            { category: textMatch(term) },
            { location: textMatch(term) },
          ]),
          { skills: { hasSome: arrayVariants(terms) } },
        ],
      }
    : {}),
  provider: { status: AccountStatus.ACTIVE },
  status: ServiceStatus.ACTIVE,
});

export interface AssistantRetrievalRepository {
  retrieve(
    sourceType: AssistantSourceType,
    terms: readonly string[],
    limit: number,
    activeOnly?: boolean,
    reportType?: 'LOST' | 'FOUND',
    requiredTerms?: readonly string[],
  ): Promise<readonly AssistantCandidate[]>;
}

export const assistantRetrievalRepository: AssistantRetrievalRepository = {
  async retrieve(
    sourceType,
    terms,
    limit,
    activeOnly = false,
    reportType,
    requiredTerms: readonly string[] = [],
  ) {
    switch (sourceType) {
      case 'MARKETPLACE': {
        const rows = await prisma.marketplace.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            category: true,
            createdAt: true,
            currency: true,
            description: true,
            id: true,
            location: true,
            price: true,
            title: true,
          },
          take: limit,
          where: {
            ...buildMarketplaceAssistantWhere(terms),
            ...(activeOnly ? { status: ListingStatus.ACTIVE } : {}),
          },
        });
        return rows.map((row) => ({
          attributes: [
            row.category,
            `${row.currency.trim()} ${row.price.toFixed(2)}`,
            ...(row.location === null ? [] : [row.location]),
          ],
          createdAt: row.createdAt,
          description: row.description ?? '',
          id: row.id,
          searchText: [row.title, row.description, row.category, row.location].join(' '),
          sourceType,
          title: row.title,
        }));
      }
      case 'LOST_FOUND': {
        const rows = await prisma.lostFound.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            category: true,
            createdAt: true,
            description: true,
            id: true,
            location: true,
            title: true,
            type: true,
            status: true,
          },
          take: limit,
          where: {
            ...buildLostFoundAssistantWhere(terms),
            ...(requiredTerms.length
              ? {
                  AND: [
                    {
                      OR: requiredTerms.flatMap((term) => [
                        { title: textMatch(term) },
                        { description: textMatch(term) },
                      ]),
                    },
                  ],
                }
              : {}),
            ...(reportType ? { type: reportType } : {}),
            ...(activeOnly ? { status: LostFoundStatus.OPEN } : {}),
          },
        });
        return rows.map((row) => ({
          attributes: [
            row.type,
            ...(row.category === null ? [] : [row.category]),
            ...(row.location === null ? [] : [row.location]),
          ],
          createdAt: row.createdAt,
          description: row.description,
          id: row.id,
          searchText: [row.title, row.description, row.category, row.location, row.type].join(' '),
          facts: {
            kind: 'LOST_FOUND' as const,
            reportType: row.type,
            status: row.status,
            location: row.location === null ? null : boundedPublicText(row.location, 180),
          },
          sourceType,
          title: row.title,
        }));
      }
      case 'TEAMUP': {
        const rows = await prisma.teamUp.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            category: true,
            createdAt: true,
            description: true,
            id: true,
            requiredSkills: true,
            maxMembers: true,
            members: true,
            status: true,
            title: true,
          },
          take: limit,
          where: {
            ...buildTeamUpAssistantWhere(terms),
            ...(activeOnly ? { status: ProjectStatus.OPEN } : {}),
          },
        });
        return rows.map((row) => ({
          attributes: [
            ...(row.category === null ? [] : [row.category]),
            ...row.requiredSkills.slice(0, 8),
          ],
          createdAt: row.createdAt,
          description: row.description,
          id: row.id,
          searchText: [row.title, row.description, row.category, ...row.requiredSkills].join(' '),
          facts: {
            kind: 'TEAMUP' as const,
            status: row.status,
            maxMembers: row.maxMembers,
            currentMembers: publicTeamCount(row.members, row.maxMembers),
          },
          sourceType,
          title: row.title,
        }));
      }
      case 'SERVICE': {
        const rows = await prisma.service.findMany({
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          select: {
            category: true,
            createdAt: true,
            description: true,
            id: true,
            location: true,
            skills: true,
            title: true,
          },
          take: limit,
          where: buildServiceAssistantWhere(terms),
        });
        return rows.map((row) => ({
          attributes: [
            row.category,
            ...(row.location === null ? [] : [row.location]),
            ...row.skills.slice(0, 8),
          ],
          createdAt: row.createdAt,
          description: row.description,
          id: row.id,
          searchText: [row.title, row.description, row.category, row.location, ...row.skills].join(
            ' ',
          ),
          sourceType,
          title: row.title,
        }));
      }
    }
  },
};
