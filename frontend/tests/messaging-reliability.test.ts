import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { test } from 'node:test';
import type { Socket } from 'socket.io-client';
import {
  createRealtimeLifecycle,
  type RealtimeSession,
  type ConnectionState,
} from '../src/features/messaging/realtime-lifecycle.js';
import { coalesceAsync, recoverMessages } from '../src/features/messaging/messaging-recovery.js';
import { mergeMessages } from '../src/features/messaging/messaging-state.js';
import type { MessageView } from '../src/features/messaging/messaging.types.js';
const tick = () => new Promise<void>((resolve) => setImmediate(resolve));
void test('an initial session response arriving after logout cannot recreate the old socket', async () => {
  let complete: (session: RealtimeSession | null) => void = () => {};
  let change: (session: RealtimeSession | null) => void = () => {};
  let created = 0;
  const pending = new Promise<RealtimeSession | null>((resolve) => {
    complete = resolve;
  });
  const lifecycle = createRealtimeLifecycle({
    session: () => pending,
    watch: (listener) => {
      change = listener;
      return () => {};
    },
    socket: () => {
      created++;
      throw new Error('Old account socket must not be created');
    },
  });
  const sub = lifecycle.subscribe({ userId: 'a' });
  change(null);
  complete({ user: { id: 'a' }, access_token: 'synthetic-stale' });
  await tick();
  assert.equal(created, 0);
  sub.disconnect();
});
const session = (user = 'a', token = 'synthetic-1'): RealtimeSession => ({
  user: { id: user },
  access_token: token,
  expires_at: Date.now() / 1000 + 3600,
});
function harness() {
  let current: RealtimeSession | null = session();
  let change: ((value: RealtimeSession | null) => void) | undefined;
  let subscriptions = 0;
  const sockets: FakeSocket[] = [];
  class FakeSocket extends EventEmitter {
    connected = false;
    active = true;
    io = new EventEmitter();
    credentials: unknown;
    constructor(readonly auth: (done: (value: { token?: string }) => void) => void) {
      super();
    }
    connect() {
      this.auth((value) => {
        this.credentials = value;
        this.connected = !!value.token;
        if (this.connected) this.emit('connect');
      });
      return this;
    }
    disconnect() {
      this.connected = false;
      return this;
    }
  }
  const lifecycle = createRealtimeLifecycle({
    session: () => Promise.resolve(current),
    watch: (fn) => {
      change = fn;
      subscriptions++;
      return () => {
        subscriptions--;
        change = undefined;
      };
    },
    socket: (auth) => {
      const socket = new FakeSocket(auth);
      sockets.push(socket);
      return socket as unknown as Socket;
    },
  });
  return {
    lifecycle,
    sockets,
    set(value: RealtimeSession | null, notify = true) {
      current = value;
      if (notify) change?.(value);
    },
    subscriptions: () => subscriptions,
  };
}

void test('shared socket renews credentials once, rejects old account events, and cleans up at final unsubscribe', async () => {
  const h = harness(),
    states: ConnectionState[] = [],
    seen: unknown[] = [];
  const first = h.lifecycle.subscribe({
    userId: 'a',
    message: (m) => seen.push(m),
    state: (s) => states.push(s),
  });
  const second = h.lifecycle.subscribe({ userId: 'a' });
  await tick();
  assert.equal(h.sockets.length, 1);
  assert.equal(h.subscriptions(), 1);
  assert.equal(states.at(-1), 'connected');
  h.set(session('a', 'synthetic-2'));
  await tick();
  assert.equal(h.sockets.length, 2);
  assert.equal(h.sockets[0].connected, false);
  assert.deepEqual(h.sockets[1].credentials, { token: 'synthetic-2' });
  h.set(session('a', 'synthetic-2'));
  await tick();
  assert.equal(h.sockets.length, 2);
  h.sockets[0].emit('message:new', { id: 'old' });
  assert.equal(seen.length, 0);
  h.set(session('b', 'synthetic-b'));
  h.sockets[1].emit('message:new', { id: 'wrong-account' });
  await tick();
  assert.equal(seen.length, 0);
  const third = h.lifecycle.subscribe({ userId: 'b', message: (m) => seen.push(m) });
  await tick();
  h.sockets.at(-1)!.emit('message:new', { id: 'authorized' });
  assert.equal(seen.length, 1);
  first.disconnect();
  second.disconnect();
  assert.equal(h.subscriptions(), 1);
  third.disconnect();
  assert.equal(h.subscriptions(), 0);
  assert.equal(h.sockets.at(-1)!.connected, false);
});
void test('server rejection does not reconnect with the same token; refreshed auth and logout are bounded', async () => {
  const h = harness(),
    states: ConnectionState[] = [];
  const sub = h.lifecycle.subscribe({ userId: 'a', state: (s) => states.push(s) });
  await tick();
  h.sockets[0].connected = false;
  h.sockets[0].emit('disconnect', 'io server disconnect');
  await tick();
  h.lifecycle.resume();
  await tick();
  assert.equal(h.sockets.length, 1);
  assert.equal(h.sockets[0].connected, false);
  assert.equal(states.at(-1), 'authentication-rejected');
  h.set(session('a', 'synthetic-renewed'));
  await tick();
  assert.equal(h.sockets.length, 2);
  h.set(null);
  await tick();
  h.lifecycle.resume();
  await tick();
  assert.equal(h.sockets.length, 2);
  assert.equal(states.at(-1), 'logged-out');
  sub.disconnect();
});
void test('transport reconnect obtains current session instead of capturing the first token', async () => {
  const h = harness();
  let restored = 0;
  const sub = h.lifecycle.subscribe({ restored: () => restored++ });
  await tick();
  h.set(session('a', 'synthetic-new-handshake'), false);
  h.sockets[0].connected = false;
  h.sockets[0].emit('disconnect', 'transport close');
  h.sockets[0].connect();
  await tick();
  assert.deepEqual(h.sockets[0].credentials, { token: 'synthetic-new-handshake' });
  assert.equal(restored, 2);
  sub.disconnect();
});
void test('same-token auth notifications do not invalidate an in-flight reconnect handshake', async () => {
  const h = harness();
  const sub = h.lifecycle.subscribe({ userId: 'a' });
  await tick();
  h.sockets[0].connected = false;
  h.sockets[0].connect();
  h.set(session());
  await tick();
  assert.equal(h.sockets.length, 1);
  assert.equal(h.sockets[0].connected, true);
  assert.deepEqual(h.sockets[0].credentials, { token: 'synthetic-1' });
  sub.disconnect();
});
void test('expired sessions never establish a socket', async () => {
  const h = harness();
  h.set({ ...session(), expires_at: 1 });
  let state: ConnectionState | undefined;
  const sub = h.lifecycle.subscribe({
    state: (s) => {
      state = s;
    },
  });
  await tick();
  assert.equal(h.sockets.length, 0);
  assert.equal(state, 'authentication-unavailable');
  sub.disconnect();
});
const message = (n: number): MessageView => ({
  id: String(n).padStart(4, '0'),
  conversationId: 'a',
  senderId: 'b',
  sentAt: '2026-10-31T00:00:00Z',
  text: 'Synthetic recovery',
  read: false,
});
void test('bounded cursor recovery merges multiple pages and equal timestamps with concurrent events', async () => {
  let displayed: readonly MessageView[] = [message(0), message(240)],
    calls = 0;
  const rows = Array.from({ length: 235 }, (_, i) => message(i + 1));
  const result = await recoverMessages(
    '0000',
    async (after) => {
      await Promise.resolve();
      calls++;
      const start = Number(after),
        page = rows.slice(start, start + 100);
      return {
        messages: page,
        nextCursor: page.at(-1)?.id ?? after,
        hasMore: start + 100 < rows.length,
        readReceipt: 'signed-synthetic',
      };
    },
    (page) => {
      displayed = mergeMessages(displayed, page.messages);
    },
    () => true,
  );
  assert.equal(calls, 3);
  assert.equal(result.complete, true);
  assert.equal(displayed.length, 237);
  assert.equal(displayed.at(-1)?.id, '0240');
});
void test('recovery stops at documented bound and discards a response after conversation switch', async () => {
  let consumed = 0,
    active = true;
  const bound = await recoverMessages(
    '0',
    (after) =>
      Promise.resolve({
        messages: [],
        hasMore: true,
        nextCursor: String(Number(after) + 1),
        readReceipt: 'signed',
      }),
    () => {
      consumed++;
    },
    () => true,
    2,
  );
  assert.equal(consumed, 2);
  assert.equal(bound.complete, false);
  assert.equal(bound.cursor, '2');
  await recoverMessages(
    '0',
    async () => {
      await Promise.resolve();
      active = false;
      return { messages: [message(1)], hasMore: false, nextCursor: '1', readReceipt: 'signed' };
    },
    () => {
      consumed++;
    },
    () => active,
  );
  assert.equal(consumed, 2);
});
void test('burst invalidations coalesce and one trailing authoritative request covers in-flight changes', async () => {
  let calls = 0,
    release: () => void = () => {};
  const refresh = coalesceAsync(async () => {
    calls++;
    if (calls === 1)
      await new Promise<void>((resolve) => {
        release = resolve;
      });
  });
  const first = refresh();
  await tick();
  void refresh();
  void refresh();
  void refresh();
  release();
  await first;
  assert.equal(calls, 2);
});

void test('recent descending reconciliation and forward recovery share ID dedup across interrupted runs', async () => {
  let visible: readonly MessageView[] = [message(4)],
    active = true;
  const recent = [message(4), message(3), message(2), message(1)];
  const consume = (page: { messages: readonly MessageView[] }) => {
    visible = mergeMessages(visible, page.messages);
  };
  let fetched = 0;
  const fetchPage = (after: string) => {
    fetched++;
    const start = after === 'start' ? 0 : recent.findIndex((row) => row.id === after) + 1;
    const rows = recent.slice(start, start + 2);
    return Promise.resolve({
      messages: rows,
      nextCursor: rows.at(-1)?.id ?? after,
      hasMore: start + 2 < recent.length,
      readReceipt: 'synthetic-signed',
    });
  };
  await recoverMessages(
    'start',
    fetchPage,
    (page) => {
      consume(page);
      active = false;
    },
    () => active,
  );
  assert.equal(fetched, 1);
  active = true;
  await recoverMessages('start', fetchPage, consume, () => active);
  consume({ messages: [message(4), message(5)] });
  consume({ messages: [message(5)] });
  assert.deepEqual(
    visible.map((row) => row.id),
    ['0001', '0002', '0003', '0004', '0005'],
  );
});
