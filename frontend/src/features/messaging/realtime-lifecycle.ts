import type { Socket } from 'socket.io-client';
import type { MessageView } from './messaging.types';
import type { NotificationView } from '../notifications/notifications.types';

export type ConnectionState =
  | 'connecting'
  | 'connected'
  | 'disconnected'
  | 'authentication-unavailable'
  | 'authentication-rejected'
  | 'logged-out';
export interface RealtimeSession {
  access_token: string;
  user: { id: string };
  expires_at?: number;
}
export interface RealtimeSubscriber {
  userId?: string;
  message?: (message: MessageView) => void;
  notification?: (notification: NotificationView) => void;
  read?: (value: { conversationId: string }) => void;
  state?: (state: ConnectionState) => void;
  restored?: () => void;
}
export interface RealtimeSource {
  session: () => Promise<RealtimeSession | null>;
  watch: (change: (session: RealtimeSession | null) => void) => () => void;
  socket: (auth: (done: (credentials: { token?: string }) => void) => void) => Socket;
}

/** One ref-counted physical socket per tab. No tokens/messages enter cross-tab storage. */
export function createRealtimeLifecycle(source: RealtimeSource) {
  const listeners = new Set<RealtimeSubscriber>();
  let socket: Socket | undefined,
    current: RealtimeSession | null = null;
  let unwatch: (() => void) | undefined,
    revision = 0,
    state: ConnectionState = 'logged-out';
  let socketOwner = '',
    socketToken = '';
  let managerFailure: (() => void) | undefined;
  const valid = (session: RealtimeSession | null): session is RealtimeSession =>
    !!session?.user.id &&
    !!session.access_token &&
    (session.expires_at === undefined || session.expires_at * 1000 > Date.now());
  const publish = (next: ConnectionState) => {
    state = next;
    for (const listener of listeners)
      listener.state?.(
        listener.userId && listener.userId !== current?.user.id ? 'logged-out' : next,
      );
  };
  const stopSocket = () => {
    socket?.removeAllListeners();
    if (managerFailure) socket?.io.off('reconnect_failed', managerFailure);
    managerFailure = undefined;
    socket?.disconnect();
    socket = undefined;
    socketOwner = '';
    socketToken = '';
  };
  const dispatch = (run: (listener: RealtimeSubscriber) => void) => {
    if (!valid(current) || socketOwner !== current.user.id) return;
    for (const listener of listeners) if (listener.userId === current.user.id) run(listener);
  };
  const apply = (session: RealtimeSession | null) => {
    current = session;
    if (!valid(session)) {
      stopSocket();
      publish(session ? 'authentication-unavailable' : 'logged-out');
      return;
    }
    for (const listener of listeners) listener.userId ??= session.user.id;
    if (![...listeners].some((listener) => listener.userId === session.user.id)) {
      stopSocket();
      return;
    }
    if (socket && socketOwner === session.user.id && socketToken === session.access_token) return;
    stopSocket();
    socketOwner = session.user.id;
    socketToken = session.access_token;
    const owner = socketOwner;
    const candidate = source.socket((done) => {
      const request = revision;
      void source
        .session()
        .then((latest) => {
          if (
            candidate !== socket ||
            request !== revision ||
            !valid(latest) ||
            latest.user.id !== owner ||
            current?.user.id !== owner
          ) {
            done({});
            return;
          }
          current = latest;
          socketToken = latest.access_token;
          done({ token: latest.access_token });
        })
        .catch(() => {
          if (candidate === socket) {
            stopSocket();
            publish('authentication-unavailable');
          }
          done({});
        });
    });
    socket = candidate;
    candidate.on('connect', () => {
      if (socket !== candidate) return;
      publish('connected');
      dispatch((listener) => listener.restored?.());
    });
    candidate.on('message:new', (message: MessageView) => {
      if (socket === candidate) dispatch((listener) => listener.message?.(message));
    });
    candidate.on('notification:created', (notification: NotificationView) => {
      if (socket === candidate) dispatch((listener) => listener.notification?.(notification));
    });
    candidate.on('messages:read', (value: { conversationId: string }) => {
      if (socket === candidate) dispatch((listener) => listener.read?.(value));
    });
    candidate.on('disconnect', (reason: string) => {
      if (socket !== candidate) return;
      publish(reason === 'io server disconnect' ? 'authentication-rejected' : 'disconnected');
      // Server-enforced revocation never loops with the same credential.
      if (reason === 'io server disconnect') void recover(false);
    });
    candidate.on('connect_error', () => {
      if (socket === candidate)
        publish(candidate.active ? 'disconnected' : 'authentication-rejected');
    });
    managerFailure = () => {
      if (socket === candidate) publish('disconnected');
    };
    candidate.io.on('reconnect_failed', managerFailure);
    publish('connecting');
    candidate.connect();
  };
  const recover = async (restart: boolean) => {
    const request = revision;
    try {
      const latest = await source.session();
      if (!listeners.size || revision !== request) return;
      const same =
        socket &&
        valid(latest) &&
        latest.user.id === socketOwner &&
        latest.access_token === socketToken;
      if (same) {
        if (restart && state !== 'authentication-rejected' && !socket!.connected) socket!.connect();
      } else apply(latest);
    } catch {
      if (listeners.size && revision === request) {
        stopSocket();
        publish('authentication-unavailable');
      }
    }
  };
  return {
    subscribe(listener: RealtimeSubscriber) {
      listeners.add(listener);
      if (!unwatch) {
        unwatch = source.watch((session) => {
          // Stop old-account events synchronously, before any queued auth work.
          if (
            !session ||
            current?.user.id !== session?.user.id ||
            current?.access_token !== session?.access_token
          ) {
            ++revision;
            stopSocket();
          }
          current = session;
          queueMicrotask(() => {
            if (listeners.size && current === session) apply(session);
          });
        });
        void recover(true);
      } else {
        listener.state?.(
          listener.userId && listener.userId !== current?.user.id ? 'logged-out' : state,
        );
        if (current) apply(current);
      }
      return {
        disconnect() {
          listeners.delete(listener);
          if (!listeners.size) {
            ++revision;
            stopSocket();
            unwatch?.();
            unwatch = undefined;
            current = null;
            state = 'logged-out';
          }
        },
      };
    },
    resume() {
      void recover(true);
    },
  };
}
