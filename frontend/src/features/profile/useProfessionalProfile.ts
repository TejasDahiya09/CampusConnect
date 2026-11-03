import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiClientError } from '../../services/api-client';
import {
  getProfessional,
  saveProfessional,
  type ProfessionalDetails,
  type ProfessionalState,
} from './professional-profile';

export const professionalError = (error: unknown): string => {
  const status = error instanceof ApiClientError ? error.status : 0;
  if (status === 401 || status === 403)
    return 'Your session or account cannot access professional details. Sign in again.';
  if (status === 409)
    return 'Professional details changed elsewhere. Your draft is retained. Reload and review the latest saved details.';
  if (status >= 500)
    return 'The professional details service is unavailable. Your draft is retained. Try again.';
  return 'Professional details could not be loaded or saved. Your draft is retained. Check your connection and try again.';
};

export function useProfessionalProfile() {
  const [state, setState] = useState<ProfessionalState>({ available: false, details: null });
  const [pendingSave, setPendingSave] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const sequence = useRef(0),
    mounted = useRef(false),
    saving = useRef(false);
  const reload = useCallback(async () => {
    if (saving.current) return;
    const request = ++sequence.current;
    setLoading(true);
    setError(null);
    try {
      const value = await getProfessional();
      if (mounted.current && request === sequence.current) setState(value);
    } catch (failure) {
      if (mounted.current && request === sequence.current) setError(professionalError(failure));
    } finally {
      if (mounted.current && request === sequence.current) setLoading(false);
    }
  }, []);
  useEffect(() => {
    mounted.current = true;
    const request = ++sequence.current;
    void getProfessional()
      .then((value) => {
        if (mounted.current && request === sequence.current) setState(value);
      })
      .catch((failure: unknown) => {
        if (mounted.current && request === sequence.current) setError(professionalError(failure));
      })
      .finally(() => {
        if (mounted.current && request === sequence.current) setLoading(false);
      });
    return () => {
      mounted.current = false;
    };
  }, []);
  const save = async (details: ProfessionalDetails, version: string) => {
    if (saving.current) throw new Error('A save is already in progress.');
    saving.current = true;
    setPendingSave(true);
    const request = ++sequence.current;
    try {
      const value = await saveProfessional(details, version);
      if (mounted.current && request === sequence.current) {
        setState(value);
        setError(null);
        setLoading(false);
      }
      return value;
    } finally {
      saving.current = false;
      if (mounted.current) setPendingSave(false);
    }
  };
  return { state, loading, error, reload, save, pendingSave };
}
