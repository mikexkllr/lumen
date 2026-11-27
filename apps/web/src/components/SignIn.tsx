import { useEffect, useState } from 'react';
import { AppleButton } from './AppleButton.tsx';
import { GoogleButton } from './GoogleButton.tsx';
import { Icon } from './ui.tsx';
import { reportHandled } from '../lib/monitoring.ts';
import { useApp } from '../lib/store.tsx';
import { appleSignIn, emailStart, emailVerify, googleFinish, googleSignIn, linkedSignIns, PROVIDERS, signInMethods, SignInError, takeGoogleRedirect, unlinkSignIn, type Linked, type Provider } from '../lib/signIn.ts';

export type SignInResult = { token?: string; created?: boolean; method: Provider };

const LINKED_LABEL = { apple: 'signin.linkedApple', google: 'signin.linkedGoogle', email: 'signin.linkedEmail' } as const;

/**
 * Sign-in methods of a Lumen server: Apple (iOS app), Google and an emailed code (everywhere).
 * Without `token` it signs in (onSignedIn gets a device code); with `token` it links the
 * method to that account and shows which methods are already linked.
 */
export function SignInOptions({ serverUrl, token, disabled, onSignedIn, onLinked }: {
  serverUrl: string;
  token?: string;
  disabled?: boolean;
  onSignedIn?: (r: SignInResult) => void | Promise<void>;
  onLinked?: (linked: Linked) => void;
}) {
  const { t, settings } = useApp();
  const [methods, setMethods] = useState<{ apple: boolean; google: string | null; email: boolean } | null>(null);
  const [linked, setLinked] = useState<Linked | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  /** Where a failed sign-in broke (provider · step · reason), shown small under the message. */
  const [detail, setDetail] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const [nonce, setNonce] = useState(0);

  const fail = (e: unknown) => {
    const c = e instanceof SignInError ? e.code : 'failed';
    if (c === 'canceled') return;
    setMsg(t(`signin.err.${c}`));
    if (c !== 'failed') return;
    // A sign-in that breaks for no reason the learner can fix: say where, and tell the operator.
    const where = e instanceof SignInError && e.detail ? e.detail : `app · ${(e as Error)?.message ?? String(e)}`.slice(0, 160);
    setDetail(where);
    reportHandled(e, 'signin', { detail: where, linking: !!token });
  };
  const done = async (r: { token?: string; created?: boolean }, method: Provider) => {
    if (token) {
      const next = { apple: linked?.apple ?? false, google: linked?.google ?? false, email: linked?.email ?? false, [method]: true };
      setLinked(next);
      onLinked?.(next);
      setMsg(t('signin.linkedOk'));
    } else {
      await onSignedIn?.({ ...r, method });
    }
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    setDetail(null);
    try {
      await f();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    let live = true;
    setMethods(null);
    void signInMethods(serverUrl).then((m) => live && setMethods(m));
    if (token) void linkedSignIns(serverUrl, token).then((l) => { if (live && l) { setLinked(l); onLinked?.(l); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, token, nonce]);

  // Back from Google's page (web): finish the sign-in this form started.
  useEffect(() => {
    const back = takeGoogleRedirect(serverUrl, !!token);
    if (!back) return;
    if ('error' in back) {
      if (back.error !== 'access_denied') fail(new SignInError('failed', back.error, `google · redirect · ${back.error}`));
      return;
    }
    void run(async () => done(await googleFinish(serverUrl, back.idToken, back.nonce, token), 'google'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!methods) return <p className="small faint" role="status" style={{ margin: 0 }}>{t('loading')}</p>;
  if (!methods.apple && !methods.google && !methods.email) {
    // Linking is optional; signing in is the way into the app, so say why it can't happen.
    if (token) return null;
    return (
      <div className="card stack" role="alert" style={{ gap: 10 }}>
        <p className="small" style={{ margin: 0 }}>{t('signin.unavailable')}</p>
        <button type="button" className="btn ghost small" onClick={() => setNonce((n) => n + 1)}>{t('retry')}</button>
      </div>
    );
  }

  const apple = () => run(async () => done(await appleSignIn(serverUrl, token), 'apple'));
  const google = () => run(async () => done(await googleSignIn(serverUrl, methods.google!, token), 'google'));
  const verifyBtn = busy ? t('loading') : t(token ? 'signin.verifyLink' : 'signin.verify');
  const send = () => run(async () => {
    const address = email.trim();
    await emailStart(serverUrl, address, settings.locale);
    setSentTo(address);
    setCode('');
  });
  const verify = () => run(async () => {
    if (!sentTo) return;
    const r = await emailVerify(serverUrl, sentTo, code, token);
    setSentTo(null);
    setEmail('');
    await done(r, 'email');
  });
  const unlink = (p: Provider) => run(async () => {
    if (!token) return;
    await unlinkSignIn(serverUrl, token, p);
    const next = { apple: linked?.apple ?? false, google: linked?.google ?? false, email: linked?.email ?? false, [p]: false };
    setLinked(next);
    onLinked?.(next);
  });

  const showApple = methods.apple && !(token && linked?.apple);
  const showGoogle = !!methods.google && !(token && linked?.google);
  const showEmail = methods.email && !(token && linked?.email);
  const linkedList = linked ? PROVIDERS.filter((p) => linked[p]) : [];
  return (
    <div className="stack" style={{ gap: 10 }}>
      {token && linkedList.length > 0 && (
        <div className="stack" style={{ gap: 4 }}>
          {/* The last sign-in method stays: without it the account can't be opened on another device. */}
          {linkedList.map((p) => <LinkedRow key={p} label={t(LINKED_LABEL[p])} onUnlink={linkedList.length > 1 ? () => unlink(p) : undefined} unlinkLabel={t('signin.unlink')} busy={busy} />)}
        </div>
      )}
      {showApple && <AppleButton label={t(token ? 'signin.appleLink' : 'signin.apple')} onClick={apple} disabled={disabled} busy={busy} />}
      {showGoogle && <GoogleButton label={t(token ? 'signin.googleLink' : 'signin.google')} onClick={google} disabled={disabled} busy={busy} />}
      {(showApple || showGoogle) && <p className="small faint" style={{ margin: 0 }}>{t(showApple && showGoogle ? 'signin.appleGoogleNote' : showApple ? 'signin.appleNote' : 'signin.googleNote')}</p>}
      {(showApple || showGoogle) && showEmail && <p className="small faint" style={{ margin: 0, textAlign: 'center' }}>{t('signin.or')}</p>}
      {showEmail && (!sentTo ? (
        <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="field" style={{ margin: 0 }}>
            <span className="small faint">{t('signin.email')}</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button className="btn primary block" type="submit" disabled={disabled || busy || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())}>{busy ? t('loading') : t(token ? 'signin.emailLink' : 'signin.emailSend')}</button>
          <p className="small faint" style={{ margin: 0 }}>{t('signin.emailNote')}</p>
        </form>
      ) : (
        <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void verify(); }}>
          <p className="small" style={{ margin: 0 }}>{t('signin.codeSent', { email: sentTo })}</p>
          <label className="field" style={{ margin: 0 }}>
            <span className="small faint">{t('signin.code')}</span>
            <input className="input" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} required autoFocus />
          </label>
          <div className="row" style={{ gap: 8 }}>
            <button className="btn primary grow" type="submit" disabled={busy || code.length !== 6}>{verifyBtn}</button>
            <button className="btn ghost" type="button" disabled={busy} onClick={() => { setSentTo(null); setMsg(null); }}>{t('signin.otherEmail')}</button>
          </div>
        </form>
      ))}
      {msg && (
        <p className="small" role={msg === t('signin.linkedOk') ? 'status' : 'alert'} style={{ margin: 0 }}>
          {msg}
          {detail && <span className="faint" style={{ display: 'block', marginTop: 4, fontSize: '0.75rem', fontFamily: 'var(--mono)', overflowWrap: 'anywhere' }}>{t('signin.errDetail', { detail })}</span>}
        </p>
      )}
    </div>
  );
}

function LinkedRow({ label, onUnlink, unlinkLabel, busy }: { label: string; onUnlink?: () => void; unlinkLabel: string; busy: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between', minHeight: 36 }}>
      <span className="small row" style={{ gap: 6 }}><Icon name="check" size={16} /> {label}</span>
      {onUnlink && <button className="btn ghost small" type="button" onClick={onUnlink} disabled={busy}>{unlinkLabel}</button>}
    </div>
  );
}
