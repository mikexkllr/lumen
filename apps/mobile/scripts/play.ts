// Minimal Google Play Developer API client for the release pipeline (no dependencies).
//
//   PLAY_ACCESS_TOKEN (OAuth token with the androidpublisher scope, as CI gets it through
//   Workload Identity Federation) or GOOGLE_APPLICATION_CREDENTIALS (service account key file)
//
//   node apps/mobile/scripts/play.ts status <package>
//   node apps/mobile/scripts/play.ts upload <package> <app.aab> --track internal|alpha [--notes-file f]
//   node apps/mobile/scripts/play.ts listing <package> apps/mobile/store/play/listing.json store-screenshots/play
//
// `upload` sends the bundle and releases it on the track (internal testing, or alpha = closed
// testing). While the app has never been published, Google only accepts draft releases: the
// script then creates a draft and says so; roll it out once in Play Console.
// `listing` sets title and descriptions per language, the contact website and email
// (LUMEN_CONTACT), icon, feature graphic and screenshots (<dir>/<language>/<imageType>/*.png).
import { createSign } from 'node:crypto';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const BASE = 'https://androidpublisher.googleapis.com/androidpublisher/v3/applications';
const UPLOAD = 'https://androidpublisher.googleapis.com/upload/androidpublisher/v3/applications';
const SCOPE = 'https://www.googleapis.com/auth/androidpublisher';

let cached: string | undefined;
async function token(): Promise<string> {
  if (process.env.PLAY_ACCESS_TOKEN) return process.env.PLAY_ACCESS_TOKEN;
  if (cached) return cached;
  const file = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!file) throw new Error('set PLAY_ACCESS_TOKEN or GOOGLE_APPLICATION_CREDENTIALS (service account key)');
  const key = JSON.parse(readFileSync(file, 'utf8'));
  if (key.type !== 'service_account') throw new Error(`${file} is not a service account key`);
  const now = Math.floor(Date.now() / 1000);
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
  const unsigned = `${b64({ alg: 'RS256', typ: 'JWT' })}.${b64({ iss: key.client_email, scope: SCOPE, aud: key.token_uri, iat: now, exp: now + 3600 })}`;
  const jwt = `${unsigned}.${createSign('RSA-SHA256').update(unsigned).sign(key.private_key).toString('base64url')}`;
  const r = await fetch(key.token_uri, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion: jwt }) });
  if (!r.ok) throw new Error(`token: ${r.status} ${await r.text()}`);
  cached = (await r.json()).access_token as string;
  return cached;
}

async function call(method: string, url: string, body?: unknown, type = 'application/json'): Promise<any> {
  const res = await fetch(url, {
    method,
    headers: { authorization: `Bearer ${await token()}`, ...(body === undefined ? {} : { 'content-type': type }) },
    body: body === undefined ? undefined : type === 'application/json' ? JSON.stringify(body) : (body as Buffer),
  });
  const text = await res.text();
  if (!res.ok) throw new PlayError(`${method} ${url.replace(/^https:\/\/[^/]+/, '')} -> ${res.status}\n${text}`, text);
  return text ? JSON.parse(text) : null;
}

class PlayError extends Error {
  body: string;
  constructor(message: string, body: string) {
    super(message);
    this.body = body;
  }
}

/**
 * One edit: every change inside `fn` goes live together on commit. Changed in Play Console
 * meanwhile? Google refuses the commit, so the whole edit runs again (up to three times).
 */
async function edit<T>(pkg: string, fn: (id: string, url: string) => Promise<T>): Promise<T> {
  const app = `${BASE}/${pkg}`;
  for (let attempt = 1; ; attempt++) {
    try {
      const { id } = await call('POST', `${app}/edits`, {});
      const out = await fn(id, `${app}/edits/${id}`);
      try {
        await call('POST', `${app}/edits/${id}:commit`);
      } catch (e) {
        // Apps with managed publishing (or changes waiting for review) need the review started in Play Console.
        if (!(e instanceof PlayError) || !e.body.includes('changesNotSentForReview')) throw e;
        await call('POST', `${app}/edits/${id}:commit?changesNotSentForReview=true`);
        console.log('committed; send the changes for review in Play Console (Publishing overview)');
      }
      return out;
    } catch (e) {
      if (attempt >= 3 || !(e instanceof PlayError) || !/outside of this Edit/i.test(e.body)) throw e;
      console.log(`the app was changed in Play Console meanwhile – starting a new edit (attempt ${attempt + 1})`);
      await new Promise((r) => setTimeout(r, 15_000 * attempt));
    }
  }
}

async function status(pkg: string) {
  await edit(pkg, async (_, url) => {
    const { tracks = [] } = await call('GET', `${url}/tracks`);
    for (const t of tracks) {
      for (const r of t.releases ?? []) console.log(`${t.track}: ${r.name ?? '–'} (${(r.versionCodes ?? []).join(', ')}) ${r.status}`);
    }
  });
}

async function upload(pkg: string, aab: string, track: string, notes?: string) {
  const bytes = readFileSync(aab);
  const release = (status: string, versionCode: number) => ({
    track,
    releases: [{ name: `${versionName()} (${versionCode})`, versionCodes: [String(versionCode)], status, ...(notes ? { releaseNotes: [{ language: 'en-US', text: notes.slice(0, 500) }] } : {}) }],
  });
  // Google may refuse a completed release on a draft app at the track update or only at the
  // commit; either way the whole edit runs again with a draft release.
  const attempt = (status: string) => edit(pkg, async (_, url) => {
    const b = await call('POST', `${url.replace(BASE, UPLOAD)}/bundles?uploadType=media`, bytes, 'application/octet-stream');
    console.log(`bundle ${b.versionCode} uploaded (sha256 ${b.sha256})`);
    await call('PUT', `${url}/tracks/${track}`, release(status, b.versionCode));
    return b.versionCode as number;
  });
  let draft = false;
  let versionCode: number;
  try {
    versionCode = await attempt('completed');
  } catch (e) {
    if (!(e instanceof PlayError) || !/draft app/i.test(e.body)) throw e;
    draft = true;
    versionCode = await attempt('draft');
  }
  console.log(draft
    ? `${track}: release ${versionCode} created as a draft – the app is not published yet; roll it out once in Play Console`
    : `${track}: release ${versionCode} rolled out`);
}

function versionName(): string {
  return JSON.parse(readFileSync(join(import.meta.dirname, '../package.json'), 'utf8')).version;
}

const IMAGE_TYPES = ['phoneScreenshots', 'sevenInchScreenshots', 'tenInchScreenshots'];

// Contact details, texts and images go in separate edits, so a refused part (missing
// permission, unknown language) does not hold back the others; the command fails at the end.
async function listing(pkg: string, file: string, shots: string) {
  const spec = JSON.parse(readFileSync(file, 'utf8'));
  const store = join(file, '..');
  const failed: string[] = [];
  const step = async (name: string, fn: (url: string) => Promise<void>) => {
    try {
      await edit(pkg, (_, url) => fn(url));
      console.log(`${name}: ok`);
    } catch (e) {
      failed.push(name);
      console.error(`${name}: ${e instanceof Error ? e.message : e}`);
    }
  };
  await step('contact details', async (url) => {
    const details = await call('GET', `${url}/details`);
    await call('PUT', `${url}/details`, { ...details, defaultLanguage: spec.defaultLanguage, contactWebsite: spec.contactWebsite, ...(process.env.LUMEN_CONTACT ? { contactEmail: process.env.LUMEN_CONTACT } : {}) });
  });
  for (const [language, l] of Object.entries(spec.locales as Record<string, { title: string; shortDescription: string; fullDescription: string }>)) {
    await step(`${language} texts`, async (url) => {
      await call('PUT', `${url}/listings/${language}`, { language, title: l.title, shortDescription: l.shortDescription, fullDescription: l.fullDescription });
    });
    const images: [string, string[]][] = [
      ['icon', [join(store, 'icon.png')]],
      ['featureGraphic', [join(store, `feature-graphic-${language}.png`)]],
      ...IMAGE_TYPES.map((t): [string, string[]] => {
        const dir = join(shots, language, t);
        return [t, existsSync(dir) ? readdirSync(dir).filter((f) => f.endsWith('.png')).sort().map((f) => join(dir, f)) : []];
      }),
    ];
    await step(`${language} images`, async (url) => {
      for (const [type, files] of images) {
        if (!files.length || !files.every(existsSync)) continue;
        await call('DELETE', `${url}/listings/${language}/${type}`);
        for (const f of files) await call('POST', `${url.replace(BASE, UPLOAD)}/listings/${language}/${type}?uploadType=media`, readFileSync(f), 'image/png');
        console.log(`${language} ${type}: ${files.length}`);
      }
    });
  }
  if (failed.length) throw new Error(`not updated: ${failed.join(', ')}`);
  console.log('store listing updated');
}

const [cmd, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
try {
  if (cmd === 'status') await status(args[0]);
  else if (cmd === 'upload') {
    const track = flag('--track');
    if (track !== 'internal' && track !== 'alpha') throw new Error('--track internal|alpha');
    const notes = flag('--notes-file');
    await upload(args[0], args[1], track, notes ? readFileSync(notes, 'utf8').trim() : undefined);
  } else if (cmd === 'listing') await listing(args[0], args[1], args[2]);
  else {
    console.error('usage: play.ts status <package> | upload <package> <aab> --track internal|alpha [--notes-file f] | listing <package> <listing.json> <screenshots dir>');
    process.exit(2);
  }
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
