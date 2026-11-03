import { photoLocalActivation, isPhotoLoopback } from './profile-photo-readiness.js';
import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { Router, type RequestHandler, type ErrorRequestHandler } from 'express';
import { Prisma, type PrismaClient } from '../../generated/prisma/client.js';
import { prisma } from '../../database/prisma.js';
import { authenticationMiddleware } from '../auth/auth.middleware.js';
import { AppError } from '../../errors/app-error.js';
import { sendSuccess } from '../../utils/api-response.js';
import { env } from '../../config/env.js';
import { canonicalPhoto, PHOTO_BYTES } from './profile-photo-image.js';
import { storedPhoto, predefinedAvatar, profileAvatarView } from './profile-avatar-value.js';
import { profilePhotoStorage, type PhotoStorage } from './profile-photo-storage.js';
const error = (code: string, message: string, statusCode: number) =>
  new AppError({ code, message, statusCode });
export const photoVersion = (value: unknown): string => {
  const stable = (v: unknown): unknown =>
    Array.isArray(v)
      ? v.map(stable)
      : v && typeof v === 'object'
        ? Object.fromEntries(
            Object.entries(v)
              .sort(([a], [b]) => a.localeCompare(b))
              .map(([k, x]) => [k, stable(x)]),
          )
        : v;
  return createHash('sha256')
    .update(JSON.stringify(stable(value ?? null)))
    .digest('hex');
};
export interface PhotoRepository {
  read(user: string): Promise<unknown>;
  replace(user: string, version: string, avatar: unknown): Promise<boolean>;
}
export const createPhotoRepository = (db: PrismaClient = prisma): PhotoRepository => {
  const read = async (user: string, client: Pick<Prisma.TransactionClient, 'user'> = db) => {
    const row = await client.user.findUnique({
      where: { id: user },
      select: { status: true, profile: { select: { avatar: true } } },
    });
    if (row?.status !== 'ACTIVE' || !row.profile)
      throw error('PROFILE_PHOTO_FORBIDDEN', 'An active profile is required.', 403);
    return row.profile.avatar;
  };
  return {
    read,
    replace: (user, version, avatar) =>
      db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM public.users WHERE id=${user}::uuid FOR UPDATE`;
        const current = await read(user, tx);
        if (photoVersion(current) !== version) return false;
        await tx.profile.update({
          where: { userId: user },
          data: {
            avatar:
              avatar === null
                ? Prisma.JsonNull
                : (JSON.parse(JSON.stringify(avatar)) as Prisma.InputJsonValue),
          },
        });
        return true;
      }),
  };
};
interface Ticket {
  owner: string;
  nonce: string;
  size: number;
  version: string;
  expires: number;
}
const uuid = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const validVersion = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const body = (value: unknown, keys: string[]) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((k) => !keys.includes(k))
  )
    throw error('PROFILE_PHOTO_INPUT', 'Use the supported photo fields.', 400);
  return value as Record<string, unknown>;
};
export const signPhotoTicket = (ticket: Ticket, secret: string) => {
  const payload = Buffer.from(JSON.stringify(ticket)).toString('base64url');
  return payload + '.' + createHmac('sha256', secret).update(payload).digest('base64url');
};
export function readPhotoTicket(
  raw: unknown,
  owner: string,
  secret: string,
  now: number,
  cleanup = false,
): Ticket {
  if (typeof raw !== 'string' || raw.length > 2048)
    throw error(
      'PROFILE_PHOTO_TICKET',
      'This photo upload authorization is invalid or expired.',
      400,
    );
  const [payload, signature, ...rest] = raw.split('.');
  if (!payload || !signature || rest.length)
    throw error(
      'PROFILE_PHOTO_TICKET',
      'This photo upload authorization is invalid or expired.',
      400,
    );
  const expected = createHmac('sha256', secret).update(payload).digest();
  const provided = Buffer.from(signature, 'base64url');
  if (provided.length !== expected.length || !timingSafeEqual(provided, expected))
    throw error(
      'PROFILE_PHOTO_TICKET',
      'This photo upload authorization is invalid or expired.',
      400,
    );
  let ticket: Ticket;
  try {
    ticket = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as Ticket;
  } catch {
    throw error(
      'PROFILE_PHOTO_TICKET',
      'This photo upload authorization is invalid or expired.',
      400,
    );
  }
  if (
    ticket.owner !== owner ||
    !uuid.test(ticket.owner) ||
    !uuid.test(ticket.nonce) ||
    !Number.isInteger(ticket.size) ||
    ticket.size < 1 ||
    ticket.size > PHOTO_BYTES ||
    !validVersion(ticket.version) ||
    !Number.isFinite(ticket.expires) ||
    ticket.expires > now + 300000 ||
    ticket.expires + (cleanup ? 86400000 : 0) < now
  )
    throw error(
      'PROFILE_PHOTO_TICKET',
      'This photo upload authorization is invalid or expired.',
      400,
    );
  return ticket;
}
const pending = (t: Ticket) => `profile-photos-pending/${t.owner}/${t.nonce}.png`;
export function createProfilePhotoRouter(options: {
  ready: boolean;
  secret: string;
  repository: PhotoRepository;
  storage: PhotoStorage;
  requireAuth?: RequestHandler;
  now?: () => number;
  allowedOwnerId?: string | undefined;
  localOnly?: boolean | undefined;
}) {
  const router = Router(),
    now = options.now ?? Date.now;
  const windows = new Map<string, { count: number; expires: number }>();
  const remove = async (key: string, owner?: string) => {
    try {
      await options.storage.remove(key, owner);
    } catch {
      console.warn('Profile photo cleanup requires retry; no private details logged.');
    }
  };
  router.use(options.requireAuth ?? authenticationMiddleware.requireAuth, (req, res, next) => {
    res.set('Cache-Control', 'private, no-store');
    if (req.auth?.user.status !== 'ACTIVE')
      return next(error('PROFILE_PHOTO_FORBIDDEN', 'An active account is required.', 403));
    next();
  });
  const canUsePhoto = (req: Parameters<RequestHandler>[0]) =>
    options.ready &&
    options.secret.length >= 32 &&
    (!options.allowedOwnerId || req.auth?.user.id === options.allowedOwnerId) &&
    (!options.localOnly || isPhotoLoopback(req.socket.remoteAddress));
  router.get('/', async (req, res) => {
    if (!canUsePhoto(req))
      return sendSuccess(res, { photo: { available: false, avatar: null, version: null } });
    const current = await options.repository.read(req.auth!.user.id);
    return sendSuccess(res, {
      photo: {
        available: true,
        avatar: profileAvatarView(current),
        version: photoVersion(current),
      },
    });
  });
  router.use((req, _res, next) => {
    if (!canUsePhoto(req))
      return next(
        error(
          'PROFILE_PHOTO_UNAVAILABLE',
          'Photo saving is not enabled. You can still preview a crop.',
          503,
        ),
      );
    next();
  });
  const rate: RequestHandler = (req, _res, next) => {
    const time = now();
    for (const [key, value] of windows) if (value.expires <= time) windows.delete(key);
    const id = req.auth!.user.id,
      current = windows.get(id);
    if ((current?.count ?? 0) >= 8 || (!current && windows.size >= 1000))
      return next(
        error('PROFILE_PHOTO_RATE_LIMIT', 'Please wait before trying another photo upload.', 429),
      );
    windows.set(id, {
      count: (current?.count ?? 0) + 1,
      expires: current?.expires ?? time + 60000,
    });
    next();
  };
  const conflict = () =>
    error(
      'PROFILE_PHOTO_CONFLICT',
      'Your avatar changed. Reload your profile before saving again.',
      409,
    );
  const unavailable = () =>
    error(
      'PROFILE_PHOTO_STORAGE',
      'Photo saving could not be confirmed. Reload your profile before trying again.',
      503,
    );
  router.post('/uploads', rate, async (req, res) => {
    const input = body(req.body, ['size', 'version']);
    if (
      !Number.isInteger(input.size) ||
      Number(input.size) < 1 ||
      Number(input.size) > PHOTO_BYTES ||
      !validVersion(input.version)
    )
      throw error('PROFILE_PHOTO_INPUT', 'The cropped photo or avatar version is invalid.', 400);
    const user = req.auth!.user.id,
      current = await options.repository.read(user);
    if (photoVersion(current) !== input.version) throw conflict();
    const ticket: Ticket = {
      owner: user,
      nonce: randomUUID(),
      size: Number(input.size),
      version: input.version,
      expires: now() + 300000,
    };
    let upload;
    try {
      upload = await options.storage.authorize(pending(ticket), ticket.size, user, ticket.nonce);
    } catch {
      throw unavailable();
    }
    return sendSuccess(res, {
      ticket: signPhotoTicket(ticket, options.secret),
      uploadUrl: upload.uploadUrl,
      requiredHeaders: upload.headers,
      expiresAt: new Date(ticket.expires).toISOString(),
    });
  });
  router.post('/uploads/complete', rate, async (req, res) => {
    const input = body(req.body, ['ticket']),
      user = req.auth!.user.id,
      ticket = readPhotoTicket(input.ticket, user, options.secret, now());
    const current = await options.repository.read(user);
    if (photoVersion(current) !== ticket.version) {
      await remove(pending(ticket));
      throw conflict();
    }
    const id = randomUUID(),
      objectKey = `profile-photos/${id}.png`;
    let written = false,
      committed = false,
      attempted = false,
      conflicted = false;
    try {
      const bytes = canonicalPhoto(
        await options.storage.read(pending(ticket), ticket.size, user, ticket.nonce),
      );
      written = true;
      await options.storage.put(objectKey, bytes, user);
      const next = {
        type: 'photo',
        id,
        objectKey,
        fallback: storedPhoto(current)?.fallback ?? predefinedAvatar(current),
      };
      attempted = true;
      if (!(await options.repository.replace(user, ticket.version, next))) {
        conflicted = true;
        throw conflict();
      }
      committed = true;
      const old = storedPhoto(current);
      if (old) await remove(old.objectKey, user);
      return sendSuccess(res, {
        photo: { available: true, avatar: profileAvatarView(next), version: photoVersion(next) },
      });
    } catch (e) {
      if (
        !committed &&
        written &&
        (!attempted || conflicted || (e instanceof AppError && e.statusCode === 403))
      )
        await remove(objectKey, user);
      if (e instanceof AppError) throw e;
      throw unavailable();
    } finally {
      await remove(pending(ticket));
    }
  });
  router.delete('/uploads', async (req, res) => {
    const ticket = readPhotoTicket(
      body(req.body, ['ticket']).ticket,
      req.auth!.user.id,
      options.secret,
      now(),
      true,
    );
    await remove(pending(ticket));
    return sendSuccess(res, { cancelled: true });
  });
  router.delete('/', async (req, res) => {
    const input = body(req.body, ['version']);
    if (!validVersion(input.version))
      throw error('PROFILE_PHOTO_INPUT', 'Reload your profile before removing its photo.', 400);
    const user = req.auth!.user.id,
      current = await options.repository.read(user);
    if (photoVersion(current) !== input.version) throw conflict();
    const old = storedPhoto(current);
    if (!old)
      return sendSuccess(res, {
        photo: {
          available: true,
          avatar: profileAvatarView(current),
          version: photoVersion(current),
        },
      });
    if (!(await options.repository.replace(user, input.version, old.fallback))) throw conflict();
    await remove(old.objectKey, user);
    return sendSuccess(res, {
      photo: { available: true, avatar: old.fallback, version: photoVersion(old.fallback) },
    });
  });
  const sanitize: ErrorRequestHandler = (failure, _req, _res, next) =>
    next(failure instanceof AppError ? failure : unavailable());
  router.use(sanitize);
  return router;
}
const secret = process.env.PROFILE_PHOTO_UPLOAD_SECRET ?? '';
const activation = photoLocalActivation({
  nodeEnv: env.nodeEnv,
  flag: process.env.PROFILE_PHOTO_STORAGE_READY,
  secret,
  ownerId: process.env.PROFILE_PHOTO_LOCAL_OWNER_ID,
  region: env.awsRegion,
  bucket: env.awsS3Bucket,
  deliveryUrl: env.awsCloudFrontBaseUrl,
  frontendUrl: env.frontendUrl,
});
export const profilePhotoRouter = createProfilePhotoRouter({
  ready: activation.enabled,
  secret,
  allowedOwnerId: activation.ownerId ?? undefined,
  localOnly: true,
  repository: createPhotoRepository(),
  storage: profilePhotoStorage,
});
