import {
  requireActiveServicesAccount,
  runServicesTransaction,
  servicePerson,
} from './services-policy.js';
import { randomUUID } from 'node:crypto';
import { prisma } from '../../database/prisma.js';
import {
  AccountStatus,
  ModerationVisibility,
  type Prisma,
  ServiceStatus,
} from '../../generated/prisma/client.js';
import type {
  PricingType,
  ServiceCreateInput,
  ServiceQuery,
  ServiceRequestRecord,
  ServiceRequestStatus,
  ServicesWorkspace,
  ServiceUpdateInput,
  ServiceView,
} from './services.types.js';
const select = {
  bookings: true,
  category: true,
  createdAt: true,
  description: true,
  featuredOnLanding: true,
  id: true,
  location: true,
  moderationVisibility: true,
  price: true,
  provider: {
    select: {
      id: true,
      status: true,
      profile: {
        select: { avatar: true, department: true, fullName: true, moderationVisibility: true },
      },
    },
  },
  providerId: true,
  skills: true,
  status: true,
  title: true,
  updatedAt: true,
} satisfies Prisma.ServiceSelect;
type Row = Prisma.ServiceGetPayload<{ select: typeof select }>;
const requests = (value: Prisma.JsonValue): ServiceRequestRecord[] =>
  !Array.isArray(value)
    ? []
    : value.flatMap((item) => {
        if (typeof item !== 'object' || item === null || Array.isArray(item)) return [];
        const row = item as Record<string, Prisma.JsonValue>;
        if (
          typeof row.id !== 'string' ||
          typeof row.requesterId !== 'string' ||
          typeof row.createdAt !== 'string' ||
          typeof row.updatedAt !== 'string' ||
          typeof row.status !== 'string' ||
          !['PENDING', 'ACCEPTED', 'REJECTED', 'COMPLETED'].includes(row.status)
        )
          return [];
        return [
          {
            createdAt: row.createdAt,
            id: row.id,
            message: typeof row.message === 'string' ? row.message : null,
            requesterId: row.requesterId,
            reviewedAt: typeof row.reviewedAt === 'string' ? row.reviewedAt : null,
            status: row.status as ServiceRequestStatus,
            updatedAt: row.updatedAt,
          },
        ];
      });
const json = (value: readonly ServiceRequestRecord[]) => value as unknown as Prisma.InputJsonArray;
const pricing = (price: Prisma.Decimal | null): PricingType =>
  price === null ? 'NEGOTIABLE' : price.isZero() ? 'FREE' : 'FIXED';
const view = (row: Row, viewerId?: string): ServiceView => {
  const bookings = requests(row.bookings);
  const ownRequests = bookings.filter((item) => item.requesterId === viewerId);
  // Creation time is authoritative; append order resolves same-millisecond ties.
  const createdTime = (item: ServiceRequestRecord) => {
    const time = Date.parse(item.createdAt);
    return Number.isFinite(time) ? time : 0;
  };
  const latest = ownRequests.reduce<ServiceRequestRecord | null>(
    (last, item) => (!last || createdTime(item) >= createdTime(last) ? item : last),
    null,
  );
  return {
    category: row.category,
    createdAt: row.createdAt.toISOString(),
    description: row.description,
    ...(viewerId === row.providerId ? { featuredOnLanding: row.featuredOnLanding } : {}),
    id: row.id,
    location: row.location,
    price: row.price?.toFixed(2) ?? null,
    pricingType: pricing(row.price),
    provider: servicePerson(row.provider),
    providerId: row.providerId,
    requestCount: bookings.length,
    skills: row.skills,
    status: row.status,
    title: row.title,
    updatedAt: row.updatedAt.toISOString(),
    viewerIsProvider: viewerId === row.providerId,
    viewerRequestStatus: latest?.status ?? null,
    viewerCanRequest:
      viewerId !== undefined &&
      viewerId !== row.providerId &&
      row.status === ServiceStatus.ACTIVE &&
      row.moderationVisibility === ModerationVisibility.VISIBLE &&
      row.provider.status === AccountStatus.ACTIVE &&
      !ownRequests.some((item) => item.status === 'PENDING' || item.status === 'ACCEPTED'),
  };
};
const people = async (ids: readonly string[], db: typeof prisma) => {
  const users = await db.user.findMany({
    select: {
      id: true,
      status: true,
      profile: {
        select: { avatar: true, department: true, fullName: true, moderationVisibility: true },
      },
    },
    where: { id: { in: [...new Set(ids)] } },
  });
  return new Map(users.map((user) => [user.id, servicePerson(user)]));
};
export type RequestMutationResult =
  | { kind: 'request'; request: ServiceRequestRecord; service: ServiceView }
  | { kind: 'conflict' | 'forbidden' | 'not-found' };
export const createServicesRepository = (db: typeof prisma = prisma) => {
  const transact = <T>(run: (tx: Prisma.TransactionClient) => Promise<T>) =>
    runServicesTransaction(db, run);
  return {
    create: async (providerId: string, input: ServiceCreateInput) =>
      transact(async (tx) => {
        await requireActiveServicesAccount(tx, providerId, true);
        return view(
          await tx.service.create({
            data: {
              category: input.category,
              description: input.description,
              featuredOnLanding: input.featuredOnLanding ?? false,
              location: input.location,
              price: input.price,
              providerId,
              skills: [...input.skills],
              title: input.title,
            },
            select,
          }),
          providerId,
        );
      }),
    find: async (id: string, viewerId?: string) => {
      const row = await db.service.findFirst({
        select,
        where: {
          id,
          OR: [
            {
              moderationVisibility: ModerationVisibility.VISIBLE,
              provider: { status: AccountStatus.ACTIVE },
            },
            ...(viewerId
              ? [
                  { providerId: viewerId },
                  { bookings: { array_contains: [{ requesterId: viewerId }] } },
                ]
              : []),
          ],
        },
      });
      return row ? view(row, viewerId) : null;
    },
    list: async (query: ServiceQuery, viewerId?: string) => {
      const bounds = {
        ...(query.minPrice === undefined ? {} : { gte: query.minPrice }),
        ...(query.maxPrice === undefined ? {} : { lte: query.maxPrice }),
      };
      const priceFilter =
        query.pricingType === 'NEGOTIABLE'
          ? null
          : query.pricingType || query.minPrice !== undefined || query.maxPrice !== undefined
            ? {
                ...bounds,
                ...(query.pricingType === 'FREE'
                  ? { equals: 0 }
                  : query.pricingType === 'FIXED'
                    ? { gt: 0 }
                    : {}),
              }
            : undefined;
      const where: Prisma.ServiceWhereInput = {
        moderationVisibility: ModerationVisibility.VISIBLE,
        provider: { status: AccountStatus.ACTIVE },
        ...(query.category ? { category: { equals: query.category, mode: 'insensitive' } } : {}),
        ...(query.search
          ? {
              OR: [
                { title: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
                { category: { contains: query.search, mode: 'insensitive' } },
                { skills: { has: query.search } },
              ],
            }
          : {}),
        ...(query.status ? { status: query.status } : {}),
        ...(priceFilter === undefined ? {} : { price: priceFilter }),
      };
      const orderBy: Prisma.ServiceOrderByWithRelationInput[] =
        query.sort === 'oldest'
          ? [{ createdAt: 'asc' }, { id: 'asc' }]
          : query.sort === 'price_asc'
            ? [{ price: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }]
            : query.sort === 'price_desc'
              ? [{ price: { sort: 'desc', nulls: 'last' } }, { id: 'asc' }]
              : [{ createdAt: 'desc' }, { id: 'desc' }];
      const [rows, total] = await Promise.all([
        db.service.findMany({
          orderBy,
          select,
          skip: (query.page - 1) * query.limit,
          take: query.limit,
          where,
        }),
        db.service.count({ where }),
      ]);
      return { items: rows.map((row) => view(row, viewerId)), total };
    },
    update: async (providerId: string, id: string, input: ServiceUpdateInput) =>
      transact(async (tx) => {
        await requireActiveServicesAccount(tx, providerId, true);
        const current = await tx.service.findUnique({
          select: { providerId: true, status: true },
          where: { id, moderationVisibility: ModerationVisibility.VISIBLE },
        });
        if (!current) return 'not-found' as const;
        if (current.providerId !== providerId) return 'forbidden' as const;
        if (current.status === ServiceStatus.ARCHIVED) return 'conflict' as const;
        const data: Prisma.ServiceUpdateInput = {
          ...(input.category === undefined ? {} : { category: input.category }),
          ...(input.description === undefined ? {} : { description: input.description }),
          ...(input.featuredOnLanding === undefined
            ? {}
            : { featuredOnLanding: input.featuredOnLanding }),
          ...(input.location === undefined ? {} : { location: input.location }),
          ...(input.price === undefined ? {} : { price: input.price }),
          ...(input.skills === undefined ? {} : { skills: [...input.skills] }),
          ...(input.title === undefined ? {} : { title: input.title }),
        };
        return view(await tx.service.update({ data, select, where: { id } }), providerId);
      }),
    request: async (
      requesterId: string,
      id: string,
      message: string | null,
    ): Promise<
      | (ServiceRequestRecord & { notificationTarget: { providerId: string; title: string } })
      | 'not-found'
      | 'forbidden'
      | 'conflict'
    > =>
      transact(async (tx) => {
        await requireActiveServicesAccount(tx, requesterId, true);
        const row = await tx.service.findFirst({
          select: { bookings: true, providerId: true, status: true, title: true },
          where: {
            id,
            moderationVisibility: ModerationVisibility.VISIBLE,
            provider: { status: AccountStatus.ACTIVE },
          },
        });
        if (!row || row.status !== ServiceStatus.ACTIVE) return 'not-found' as const;
        if (row.providerId === requesterId) return 'forbidden' as const;
        await requireActiveServicesAccount(tx, row.providerId, true);
        const current = requests(row.bookings);
        if (
          current.some(
            (item) =>
              item.requesterId === requesterId && ['PENDING', 'ACCEPTED'].includes(item.status),
          )
        )
          return 'conflict' as const;
        const now = new Date().toISOString();
        const request: ServiceRequestRecord = {
          createdAt: now,
          id: randomUUID(),
          message,
          requesterId,
          reviewedAt: null,
          status: 'PENDING',
          updatedAt: now,
        };
        await tx.service.update({ data: { bookings: json([...current, request]) }, where: { id } });
        return { ...request, notificationTarget: { providerId: row.providerId, title: row.title } };
      }),
    mutateRequest: async (
      providerId: string,
      serviceId: string,
      requestId: string,
      status: 'ACCEPTED' | 'REJECTED' | 'COMPLETED',
    ): Promise<RequestMutationResult> =>
      transact(async (tx) => {
        await requireActiveServicesAccount(tx, providerId, true);
        const row = await tx.service.findUnique({ select, where: { id: serviceId } });
        if (!row) return { kind: 'not-found' };
        if (row.providerId !== providerId) return { kind: 'forbidden' };
        const current = requests(row.bookings);
        const index = current.findIndex(({ id }) => id === requestId);
        const old = current[index];
        if (!old) return { kind: 'not-found' };
        const valid = status === 'COMPLETED' ? old.status === 'ACCEPTED' : old.status === 'PENDING';
        if (!valid) return { kind: 'conflict' };
        if (
          status === 'ACCEPTED' &&
          (row.status !== ServiceStatus.ACTIVE ||
            row.moderationVisibility !== ModerationVisibility.VISIBLE)
        )
          return { kind: 'conflict' };
        // Completion/rejection close historical obligations; acceptance grants new engagement.
        if (status === 'ACCEPTED') await requireActiveServicesAccount(tx, old.requesterId, true);
        const now = new Date().toISOString();
        const request = { ...old, reviewedAt: old.reviewedAt ?? now, status, updatedAt: now };
        current[index] = request;
        const updated = await tx.service.update({
          data: { bookings: json(current) },
          select,
          where: { id: serviceId },
        });
        return { kind: 'request', request, service: view(updated, providerId) };
      }),
    workspace: async (userId: string): Promise<ServicesWorkspace> => {
      await requireActiveServicesAccount(db, userId);
      const [providedRows, requestedRows] = await Promise.all([
        db.service.findMany({
          orderBy: { updatedAt: 'desc' },
          select,
          where: { providerId: userId },
        }),
        db.service.findMany({
          orderBy: { updatedAt: 'desc' },
          select,
          where: { bookings: { array_contains: [{ requesterId: userId }] } },
        }),
      ]);
      const all = providedRows.flatMap((row) => requests(row.bookings));
      const byId = await people(
        all.map(({ requesterId }) => requesterId),
        db,
      );
      const received = providedRows.flatMap((row) =>
        requests(row.bookings).flatMap((request) => {
          const requester = byId.get(request.requesterId);
          return requester ? [{ ...request, requester, service: view(row, userId) }] : [];
        }),
      );
      const requested = requestedRows.flatMap((row) =>
        requests(row.bookings)
          .filter(({ requesterId }) => requesterId === userId)
          .map((request) => ({
            ...request,
            requester: { avatar: null, department: null, displayName: 'You', id: userId },
            service: view(row, userId),
          })),
      );
      return { provided: providedRows.map((row) => view(row, userId)), received, requested };
    },
    transition: async (providerId: string, id: string, status: ServiceStatus) =>
      transact(async (tx) => {
        await requireActiveServicesAccount(tx, providerId, true);
        const row = await tx.service.findUnique({
          select: { providerId: true, status: true },
          where: { id, moderationVisibility: ModerationVisibility.VISIBLE },
        });
        if (!row) return 'not-found' as const;
        if (row.providerId !== providerId) return 'forbidden' as const;
        const allowed: Record<ServiceStatus, readonly ServiceStatus[]> = {
          ACTIVE: [ServiceStatus.PAUSED, ServiceStatus.ARCHIVED],
          PAUSED: [ServiceStatus.ACTIVE, ServiceStatus.ARCHIVED],
          ARCHIVED: [],
        };
        if (!allowed[row.status].includes(status)) return 'conflict' as const;
        return view(
          await tx.service.update({ data: { status }, select, where: { id } }),
          providerId,
        );
      }),
  };
};
export const servicesRepository = createServicesRepository();
export type ServicesRepository = typeof servicesRepository;
