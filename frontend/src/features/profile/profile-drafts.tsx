import { UNSAFE_NavigationContext as NavigationContext } from 'react-router-dom';
import { useCallback, useContext, useEffect, useMemo, useRef, type PropsWithChildren } from 'react';

import { DraftContext } from './profile-draft-state';
export function ProfileDraftProvider({ children }: PropsWithChildren) {
  const drafts = useRef(new Set<string>());
  const navigation = useContext(NavigationContext);
  const linkApproved = useRef(false);
  const set = useCallback((key: string, dirty: boolean) => {
    if (dirty) drafts.current.add(key);
    else drafts.current.delete(key);
  }, []);
  useEffect(() => {
    const unload = (event: BeforeUnloadEvent) => {
      if (!drafts.current.size) return;
      event.preventDefault();
      event.returnValue = '';
    };
    const navigate = (event: MouseEvent) => {
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.target === '_blank' ||
        link.hasAttribute('download') ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const next = new URL(link.href, location.href);
      if (next.pathname === location.pathname && next.search === location.search) return;
      if (drafts.current.size) {
        if (!window.confirm('You have unsaved profile changes. Leave this page?')) {
          event.preventDefault();
          event.stopPropagation();
        } else {
          linkApproved.current = true;
          queueMicrotask(() => {
            linkApproved.current = false;
          });
        }
      }
    };
    window.addEventListener('beforeunload', unload);
    document.addEventListener('click', navigate, true);
    return () => {
      window.removeEventListener('beforeunload', unload);
      document.removeEventListener('click', navigate, true);
    };
  }, []);
  const guardedNavigation = useMemo(() => {
    const allow = () =>
      !drafts.current.size ||
      linkApproved.current ||
      window.confirm('You have unsaved profile changes. Leave this page?');
    const navigator = navigation.navigator;
    const push: typeof navigator.push = (...args) => {
      if (allow()) navigator.push(...args);
    };
    const replace: typeof navigator.replace = (...args) => {
      if (allow()) navigator.replace(...args);
    };
    const go: typeof navigator.go = (...args) => {
      if (allow()) navigator.go(...args);
    };
    return { ...navigation, navigator: { ...navigator, push, replace, go } };
  }, [navigation]);
  return (
    <NavigationContext.Provider value={guardedNavigation}>
      <DraftContext.Provider value={set}>{children}</DraftContext.Provider>
    </NavigationContext.Provider>
  );
}
