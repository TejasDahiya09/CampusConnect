import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { frontendEnv } from '../config/env';

let supabaseClient: SupabaseClient | undefined;

export const getSupabaseClient = (): SupabaseClient => {
  if (
    !frontendEnv.authConfigured ||
    frontendEnv.supabaseUrl === undefined ||
    frontendEnv.supabasePublishableKey === undefined
  ) {
    throw new Error('Supabase Auth public configuration is required.');
  }

  supabaseClient ??= createClient(frontendEnv.supabaseUrl, frontendEnv.supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
    },
  });

  return supabaseClient;
};
