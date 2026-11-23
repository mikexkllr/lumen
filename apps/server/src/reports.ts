/**
 * Reports of Lux replies (AGPL-3.0-or-later). App stores require that users
 * can flag AI-generated content in the app. A report holds the reply, the
 * learner's question before it and the task – never the sync code or an
 * account – and is deleted after REPORT_RETENTION_DAYS.
 */
import { DatabaseSync } from 'node:sqlite';

export const TUTOR_REPORT_REASONS = ['wrong', 'solution', 'inappropriate', 'other'] as const;
export const REPORT_RETENTION_DAYS = 180;

export interface TutorReport {
  id: number;
  reason: string;
  reply: string;
  question: string;
  task: string;
  kind: string;
  locale: string;
  model: string;
  createdAt: number;
  resolved: boolean;
}

export type TutorReportInput = Omit<TutorReport, 'id' | 'createdAt' | 'resolved'>;

const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');

/** Validates an untrusted report body. Returns an error string or the report. */
export function parseTutorReport(body: unknown): TutorReportInput | string {
  if (!body || typeof body !== 'object') return 'body must be an object';
  const b = body as Record<string, unknown>;
  if (typeof b.reason !== 'string' || !(TUTOR_REPORT_REASONS as readonly string[]).includes(b.reason)) return 'invalid reason';
  if (typeof b.reply !== 'string' || !b.reply.trim() || b.reply.length > 2000) return 'invalid reply';
  for (const k of ['question', 'task']) if (b[k] !== undefined && (typeof b[k] !== 'string' || (b[k] as string).length > 2000)) return `invalid ${k}`;
  return { reason: b.reason, reply: b.reply, question: str(b.question, 2000), task: str(b.task, 2000), kind: str(b.kind, 40), locale: str(b.locale, 10), model: str(b.model, 120) };
}

export function tutorReportStore(path = ':memory:') {
  const db = new DatabaseSync(path);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS tutor_reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reason TEXT NOT NULL,
      reply TEXT NOT NULL,
      question TEXT NOT NULL,
      task TEXT NOT NULL,
      kind TEXT NOT NULL,
      locale TEXT NOT NULL,
      model TEXT NOT NULL,
      created_at INTEGER NOT NULL,
      resolved INTEGER NOT NULL DEFAULT 0
    );
  `);
  const ins = db.prepare('INSERT INTO tutor_reports (reason, reply, question, task, kind, locale, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)');
  const purge = db.prepare('DELETE FROM tutor_reports WHERE created_at < ?');
  const list = db.prepare('SELECT * FROM tutor_reports WHERE resolved = ? ORDER BY id DESC LIMIT 200');
  const resolve = db.prepare('UPDATE tutor_reports SET resolved = 1 WHERE id = ?');
  return {
    add(r: TutorReportInput, now = Date.now()): number {
      purge.run(now - REPORT_RETENTION_DAYS * 86_400_000);
      return Number(ins.run(r.reason, r.reply, r.question, r.task, r.kind, r.locale, r.model, now).lastInsertRowid);
    },
    list(resolved = false): TutorReport[] {
      return (list.all(resolved ? 1 : 0) as Record<string, unknown>[]).map((x) => ({
        id: Number(x.id), reason: String(x.reason), reply: String(x.reply), question: String(x.question), task: String(x.task), kind: String(x.kind), locale: String(x.locale), model: String(x.model), createdAt: Number(x.created_at), resolved: Number(x.resolved) === 1,
      }));
    },
    resolve: (id: number) => Number(resolve.run(id).changes) > 0,
    close: () => db.close(),
  };
}

export type TutorReportStore = ReturnType<typeof tutorReportStore>;
