import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Icon } from '../../components/Icon';
import { useAuth } from '../auth/useAuth';
import {
  announceNotificationsChanged,
  connectNotificationSocket,
  mergeNotifications,
  notificationActionState,
  notificationsChangedEvent,
  notificationsService,
} from './notifications-service';
import type { NotificationView } from './notifications.types';
const age = (value: string) => {
  const seconds = Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 1000));
  return seconds < 60
    ? 'now'
    : seconds < 3600
      ? `${Math.floor(seconds / 60)}m`
      : seconds < 86400
        ? `${Math.floor(seconds / 3600)}h`
        : `${Math.floor(seconds / 86400)}d`;
};
export function NotificationBell() {
  const { applicationUser } = useAuth();
  const userId = applicationUser?.id;
  return <NotificationBellSession key={userId ?? 'signed-out'} userId={userId} />;
}
function NotificationBellSession({ userId }: { userId?: string }) {
  const account = useRef(userId);
  useLayoutEffect(() => {
    account.current = userId;
  }, [userId]);
  const navigate = useNavigate();
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const refreshSequence = useRef(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<readonly NotificationView[]>([]);
  const [count, setCount] = useState(0);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string>();
  const refresh = useCallback(async () => {
    if (!userId) return;
    const sequence = ++refreshSequence.current;
    try {
      setError(undefined);
      const [result, total] = await Promise.all([
        notificationsService.list(1, 6),
        notificationsService.count(),
      ]);
      if (sequence !== refreshSequence.current || account.current !== userId) return;
      setItems(result.notifications);
      setCount(total);
      setTotal(result.pagination.total);
    } catch {
      if (sequence === refreshSequence.current && account.current === userId)
        setError('Notifications could not be loaded.');
    } finally {
      if (sequence === refreshSequence.current && account.current === userId) setLoading(false);
    }
  }, [userId]);
  useEffect(() => {
    const initialRefresh = window.setTimeout(() => void refresh(), 0);
    let socket: Awaited<ReturnType<typeof connectNotificationSocket>> | undefined;
    let active = true;
    void connectNotificationSocket(
      (item) => {
        if (!active) return;
        setItems((current) => mergeNotifications(current, item).slice(0, 6));
        setCount((current) => current + (item.read ? 0 : 1));
        setTotal((current) => current + 1);
        announceNotificationsChanged();
      },
      () => void refresh(),
      userId,
    )
      .then((value) => {
        if (active) socket = value;
        else value.disconnect();
      })
      .catch(() => undefined);
    return () => {
      active = false;
      window.clearTimeout(initialRefresh);
      socket?.disconnect();
    };
  }, [refresh, userId]);
  useEffect(() => {
    const handleChange = () => void refresh();
    window.addEventListener(notificationsChangedEvent, handleChange);
    return () => window.removeEventListener(notificationsChangedEvent, handleChange);
  }, [refresh]);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => {
      if (!root.current?.contains(event.target as Node)) {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        trigger.current?.focus();
      }
    };
    document.addEventListener('mousedown', close);
    window.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', escape);
    };
  }, [open]);
  const visit = async (item: NotificationView) => {
    if (!item.read) {
      await notificationsService.read(item.id);
      setCount((current) => Math.max(0, current - 1));
      setItems((current) =>
        current.map((value) => (value.id === item.id ? { ...value, read: true } : value)),
      );
      announceNotificationsChanged();
    }
    setOpen(false);
    void navigate(item.path);
  };
  const allRead = async () => {
    setActionBusy(true);
    try {
      await notificationsService.readAll();
      setCount(0);
      setItems((current) => current.map((item) => ({ ...item, read: true })));
      announceNotificationsChanged();
    } catch {
      setError('Notifications could not be marked as read.');
    } finally {
      setActionBusy(false);
    }
  };
  const dismiss = async (item: NotificationView) => {
    setActionBusy(true);
    try {
      setError(undefined);
      await notificationsService.dismiss(item.id);
      setItems((current) => current.filter(({ id }) => id !== item.id));
      if (!item.read) setCount((current) => Math.max(0, current - 1));
      setTotal((current) => Math.max(0, current - 1));
      announceNotificationsChanged();
    } catch {
      setError('That notification could not be dismissed.');
    } finally {
      setActionBusy(false);
    }
  };
  const actions = notificationActionState(total, count);
  return (
    <div className="cc-notification-root relative" ref={root}>
      <button
        aria-expanded={open}
        aria-label="Notifications"
        className="cc-icon-button relative"
        onClick={() => {
          setOpen((value) => !value);
          if (!open) {
            setLoading(true);
            void refresh();
          }
        }}
        ref={trigger}
        type="button"
      >
        <Icon className="size-5" name="bell" />
        {count ? (
          <span className="absolute -right-1 -top-1 min-w-5 rounded-full bg-[var(--cc-danger)] px-1 text-[.6rem] font-bold text-white">
            {count > 99 ? '99+' : count}
          </span>
        ) : null}
      </button>
      {open ? (
        <div className="cc-notification-panel cc-popover absolute right-0 mt-2 w-[min(24rem,calc(100vw-2rem))] overflow-hidden rounded-[var(--cc-radius-lg)] shadow-[var(--cc-shadow-lg)]">
          <div className="cc-notification-header flex items-center justify-between border-b p-4 [border-color:var(--cc-border)]">
            <h2 className="font-semibold">Notifications</h2>
            {actions.markAllRead && !loading ? (
              <button
                className="text-xs font-semibold text-[var(--cc-primary)]"
                disabled={actionBusy}
                onClick={() => void allRead()}
                type="button"
              >
                Mark all read
              </button>
            ) : null}
          </div>
          {loading ? (
            <p className="p-5 text-sm text-[var(--cc-muted)]">Loading…</p>
          ) : error ? (
            <p className="p-5 text-sm text-[var(--cc-danger)]">{error}</p>
          ) : items.length ? (
            <div className="max-h-96 divide-y divide-[var(--cc-border)] overflow-y-auto">
              {items.map((item) => (
                <div
                  className={`flex items-start gap-1 p-2 ${item.read ? 'opacity-65' : ''}`}
                  key={item.id}
                >
                  <button
                    className="min-w-0 flex-1 rounded-lg p-2 text-left hover:bg-[var(--cc-hover)]"
                    onClick={() => void visit(item)}
                    type="button"
                  >
                    <span className="flex items-center gap-2 text-sm font-medium">
                      {!item.read ? (
                        <span className="size-2 rounded-full bg-[var(--cc-primary)]" />
                      ) : null}
                      {item.title}
                    </span>
                    {item.description ? (
                      <span className="mt-1 block text-xs text-[var(--cc-muted)]">
                        {item.description}
                      </span>
                    ) : null}
                    <span className="mt-2 block text-[.65rem] text-[var(--cc-subtle)]">
                      {age(item.createdAt)}
                    </span>
                  </button>
                  <button
                    aria-label={`Dismiss ${item.title}`}
                    className="cc-icon-button shrink-0"
                    disabled={actionBusy}
                    onClick={() => void dismiss(item)}
                    type="button"
                  >
                    ×
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="p-6 text-center text-sm text-[var(--cc-muted)]">You are all caught up.</p>
          )}
          {!loading && !error && actions.clearRead ? (
            <Link
              className="block border-t p-3 text-center text-xs font-semibold text-[var(--cc-muted)] [border-color:var(--cc-border)]"
              onClick={() => setOpen(false)}
              to="/notifications"
            >
              Manage read notifications
            </Link>
          ) : null}
          <Link
            className="block border-t p-3 text-center text-sm font-semibold text-[var(--cc-primary)] [border-color:var(--cc-border)]"
            onClick={() => setOpen(false)}
            to="/notifications"
          >
            View all notifications
          </Link>
        </div>
      ) : null}
    </div>
  );
}
