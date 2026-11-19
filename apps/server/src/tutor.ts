/**
 * Lux tutor endpoint (AGPL-3.0-or-later).
 *
 * Talks to any OpenAI-compatible chat endpoint: a local model via Ollama or
 * llama.cpp during development, OpenRouter (or similar) in production. The
 * system prompt is built here from the structured lesson context – clients
 * cannot replace it. Every model reply passes the engine's leak guard; if the
 * model gives the answer away twice, the deterministic rule tutor answers.
 */
import { findLeak, intentText, isEcho, isFreeText, ruleReply, tutorMessages, type ChatMessage, type TutorContext, type TutorIntent } from '@lumen/engine';

export interface TutorConfig {
  /** Base URL of an OpenAI-compatible API, e.g. http://localhost:11434/v1 or https://openrouter.ai/api/v1 */
  url: string;
  model: string;
  apiKey?: string;
  /** Sent as reasoning_effort when set (e.g. "none" for small local reasoning models). */
  reasoning?: string;
  maxTokens: number;
  temperature: number;
  timeoutMs: number;
}

export function tutorConfigFromEnv(env: NodeJS.ProcessEnv = process.env): TutorConfig | null {
  if (env.LUMEN_TUTOR === 'off') return null;
  const url = env.LUMEN_TUTOR_URL ?? 'http://localhost:11434/v1';
  const local = /localhost|127\.0\.0\.1/.test(url);
  return {
    url: url.replace(/\/$/, ''),
    model: env.LUMEN_TUTOR_MODEL ?? (local ? 'qwen3:1.7b' : 'qwen/qwen3-30b-a3b'),
    apiKey: env.LUMEN_TUTOR_API_KEY || undefined,
    reasoning: env.LUMEN_TUTOR_REASONING ?? (local ? 'none' : undefined),
    maxTokens: Number(env.LUMEN_TUTOR_MAX_TOKENS ?? 220),
    temperature: Number(env.LUMEN_TUTOR_TEMPERATURE ?? 0.3),
    timeoutMs: Number(env.LUMEN_TUTOR_TIMEOUT_MS ?? 20_000),
  };
}

const INTENTS = new Set<TutorIntent>(['why-wrong', 'hint', 'rephrase', 'explain-task', 'why-right', 'explain-step', 'simpler', 'example', 'deeper', 'quiz', 'teach-feedback', 'chat', 'reasoning']);
const STATUSES = new Set(['unanswered', 'wrong', 'correct', 'revealed', 'explain']);

export interface TutorRequest {
  context: TutorContext;
  history: ChatMessage[];
  intent: TutorIntent;
  message?: string;
}

const str = (v: unknown, max: number) => typeof v === 'string' && v.length <= max;
const strOpt = (v: unknown, max: number) => v === undefined || str(v, max);

/** Validates an untrusted request body. Returns an error string or the typed request. */
export function parseTutorRequest(body: unknown): TutorRequest | string {
  if (!body || typeof body !== 'object') return 'body must be an object';
  const b = body as Record<string, unknown>;
  const c = b.context as Record<string, unknown> | undefined;
  if (!c || typeof c !== 'object') return 'missing context';
  if (JSON.stringify(c).length > 8000) return 'context too large';
  if (!str(c.task, 1200) || !str(c.kind, 40) || !str(c.locale, 10) || !STATUSES.has(c.status as string)) return 'invalid context';
  for (const k of ['course', 'lesson', 'setup', 'learner', 'answer', 'mistake', 'solution', 'explanation']) if (!strOpt(c[k], 600)) return `invalid ${k}`;
  if (!Array.isArray(c.hints) || c.hints.length > 6 || !c.hints.every((h) => str(h, 400))) return 'invalid hints';
  if (c.options !== undefined && (!Array.isArray(c.options) || c.options.length > 8 || !c.options.every((o) => str(o, 200)))) return 'invalid options';
  const g = c.guard as Record<string, unknown> | undefined;
  if (!g || !Array.isArray(g.numbers) || !Array.isArray(g.phrases) || !Array.isArray(g.letters)) return 'invalid guard';
  if (!g.numbers.every((n) => typeof n === 'number') || !g.phrases.every((p) => str(p, 200)) || !g.letters.every((l) => str(l, 1))) return 'invalid guard';
  if (typeof b.intent !== 'string' || !INTENTS.has(b.intent as TutorIntent)) return 'invalid intent';
  if (isFreeText(b.intent as TutorIntent) && !str(b.message, 500)) return 'missing message';
  const history = Array.isArray(b.history) ? b.history : [];
  if (history.length > 16) return 'history too long';
  for (const m of history) {
    const mm = m as Record<string, unknown>;
    if (!mm || (mm.role !== 'user' && mm.role !== 'assistant') || !str(mm.content, 1200)) return 'invalid history';
  }
  return {
    context: { ...(c as unknown as TutorContext), attempts: Number(c.attempts) || 0, hintsShown: Number(c.hintsShown) || 0, v: 1 },
    history: history as ChatMessage[],
    intent: b.intent as TutorIntent,
    message: b.message as string | undefined,
  };
}

export interface TutorReply {
  reply: string;
  source: 'llm' | 'rules';
  model?: string;
  /** Why the rule tutor answered instead of the model. */
  fallback?: 'disabled' | 'unavailable' | 'leak' | 'empty' | 'echo';
}

/** Removes reasoning blocks some models emit and trims to a few sentences. */
export function cleanReply(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*(lux|assistant)\s*:\s*/i, '').trim();
  if (t.length > 700) {
    const cut = t.slice(0, 700);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = end > 200 ? cut.slice(0, end + 1) : `${cut}…`;
  }
  return t;
}

async function complete(cfg: TutorConfig, messages: ChatMessage[], fetchImpl: typeof fetch): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), cfg.timeoutMs);
  try {
    const res = await fetchImpl(`${cfg.url}/chat/completions`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(cfg.apiKey ? { Authorization: `Bearer ${cfg.apiKey}` } : {}),
        'X-Title': 'Lumen',
      },
      body: JSON.stringify({
        model: cfg.model,
        messages,
        max_tokens: cfg.maxTokens,
        temperature: cfg.temperature,
        stream: false,
        ...(cfg.reasoning ? { reasoning_effort: cfg.reasoning } : {}),
      }),
    });
    if (!res.ok) throw new Error(`tutor upstream ${res.status}`);
    const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
    return cleanReply(data.choices?.[0]?.message?.content ?? '');
  } finally {
    clearTimeout(timer);
  }
}

export async function tutorReply(cfg: TutorConfig | null, req: TutorRequest, fetchImpl: typeof fetch = fetch): Promise<TutorReply> {
  const { context: ctx, history, intent } = req;
  const turn = history.filter((m) => m.role === 'assistant').length;
  const rules = (fallback: TutorReply['fallback']): TutorReply => ({ reply: ruleReply(ctx, intent, turn, req.message), source: 'rules', fallback });
  if (!cfg) return rules('disabled');
  const userText = isFreeText(intent) ? req.message! : intentText(intent, ctx.locale);
  try {
    let echoed = false;
    for (const strict of [false, true]) {
      const text = await complete(cfg, tutorMessages(ctx, history, userText, { strict, intent }), fetchImpl);
      if (!text) return rules('empty');
      if (isEcho(text, history)) {
        echoed = true;
        continue;
      }
      if (!findLeak(text, ctx)) return { reply: text, source: 'llm', model: cfg.model };
    }
    return rules(echoed ? 'echo' : 'leak');
  } catch {
    return rules('unavailable');
  }
}

/** Loads a local model into memory so the first learner question is fast. */
export async function warmUp(cfg: TutorConfig, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  try {
    await complete({ ...cfg, maxTokens: 1, timeoutMs: 120_000 }, [{ role: 'user', content: 'Hallo' }], fetchImpl);
    return true;
  } catch {
    return false;
  }
}
