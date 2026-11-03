import type { RequestAuthentication, SupabaseIdentity } from '../modules/auth/auth.types.js';

declare global {
  namespace Express {
    interface Request {
      auth?: RequestAuthentication;
      authIdentity?: SupabaseIdentity;
    }
  }
}

export {};
