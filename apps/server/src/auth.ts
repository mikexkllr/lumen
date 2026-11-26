/**
 * Sign-in on top of the anonymous sync code: "Sign in with Apple", "Sign in with Google" and
 * email codes.
 *
 * An account is still identified by SHA-256 of a sync code. Sign-in only adds:
 * - auth_links: a hash of Apple's or Google's stable user id ("sub") or of the email address
 *   -> account. The server keeps no email address and no name, only these hashes.
 * - auth_tokens: extra device codes for the same account, handed out when someone signs in on
 *   a new device (the server never learns the original sync code, so it cannot give it back).
 * Deleting the account removes both and revokes the Apple token (App Store guideline 5.1.1(v)).
 */
import { createHash, createHmac, createPublicKey, createSign, createVerify, randomBytes, randomInt } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

export type Provider = 'apple' | 'google' | 'email';
export const PROVIDERS: readonly Provider[] = ['apple', 'google', 'email'];

export interface AuthStore {
  /** Account of a sync-code hash: itself, or the account a device code points to. */
  resolve(tokenHash: string): string;
  addToken(tokenHash: string, account: string): void;
  accountFor(provider: Provider, idHash: string): string | null;
  linkOf(provider: Provider, account: string): { idHash: string; refreshToken: string | null } | null;
  link(provider: Provider, idHash: string, account: string, refreshToken?: string | null): void;
  unlink(provider: Provider, account: string): { refreshToken: string | null } | null;
  /** Removes device codes and all links; returns the Apple link (for revoking it). */
  deleteAccount(account: string): { refreshToken: string | null } | null;
  /** A code of a deleted account: other devices still holding it get signed out. */
  isDeleted(tokenHash: string): boolean;
  /** One-time email codes: stored as hashes, 10 minutes, 5 tries. */
  putEmailCode(idHash: string, codeHash: string, expires: number): void;
  checkEmailCode(idHash: string, codeHash: string, now: number): 'ok' | 'wrong' | 'expired' | 'locked';
  recentEmailCodes(idHash: string, since: number): number;
  close(): void;
}

export function authStore(path = ':memory:'): AuthStore {
  const db = new DatabaseSync(path);
  db.exec(`
    CREATE TABLE IF NOT EXISTS auth_tokens (token_hash TEXT PRIMARY KEY, account TEXT NOT NULL, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS auth_tokens_account ON auth_tokens (account);
    CREATE TABLE IF NOT EXISTS auth_links (provider TEXT NOT NULL, id_hash TEXT NOT NULL, account TEXT NOT NULL, refresh_token TEXT, created_at INTEGER NOT NULL,
      PRIMARY KEY (provider, id_hash), UNIQUE (provider, account));
    CREATE TABLE IF NOT EXISTS email_codes (id_hash TEXT NOT NULL, code_hash TEXT NOT NULL, expires INTEGER NOT NULL, tries INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL);
    CREATE INDEX IF NOT EXISTS email_codes_id ON email_codes (id_hash, created_at);
    CREATE TABLE IF NOT EXISTS deleted_tokens (token_hash TEXT PRIMARY KEY, deleted_at INTEGER NOT NULL);
  `);
  const q = {
    token: db.prepare('SELECT account FROM auth_tokens WHERE token_hash = ?'),
    addToken: db.prepare('INSERT OR IGNORE INTO auth_tokens (token_hash, account, created_at) VALUES (?, ?, ?)'),
    byId: db.prepare('SELECT account FROM auth_links WHERE provider = ? AND id_hash = ?'),
    byAccount: db.prepare('SELECT id_hash, refresh_token FROM auth_links WHERE provider = ? AND account = ?'),
    link: db.prepare('INSERT INTO auth_links (provider, id_hash, account, refresh_token, created_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(provider, id_hash) DO UPDATE SET refresh_token = COALESCE(excluded.refresh_token, auth_links.refresh_token)'),
    unlink: db.prepare('DELETE FROM auth_links WHERE provider = ? AND account = ?'),
    unlinkAll: db.prepare('DELETE FROM auth_links WHERE account = ?'),
    delTokens: db.prepare('DELETE FROM auth_tokens WHERE account = ?'),
    tokensOf: db.prepare('SELECT token_hash FROM auth_tokens WHERE account = ?'),
    tombstone: db.prepare('INSERT OR IGNORE INTO deleted_tokens (token_hash, deleted_at) VALUES (?, ?)'),
    isDeleted: db.prepare('SELECT 1 AS x FROM deleted_tokens WHERE token_hash = ?'),
    putCode: db.prepare('INSERT INTO email_codes (id_hash, code_hash, expires, created_at) VALUES (?, ?, ?, ?)'),
    lastCode: db.prepare('SELECT rowid, code_hash, expires, tries FROM email_codes WHERE id_hash = ? ORDER BY created_at DESC, rowid DESC LIMIT 1'),
    tryCode: db.prepare('UPDATE email_codes SET tries = tries + 1 WHERE rowid = ?'),
    delCodes: db.prepare('DELETE FROM email_codes WHERE id_hash = ? OR expires < ?'),
    countCodes: db.prepare('SELECT COUNT(*) AS n FROM email_codes WHERE id_hash = ? AND created_at > ?'),
  };
  const linkOf = (provider: Provider, account: string) => {
    const r = q.byAccount.get(provider, account) as { id_hash: string; refresh_token: string | null } | undefined;
    return r ? { idHash: r.id_hash, refreshToken: r.refresh_token } : null;
  };
  return {
    resolve: (h) => (q.token.get(h) as { account: string } | undefined)?.account ?? h,
    addToken: (h, account) => void q.addToken.run(h, account, Date.now()),
    accountFor: (provider, idHash) => (q.byId.get(provider, idHash) as { account: string } | undefined)?.account ?? null,
    linkOf,
    link: (provider, idHash, account, refreshToken = null) => void q.link.run(provider, idHash, account, refreshToken, Date.now()),
    unlink(provider, account) {
      const l = linkOf(provider, account);
      q.unlink.run(provider, account);
      return l ? { refreshToken: l.refreshToken } : null;
    },
    deleteAccount(account) {
      const apple = linkOf('apple', account);
      const now = Date.now();
      for (const r of q.tokensOf.all(account) as { token_hash: string }[]) q.tombstone.run(r.token_hash, now);
      q.tombstone.run(account, now);
      q.unlinkAll.run(account);
      q.delTokens.run(account);
      return apple ? { refreshToken: apple.refreshToken } : null;
    },
    isDeleted: (h) => !!q.isDeleted.get(h),
    putEmailCode: (idHash, codeHash, expires) => void q.putCode.run(idHash, codeHash, expires, Date.now()),
    checkEmailCode(idHash, codeHash, now) {
      const r = q.lastCode.get(idHash) as { rowid: number; code_hash: string; expires: number; tries: number } | undefined;
      if (!r || r.expires < now) return 'expired';
      if (r.tries >= 5) return 'locked';
      if (r.code_hash !== codeHash) {
        q.tryCode.run(r.rowid);
        return 'wrong';
      }
      q.delCodes.run(idHash, now);
      return 'ok';
    },
    recentEmailCodes: (idHash, since) => Number((q.countCodes.get(idHash, since) as { n: number }).n),
    close: () => db.close(),
  };
}

/** Same format as the app's sync codes: 20 characters from a 32-letter alphabet, dashed in fours. */
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function newDeviceCode(): string {
  return [...randomBytes(20)].map((b) => ALPHABET[b % 32]).join('').match(/.{4}/g)!.join('-');
}

export const appleSubHash = (sub: string) => createHash('sha256').update(`lumen-apple:${sub}`).digest('hex');

export interface AppleConfig {
  /** Accepted "aud" values: the iOS bundle id (and a Services ID if the web ever signs in). */
  clientIds: string[];
  /** For exchanging the authorization code and revoking tokens; optional but needed for 5.1.1(v). */
  teamId?: string;
  keyId?: string;
  privateKey?: string;
}

export function appleConfigFromEnv(env = process.env): AppleConfig | null {
  const ids = (env.LUMEN_APPLE_CLIENT_IDS ?? '').split(',').map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return null;
  return {
    clientIds: ids,
    teamId: env.LUMEN_APPLE_TEAM_ID || undefined,
    keyId: env.LUMEN_APPLE_KEY_ID || undefined,
    privateKey: env.LUMEN_APPLE_PRIVATE_KEY ? env.LUMEN_APPLE_PRIVATE_KEY.replace(/\\n/g, '\n') : undefined,
  };
}

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url');
const ISSUER = 'https://appleid.apple.com';

type Jwk = { kid: string; kty: string; n: string; e: string; alg?: string };
const jwksCache = new Map<string, { at: number; keys: Jwk[] }>();
async function signingKeys(url: string, fetchImpl: typeof fetch, force = false): Promise<Jwk[]> {
  const hit = jwksCache.get(url);
  if (!force && hit && Date.now() - hit.at < 3_600_000) return hit.keys;
  const r = await fetchImpl(url, { signal: AbortSignal.timeout(5000) });
  if (!r.ok) throw new Error(`signing keys: HTTP ${r.status}`);
  const keys = ((await r.json()) as { keys: Jwk[] }).keys;
  jwksCache.set(url, { at: Date.now(), keys });
  return keys;
}
/** Test hook: start without cached keys (Apple and Google). */
export function resetAppleKeyCache(): void {
  jwksCache.clear();
}

/**
 * Checks an identity token (RS256 signature against the provider's published keys, issuer,
 * audience, expiry, nonce) and returns its stable user id. `nonce` is the raw value the app
 * generated; the provider signed its SHA-256 (hex), so a leaked token alone can't be replayed.
 */
async function verifyIdToken(token: string, nonce: string, o: { keysUrl: string; issuers: string[]; audiences: string[] }, fetchImpl: typeof fetch, now: number): Promise<string> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('malformed token');
  const header = JSON.parse(Buffer.from(parts[0], 'base64url').toString()) as { kid?: string; alg?: string };
  const claims = JSON.parse(Buffer.from(parts[1], 'base64url').toString()) as { iss?: string; aud?: string; exp?: number; sub?: string; nonce?: string };
  if (header.alg !== 'RS256' || !header.kid) throw new Error('unexpected algorithm');
  let jwk = (await signingKeys(o.keysUrl, fetchImpl)).find((k) => k.kid === header.kid);
  if (!jwk) jwk = (await signingKeys(o.keysUrl, fetchImpl, true)).find((k) => k.kid === header.kid);
  if (!jwk) throw new Error('unknown key');
  const key = createPublicKey({ key: jwk, format: 'jwk' } as unknown as Parameters<typeof createPublicKey>[0]);
  const ok = createVerify('RSA-SHA256').update(`${parts[0]}.${parts[1]}`).verify(key, Buffer.from(parts[2], 'base64url'));
  if (!ok) throw new Error('bad signature');
  if (!claims.iss || !o.issuers.includes(claims.iss)) throw new Error('wrong issuer');
  if (!claims.aud || !o.audiences.includes(claims.aud)) throw new Error('wrong audience');
  if (!claims.exp || claims.exp * 1000 < now) throw new Error('expired');
  if (!claims.sub) throw new Error('no subject');
  const expected = createHash('sha256').update(nonce).digest('hex');
  if (!nonce || claims.nonce !== expected) throw new Error('nonce mismatch');
  return claims.sub;
}

/** Checks an Apple identity token and returns Apple's stable user id. */
export function verifyAppleToken(token: string, nonce: string, cfg: AppleConfig, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string> {
  return verifyIdToken(token, nonce, { keysUrl: `${ISSUER}/auth/keys`, issuers: [ISSUER], audiences: cfg.clientIds }, fetchImpl, now);
}

function clientSecret(cfg: AppleConfig, clientId: string): string | null {
  if (!cfg.teamId || !cfg.keyId || !cfg.privateKey) return null;
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid: cfg.keyId }));
  const body = b64url(JSON.stringify({ iss: cfg.teamId, iat: now, exp: now + 300, aud: ISSUER, sub: clientId }));
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key: cfg.privateKey, dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

/** Exchanges the one-time authorization code for a refresh token (kept only to revoke it later). */
export async function appleRefreshToken(code: string, cfg: AppleConfig, fetchImpl: typeof fetch = fetch): Promise<string | null> {
  const clientId = cfg.clientIds[0];
  const secret = clientSecret(cfg, clientId);
  if (!secret || !code) return null;
  const r = await fetchImpl(`${ISSUER}/auth/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, code, grant_type: 'authorization_code' }),
    signal: AbortSignal.timeout(8000),
  });
  if (!r.ok) return null;
  return ((await r.json()) as { refresh_token?: string }).refresh_token ?? null;
}

/** Revokes the user's Apple token when the account is deleted or unlinked. Best effort. */
export async function revokeApple(refreshToken: string | null, cfg: AppleConfig, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const clientId = cfg.clientIds[0];
  const secret = clientSecret(cfg, clientId);
  if (!secret || !refreshToken) return false;
  const r = await fetchImpl(`${ISSUER}/auth/revoke`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: clientId, client_secret: secret, token: refreshToken, token_type_hint: 'refresh_token' }),
    signal: AbortSignal.timeout(8000),
  }).catch(() => null);
  return !!r?.ok;
}

export const googleSubHash = (sub: string) => createHash('sha256').update(`lumen-google:${sub}`).digest('hex');

export interface GoogleConfig {
  /** OAuth client of the web app; Android's Credential Manager issues tokens for it too. */
  webClientId?: string;
  /** OAuth client of the iOS app (sign-in in the system browser sheet). */
  iosClientId?: string;
}

export function googleConfigFromEnv(env = process.env): GoogleConfig | null {
  const web = env.LUMEN_GOOGLE_WEB_CLIENT_ID?.trim() || undefined;
  const ios = env.LUMEN_GOOGLE_IOS_CLIENT_ID?.trim() || undefined;
  return web || ios ? { webClientId: web, iosClientId: ios } : null;
}

const GOOGLE_ISSUERS = ['https://accounts.google.com', 'accounts.google.com'];

/**
 * Checks a Google ID token and returns Google's stable user id. The token's name, email and
 * picture claims are ignored. Lumen keeps no Google token, so there is nothing to revoke.
 */
export function verifyGoogleToken(token: string, nonce: string, cfg: GoogleConfig, fetchImpl: typeof fetch = fetch, now = Date.now()): Promise<string> {
  const audiences = [cfg.webClientId, cfg.iosClientId].filter((s): s is string => !!s);
  return verifyIdToken(token, nonce, { keysUrl: 'https://www.googleapis.com/oauth2/v3/certs', issuers: GOOGLE_ISSUERS, audiences }, fetchImpl, now);
}

/** Email sign-in: the address is only used to send the code; the server keeps HMAC(pepper, address). */
export function normalizeEmail(e: string): string | null {
  const s = e.trim().toLowerCase();
  return s.length <= 254 && /^[^\s@"<>,;:\\]+@[^\s@"<>,;:\\]+\.[a-z]{2,}$/.test(s) ? s : null;
}
export const emailIdHash = (email: string, pepper: string) => createHmac('sha256', pepper).update(`lumen-email:${email}`).digest('hex');
export const emailCodeHash = (idHash: string, code: string) => createHash('sha256').update(`${idHash}:${code}`).digest('hex');
export function newEmailCode(): string {
  return String(randomInt(0, 1_000_000)).padStart(6, '0');
}
