import { io } from 'socket.io-client';
import { frontendEnv } from '../../config/env';
import { getSupabaseClient } from '../../lib/supabase';
import { createRealtimeLifecycle, type RealtimeSubscriber } from './realtime-lifecycle';

let shared: ReturnType<typeof createRealtimeLifecycle> | undefined;
let users = 0;
const resumeShared = () => {
  if (navigator.onLine && document.visibilityState === 'visible') shared?.resume();
};
export function subscribeMessagingRealtime(listener: RealtimeSubscriber) {
  shared ??= createRealtimeLifecycle({
    session: async () => (await getSupabaseClient().auth.getSession()).data.session,
    watch: (change) => {
      const { data } = getSupabaseClient().auth.onAuthStateChange((_event, session) =>
        change(session),
      );
      return () => data.subscription.unsubscribe();
    },
    socket: (auth) =>
      io(frontendEnv.apiBaseUrl, {
        autoConnect: false,
        auth,
        transports: ['websocket', 'polling'],
        reconnectionAttempts: 6,
        reconnectionDelay: 500,
        reconnectionDelayMax: 5000,
      }),
  });
  const subscription = shared.subscribe(listener);
  if (++users === 1) {
    window.addEventListener('online', resumeShared);
    document.addEventListener('visibilitychange', resumeShared);
  }
  let closed = false;
  return {
    disconnect() {
      if (closed) return;
      closed = true;
      subscription.disconnect();
      if (--users === 0) {
        window.removeEventListener('online', resumeShared);
        document.removeEventListener('visibilitychange', resumeShared);
      }
    },
  };
}
