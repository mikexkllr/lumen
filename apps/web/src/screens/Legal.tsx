import { Icon } from '../components/ui.tsx';
import { legalText, type LegalPage } from '../lib/legal.ts';
import { Markdown } from '../lib/markdown.tsx';
import { href } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';

const PAGES: LegalPage[] = ['privacy', 'terms', 'imprint'];

export function Legal({ page }: { page?: string }) {
  const { t, settings } = useApp();
  const p: LegalPage = PAGES.includes(page as LegalPage) ? (page as LegalPage) : 'privacy';
  return (
    <main id="main" className="fade-in legal">
      <nav className="sc-tabs" aria-label={t('settings.legal')}>
        {PAGES.map((x) => <a key={x} href={href(`legal/${x}`)} aria-current={x === p ? 'page' : undefined}>{t(`legal.${x}`)}</a>)}
      </nav>
      <h1 className="display" style={{ fontSize: '1.75rem' }}>{t(`legal.${p}`)}</h1>
      <p className="small faint"><Icon name="info" size={14} /> {t('legal.draft')}</p>
      {legalText(p, settings.locale).map((s) => (
        <section key={s.h}>
          <h2>{s.h}</h2>
          <Markdown text={s.body} />
        </section>
      ))}
    </main>
  );
}
