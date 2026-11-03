import { createContext, useContext, useEffect } from 'react';
export const DraftContext = createContext<(key: string, dirty: boolean) => void>(() => undefined);
export function useProfileDraft(key: string, dirty: boolean) {
  const set = useContext(DraftContext);
  useEffect(() => {
    set(key, dirty);
    return () => set(key, false);
  }, [set, key, dirty]);
}
