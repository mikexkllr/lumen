/**
 * Client for the Lux tutor. Talks to the Lumen server (`/v1/tutor`), which
 * calls the language model. Without a server – offline, static hosting, the
 * tutor switched off – Lux answers with the deterministic rule tutor from the
 * engine, so every lesson always has help.
 */
import { intentText, isFreeText, ruleReply, type ChatMessage, type TutorContext, type TutorIntent } from '@lumen/engine';

const BASE = ((import.meta.env.VITE_LUMEN_TUTOR_URL as string | undefined) ?? '/api').replace(/\/$/, '');

export interface LuxMessage {
  role: 'user' | 'assistant';
  content: string;
  source?: 'llm' | 'rules';
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
}

let statusCache: Promise<TutorStatusInfo | null> | null = null;

export function tutorStatus(): Promise<TutorStatusInfo | null> {
  statusCache ??= fetch(`${BASE}/v1/tutor`, { signal: AbortSignal.timeout(4000) })
    .then((r) => (r.ok ? (r.json() as Promise<TutorStatusInfo>) : null))
    .catch(() => null);
  return statusCache;
}

export function userTextFor(intent: TutorIntent, locale: string, message?: string): string {
  return isFreeText(intent) ? (message ?? '') : intentText(intent, locale);
}

export async function askLux(context: TutorContext, history: LuxMessage[], intent: TutorIntent, message?: string, online = true): Promise<LuxAnswer> {
  const turn = history.filter((m) => m.role === 'assistant').length;
  const offline = (fallback: string): LuxAnswer => ({ reply: ruleReply(context, intent, turn, message), source: 'rules', fallback });
  if (!online) return offline('disabled');
  try {
    const res = await fetch(`${BASE}/v1/tutor`, {
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
