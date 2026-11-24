import { useEffect, useState } from 'react';
import { AppleButton } from './AppleButton.tsx';
import { Icon } from './ui.tsx';
import { useApp } from '../lib/store.tsx';
import { appleSignIn, emailStart, emailVerify, linkedSignIns, signInMethods, SignInError, unlinkSignIn } from '../lib/signIn.ts';

type Result = { token?: string; created?: boolean };

/**
 * Sign-in methods of a Lumen server: Apple (iOS app) and an emailed code (everywhere).
 * Without `token` it signs in (onSignedIn gets a device code); with `token` it links the
 * method to that account and shows which methods are already linked.
 */
export function SignInOptions({ serverUrl, token, disabled, onSignedIn, onLinked }: {
  serverUrl: string;
  token?: string;
  disabled?: boolean;
  onSignedIn?: (r: Result) => void;
  onLinked?: (linked: { apple: boolean; email: boolean }) => void;
}) {
  const { t, settings } = useApp();
  const [methods, setMethods] = useState<{ apple: boolean; email: boolean } | null>(null);
  const [linked, setLinked] = useState<{ apple: boolean; email: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');

  useEffect(() => {
    let live = true;
    void signInMethods(serverUrl).then((m) => live && setMethods(m));
    if (token) void linkedSignIns(serverUrl, token).then((l) => { if (live && l) { setLinked(l); onLinked?.(l); } });
    return () => { live = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serverUrl, token]);

  if (!methods || (!methods.apple && !methods.email)) return null;

  const fail = (e: unknown) => {
    const c = e instanceof SignInError ? e.code : 'failed';
    if (c !== 'canceled') setMsg(t(`signin.err.${c}`));
  };
  const done = (r: Result, method: 'apple' | 'email') => {
    if (token) {
      const next = { apple: linked?.apple ?? false, email: linked?.email ?? false, [method]: true };
      setLinked(next);
      onLinked?.(next);
      setMsg(t('signin.linkedOk'));
    } else {
      onSignedIn?.(r);
    }
  };
  const run = async (f: () => Promise<void>) => {
    setBusy(true);
    setMsg(null);
    try {
      await f();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(false);
    }
  };
  const apple = () => run(async () => done(await appleSignIn(serverUrl, token), 'apple'));
  const send = () => run(async () => {
    const address = email.trim();
    await emailStart(serverUrl, address, settings.locale);
    setSentTo(address);
    setCode('');
  });
  const verify = () => run(async () => {
    if (!sentTo) return;
    done(await emailVerify(serverUrl, sentTo, code, token), 'email');
    setSentTo(null);
    setEmail('');
  });
  const unlink = (p: 'apple' | 'email') => run(async () => {
    if (!token) return;
    await unlinkSignIn(serverUrl, token, p);
    const next = { apple: linked?.apple ?? false, email: linked?.email ?? false, [p]: false };
    setLinked(next);
    onLinked?.(next);
  });

  const showApple = methods.apple && !(token && linked?.apple);
  const showEmail = methods.email && !(token && linked?.email);
  return (
    <div className="stack" style={{ gap: 10 }}>
      {token && (linked?.apple || linked?.email) && (
        <div className="stack" style={{ gap: 4 }}>
          {linked.apple && <LinkedRow label={t('signin.linkedApple')} onUnlink={() => unlink('apple')} unlinkLabel={t('signin.unlink')} busy={busy} />}
          {linked.email && <LinkedRow label={t('signin.linkedEmail')} onUnlink={() => unlink('email')} unlinkLabel={t('signin.unlink')} busy={busy} />}
        </div>
      )}
      {showApple && (
        <>
          <AppleButton label={t(token ? 'signin.appleLink' : 'signin.apple')} onClick={apple} disabled={disabled} busy={busy} />
          <p className="small faint" style={{ margin: 0 }}>{t('signin.appleNote')}</p>
        </>
      )}
      {showApple && showEmail && <p className="small faint" style={{ margin: 0, textAlign: 'center' }}>{t('signin.or')}</p>}
      {showEmail && (!sentTo ? (
        <form className="stack" style={{ gap: 8 }} onSubmit={(e) => { e.preventDefault(); void send(); }}>
          <label className="field" style={{ margin: 0 }}>
            <span className="small faint">{t('signin.email')}</span>
            <input className="input" type="email" inputMode="email" autoComplete="email" autoCapitalize="none" spellCheck={false} value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <button className="btn primary block" type="submit" disabled={disabled || busy || !/\S+@\S+\.\S+/.test(email)}>{t(token ? 'signin.emailLink' : 'signin.emailSend')}</button>
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
            <button className="btn primary grow" type="submit" disabled={busy || code.length !== 6}>{t(token ? 'signin.verifyLink' : 'signin.verify')}</button>
            <button className="btn ghost" type="button" onClick={() => { setSentTo(null); setMsg(null); }}>{t('signin.otherEmail')}</button>
          </div>
        </form>
      ))}
      {msg && <p className="small" role="status" style={{ margin: 0 }}>{msg}</p>}
    </div>
  );
}

function LinkedRow({ label, onUnlink, unlinkLabel, busy }: { label: string; onUnlink: () => void; unlinkLabel: string; busy: boolean }) {
  return (
    <div className="row" style={{ justifyContent: 'space-between' }}>
      <span className="small row" style={{ gap: 6 }}><Icon name="check" size={16} /> {label}</span>
      <button className="btn ghost small" type="button" onClick={onUnlink} disabled={busy}>{unlinkLabel}</button>
    </div>
  );
}
