/**
 * "Bring your own key" for Lux: learners who want a stronger model than the
 * server's default enter an API key of an OpenAI-compatible provider (e.g.
 * OpenRouter). The key stays on the device and requests go from the device
 * straight to the provider – the Lumen server never sees the key. The same
 * system prompt and the same leak guard as on the server apply; if the model
 * gives the answer away twice, the rule tutor answers.
 */
import { findLeak, intentText, isEcho, isFreeText, ruleReply, tutorMessages, type ChatMessage, type TutorContext, type TutorIntent } from '@lumen/engine';

export interface ByokConfig {
  /** Base URL of an OpenAI-compatible API, e.g. https://openrouter.ai/api/v1 */
  url: string;
  model: string;
  key: string;
}

export const BYOK_PROVIDERS = [
  { id: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/api/v1' },
  { id: 'openai', label: 'OpenAI', url: 'https://api.openai.com/v1' },
  { id: 'custom', label: '', url: '' },
] as const;

export function providerLabel(url: string): string {
  const p = BYOK_PROVIDERS.find((x) => x.url && url.replace(/\/$/, '') === x.url);
  if (p) return p.label;
  try {
    return new URL(url).hostname;
  } catch {
    return url;
  }
}

export function isValidByok(c: Partial<ByokConfig>): c is ByokConfig {
  try {
    return !!c.url && new URL(c.url).protocol === 'https:' && !!c.model?.trim() && !!c.key?.trim() && c.key.length <= 400;
  } catch {
    return false;
  }
}

/** Removes reasoning blocks some models emit and trims to a few sentences (same as the server). */
export function cleanReply(text: string): string {
  let t = text.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/^\s*(lux|assistant)\s*:\s*/i, '').trim();
  if (t.length > 700) {
    const cut = t.slice(0, 700);
    const end = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('? '), cut.lastIndexOf('! '));
    t = end > 200 ? cut.slice(0, end + 1) : `${cut}…`;
  }
  return t;
}

export class ByokError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function complete(cfg: ByokConfig, messages: ChatMessage[], maxTokens = 220, timeoutMs = 30_000): Promise<string> {
  const res = await fetch(`${cfg.url.replace(/\/$/, '')}/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.key.trim()}`, 'X-Title': 'Lumen' },
    body: JSON.stringify({ model: cfg.model.trim(), messages, max_tokens: maxTokens, temperature: 0.3, stream: false }),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new ByokError(res.status, `HTTP ${res.status}`);
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  return cleanReply(data.choices?.[0]?.message?.content ?? '');
}

export interface ByokAnswer {
  reply: string;
  source: 'llm' | 'rules';
  model?: string;
  fallback?: string;
}

export async function askByok(cfg: ByokConfig, ctx: TutorContext, history: ChatMessage[], intent: TutorIntent, message?: string): Promise<ByokAnswer> {
  const turn = history.filter((m) => m.role === 'assistant').length;
  const rules = (fallback: string): ByokAnswer => ({ reply: ruleReply(ctx, intent, turn, message), source: 'rules', fallback });
  const userText = isFreeText(intent) ? (message ?? '') : intentText(intent, ctx.locale);
  try {
    let echoed = false;
    for (const strict of [false, true]) {
      const text = await complete(cfg, tutorMessages(ctx, history, userText, { strict, intent }));
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

/** A one-token request to check key, model and URL. Returns null if it works, else the HTTP status (0: network). */
export async function testByok(cfg: ByokConfig): Promise<number | null> {
  try {
    await complete(cfg, [{ role: 'user', content: 'Hi' }], 1, 20_000);
    return null;
  } catch (e) {
    return e instanceof ByokError ? e.status : 0;
  }
}
