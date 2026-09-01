import type { AuthSession } from './session.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      /** authenticated user resolved from the session cookie (if any) */
      user?: AuthSession;
    }
  }
}

export {};
