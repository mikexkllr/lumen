import { createContext, useContext, useEffect, type ReactNode } from 'react';
import { useApp } from './store.tsx';
import { ApiError, connOf, social, useQuery, type MeResponse, type Query, type SocialConn } from './social.ts';
import { isKid } from './settings.ts';

interface SocialState {
  /** Social is possible here: sync code set, profile cached, not in kids mode. */
  active: boolean;
  conn: SocialConn | null;
  me: Query<MeResponse>;
}

const Ctx = createContext<SocialState | null>(null);

/** Shares the caller's social profile (badge counts, league) across screens; refreshes after each sync. */
export function SocialProvider({ children }: { children: ReactNode }) {
  const { settings, syncNonce, updateSettings, online } = useApp();
  const conn = connOf(settings);
  const kid = isKid(settings);
  const active = !!(conn && settings.social && !kid);
  // With a profile: refresh after every sync. Without one: probe once per sync code, so a
  // profile created on another device shows up here too.
  const key = !conn || kid || !online ? null : active ? `me:${conn.token}:${syncNonce}` : `probe:${conn.token}`;
  const me = useQuery<MeResponse>(key, () => social.me(conn!));
  useEffect(() => {
    if (me.error instanceof ApiError && me.error.status === 404 && settings.social) updateSettings({ social: null });
  }, [me.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = me.data?.profile;
    if (p && !kid && (settings.social?.userId !== p.id || settings.social?.handle !== p.handle)) updateSettings({ social: { userId: p.id, handle: p.handle } });
  }, [me.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={{ active, conn, me }}>{children}</Ctx.Provider>;
}

export function useSocial(): SocialState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSocial outside SocialProvider');
  return v;
}
