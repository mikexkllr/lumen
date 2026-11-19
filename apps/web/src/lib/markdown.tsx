/**
 * Safe Markdown subset for content: paragraphs, line breaks, lists, **bold**,
 * *italic*, `code`, $inline math$ and $$display math$$. Only KaTeX output is
 * injected as HTML; everything else goes through React (auto-escaped).
 */
import katex from 'katex';
import { Fragment, type ReactNode } from 'react';

function math(tex: string, display: boolean, key: string): ReactNode {
  const html = katex.renderToString(tex, { throwOnError: false, displayMode: display, output: 'htmlAndMathml', trust: false });
  return <span key={key} className={display ? 'math-display' : 'math'} dangerouslySetInnerHTML={{ __html: html }} />;
}

export function inline(text: string, keyBase = 'i'): ReactNode[] {
  const parts = text.split(/(\$\$[^$]+\$\$|\$[^$\n]+\$|\*\*[^*]+\*\*|\*[^*\n]+\*|`[^`]+`)/g);
  return parts.map((p, i) => {
    const key = `${keyBase}-${i}`;
    if (p.startsWith('$$') && p.endsWith('$$') && p.length > 4) return math(p.slice(2, -2), true, key);
    if (p.startsWith('$') && p.endsWith('$') && p.length > 2) return math(p.slice(1, -1), false, key);
    if (p.startsWith('**') && p.endsWith('**') && p.length > 4) return <strong key={key}>{inline(p.slice(2, -2), key)}</strong>;
    if (p.startsWith('*') && p.endsWith('*') && p.length > 2) return <em key={key}>{inline(p.slice(1, -1), key)}</em>;
    if (p.startsWith('`') && p.endsWith('`') && p.length > 2) return <code key={key}>{p.slice(1, -1)}</code>;
    return <Fragment key={key}>{typo(p)}</Fragment>;
  });
}

/** Keep numbers and their units together (no line break in »40 %«). */
const typo = (s: string) => s.replace(/(\d) (%|€|°|km\/h|km|cm|mm|m²|m³|cm²|cm³|m|kg|g|MB|GB|kB|kWh|Wh|W|V|A|Ω|h|s|ms|Min\.|Jahre|Uhr)(?=$|[\s.,;:!?)–])/g, '$1\u00a0$2');

export function Markdown({ text, className }: { text: string; className?: string }) {
  const blocks = text.trim().split(/\n\s*\n/);
  return (
    <div className={`md ${className ?? ''}`}>
      {blocks.map((b, bi) => {
        const lines = b.split('\n').map((l) => l.trim()).filter(Boolean);
        if (lines.length && lines.every((l) => /^[-*] /.test(l))) {
          return (
            <ul key={bi}>
              {lines.map((l, li) => (
                <li key={li}>{inline(l.slice(2), `${bi}-${li}`)}</li>
              ))}
            </ul>
          );
        }
        return (
          <p key={bi}>
            {lines.map((l, li) => (
              <Fragment key={li}>
                {li > 0 && <br />}
                {inline(l, `${bi}-${li}`)}
              </Fragment>
            ))}
          </p>
        );
      })}
    </div>
  );
}

/** Plain text for aria labels. */
export function plain(text: string): string {
  return text.replace(/\$([^$]+)\$/g, '$1').replace(/[*`]/g, '').replace(/\\frac\{\s*([^}]*)\}\{\s*([^}]*)\}/g, '$1/$2');
}
