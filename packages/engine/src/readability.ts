/**
 * Readability helpers for authoring evals.
 * German: Flesch-Reading-Ease nach Amstad (180 − ASL − 58,5 · ASW).
 * English: classic Flesch (206.835 − 1.015 · ASL − 84.6 · ASW).
 */

export function plainText(md: string): string {
  return md
    .replace(/\$\$[\s\S]*?\$\$/g, ' Formel ')
    .replace(/\$[^$\n]+\$/g, ' Formel ')
    .replace(/`[^`]*`/g, ' Code ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[*_#>|~-]+/g, ' ')
    .replace(/\{\{[^}]*\}\}/g, ' 5 ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function words(text: string): string[] {
  return text.split(/\s+/).map((w) => w.replace(/[^\p{L}\p{N}]/gu, '')).filter(Boolean);
}

export function wordCount(md: string): number {
  return words(plainText(md)).length;
}

export function syllables(word: string, locale: string): number {
  const w = word.toLowerCase();
  if (/^\d+$/.test(w)) return Math.max(1, Math.ceil(w.length / 2));
  if (locale.startsWith('de')) {
    const groups = w.replace(/(ei|ie|au|eu|äu|ai|ey|ay)/g, 'a').match(/[aeiouäöüy]+/g);
    return Math.max(1, groups?.length ?? 1);
  }
  const groups = w.replace(/e$/, '').match(/[aeiouy]+/g);
  return Math.max(1, groups?.length ?? 1);
}

export function readingEase(md: string, locale = 'de'): number | null {
  const text = plainText(md);
  const sentences = text.split(/[.!?:]+(?:\s|$)/).filter((s) => words(s).length > 0);
  const ws = words(text);
  if (ws.length < 8 || !sentences.length) return null;
  const asl = ws.length / sentences.length;
  const asw = ws.reduce((s, w) => s + syllables(w, locale), 0) / ws.length;
  return locale.startsWith('de') ? 180 - asl - 58.5 * asw : 206.835 - 1.015 * asl - 84.6 * asw;
}
