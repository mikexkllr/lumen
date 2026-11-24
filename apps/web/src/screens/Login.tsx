import { SignInOptions } from '../components/SignIn.tsx';
import { Icon } from '../components/ui.tsx';
import { defaultSyncUrl } from '../lib/api.ts';
import { navigate } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';
import { normalizeCode } from '../lib/sync.ts';

/** Sign in on a new device (from the welcome screen): Apple or an emailed code. */
export function Login() {
  const { t, updateSettings } = useApp();
  const server = defaultSyncUrl();
  return (
    <main className="onb" id="main">
      <div className="onb-top">
        <button className="icon-btn" onClick={() => history.back()} aria-label={t('onb.back')}><Icon name="back" /></button>
      </div>
      <div className="onb-body">
        <h1>{t('signin.title')}</h1>
        <p className="sub">{t('signin.intro')}</p>
        <SignInOptions
          serverUrl={server}
          onSignedIn={(r) => {
            if (!r.token) return;
            updateSettings({ onboarded: true, sync: { serverUrl: server, token: normalizeCode(r.token), lastSync: null, cursor: 0, consent: true } });
            navigate('', true);
          }}
        />
        <p className="small faint" style={{ marginTop: 16 }}>{t('signin.age')}</p>
      </div>
    </main>
  );
}
