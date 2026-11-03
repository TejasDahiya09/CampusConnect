import { StudentAvatar } from '../students/StudentAvatar';
import { useCallback, useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { Button } from '../../components/ui';
import { ApiClientError } from '../../services/api-client';
import { useAuth } from '../auth/useAuth';
import {
  connectMessagingSocket,
  createLatestRequestGate,
  messagingService,
  messageAttempt,
  withTransientMessagingRetry,
  type MessageAttempt,
} from './messaging-service';
import { clearSentDraft, mergeMessages, nearLatest } from './messaging-state';
import { coalesceAsync, recoverMessages } from './messaging-recovery';
import type { ConnectionState } from './realtime-lifecycle';
import type {
  ConversationContext,
  ConversationView,
  InboxResult,
  MessageView,
} from './messaging.types';
import './messaging.css';

const filters: readonly { label: string; value?: ConversationContext }[] = [
  { label: 'All' },
  { label: 'Direct', value: 'DIRECT' },
  { label: 'Marketplace', value: 'MARKETPLACE' },
  { label: 'TeamUp', value: 'TEAMUP' },
  { label: 'Services', value: 'SERVICE' },
];
const emptyInbox: InboxResult = {
  conversations: [],
  unread: { byContext: { DIRECT: 0, MARKETPLACE: 0, SERVICE: 0, TEAMUP: 0 }, total: 0 },
};
const issue = (error: unknown, fallback: string) =>
  error instanceof ApiClientError ? error.message : fallback;
const time = (value: string) =>
  new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
function Avatar({ person }: { person?: ConversationView['otherParticipant'] }) {
  return (
    <span className="cc-msg-avatar">
      <StudentAvatar
        avatar={person?.avatar}
        displayName={person?.displayName ?? 'CampusConnect student'}
      />
    </span>
  );
}
function Notice({ children, retry }: { children: React.ReactNode; retry?: () => void }) {
  return (
    <div className="cc-msg-notice" role="alert">
      <span>{children}</span>
      {retry && (
        <Button variant="secondary" onClick={retry}>
          Retry
        </Button>
      )}
    </div>
  );
}

export function MessagesPage() {
  const { applicationUser } = useAuth();
  return (
    <MessagingWorkspace key={applicationUser?.id ?? 'signed-out'} userId={applicationUser?.id} />
  );
}

function MessagingWorkspace({ userId }: { userId?: string }) {
  const { id } = useParams();
  const [inbox, setInbox] = useState<InboxResult>(emptyInbox);
  const [context, setContext] = useState<ConversationContext>();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [inboxError, setInboxError] = useState('');
  const [moreInboxLoading, setMoreInboxLoading] = useState(false);
  const [thread, setThread] = useState<{
    id?: string;
    messages: readonly MessageView[];
    loading: boolean;
    error: string;
    page: number;
    more: boolean;
  }>({ messages: [], loading: false, error: '', page: 1, more: false });
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [pending, setPending] = useState<string>();
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [readErrors, setReadErrors] = useState<Record<string, string>>({});
  const [olderLoading, setOlderLoading] = useState(false);
  const [olderError, setOlderError] = useState('');
  const [jump, setJump] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const [connectionState, setConnectionState] = useState<ConnectionState>('connecting');
  const online = connectionState === 'connected';
  const [syncError, setSyncError] = useState('');
  const active = useRef(id);
  active.current = id;
  const alive = useRef(true);
  const scroll = useRef<HTMLDivElement>(null);
  const heading = useRef<HTMLHeadingElement>(null);
  const follow = useRef(true);
  const userScrolled = useRef(false);
  const anchor = useRef<{
    top: number;
    height: number;
    messageId?: string;
    offset?: number;
  } | null>(null);
  const inboxGate = useRef(createLatestRequestGate());
  const historyGate = useRef(createLatestRequestGate());
  const attempts = useRef(new Map<string, MessageAttempt>());
  const sendLock = useRef(false);
  const olderLock = useRef(false);
  const received = useRef(new Set<string>());
  const known = useRef(new Map<string, ConversationView>());
  const cursors = useRef(new Map<string, string>());
  const historyFloors = useRef(new Map<string, string>());
  const catchingUp = useRef(new Map<string, Promise<void>>());
  const recoveryAgain = useRef(new Set<string>());
  const recoveryVersion = useRef(0);
  const recoverRef = useRef<() => Promise<void>>(async () => {});
  const recoveryPending = useRef(false);
  const reconcileNeeded = useRef(false);
  const filterRef = useRef({ context, query });
  filterRef.current = { context, query };
  const refresh = useRef(
    coalesceAsync(async () => {
      if (!alive.current || !navigator.onLine) return;
      const request = inboxGate.current.begin();
      try {
        const result = await withTransientMessagingRetry(() =>
          messagingService.list(
            filterRef.current.context,
            filterRef.current.query.trim() || undefined,
            undefined,
            active.current,
          ),
        );
        if (!alive.current || !inboxGate.current.isCurrent(request)) return;
        for (const conversation of result.conversations)
          known.current.set(conversation.id, conversation);
        if (result.selectedConversation)
          known.current.set(result.selectedConversation.id, result.selectedConversation);
        setInbox(result);
        setInboxError('');
      } catch (error) {
        if (alive.current && inboxGate.current.isCurrent(request))
          setInboxError(issue(error, 'Conversations could not be loaded.'));
      } finally {
        if (alive.current && inboxGate.current.isCurrent(request)) setLoading(false);
      }
    }),
  ).current;
  const loadMoreInbox = async () => {
    if (!inbox.nextCursor || moreInboxLoading) return;
    setMoreInboxLoading(true);
    const request = inboxGate.current.begin();
    try {
      const result = await messagingService.list(
        context,
        query.trim() || undefined,
        inbox.nextCursor,
        active.current,
      );
      if (!alive.current || !inboxGate.current.isCurrent(request)) return;
      for (const row of result.conversations) known.current.set(row.id, row);
      setInbox((current) => ({
        ...result,
        conversations: [
          ...current.conversations,
          ...result.conversations.filter(
            (row) => !current.conversations.some((existing) => existing.id === row.id),
          ),
        ],
      }));
      setInboxError('');
    } catch (error) {
      if (alive.current && inboxGate.current.isCurrent(request))
        setInboxError(issue(error, 'More conversations could not be loaded.'));
    } finally {
      if (alive.current) setMoreInboxLoading(false);
    }
  };
  useEffect(() => {
    alive.current = true;
    const inboxRequests = inboxGate.current;
    const historyRequests = historyGate.current;
    return () => {
      alive.current = false;
      inboxRequests.begin();
      historyRequests.begin();
    };
  }, []);
  useEffect(() => {
    inboxGate.current.begin();
    const timer = window.setTimeout(() => void refresh(), 200);
    return () => window.clearTimeout(timer);
  }, [context, query, refresh]);

  const acknowledge = useCallback(
    async (conversationId: string, receipt: string, refreshInbox = true) => {
      try {
        await withTransientMessagingRetry(() => messagingService.markRead(conversationId, receipt));
        if (!alive.current) return;
        setReadErrors((current) => ({ ...current, [conversationId]: '' }));
        if (refreshInbox) await refresh();
      } catch {
        if (alive.current)
          setReadErrors((current) => ({
            ...current,
            [conversationId]: 'Messages loaded, but read status could not be updated.',
          }));
      }
    },
    [refresh],
  );
  const loadLatest = useCallback(
    async (conversationId: string, initial: boolean) => {
      const request = initial ? historyGate.current.begin() : undefined;
      if (initial) {
        setThread({
          id: conversationId,
          messages: [],
          loading: true,
          error: '',
          page: 1,
          more: false,
        });
        setOlderError('');
        setJump(false);
        anchor.current = null;
        follow.current = true;
        userScrolled.current = false;
      }
      try {
        const result = await withTransientMessagingRetry(() =>
          messagingService.historyPage(conversationId),
        );
        if (
          !alive.current ||
          active.current !== conversationId ||
          (request !== undefined && !historyGate.current.isCurrent(request))
        )
          return;
        setThread((current) => ({
          ...current,
          id: conversationId,
          loading: false,
          error: '',
          messages: mergeMessages(
            current.id === conversationId ? current.messages : [],
            result.messages,
          ),
          ...(initial ? { page: 1, more: result.messages.length === 50 } : {}),
        }));
        if (initial) {
          const last = result.messages.at(-1);
          if (result.messages[0]) historyFloors.current.set(conversationId, result.messages[0].id);
          cursors.current.set(conversationId, last?.id ?? 'start');
          if (recoveryPending.current) {
            recoveryPending.current = false;
            queueMicrotask(() => void recoverRef.current());
          }
        }
        if (document.visibilityState === 'visible')
          void acknowledge(conversationId, result.readReceipt);
      } catch (error) {
        if (
          alive.current &&
          active.current === conversationId &&
          (request === undefined || historyGate.current.isCurrent(request))
        )
          setThread((current) => ({
            ...current,
            loading: false,
            error: issue(error, 'Conversation could not be loaded.'),
          }));
      }
    },
    [acknowledge],
  );
  const catchUp = useCallback(async () => {
    if (!navigator.onLine || !alive.current) return;
    void refresh();
    const conversationId = active.current;
    if (!conversationId) return;
    const existing = catchingUp.current.get(conversationId);
    if (existing) {
      recoveryAgain.current.add(conversationId);
      return existing;
    }
    const version = recoveryVersion.current;
    const relevant = () =>
      alive.current && active.current === conversationId && version === recoveryVersion.current;
    let complete = false;
    const operation = (async () => {
      try {
        const cursor = cursors.current.get(conversationId);
        if (!cursor) {
          recoveryPending.current = true;
          return;
        }
        if (reconcileNeeded.current) {
          reconcileNeeded.current = false;
          try {
            await recoverMessages(
              'start',
              (after) =>
                withTransientMessagingRetry(() =>
                  messagingService.updates(
                    conversationId,
                    after,
                    true,
                    historyFloors.current.get(conversationId),
                  ),
                ),
              async (page) => {
                if (!relevant()) return;
                if (scroll.current && !nearLatest(scroll.current)) {
                  const element = scroll.current;
                  const visible = Array.from(
                    element.querySelectorAll<HTMLElement>('[data-message-id]'),
                  ).find(
                    (row) =>
                      row.getBoundingClientRect().bottom >= element.getBoundingClientRect().top,
                  );
                  anchor.current = {
                    top: element.scrollTop,
                    height: element.scrollHeight,
                    ...(visible
                      ? {
                          messageId: visible.dataset.messageId!,
                          offset: visible.getBoundingClientRect().top,
                        }
                      : {}),
                  };
                }
                setThread((current) => ({
                  ...current,
                  messages: mergeMessages(current.messages, page.messages),
                }));
                if (page.messages.length && document.visibilityState === 'visible')
                  await acknowledge(conversationId, page.readReceipt, false);
              },
              relevant,
            );
          } catch (error) {
            reconcileNeeded.current = true;
            throw error;
          }
        }
        const result = await recoverMessages(
          cursor,
          (after) =>
            withTransientMessagingRetry(() => messagingService.updates(conversationId, after)),
          async (page) => {
            if (!relevant()) return;
            if (page.messages.length && scroll.current && !nearLatest(scroll.current)) {
              follow.current = false;
              setJump(true);
            }
            setThread((current) => ({
              ...current,
              messages: mergeMessages(current.messages, page.messages),
            }));
            cursors.current.set(conversationId, page.nextCursor);
            for (const message of page.messages) {
              const key = JSON.stringify([conversationId, message.text.trim()]);
              if (
                message.senderId === userId &&
                attempts.current.get(key)?.clientMessageId === message.id
              ) {
                attempts.current.delete(key);
                setDrafts((current) => ({
                  ...current,
                  [conversationId]: clearSentDraft(current[conversationId], message.text.trim()),
                }));
                setErrors((current) => ({ ...current, [conversationId]: '' }));
              }
            }
            if (page.messages.length && document.visibilityState === 'visible')
              await acknowledge(conversationId, page.readReceipt, false);
          },
          relevant,
        );
        complete = result.complete;
        if (relevant()) {
          setSyncError(
            result.complete ? '' : 'More messages remain to recover. Retry to continue safely.',
          );
          void refresh();
        }
      } catch (error) {
        if (relevant())
          setSyncError(issue(error, 'Message recovery could not finish. Retry when connected.'));
      }
    })().finally(() => {
      catchingUp.current.delete(conversationId);
      const again = recoveryAgain.current.delete(conversationId);
      if (again && complete && relevant()) queueMicrotask(() => void recoverRef.current());
    });
    catchingUp.current.set(conversationId, operation);
    return operation;
  }, [acknowledge, refresh, userId]);
  recoverRef.current = catchUp;
  useEffect(() => {
    recoveryVersion.current++;
    cursors.current.delete(id ?? '');
    setSyncError('');
    historyGate.current.begin();
    if (id) void loadLatest(id, true);
    if (window.matchMedia('(max-width: 767px)').matches) heading.current?.focus();
  }, [id, loadLatest]);
  useEffect(() => {
    let cancelled = false;
    void document.fonts.ready.then(() => {
      if (!cancelled && !userScrolled.current && scroll.current) {
        follow.current = true;
        scroll.current.scrollTop = scroll.current.scrollHeight;
      }
    });
    const observer = new ResizeObserver(() => {
      if (follow.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
    });
    if (scroll.current) observer.observe(scroll.current);
    return () => {
      cancelled = true;
      observer.disconnect();
    };
  }, [id]);
  useEffect(() => {
    // A hidden tab does not acknowledge a newly fetched receipt. Refresh on return.
    const visible = () => {
      if (document.visibilityState === 'visible' && navigator.onLine) {
        reconcileNeeded.current = true;
        void catchUp();
      }
    };
    const reconciliation = window.setInterval(visible, 60_000);
    document.addEventListener('visibilitychange', visible);
    window.addEventListener('online', visible);
    return () => {
      window.clearInterval(reconciliation);
      document.removeEventListener('visibilitychange', visible);
      window.removeEventListener('online', visible);
    };
  }, [catchUp]);
  useEffect(() => {
    let socket: Awaited<ReturnType<typeof connectMessagingSocket>> | undefined;
    let cancelled = false;
    void connectMessagingSocket(
      (message) => {
        if (cancelled || !alive.current) return;
        if (received.current.has(message.id)) return;
        received.current.add(message.id);
        if (received.current.size > 2000)
          received.current.delete(received.current.values().next().value!);
        if (active.current === message.conversationId) {
          if (scroll.current && !nearLatest(scroll.current)) {
            follow.current = false;
            setJump(true);
          }
          setThread((current) => ({
            ...current,
            messages: mergeMessages(current.id === message.conversationId ? current.messages : [], [
              message,
            ]),
          }));
          if (message.senderId !== userId) {
            setAnnouncement('New message received.');
            // An event is not a read receipt: fetch a signed page before acknowledgment.
            void catchUp();
          }
        }
        void refresh();
      },
      {
        userId,
        state: (state) => {
          if (!cancelled) {
            if (state !== 'connected' && state !== 'connecting') reconcileNeeded.current = true;
            setConnectionState(state);
          }
        },
        restored: () => {
          if (!cancelled) void catchUp();
        },
        read: () => {
          if (!cancelled) void refresh();
        },
      },
    )
      .then((connected) => {
        if (cancelled) {
          connected.disconnect();
          return;
        }
        socket = connected;
      })
      .catch(() => {
        if (!cancelled) setConnectionState('authentication-unavailable');
      });
    return () => {
      cancelled = true;
      socket?.disconnect();
    };
  }, [userId, catchUp, refresh]);
  useLayoutEffect(() => {
    const element = scroll.current;
    if (!element) return;
    if (anchor.current) {
      const visible = Array.from(element.querySelectorAll<HTMLElement>('[data-message-id]')).find(
        (row) => row.dataset.messageId === anchor.current?.messageId,
      );
      if (visible && anchor.current.offset !== undefined)
        element.scrollTop += visible.getBoundingClientRect().top - anchor.current.offset;
      else element.scrollTop = anchor.current.top + element.scrollHeight - anchor.current.height;
      anchor.current = null;
    } else if (follow.current) element.scrollTop = element.scrollHeight;
  }, [thread.messages, thread.loading]);
  const earlier = async () => {
    if (!id || olderLock.current || thread.id !== id || !thread.more) return;
    olderLock.current = true;
    setOlderLoading(true);
    setOlderError('');
    const page = thread.page + 1;
    try {
      const result = await withTransientMessagingRetry(() =>
        messagingService.historyPage(id, page),
      );
      if (!alive.current || active.current !== id) return;
      if (scroll.current)
        anchor.current = { top: scroll.current.scrollTop, height: scroll.current.scrollHeight };
      follow.current = false;
      if (result.messages[0]) historyFloors.current.set(id, result.messages[0].id);
      setThread((current) => ({
        ...current,
        messages: mergeMessages(result.messages, current.messages),
        page,
        more: result.messages.length === 50,
      }));
      if (document.visibilityState === 'visible') void acknowledge(id, result.readReceipt);
    } catch (error) {
      if (alive.current && active.current === id)
        setOlderError(issue(error, 'Earlier messages could not be loaded.'));
    } finally {
      olderLock.current = false;
      if (alive.current) setOlderLoading(false);
    }
  };
  const send = async (event?: FormEvent) => {
    event?.preventDefault();
    const text = id ? drafts[id]?.trim() : '';
    if (
      !id ||
      !text ||
      text.length > 4000 ||
      sendLock.current ||
      thread.id !== id ||
      thread.loading ||
      thread.error
    )
      return;
    const conversationId = id;
    const attemptKey = JSON.stringify([id, text]);
    const attempt = messageAttempt(attempts.current.get(attemptKey), id, text);
    attempts.current.set(attemptKey, attempt);
    sendLock.current = true;
    setPending(id);
    setErrors((current) => ({ ...current, [id]: '' }));
    try {
      const message = await messagingService.send(id, text, attempt.clientMessageId);
      if (!alive.current) return;
      attempts.current.delete(attemptKey);
      setDrafts((current) => ({
        ...current,
        [conversationId]: clearSentDraft(current[conversationId], text),
      }));
      if (active.current === conversationId) {
        follow.current = true;
        setJump(false);
        setThread((current) => ({
          ...current,
          messages: mergeMessages(current.messages, [message]),
        }));
      }
      void refresh();
    } catch (error) {
      if (alive.current)
        setErrors((current) => ({
          ...current,
          [conversationId]:
            !(error instanceof ApiClientError) || error.status >= 500 || error.status === 408
              ? 'Message not confirmed. Retry unchanged text to safely reuse its message ID, or refresh to check saved history.'
              : issue(error, 'The message was not accepted.'),
        }));
    } finally {
      sendLock.current = false;
      if (alive.current) setPending(undefined);
    }
  };
  const selected = id
    ? (inbox.conversations.find((item) => item.id === id) ?? known.current.get(id))
    : undefined;
  const messages = thread.id === id ? thread.messages : [];
  const draft = id ? (drafts[id] ?? '') : '';
  return (
    <div className={`cc-msg-page ${id ? 'has-conversation' : ''}`}>
      <div className="cc-msg-workspace">
        <aside className="cc-msg-inbox" aria-label="Conversation inbox">
          <header className="cc-msg-inbox-heading">
            <div>
              <p className="cc-msg-eyebrow">Your campus conversations</p>
              <h1 ref={!id ? heading : undefined} tabIndex={-1}>
                Messages
              </h1>
            </div>
            <span className="cc-msg-unread" aria-label={`${inbox.unread.total} unread messages`}>
              {inbox.unread.total} unread
            </span>
          </header>
          <div className="cc-msg-search">
            <Icon name="search" />
            <input
              aria-label="Search conversations"
              placeholder="Search people or context"
              maxLength={100}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
            {query && (
              <button type="button" aria-label="Clear search" onClick={() => setQuery('')}>
                <Icon name="close" />
              </button>
            )}
          </div>
          <div className="cc-msg-filters" aria-label="Conversation filters">
            {filters.map((filter) => (
              <button
                type="button"
                key={filter.label}
                aria-pressed={context === filter.value}
                onClick={(event) => {
                  setContext(filter.value);
                  event.currentTarget.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }}
              >
                {filter.label}
              </button>
            ))}
          </div>
          {inboxError && <Notice retry={() => void refresh()}>{inboxError}</Notice>}
          <nav className="cc-msg-rows" aria-label="Conversations" aria-busy={loading}>
            {loading ? (
              <p className="cc-msg-state" role="status">
                Loading conversations…
              </p>
            ) : inbox.conversations.length ? (
              inbox.conversations.map((conversation) => (
                <Link
                  className={`cc-msg-row ${id === conversation.id ? 'is-selected' : ''}`}
                  aria-current={id === conversation.id ? 'page' : undefined}
                  to={`/messages/${conversation.id}`}
                  key={conversation.id}
                >
                  <Avatar person={conversation.otherParticipant} />
                  <span className="cc-msg-row-copy">
                    <strong>{conversation.otherParticipant.displayName}</strong>
                    <span className="cc-msg-context">{conversation.contextLabel}</span>
                    <span className="cc-msg-preview">
                      {conversation.lastMessage?.text ?? 'No messages yet'}
                    </span>
                  </span>
                  <span className="cc-msg-row-end">
                    <time
                      dateTime={conversation.lastMessage?.sentAt ?? conversation.updatedAt}
                      title={new Date(conversation.updatedAt).toLocaleString()}
                    >
                      {new Date(
                        conversation.lastMessage?.sentAt ?? conversation.updatedAt,
                      ).toLocaleDateString([], { month: 'short', day: 'numeric' })}
                    </time>
                    {conversation.unreadCount > 0 && (
                      <span className="cc-msg-count">{conversation.unreadCount}</span>
                    )}
                  </span>
                </Link>
              ))
            ) : (
              !inboxError && (
                <div className="cc-msg-state">
                  <Icon name="inbox" />
                  <h2>
                    {query || context ? 'No matching conversations' : 'Your inbox starts here'}
                  </h2>
                  <p>
                    {query || context
                      ? 'Try a different search or context filter.'
                      : 'Conversations started from profiles and supported campus activities appear here.'}
                  </p>
                </div>
              )
            )}
          </nav>
          {inbox.nextCursor && !loading && (
            <Button
              variant="secondary"
              disabled={moreInboxLoading}
              className="cc-msg-load-more"
              onClick={() => void loadMoreInbox()}
            >
              {moreInboxLoading ? 'Loading conversations…' : 'Load more conversations'}
            </Button>
          )}
        </aside>
        <section className="cc-msg-thread" aria-label="Conversation">
          {id ? (
            <>
              <header className="cc-msg-thread-heading">
                <Link className="cc-msg-back" to="/messages" aria-label="Back to Messages">
                  <Icon name="chevron" />
                </Link>
                <Avatar person={selected?.otherParticipant} />
                <div>
                  <h2 ref={heading} tabIndex={-1}>
                    {selected?.otherParticipant.displayName ?? 'Conversation'}
                  </h2>
                  {selected?.contextPath ? (
                    <Link to={selected.contextPath}>{selected.contextLabel}</Link>
                  ) : (
                    <p>{selected?.contextLabel ?? 'Context unavailable'}</p>
                  )}
                </div>
              </header>
              {!online && (
                <p className="cc-msg-connection" role="status">
                  {connectionState === 'connecting'
                    ? 'Connecting to live updates…'
                    : connectionState.startsWith('authentication') ||
                        connectionState === 'logged-out'
                      ? 'Live updates need a valid session. Sign in again if this persists.'
                      : 'Live updates disconnected. You can still send and refresh messages.'}
                  <button onClick={() => void loadLatest(id, false)} type="button">
                    Refresh
                  </button>
                </p>
              )}
              <div
                className="cc-msg-history"
                ref={scroll}
                role="region"
                tabIndex={0}
                onWheel={() => {
                  userScrolled.current = true;
                }}
                onTouchMove={() => {
                  userScrolled.current = true;
                }}
                onPointerDown={() => {
                  userScrolled.current = true;
                }}
                onKeyDown={(event) => {
                  if (
                    ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(
                      event.key,
                    )
                  )
                    userScrolled.current = true;
                }}
                aria-label="Message history"
                aria-busy={thread.loading}
                onScroll={() => {
                  if (scroll.current) {
                    follow.current = nearLatest(scroll.current);
                    if (follow.current) setJump(false);
                  }
                }}
              >
                {thread.id !== id || thread.loading ? (
                  <p className="cc-msg-state" role="status">
                    Loading conversation…
                  </p>
                ) : thread.error ? (
                  <Notice retry={() => void loadLatest(id, true)}>{thread.error}</Notice>
                ) : (
                  <>
                    {thread.more && (
                      <button
                        className="cc-msg-earlier"
                        type="button"
                        disabled={olderLoading}
                        onClick={() => void earlier()}
                      >
                        {olderLoading ? 'Loading earlier messages…' : 'Load earlier messages'}
                      </button>
                    )}
                    {olderError && <Notice retry={() => void earlier()}>{olderError}</Notice>}
                    {messages.length ? (
                      messages.map((message) => (
                        <div
                          data-message-id={message.id}
                          className={`cc-msg-message ${message.senderId === userId ? 'is-own' : ''}`}
                          key={message.id}
                        >
                          <div className="cc-msg-bubble">
                            <p>{message.text}</p>
                            <time
                              dateTime={message.sentAt}
                              title={new Date(message.sentAt).toLocaleString()}
                            >
                              {time(message.sentAt)}
                            </time>
                          </div>
                        </div>
                      ))
                    ) : (
                      <div className="cc-msg-state">
                        <Icon name="message" />
                        <h3>No messages yet</h3>
                        <p>Send the first message when you are ready.</p>
                      </div>
                    )}
                  </>
                )}
              </div>
              {jump && (
                <button
                  className="cc-msg-jump"
                  type="button"
                  onClick={() => {
                    follow.current = true;
                    setJump(false);
                    if (scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
                  }}
                >
                  Jump to latest <Icon name="arrow" />
                </button>
              )}
              {readErrors[id] && (
                <Notice retry={() => void loadLatest(id, false)}>{readErrors[id]}</Notice>
              )}
              {syncError && <Notice retry={() => void catchUp()}>{syncError}</Notice>}
              {errors[id] && (
                <Notice>{errors[id]} Editing text starts a separate message attempt.</Notice>
              )}
              <form className="cc-msg-composer" onSubmit={(event) => void send(event)}>
                <label className="sr-only" htmlFor="message-draft">
                  Message
                </label>
                <textarea
                  id="message-draft"
                  rows={2}
                  maxLength={4000}
                  placeholder="Write a message…"
                  value={draft}
                  onChange={(event) =>
                    setDrafts((current) => ({ ...current, [id]: event.target.value }))
                  }
                  onKeyDown={(event) => {
                    if (
                      event.key === 'Enter' &&
                      !event.shiftKey &&
                      !event.ctrlKey &&
                      !event.altKey &&
                      !event.metaKey &&
                      !event.nativeEvent.isComposing &&
                      event.keyCode !== 229
                    ) {
                      event.preventDefault();
                      void send();
                    }
                  }}
                />
                <Button
                  type="submit"
                  disabled={!!pending || !draft.trim() || thread.loading || !!thread.error}
                  aria-label={pending === id ? 'Sending message' : 'Send message'}
                >
                  {pending === id ? 'Sending…' : 'Send'}
                  <Icon name="arrow" />
                </Button>
                <span className="cc-msg-composer-hint">
                  Shift + Enter for a new line<span>{draft.length} / 4,000</span>
                </span>
              </form>
            </>
          ) : (
            <div className="cc-msg-welcome">
              <span>
                <Icon name="message" />
              </span>
              <p className="cc-msg-eyebrow">Stay connected</p>
              <h2>A space for your conversations</h2>
              <p>Select a conversation to pick up where you left off.</p>
            </div>
          )}
        </section>
      </div>
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </div>
  );
}
