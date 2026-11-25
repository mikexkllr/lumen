import { useEffect, useState } from 'react';
import { legalText, type LegalPage } from '../lib/legal.ts';
import { tutorStatus, type TutorStatusInfo } from '../lib/tutor.ts';
import { Markdown } from '../lib/markdown.tsx';
import { href } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';

const PAGES: LegalPage[] = ['privacy', 'terms', 'imprint'];
/** Reachable by link (store listings) but not one of the tabs. */
const OTHER: LegalPage[] = ['delete'];

export function Legal({ page }: { page?: string }) {
  const { t, settings } = useApp();
  const p: LegalPage = [...PAGES, ...OTHER].includes(page as LegalPage) ? (page as LegalPage) : 'privacy';
  // The privacy policy names the AI service the server actually uses (the Lux chat itself does not).
  const [ai, setAi] = useState<TutorStatusInfo | null>(null);
  useEffect(() => {
    if (p === 'privacy') tutorStatus().then((i) => setAi(i ?? null)).catch(() => {});
  }, [p]);
  const sections = legalText(p, settings.locale);
  if (p === 'privacy' && ai?.model && ai.provider && !ai.local) {
    const at = sections.findIndex((s) => /Lux/.test(s.h));
    sections.splice(at + 1, 0, { h: t('legal.aiService'), body: t('legal.aiServiceBody', { model: ai.model, provider: ai.provider }) });
  }
  return (
    <main id="main" className="fade-in legal">
      <nav className="sc-tabs" aria-label={t('settings.legal')}>
        {PAGES.map((x) => <a key={x} href={href(`legal/${x}`)} aria-current={x === p ? 'page' : undefined}>{t(`legal.${x}`)}</a>)}
      </nav>
      <h1 className="display" style={{ fontSize: '1.75rem' }}>{t(`legal.${p}`)}</h1>
      {sections.map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          <Markdown text={s.body} />
        </section>
      ))}
    </main>
  );
}
