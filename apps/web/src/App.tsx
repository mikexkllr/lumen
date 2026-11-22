import { Icon, Logo, Ring } from './components/ui.tsx';
import { dueItems } from '@lumen/engine';
import { href, navigate, useRoute } from './lib/router.ts';
import { useApp } from './lib/store.tsx';
import { Discover, ReviewScreen, TopicScreen } from './screens/Browse.tsx';
import { Home } from './screens/Home.tsx';
import { Onboarding, Welcome } from './screens/Onboarding.tsx';
import { Profile } from './screens/Profile.tsx';
import { Community, SocialSetup, UserScreen } from './screens/Community.tsx';
import { Streak } from './screens/Streak.tsx';
import { Legal } from './screens/Legal.tsx';
import { useSocial } from './lib/socialContext.tsx';
import { isKid } from './lib/settings.ts';
import { lazy, Suspense, useEffect } from 'react';

const Player = lazy(() => import('./screens/Player.tsx').then((m) => ({ default: m.Player })));
const PreviewIndex = lazy(() => import('./screens/Preview.tsx').then((m) => ({ default: m.PreviewIndex })));
const PreviewConcept = lazy(() => import('./screens/Preview.tsx').then((m) => ({ default: m.PreviewConcept })));

const Loading = () => <main className="loading-screen"><Logo size={36} /></main>;

function useTabs() {
  const { t, reviewItems, settings } = useApp();
  const { me } = useSocial();
  const due = dueItems(reviewItems, new Date()).length;
  const socialBadge = me.data ? me.data.unseen + me.data.requests : 0;
  return [
    { id: '', icon: 'learn', label: t('tab.learn') },
    { id: 'discover', icon: 'discover', label: t('tab.discover') },
    { id: 'review', icon: 'review', label: t('tab.review'), badge: due },
    ...(isKid(settings) ? [] : [{ id: 'community', icon: 'trophy', label: t('tab.community'), badge: socialBadge }]),
    { id: 'profile', icon: 'profile', label: t('tab.profile') },
  ];
}

function TabBar({ active }: { active: string }) {
  const tabs = useTabs();
  return (
    <div className="tabbar">
      <nav aria-label="Hauptnavigation">
        {tabs.map((tab) => (
          <a key={tab.id} href={href(tab.id)} aria-current={active === tab.id ? 'page' : undefined}>
            <Icon name={tab.icon} size={22} strokeWidth={active === tab.id ? 2.2 : 1.8} />
            {tab.label}
            {tab.badge ? <span className="badge" aria-label={`${tab.badge}`}>{tab.badge}</span> : null}
          </a>
        ))}
      </nav>
    </div>
  );
}

function Sidebar({ active }: { active: string }) {
  const tabs = useTabs();
  const { t, progress, settings } = useApp();
  const minutes = Math.floor(progress.minutesToday);
  return (
    <aside className="sidebar" aria-label="Seitenleiste">
      <a className="brand" href={href('')}><Logo size={30} /> Lumen</a>
      <nav aria-label="Hauptnavigation" className="stack" style={{ gap: 2 }}>
        {tabs.map((tab) => (
          <a key={tab.id} className="side-link" href={href(tab.id)} aria-current={active === tab.id ? 'page' : undefined}>
            <Icon name={tab.icon} size={19} />
            {tab.label}
            {tab.badge ? <span className="badge">{tab.badge}</span> : null}
          </a>
        ))}
      </nav>
      <div className="side-foot">
        <div className="side-stat">
          <Ring value={minutes / settings.dailyGoal} size={38} stroke={4}>{minutes}</Ring>
          <div><strong>{t('home.goal')}</strong><span>{minutes} / {settings.dailyGoal} min</span></div>
        </div>
        <a className="side-stat" href={href('streak')}>
          <span style={{ width: 38, height: 38, display: 'grid', placeItems: 'center', borderRadius: 12, background: 'color-mix(in srgb, #f97316 12%, transparent)', color: '#f97316' }}><Icon name="flame" size={20} /></span>
          <div><strong>{t('home.streakN', { n: progress.streak.current })}</strong><span>{progress.streak.todayDone ? t('home.streakSafe') : t('home.streakOpen')}</span></div>
        </a>
      </div>
    </aside>
  );
}

export function App() {
  const route = useRoute();
  const app = useApp();
  const { lib, contentError, t, settings, loaded, online } = app;
  const [head, a, b] = route;

  useEffect(() => {
    if (loaded && !settings.onboarded && !['welcome', 'onboarding', 'placement', 'preview', 'legal'].includes(head ?? '')) navigate('welcome', true);
  }, [loaded, settings.onboarded, head]);

  useEffect(() => {
    window.scrollTo(0, 0);
  }, [route.join('/')]);

  if (contentError) {
    return (
      <main className="loading-screen" id="main">
        <div className="card" role="alert" style={{ maxWidth: 420 }}>
          <h1 style={{ fontSize: '1.25rem' }}>{t('error.content')}</h1>
          <p className="small muted" style={{ marginTop: 8 }}>{contentError}</p>
          <button className="btn primary" onClick={app.reloadContent}>{t('retry')}</button>
        </div>
      </main>
    );
  }
  if (!lib || !loaded) return <main className="loading-screen" id="main"><Logo size={40} /><span className="sr-only">{t('loading')}</span></main>;

  let screen: React.ReactNode;
  let tab: string | null = null;
  let wide = false;
  switch (head) {
    case 'welcome':
      return <Welcome />;
    case 'onboarding':
      return <Onboarding />;
    case 'placement':
      return <Suspense fallback={<Loading />}><Player key="placement" mode={{ kind: 'placement' }} /></Suspense>;
    case 'daily':
      return <Suspense fallback={<Loading />}><Player key={`daily-${app.today}`} mode={{ kind: 'daily' }} /></Suspense>;
    case 'mistakes':
      return <Suspense fallback={<Loading />}><Player key={`m-${a}`} mode={{ kind: 'mistakes', topicId: a }} /></Suspense>;
    case 'learn':
      return <Suspense fallback={<Loading />}><Player key={`l-${a}`} mode={{ kind: 'lesson', conceptId: a }} /></Suspense>;
    case 'practice': {
      if (a === 'unit') {
        const topic = lib.catalog.topics.find((tp) => tp.units.some((u) => u.id === b));
        const unit = topic?.units.find((u) => u.id === b);
        const ids = (unit?.concepts ?? []).flatMap((c) => lib.catalog.concepts[c]?.srsCards ?? []);
        return <Suspense fallback={<Loading />}><Player key={`u-${b}`} mode={{ kind: 'review', itemIds: ids, unitId: b }} /></Suspense>;
      }
      const ids = (b ?? '').split(',').filter(Boolean).map(decodeURIComponent);
      return <Suspense fallback={<Loading />}><Player key={`r-${b}`} mode={{ kind: 'review', itemIds: ids }} /></Suspense>;
    }
    case 'topic':
      screen = <TopicScreen topicId={a} />;
      tab = 'discover';
      break;
    case 'review':
      screen = <ReviewScreen />;
      tab = 'review';
      break;
    case 'discover':
      screen = <Discover subject={a} />;
      tab = 'discover';
      wide = true;
      break;
    case 'profile':
      screen = <Profile />;
      tab = 'profile';
      break;
    case 'community':
      screen = a === 'setup' ? <SocialSetup /> : a === 'edit' ? <SocialSetup edit /> : <Community section={a} />;
      tab = 'community';
      break;
    case 'u':
      screen = <UserScreen key={a} refId={a ?? ''} />;
      tab = 'community';
      break;
    case 'streak':
      screen = <Streak />;
      tab = '';
      break;
    case 'legal':
      screen = <Legal page={a} />;
      tab = 'profile';
      break;
    case 'preview':
      screen = <Suspense fallback={<p>{t('loading')}</p>}>{a ? <PreviewConcept conceptId={a} /> : <PreviewIndex />}</Suspense>;
      tab = 'profile';
      wide = true;
      break;
    default:
      screen = <Home />;
      tab = '';
  }
  return (
    <>
      <a href="#main" className="skip-link" onClick={(e) => { e.preventDefault(); const m = document.getElementById('main'); if (m) { m.tabIndex = -1; m.focus(); } }}>{t('skip')}</a>
      <div className="shell">
        <Sidebar active={tab ?? ''} />
        <div className="main">
          <div className={`page ${wide ? 'wide' : ''}`}>
            {!online && <p className="small card amber" role="status" style={{ marginBottom: 12, padding: '10px 14px' }}>{t('offline')}</p>}
            {screen}
          </div>
        </div>
      </div>
      <TabBar active={tab ?? ''} />
    </>
  );
}
