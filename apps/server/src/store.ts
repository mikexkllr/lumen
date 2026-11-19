/**
 * Event storage. SQLite via Node's built-in `node:sqlite` (no native build),
 * suitable for self-hosting. The interface is small so a PostgreSQL
 * implementation can be added for larger deployments.
 */
import { DatabaseSync } from 'node:sqlite';

export interface EventStore {
  insert(account: string, events: { id: string }[]): number;
  since(account: string, cursor: number, limit: number): { events: unknown[]; cursor: number };
  deleteAccount(account: string): number;
  close(): void;
}

export function sqliteStore(path = ':memory:'): EventStore {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS events (
      seq INTEGER PRIMARY KEY AUTOINCREMENT,
      account TEXT NOT NULL,
      id TEXT NOT NULL,
      body TEXT NOT NULL,
      received_at INTEGER NOT NULL,
      UNIQUE (account, id)
    );
    CREATE INDEX IF NOT EXISTS events_account_seq ON events (account, seq);
  `);
  const ins = db.prepare('INSERT OR IGNORE INTO events (account, id, body, received_at) VALUES (?, ?, ?, ?)');
  const sel = db.prepare('SELECT seq, body FROM events WHERE account = ? AND seq > ? ORDER BY seq LIMIT ?');
  const del = db.prepare('DELETE FROM events WHERE account = ?');
  return {
    insert(account, events) {
      let n = 0;
      db.exec('BEGIN');
      try {
        const now = Date.now();
        for (const e of events) n += Number(ins.run(account, e.id, JSON.stringify(e), now).changes);
        db.exec('COMMIT');
      } catch (err) {
        db.exec('ROLLBACK');
        throw err;
      }
      return n;
    },
    since(account, cursor, limit) {
      const rows = sel.all(account, cursor, Math.min(limit, 1_000_000)) as { seq: number; body: string }[];
      return { events: rows.map((r) => JSON.parse(r.body)), cursor: rows.length ? Number(rows[rows.length - 1].seq) : cursor };
    },
    deleteAccount(account) {
      return Number(del.run(account).changes);
    },
    close() {
      db.close();
    },
  };
}
