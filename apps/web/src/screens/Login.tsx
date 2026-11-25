import { useState } from 'react';
import { SignInOptions } from '../components/SignIn.tsx';
import { ServerPicker } from '../components/ServerPicker.tsx';
import { Icon } from '../components/ui.tsx';
import { apiBase } from '../lib/api.ts';
import { navigate } from '../lib/router.ts';
import { useApp } from '../lib/store.tsx';
import { normalizeCode } from '../lib/sync.ts';
import { TermsNote } from './Onboarding.tsx';

/**
 * Sign in to an existing account (from the welcome screen), or – for someone who used Lumen
 * before sign-in became the way in – keep learning with the progress on this device.
 */
export function Login() {
  const { t, settings, updateSettings, signIn } = useApp();
  const returning = settings.onboarded;
  const [consent, setConsent] = useState(false);
  const kid = settings.age === 'u13' || settings.age === '13-15';
  return (
    <main className="onb" id="main">
      <div className="onb-top">
        {!returning ? <button className="icon-btn" onClick={() => navigate('welcome', true)} aria-label={t('onb.back')}><Icon name="back" /></button> : <span style={{ width: 40 }} />}
      </div>
      <div className="onb-body">
        <h1>{t('signin.title')}</h1>
        <p className="sub">{t(returning ? 'signin.introLocal' : 'signin.intro')}</p>
        {kid && (
          <label className="row small consent-row">
            <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} /> {t('signin.parentConsent')}
          </label>
        )}
        <SignInOptions
          serverUrl={apiBase()}
          disabled={kid && !consent}
          onSignedIn={async (r) => {
            if (!r.token) return;
            await signIn({ serverUrl: apiBase(), token: normalizeCode(r.token), lastSync: null, cursor: 0, method: r.method });
            // A new account goes through onboarding (age, name); an existing one is ready.
            if (r.created && !returning) navigate('onboarding/interests', true);
            else {
              updateSettings({ onboarded: true });
              navigate('', true);
            }
          }}
        />
        <TermsNote />
        <div style={{ marginTop: 18 }}><ServerPicker /></div>
      </div>
    </main>
  );
}
