/**
 * Moderation for the only user-generated text in Lumen: display names and
 * handles. There are no free-text posts; reactions come from a fixed set.
 * The word list is deliberately short and conservative; operators can extend
 * it with LUMEN_BLOCKED_WORDS (comma-separated).
 */

export const AVATAR_RE = /^c([0-9]|1[01])-i([0-9]|1[0-5])$/;
export const HANDLE_RE = /^[a-z0-9_]{3,20}$/;
export const REACTIONS = ['clap', 'fire', 'heart', 'muscle', 'party', 'star'] as const;
export type Reaction = (typeof REACTIONS)[number];
export const REPORT_REASONS = ['name', 'spam', 'harassment', 'other'] as const;

const RESERVED = ['admin', 'administrator', 'lumen', 'lux', 'mod', 'moderator', 'support', 'official', 'staff', 'team', 'system', 'root', 'help'];

// Substrings that are never acceptable anywhere in a name (checked after normalisation).
const BLOCKED_SUBSTRINGS = [
  'nigger', 'nigga', 'faggot', 'fagot', 'kike', 'chink', 'retard', 'tranny',
  'neger', 'schwuchtel', 'spast', 'kanake', 'zigeuner',
  'hitler', 'heilhitler', 'siegheil', 'kkk',
  'fuck', 'whore', 'slut', 'porn', 'paedo', 'pädo', 'pedophil',
  'ficken', 'fick', 'fotze', 'hure', 'nutte', 'wichser', 'vergewalt', 'arschloch', 'hurensohn', 'missgeburt',
];
// Short words only blocked as a whole word (avoids false positives such as "Scunthorpe" or "Classic").
const BLOCKED_WORDS = ['cunt', 'rape', 'pedo', 'nazi', 'nazis', 'ass', 'dick', 'cock', 'sex', 'fag', 'tits', 'arsch', 'titten', 'penis', 'vagina', 'nsdap', 'ss', 'sa', 'hj', 'isis'];

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '8': 'b', '@': 'a', '$': 's', '!': 'i', '|': 'i' };

function extra(): string[] {
  return (process.env.LUMEN_BLOCKED_WORDS ?? '').split(',').map((w) => w.trim().toLowerCase()).filter(Boolean);
}

/** Lowercase, strip accents and leetspeak, collapse repeated letters. */
export function normalizeForFilter(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[0134578@$!|]/g, (c) => LEET[c] ?? c)
    .replace(/(.)\1{2,}/g, '$1$1');
}

export function isOffensive(text: string): boolean {
  if (/1488/.test(text)) return true;
  const n = normalizeForFilter(text);
  const squashed = n.replace(/[^a-zäöüß]/g, '');
  const singles = squashed.replace(/(.)\1+/g, '$1');
  for (const w of [...BLOCKED_SUBSTRINGS, ...extra()]) {
    const ww = w.replace(/[^a-zäöüß0-9]/g, '').replace(/(.)\1{2,}/g, '$1$1');
    if (!ww) continue;
    const single = ww.replace(/(.)\1+/g, '$1');
    if (squashed.includes(ww) || (single.length >= 4 && singles.includes(single))) return true;
  }
  const words = n.split(/[^a-zäöüß]+/).filter(Boolean);
  return words.some((w) => BLOCKED_WORDS.includes(w));
}

/** Returns an error code or null. */
export function checkHandle(handle: unknown): string | null {
  if (typeof handle !== 'string' || !HANDLE_RE.test(handle)) return 'invalid_handle';
  if (RESERVED.some((r) => handle === r || handle.startsWith(`${r}_`) || handle.endsWith(`_${r}`))) return 'reserved_handle';
  if (isOffensive(handle)) return 'offensive_handle';
  return null;
}

/** Returns an error code or null. Letters of any script, digits, spaces and . - _ ' */
export function checkName(name: unknown): string | null {
  if (typeof name !== 'string') return 'invalid_name';
  const n = name.trim();
  if (n.length < 1 || n.length > 30) return 'invalid_name';
  if (!/^[\p{L}\p{M}\p{N} .'_-]+$/u.test(n)) return 'invalid_name';
  if (/(https?|www\.|\.com|\.de|\.net|\.org)/i.test(n)) return 'invalid_name';
  if (isOffensive(n)) return 'offensive_name';
  return null;
}

export const cleanName = (name: string) => name.trim().replace(/\s+/g, ' ');
