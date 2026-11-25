import { createContext, useContext, useEffect, useRef, type ReactNode } from 'react';
import { useApp } from './store.tsx';
import { ApiError, connOf, createProfile, social, useQuery, type MeResponse, type Query, type SocialConn } from './social.ts';
import { isKid } from './settings.ts';

interface SocialState {
  /** Social is possible here: signed in, profile cached, not in kids mode. */
  active: boolean;
  conn: SocialConn | null;
  me: Query<MeResponse>;
}

const Ctx = createContext<SocialState | null>(null);

/**
 * Shares the caller's social profile (badge counts, league) across screens and refreshes it
 * after each sync. The profile is created automatically from the name chosen in onboarding as
 * soon as the server is reachable; there is no separate sign-up for the community.
 */
export function SocialProvider({ children }: { children: ReactNode }) {
  const { settings, syncNonce, updateSettings, online } = useApp();
  const conn = connOf(settings);
  const kid = isKid(settings);
  const active = !!(conn && settings.social && !kid);
  // With a profile: refresh after every sync. Without one: probe once per account, so a
  // profile created on another device shows up here too.
  const key = !conn || kid || !online ? null : active ? `me:${conn.token}:${syncNonce}` : `probe:${conn.token}:${settings.communityName ?? ''}`;
  const me = useQuery<MeResponse>(key, () => social.me(conn!));
  const creating = useRef(false);
  useEffect(() => {
    if (!(me.error instanceof ApiError) || me.error.status !== 404) return;
    if (settings.social) updateSettings({ social: null });
    // No profile yet: create it from the onboarding name (adults only).
    const name = settings.communityName;
    if (!conn || kid || settings.age !== '16+' || !name || creating.current) return;
    creating.current = true;
    createProfile(conn, name)
      .then((p) => {
        updateSettings({ social: { userId: p.id, handle: p.handle } });
        me.reload();
      })
      .catch(() => { /* offline or name rejected: the community tab offers to try again */ })
      .finally(() => { creating.current = false; });
  }, [me.error]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    const p = me.data?.profile;
    if (p && !kid && (settings.social?.userId !== p.id || settings.social?.handle !== p.handle)) updateSettings({ social: { userId: p.id, handle: p.handle }, ...(settings.age === null ? { age: '16+' as const } : {}) });
  }, [me.data]); // eslint-disable-line react-hooks/exhaustive-deps
  return <Ctx.Provider value={{ active, conn, me }}>{children}</Ctx.Provider>;
}

export function useSocial(): SocialState {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSocial outside SocialProvider');
  return v;
}
