import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Badge, Button, Card, EmptyState, Modal, PageHeader, Skeleton } from '../../components/ui';
import {
  announceNotificationsChanged,
  notificationActionState,
  notificationsChangedEvent,
  notificationsService,
} from './notifications-service';
import type { NotificationView } from './notifications.types';
const timestamp = (value: string) =>
  new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
export function NotificationsPage() {
  const navigate = useNavigate();
  const [items, setItems] = useState<readonly NotificationView[]>([]);
  const [page, setPage] = useState(1);
  const [pages, setPages] = useState(1);
  const [total, setTotal] = useState(0);
  const [unreadCount, setUnreadCount] = useState(0);
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>();
  const [actionError, setActionError] = useState<string>();
  const [busy, setBusy] = useState(false);
  const [dismissingId, setDismissingId] = useState<string>();
  const [confirmClearAll, setConfirmClearAll] = useState(false);
  const loadSequence = useRef(0);
  const load = useCallback(
    async (nextPage = 1, append = false) => {
      const sequence = ++loadSequence.current;
      setLoading(true);
      try {
        setError(undefined);
        const [result, authoritativeUnread, allResult] = await Promise.all([
          notificationsService.list(nextPage, 20, unreadOnly),
          notificationsService.count(),
          unreadOnly ? notificationsService.list(1, 1, false) : Promise.resolve(null),
        ]);
        if (sequence !== loadSequence.current) return;
        setItems((current) =>
          append ? [...current, ...result.notifications] : result.notifications,
        );
        setPage(nextPage);
        setPages(result.pagination.totalPages);
        setTotal(allResult?.pagination.total ?? result.pagination.total);
        setUnreadCount(authoritativeUnread);
      } catch {
        if (sequence === loadSequence.current)
          setError('Notification history could not be loaded.');
      } finally {
        if (sequence === loadSequence.current) setLoading(false);
      }
    },
    [unreadOnly],
  );
  useEffect(() => {
    const timer = window.setTimeout(() => void load(), 0);
    return () => window.clearTimeout(timer);
  }, [load]);
  useEffect(() => {
    const handleChange = () => void load();
    window.addEventListener(notificationsChangedEvent, handleChange);
    return () => window.removeEventListener(notificationsChangedEvent, handleChange);
  }, [load]);
  const visit = async (item: NotificationView) => {
    if (!item.read) {
      await notificationsService.read(item.id);
      setItems((current) =>
        current.map((value) => (value.id === item.id ? { ...value, read: true } : value)),
      );
      setUnreadCount((current) => Math.max(0, current - 1));
      announceNotificationsChanged();
    }
    void navigate(item.path);
  };
  const allRead = async () => {
    setBusy(true);
    setActionError(undefined);
    try {
      await notificationsService.readAll();
      setItems((current) => (unreadOnly ? [] : current.map((item) => ({ ...item, read: true }))));
      setUnreadCount(0);
      announceNotificationsChanged();
    } catch {
      setActionError('Notifications could not be marked as read.');
    } finally {
      setBusy(false);
    }
  };
  const dismiss = async (id: string) => {
    const dismissed = items.find((item) => item.id === id);
    setDismissingId(id);
    setActionError(undefined);
    try {
      await notificationsService.dismiss(id);
      setItems((current) => current.filter((item) => item.id !== id));
      if (dismissed && !dismissed.read) setUnreadCount((count) => Math.max(0, count - 1));
      setTotal((current) => Math.max(0, current - 1));
      announceNotificationsChanged();
    } catch {
      setActionError('That notification could not be dismissed.');
    } finally {
      setDismissingId(undefined);
    }
  };
  const clearRead = async () => {
    setBusy(true);
    setActionError(undefined);
    try {
      await notificationsService.clearRead();
      setItems((current) => current.filter((item) => !item.read));
      setTotal(unreadCount);
      announceNotificationsChanged();
    } catch {
      setActionError('Read notifications could not be cleared.');
    } finally {
      setBusy(false);
    }
  };
  const clearAll = async () => {
    setBusy(true);
    setActionError(undefined);
    try {
      await notificationsService.clearAll();
      setItems([]);
      setTotal(0);
      setUnreadCount(0);
      setConfirmClearAll(false);
      announceNotificationsChanged();
    } catch {
      setActionError('Notifications could not be cleared.');
    } finally {
      setBusy(false);
    }
  };
  const actions = notificationActionState(total, unreadCount);
  return (
    <div className="cc-page max-w-5xl">
      <PageHeader
        actions={
          !loading && actions.clearAll ? (
            <div className="flex flex-wrap gap-2">
              {actions.markAllRead ? (
                <Button
                  disabled={busy || Boolean(dismissingId)}
                  onClick={() => void allRead()}
                  variant="secondary"
                >
                  Mark all read
                </Button>
              ) : null}
              {actions.clearRead ? (
                <Button
                  disabled={busy || Boolean(dismissingId)}
                  onClick={() => void clearRead()}
                  variant="secondary"
                >
                  Clear read
                </Button>
              ) : null}
              <Button
                disabled={busy || Boolean(dismissingId)}
                onClick={() => setConfirmClearAll(true)}
                variant="danger"
              >
                Clear all
              </Button>
            </div>
          ) : null
        }
        description="Persistent updates from messages, Lost & Found, TeamUp, and services."
        eyebrow="Stay informed"
        title="Notifications"
      />
      <div className="mt-6 flex flex-wrap gap-2" role="group" aria-label="Notification filters">
        <button
          className={`cc-button ${!unreadOnly ? 'cc-button--primary' : 'cc-button--secondary'}`}
          onClick={() => setUnreadOnly(false)}
          type="button"
        >
          All updates
        </button>
        <button
          className={`cc-button ${unreadOnly ? 'cc-button--primary' : 'cc-button--secondary'}`}
          onClick={() => setUnreadOnly(true)}
          type="button"
        >
          Unread
        </button>
      </div>
      {actionError ? (
        <p className="mt-4 text-sm text-rose-300" role="alert">
          {actionError}
        </p>
      ) : null}
      {error ? (
        <Card className="mt-4 p-6">
          <p className="text-sm text-rose-300" role="alert">
            {error}
          </p>
          <Button className="mt-4" onClick={() => void load()} variant="secondary">
            Try again
          </Button>
        </Card>
      ) : loading && !items.length ? (
        <Skeleton className="mt-4 h-72" />
      ) : (
        <Card className="mt-4 overflow-hidden">
          {items.length ? (
            <div className="divide-y divide-white/[.07]">
              {items.map((item) => (
                <article
                  className={`flex items-start gap-2 p-3 sm:p-5 ${item.read ? 'opacity-65' : ''}`}
                  key={item.id}
                >
                  <button
                    className="flex min-w-0 flex-1 gap-4 rounded-xl p-2 text-left transition hover:bg-[var(--cc-hover)]"
                    onClick={() => void visit(item)}
                    type="button"
                  >
                    <span className="cc-icon-box shrink-0">
                      {item.kind.includes('MESSAGE')
                        ? 'M'
                        : item.kind.startsWith('TEAMUP')
                          ? 'T'
                          : item.kind.startsWith('SERVICE')
                            ? 'S'
                            : 'L'}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-semibold">
                        {!item.read ? <span className="size-2 rounded-full bg-indigo-400" /> : null}
                        {item.title}
                      </span>
                      {item.description ? (
                        <span className="mt-1 block text-sm leading-6 text-slate-500">
                          {item.description}
                        </span>
                      ) : null}
                      <span className="mt-2 block text-xs text-slate-600">
                        {timestamp(item.createdAt)}
                      </span>
                    </span>
                    <Badge tone={item.read ? 'neutral' : 'info'}>
                      {item.read ? 'Read' : 'New'}
                    </Badge>
                  </button>
                  <button
                    aria-label={`Dismiss ${item.title}`}
                    className="cc-icon-button shrink-0"
                    disabled={dismissingId === item.id || busy}
                    onClick={() => void dismiss(item.id)}
                    type="button"
                  >
                    ×
                  </button>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              description="New activity will appear here."
              icon="bell"
              title={unreadOnly ? 'No unread notifications' : 'No notifications yet'}
            />
          )}
        </Card>
      )}
      {page < pages ? (
        <div className="mt-5 text-center">
          <Button disabled={loading} onClick={() => void load(page + 1, true)} variant="secondary">
            {loading ? 'Loading…' : 'Load more'}
          </Button>
        </div>
      ) : null}
      <Modal
        description="This permanently removes every notification in your account, including unread updates."
        onClose={() => {
          if (!busy) setConfirmClearAll(false);
        }}
        open={confirmClearAll}
        title="Clear all notifications?"
      >
        <div className="flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <Button disabled={busy} onClick={() => setConfirmClearAll(false)} variant="secondary">
            Cancel
          </Button>
          <Button disabled={busy} onClick={() => void clearAll()} variant="danger">
            {busy ? 'Clearing…' : 'Clear all notifications'}
          </Button>
        </div>
      </Modal>
    </div>
  );
}
