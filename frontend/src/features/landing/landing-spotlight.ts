export interface SpotlightEnvironment {
  readonly schedule: (callback: () => void, delay: number) => () => void;
  readonly visibility: Pick<Document, 'hidden' | 'addEventListener' | 'removeEventListener'>;
  readonly motion: Pick<MediaQueryList, 'matches' | 'addEventListener' | 'removeEventListener'>;
}

/** Visit-local UI timing only. It never fetches or persists records. */
export function createSpotlightController(
  count: number,
  advance: () => void,
  environment: SpotlightEnvironment,
) {
  const pauses = new Set<string>();
  let cancel: (() => void) | undefined;
  let disposed = false;
  const sync = () => {
    cancel?.();
    cancel = undefined;
    if (
      disposed ||
      count < 2 ||
      pauses.size ||
      environment.visibility.hidden ||
      environment.motion.matches
    )
      return;
    cancel = environment.schedule(() => {
      cancel = undefined;
      if (disposed || pauses.size || environment.visibility.hidden || environment.motion.matches)
        return;
      advance();
      sync();
    }, 10000);
  };
  environment.visibility.addEventListener('visibilitychange', sync);
  environment.motion.addEventListener('change', sync);
  sync();
  return {
    pause(reason: 'focus' | 'hover' | 'manual', paused: boolean) {
      if (paused) pauses.add(reason);
      else pauses.delete(reason);
      sync();
    },
    dispose() {
      disposed = true;
      cancel?.();
      environment.visibility.removeEventListener('visibilitychange', sync);
      environment.motion.removeEventListener('change', sync);
    },
  };
}
