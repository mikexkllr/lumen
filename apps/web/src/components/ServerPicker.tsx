import { useState } from 'react';
import { useApp } from '../lib/store.tsx';
import { API_BASE, isValidServerUrl, normalizeServerUrl, probeServer } from '../lib/api.ts';

/**
 * "Use another Lumen server" (self-hosted) before signing in. The account lives on the chosen
 * server, so it can only be changed while signed out.
 */
export function ServerPicker() {
  const { t, settings, updateSettings } = useApp();
  const [url, setUrl] = useState(settings.serverUrl ?? '');
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const apply = async (next: string | null) => {
    setMsg(null);
    if (next !== null && !isValidServerUrl(next)) return setMsg(t('server.invalid'));
    setBusy(true);
    try {
      const target = next === null ? null : normalizeServerUrl(next);
      if (target && !(await probeServer(target))) return setMsg(t('server.unreachable'));
      updateSettings({ serverUrl: target });
      if (!target) setUrl('');
      setMsg(target ? t('server.connected', { url: target }) : t('server.resetDone'));
    } finally {
      setBusy(false);
    }
  };
  return (
    <details className="server-picker" open={!!settings.serverUrl}>
      <summary className="small faint">{t('server.title')}: {settings.serverUrl ? t('server.custom') : t('server.default')}</summary>
      <div className="stack" style={{ gap: 8, marginTop: 10 }}>
        <p className="small muted" style={{ margin: 0 }}>{t('server.intro')}</p>
        <div className="field" style={{ margin: 0 }}>
          <label htmlFor="srv-url" className="small faint">{t('server.url')}</label>
          <input id="srv-url" className="input" type="url" inputMode="url" autoCapitalize="none" spellCheck={false} placeholder={API_BASE.startsWith('http') ? API_BASE : 'https://lumen.example.org/api'} value={url} onChange={(e) => setUrl(e.target.value)} />
        </div>
        <div className="row wrap" style={{ gap: 8 }}>
          <button type="button" className="btn small" disabled={busy || !url.trim()} onClick={() => void apply(url)}>{t('server.connect')}</button>
          {settings.serverUrl && <button type="button" className="btn quiet small" disabled={busy} onClick={() => void apply(null)}>{t('server.reset')}</button>}
        </div>
        {msg && <p className="note" role="status">{msg}</p>}
      </div>
    </details>
  );
}
