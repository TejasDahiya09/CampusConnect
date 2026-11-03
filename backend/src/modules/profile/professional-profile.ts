import { createHash } from 'node:crypto';
import type { PrismaClient } from '../../generated/prisma/client.js';
import { Router, type RequestHandler } from 'express';
import { prisma } from '../../database/prisma.js';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { AppError, ValidationError } from '../../errors/app-error.js';
import { sendSuccess } from '../../utils/api-response.js';

export interface ProfessionalDetails {
  readonly headline: string | null;
  readonly education: readonly { institution: string; qualification: string }[];
  readonly experience: readonly { role: string; organization: string; description: string }[];
}
const invalid = (): never => {
  throw new ValidationError('Check the professional profile fields.', [
    { field: 'professional', message: 'Use the supported fields and length limits.' },
  ]);
};
const object = (v: unknown, keys: readonly string[]): Record<string, unknown> => {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).some((k) => !keys.includes(k))
  )
    return invalid();
  return v as Record<string, unknown>;
};
const text = (v: unknown, max: number, required = false): string => {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim())) return invalid();
  return v.trim();
};
/** Full replacement of this owner-only document; never overload bio or portfolio labels. */
export const parseProfessionalDetails = (input: unknown): ProfessionalDetails => {
  const v = object(input, ['headline', 'education', 'experience']);
  const headline = v.headline === null ? null : text(v.headline, 180) || null;
  if (
    !Array.isArray(v.education) ||
    v.education.length > 5 ||
    !Array.isArray(v.experience) ||
    v.experience.length > 5
  )
    return invalid();
  const education = v.education.map((entry: unknown) => {
    const e = object(entry, ['institution', 'qualification']);
    return {
      institution: text(e.institution, 180, true),
      qualification: text(e.qualification, 180),
    };
  });
  const experience = v.experience.map((entry: unknown) => {
    const e = object(entry, ['role', 'organization', 'description']);
    return {
      role: text(e.role, 180, true),
      organization: text(e.organization, 180),
      description: text(e.description, 1000),
    };
  });
  return { headline, education, experience };
};
export const professionalVersion = (value: unknown): string =>
  createHash('sha256')
    .update(JSON.stringify(value === null ? null : parseProfessionalDetails(value)))
    .digest('hex');

export interface ProfessionalStore {
  read(userId: string): Promise<unknown>;
  write(
    userId: string,
    input: ProfessionalDetails,
    expectedVersion: string,
  ): Promise<boolean | 'conflict'>;
}
export const createProfessionalStore = (client: PrismaClient = prisma): ProfessionalStore => ({
  read: async (userId) =>
    (
      await client.professionalProfile.findFirst({
        where: { userId, user: { status: 'ACTIVE' } },
        select: { details: true },
      })
    )?.details ?? null,
  write: async (userId, input, expectedVersion) =>
    client.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM public.users WHERE id = ${userId}::uuid FOR UPDATE`;
      const user = await tx.user.findUnique({
        where: { id: userId },
        select: { status: true, profile: { select: { userId: true } } },
      });
      if (user?.status !== 'ACTIVE' || !user.profile) return false;
      const current = await tx.professionalProfile.findUnique({
        where: { userId },
        select: { details: true },
      });
      if (professionalVersion(current?.details ?? null) !== expectedVersion) return 'conflict';
      const details = {
        headline: input.headline,
        education: input.education.map((e) => ({ ...e })),
        experience: input.experience.map((e) => ({ ...e })),
      };
      await tx.professionalProfile.upsert({
        where: { userId },
        create: { userId, details },
        update: { details },
      });
      return true;
    }),
});
export const professionalStore = createProfessionalStore();
const storageFailure = () =>
  new AppError({
    code: 'PROFESSIONAL_STORAGE_ERROR',
    message: 'Professional details could not be accessed. Try again.',
    statusCode: 503,
  });
export const createProfessionalRouter = (
  ready: boolean,
  store: ProfessionalStore,
  requireAuth: RequestHandler = authenticationMiddleware.requireAuth,
) => {
  const router = Router();
  router.use(requireAuth, (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (!req.auth || req.auth.user.status !== 'ACTIVE')
      return next(
        new AppError({
          code: 'PROFILE_ACCESS_DENIED',
          message: 'An active account is required.',
          statusCode: 403,
        }),
      );
    next();
  });
  router.get('/', async (req, res) => {
    let raw: unknown;
    try {
      raw = ready ? await store.read(req.auth!.user.id) : null;
    } catch {
      throw storageFailure();
    }
    return sendSuccess(res, {
      professional: {
        available: ready,
        version: ready ? professionalVersion(raw) : null,
        details: raw === null ? null : parseProfessionalDetails(raw),
      },
    });
  });
  router.put('/', async (req, res) => {
    if (!ready)
      throw new AppError({
        code: 'PROFESSIONAL_STORAGE_PENDING',
        message: 'Professional details storage requires an approved migration.',
        statusCode: 503,
      });
    const details = parseProfessionalDetails(req.body);
    const condition = req.get('if-match');
    if (!condition)
      throw new AppError({
        code: 'PROFESSIONAL_VERSION_REQUIRED',
        message: 'Reload professional details before saving.',
        statusCode: 428,
      });
    if (!/^"[a-f0-9]{64}"$/.test(condition))
      throw new ValidationError('Invalid professional version.', []);
    let result: boolean | 'conflict';
    try {
      result = await store.write(req.auth!.user.id, details, condition.slice(1, -1));
    } catch {
      throw storageFailure();
    }
    if (result === 'conflict')
      throw new AppError({
        code: 'PROFESSIONAL_CONFLICT',
        message: 'Professional details changed. Review the latest version before saving.',
        statusCode: 409,
      });
    if (!result)
      throw new AppError({
        code: 'PROFILE_ACCESS_DENIED',
        message: 'This profile cannot be updated.',
        statusCode: 403,
      });
    return sendSuccess(res, {
      professional: { available: true, details, version: professionalVersion(details) },
    });
  });
  return router;
};
export const professionalProfileRouter = createProfessionalRouter(
  process.env.PROFILE_PROFESSIONAL_STORAGE_READY === 'true',
  professionalStore,
);
