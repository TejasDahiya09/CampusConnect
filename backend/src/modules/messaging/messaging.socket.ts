import type { Server as HttpServer } from 'node:http';
import { Server, type Socket } from 'socket.io';
import { decodeJwt } from 'jose';
import { env } from '../../config/env.js';
import { AccountStatus } from '../../generated/prisma/client.js';
import { authUserRepository } from '../auth/auth.repository.js';
import { verifySupabaseAccessToken } from '../auth/supabase-jwt.js';
import { messagingEvents } from './messaging.events.js';
import { notificationEvents } from '../notifications/notifications.events.js';

export interface MessagingSocketIdentity {
  readonly userId: string;
  readonly expiresAt: number;
}
export type ResolveMessagingUser = (token: string) => Promise<MessagingSocketIdentity>;
const resolveMessagingUser: ResolveMessagingUser = async (token) => {
  const identity = await verifySupabaseAccessToken(token);
  // Decode expiration only AFTER signature/issuer/audience verification of this exact token.
  const expiration = decodeJwt(token).exp;
  const user = await authUserRepository.findById(identity.id);
  if (!user || user.status !== AccountStatus.ACTIVE || typeof expiration !== 'number')
    throw new Error('Account is unavailable.');
  return { userId: user.id, expiresAt: expiration * 1000 };
};

export const attachMessagingSocket = (
  server: HttpServer,
  authenticate: ResolveMessagingUser = resolveMessagingUser,
  revalidateMs = 30_000,
  authenticationTimeoutMs = 5_000,
): Server => {
  const io = new Server(server, {
    cors: { credentials: true, origin: env.frontendUrl },
    path: '/socket.io',
  });
  const sessions = new Map<
    string,
    {
      socket: Socket;
      token: string;
      identity: MessagingSocketIdentity;
      expiry?: ReturnType<typeof setTimeout>;
    }
  >();
  const valid = (identity: MessagingSocketIdentity) =>
    Boolean(identity.userId) &&
    Number.isFinite(identity.expiresAt) &&
    identity.expiresAt > Date.now();
  const authenticateBounded = async (token: string) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        authenticate(token),
        new Promise<never>((_resolve, reject) => {
          timer = setTimeout(
            () => reject(new Error('Authentication unavailable.')),
            authenticationTimeoutMs,
          );
          timer.unref();
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  };
  const scheduleExpiry = (session: {
    socket: Socket;
    identity: MessagingSocketIdentity;
    expiry?: ReturnType<typeof setTimeout>;
  }) => {
    if (session.expiry) clearTimeout(session.expiry);
    session.expiry = setTimeout(
      () => {
        if (session.identity.expiresAt <= Date.now()) session.socket.disconnect(true);
        else scheduleExpiry(session);
      },
      Math.min(2_147_483_647, Math.max(1, session.identity.expiresAt - Date.now())),
    );
    session.expiry.unref();
  };
  const authorize = async (session: NonNullable<ReturnType<typeof sessions.get>>) => {
    try {
      if (!valid(session.identity)) throw new Error('Expired');
      const current = await authenticateBounded(session.token);
      if (!valid(current) || current.userId !== session.identity.userId)
        throw new Error('Unavailable');
      session.identity = current;
      return session.socket.connected && sessions.get(session.socket.id) === session;
    } catch {
      session.socket.disconnect(true);
      return false;
    }
  };
  io.use((socket, next) => {
    void (async () => {
      try {
        const auth: unknown = socket.handshake.auth;
        const token = auth && typeof auth === 'object' && 'token' in auth ? auth.token : undefined;
        if (typeof token !== 'string' || !token || token.length > 8192)
          return next(new Error('Authentication is required.'));
        const identity = await authenticateBounded(token);
        if (!valid(identity)) return next(new Error('Authentication failed.'));
        // Do not retain bearer material in client-supplied handshake data.
        socket.handshake.auth = {};
        const session = { socket, token, identity };
        sessions.set(socket.id, session);
        socket.once('disconnect', () => {
          const saved = sessions.get(socket.id);
          if (saved?.expiry) clearTimeout(saved.expiry);
          sessions.delete(socket.id);
        });
        await socket.join('user:' + identity.userId);
        scheduleExpiry(session);
        next();
      } catch {
        next(new Error('Authentication failed.'));
      }
    })();
  });
  // Authoritative authentication/account lookup before EVERY private emission; no eligibility cache.
  const deliver = async (event: string, payload: unknown, ids: readonly string[]) => {
    const targets = new Set(ids);
    await Promise.all(
      [...sessions.values()]
        .filter((s) => targets.has(s.identity.userId))
        .map(async (session) => {
          if (await authorize(session)) {
            if (valid(session.identity)) session.socket.emit(event, payload);
            else session.socket.disconnect(true);
          }
        }),
    );
  };
  const emitMessage = (message: unknown, ids: readonly string[]) => {
    void deliver('message:new', message, ids).catch(() =>
      console.error('Messaging private delivery failed.'),
    );
  };
  const emitNotification = (notification: unknown, id: string) => {
    void deliver('notification:created', notification, [id]).catch(() =>
      console.error('Notification private delivery failed.'),
    );
  };
  const emitRead = (payload: { conversationId: string }, ids: readonly string[]) => {
    void deliver('messages:read', payload, ids).catch(() =>
      console.error('Messaging read invalidation delivery failed.'),
    );
  };
  messagingEvents.on('message', emitMessage);
  messagingEvents.on('read', emitRead);
  notificationEvents.on('created', emitNotification);
  const revalidation = setInterval(
    () => {
      for (const session of sessions.values()) void authorize(session);
    },
    Math.max(10, revalidateMs),
  );
  revalidation.unref();
  const cleanup = () => {
    clearInterval(revalidation);
    for (const session of sessions.values()) if (session.expiry) clearTimeout(session.expiry);
    sessions.clear();
    messagingEvents.off('message', emitMessage);
    messagingEvents.off('read', emitRead);
    notificationEvents.off('created', emitNotification);
    server.off('close', cleanup);
    io.engine.off('close', cleanup);
  };
  server.once('close', cleanup);
  io.engine.once('close', cleanup);
  return io;
};
