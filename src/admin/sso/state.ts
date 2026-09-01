import { randomBytes } from 'node:crypto';

/**
 * In-memory store for the per-login state of SSO flows (state / nonce / PKCE
 * verifier / return path). Entries expire automatically. Single-process admin
 * server, so a Map is sufficient.
 */
export interface LoginState {
  state: string;
  /** post-login path to return the browser to */
  relay?: string;
  nonce?: string;
  codeVerifier?: string;
  authnRequestId?: string;
  createdAt: number;
}

export class LoginStateStore {
  private readonly states = new Map<string, LoginState>();
  private readonly ttl = 10 * 60 * 1000;

  set(data: Partial<LoginState>): string {
    this.prune();
    const state = data.state || randomBytes(24).toString('hex');
    this.states.set(state, { ...data, state, createdAt: Date.now() } as LoginState);
    return state;
  }

  get(state: string): LoginState | undefined {
    this.prune();
    const s = this.states.get(state);
    if (s && Date.now() - s.createdAt < this.ttl) return s;
    this.states.delete(state);
    return undefined;
  }

  take(state: string): LoginState | undefined {
    const s = this.get(state);
    this.states.delete(state);
    return s;
  }

  private prune(): void {
    const now = Date.now();
    for (const [k, v] of this.states) if (now - v.createdAt > this.ttl) this.states.delete(k);
  }
}

export const loginStates = new LoginStateStore();

export async function fetchText(url: string, timeoutMs = 15000): Promise<string> {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: ac.signal, redirect: 'follow' });
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url}`);
    return await res.text();
  } finally {
    clearTimeout(timer);
  }
}
