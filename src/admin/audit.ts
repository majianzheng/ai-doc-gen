import { randomUUID } from 'node:crypto';
import { mkdir, readFile, appendFile, writeFile } from 'node:fs/promises';
import { dirname, normalize, join } from 'node:path';

/**
 * Admin-only audit log. Persisted as newline-delimited JSON (`audit.log`) under
 * DATA_DIR so it survives restarts and can be inspected on disk. Every admin /
 * user action (login, generation, file delete / transfer / download, template
 * and style-template changes, user and SSO management) is recorded with the
 * actor, action, target and a free-text detail.
 *
 * Appends are serialized through a promise chain so concurrent requests never
 * interleave bytes inside one record.
 */

export interface AuditRecordInput {
  /** username of the actor; 'system' for unauthenticated service calls */
  actor?: string;
  /** role of the actor: 'admin' | 'user' | 'system' */
  role?: string;
  /** stable action code, e.g. 'login', 'file.generate', 'template.delete' */
  action: string;
  /** primary object: file key / template id / username / 'sso-config' */
  target?: string;
  /** human-readable detail (free text / JSON) */
  detail?: string;
  /** client IP when available */
  ip?: string;
}

export interface AuditRecord extends AuditRecordInput {
  id: string;
  /** ISO timestamp */
  time: string;
}

export interface AuditPage {
  items: AuditRecord[];
  total: number;
  page: number;
  limit: number;
  pages: number;
  /** distinct action codes present (for the filter dropdown) */
  actions: string[];
}

export interface AuditQuery {
  page?: number;
  limit?: number;
  /** filter by actor username (case-insensitive) */
  actor?: string;
  /** filter by exact action code */
  action?: string;
  /** free-text search across actor/action/target/detail */
  q?: string;
}

export class AuditLogStore {
  private readonly file: string;
  /** serializes appends (a promise chain) so writes are ordered & atomic per line */
  private tail: Promise<void> = Promise.resolve();

  constructor(dataDir: string) {
    this.file = normalize(join(dataDir, 'audit.log'));
  }

  async init(): Promise<void> {
    await mkdir(dirname(this.file), { recursive: true });
  }

  /** Append one record (fire-and-forget; never throws to the caller). */
  record(input: AuditRecordInput): void {
    const rec: AuditRecord = {
      id: randomUUID(),
      time: new Date().toISOString(),
      ...input,
    };
    const line = `${JSON.stringify(rec)}\n`;
    // Keep writes ordered; swallow errors so a busy logger can not break requests.
    this.tail = this.tail
      .then(() => appendFile(this.file, line, 'utf8'))
      .catch(() => { /* keep the chain alive */ });
    void this.tail;
  }

  /** Await until all pending appends have been flushed (for tests / shutdown). */
  async flush(): Promise<void> {
    return this.tail;
  }

  async list(query: AuditQuery = {}): Promise<AuditPage> {
    const page = Math.max(1, Number.isFinite(Number(query.page)) ? Number(query.page) : 1);
    const limit = Math.min(500, Math.max(1, Number.isFinite(Number(query.limit)) ? Number(query.limit) : 20));
    const actor = (query.actor ?? '').trim().toLowerCase();
    const action = (query.action ?? '').trim();
    const q = (query.q ?? '').trim().toLowerCase();

    const all = await this.readAll();

    let rows = all;
    if (actor) rows = rows.filter((r) => (r.actor ?? '').toLowerCase() === actor);
    if (action) rows = rows.filter((r) => r.action === action);
    if (q) {
      rows = rows.filter((r) => `${r.actor ?? ''} ${r.action} ${r.target ?? ''} ${r.detail ?? ''}`.toLowerCase().includes(q));
    }

    const actions = [...new Set(rows.map((r) => r.action))].sort();
    // newest first
    const ordered = [...rows].reverse();
    const total = ordered.length;
    const start = (page - 1) * limit;
    return {
      items: ordered.slice(start, start + limit),
      total,
      page,
      limit,
      pages: Math.max(1, Math.ceil(total / limit)),
      actions,
    };
  }

  /** Wipe the whole audit log (admin-only operation). */
  async clear(): Promise<void> {
    this.tail = this.tail.then(() => writeFile(this.file, '', 'utf8')).catch(() => {});
    await this.tail;
  }

  private async readAll(): Promise<AuditRecord[]> {
    let text: string;
    try {
      text = await readFile(this.file, 'utf8');
    } catch {
      return [];
    }
    const records: AuditRecord[] = [];
    for (const line of text.split('\n')) {
      if (!line.trim()) continue;
      try {
        records.push(JSON.parse(line) as AuditRecord);
      } catch {
        /* skip corrupt lines */
      }
    }
    return records;
  }
}
