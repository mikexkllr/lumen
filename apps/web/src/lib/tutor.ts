/**
 * Client for the Lux tutor. Talks to the Lumen server (`/v1/tutor`), which
 * calls the language model. Without a server – offline, static hosting, the
 * tutor switched off – Lux answers with the deterministic rule tutor from the
 * engine, so every lesson always has help.
 */
import { intentText, isFreeText, ruleReply, type ChatMessage, type TutorContext, type TutorIntent } from '@lumen/engine';
import { apiBase, onServerChange } from './api.ts';
import { askByok, type ByokConfig } from './byok.ts';

export interface LuxMessage {
  role: 'user' | 'assistant';
  content: string;
  source?: 'llm' | 'rules';
  /** Model that wrote an 'llm' reply (sent along with a report). */
  model?: string;
  /** The learner reported this reply. */
  reported?: boolean;
  /** Lux asked how the learner got to their answer and waits for it. */
  ask?: boolean;
}

export interface LuxAnswer {
  reply: string;
  source: 'llm' | 'rules';
  model?: string;
  fallback?: string;
}

export interface TutorStatusInfo {
  model: string | null;
  local: boolean;
  /** Who runs the model (shown before consent), null for a local model. */
  provider?: string | null;
  /** The server accepts reports of Lux replies. */
  reports?: boolean;
}

let statusCache: Promise<TutorStatusInfo | null> | null = null;
onServerChange(() => {
  statusCache = null;
});

export function tutorStatus(): Promise<TutorStatusInfo | null> {
  statusCache ??= fetch(`${apiBase()}/v1/tutor`, { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? (r.json() as Promise<TutorStatusInfo>) : null))
    .catch(() => null);
  return statusCache;
}

export function userTextFor(intent: TutorIntent, locale: string, message?: string): string {
  return isFreeText(intent) ? (message ?? '') : intentText(intent, locale);
}

export async function askLux(context: TutorContext, history: LuxMessage[], intent: TutorIntent, message?: string, online = true, byok: ByokConfig | null = null): Promise<LuxAnswer> {
  const turn = history.filter((m) => m.role === 'assistant').length;
  const offline = (fallback: string): LuxAnswer => ({ reply: ruleReply(context, intent, turn, message), source: 'rules', fallback });
  if (!online) return offline('disabled');
  // Own API key: the device talks to the learner's provider directly, with the same prompt and leak guard.
  if (byok) return askByok(byok, context, history.slice(-12).map(({ role, content }): ChatMessage => ({ role, content })), intent, message);
  try {
    const res = await fetch(`${apiBase()}/v1/tutor`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ context, history: history.slice(-12).map(({ role, content }): ChatMessage => ({ role, content })), intent, message }),
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return offline('unavailable');
    return (await res.json()) as LuxAnswer;
  } catch {
    return offline('offline');
  }
}

export type LuxReportReason = 'wrong' | 'solution' | 'inappropriate' | 'other';

/** Flags a Lux reply for the moderators (required by the app stores for AI-generated content). */
export async function reportLux(report: { reason: LuxReportReason; reply: string; question?: string; task: string; kind: string; locale: string; model?: string }): Promise<void> {
  const res = await fetch(`${apiBase()}/v1/tutor/reports`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(report),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
}
