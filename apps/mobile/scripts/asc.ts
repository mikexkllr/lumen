// Minimal App Store Connect API client for the release pipeline (no dependencies).
//
//   ASC_KEY_ID, ASC_ISSUER_ID and ASC_KEY_P8 (path to the .p8 file) or ASC_KEY_P8_BASE64
//
//   node apps/mobile/scripts/asc.ts register-bundle-id <bundleId> <name>
//   node apps/mobile/scripts/asc.ts status <bundleId>
//   node apps/mobile/scripts/asc.ts listing <bundleId> apps/mobile/store/listing.json
//   node apps/mobile/scripts/asc.ts screenshots <bundleId> <dir with <locale>/<displayType>/*.png>
//   node apps/mobile/scripts/asc.ts create-certificate <csr.pem> <out-cert.pem>
//   node apps/mobile/scripts/asc.ts create-profile <bundleId> <certId> <name> <out.mobileprovision>
//   node apps/mobile/scripts/asc.ts submit <bundleId> <version> <build> [--whats-new-file <file>]
//   node apps/mobile/scripts/asc.ts unsubmit <bundleId>    take the version out of App Review
//   node apps/mobile/scripts/asc.ts resubmit <bundleId>    submit the editable version again with its build
//
// `submit` waits until <build> has finished processing, creates (or reuses) the App Store
// version <version>, attaches the build, sets "What's New" for every localization (updates
// only), sets the release to happen automatically after approval and submits it for review.
import { createHash, createSign } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const API = 'https://api.appstoreconnect.apple.com';

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

function privateKey(): string {
  if (process.env.ASC_KEY_P8) return readFileSync(process.env.ASC_KEY_P8, 'utf8');
  if (process.env.ASC_KEY_P8_BASE64) return Buffer.from(process.env.ASC_KEY_P8_BASE64, 'base64').toString('utf8');
  throw new Error('set ASC_KEY_P8 (path) or ASC_KEY_P8_BASE64');
}

function token(): string {
  const kid = process.env.ASC_KEY_ID;
  const iss = process.env.ASC_ISSUER_ID;
  if (!kid || !iss) throw new Error('set ASC_KEY_ID and ASC_ISSUER_ID');
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: 'ES256', kid, typ: 'JWT' }));
  const body = b64url(JSON.stringify({ iss, iat: now, exp: now + 15 * 60, aud: 'appstoreconnect-v1' }));
  const sig = createSign('SHA256').update(`${head}.${body}`).sign({ key: privateKey(), dsaEncoding: 'ieee-p1363' });
  return `${head}.${body}.${b64url(sig)}`;
}

type Doc = { data: any; included?: any[] };

async function api(method: string, path: string, body?: unknown): Promise<Doc> {
  const res = await fetch(API + path, {
    method,
    headers: { authorization: `Bearer ${token()}`, 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (res.status === 204) return { data: null };
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status}\n${text}`);
  return JSON.parse(text);
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Version states in which metadata, screenshots and the build can be changed. */
const EDITABLE = ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED', 'INVALID_BINARY'];

async function findApp(bundleId: string) {
  const r = await api('GET', `/v1/apps?filter[bundleId]=${encodeURIComponent(bundleId)}`);
  const app = r.data[0];
  if (!app) throw new Error(`no app with bundle id ${bundleId} in App Store Connect`);
  return app;
}

async function registerBundleId(identifier: string, name: string) {
  const r = await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(identifier)}`);
  const hit = r.data.find((b: any) => b.attributes.identifier === identifier);
  if (hit) return console.log(`bundle id ${identifier} already registered (${hit.id})`);
  const c = await api('POST', '/v1/bundleIds', { data: { type: 'bundleIds', attributes: { identifier, name, platform: 'IOS' } } });
  console.log(`registered bundle id ${identifier} (${c.data.id})`);
}

// Creates an Apple Distribution certificate from a CSR (PEM) and prints it as PEM.
async function createCertificate(csrFile: string, outFile: string) {
  const csr = readFileSync(csrFile, 'utf8').replace(/-----[^-]+-----/g, '').replace(/\s+/g, '');
  const r = await api('POST', '/v1/certificates', { data: { type: 'certificates', attributes: { certificateType: 'DISTRIBUTION', csrContent: csr } } });
  const pem = `-----BEGIN CERTIFICATE-----\n${r.data.attributes.certificateContent.match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
  writeFileSync(outFile, pem, { mode: 0o600 });
  console.log(`certificate ${r.data.id} (${r.data.attributes.name}), expires ${r.data.attributes.expirationDate}`);
}

// Creates an App Store provisioning profile for <bundleId> with certificate <certId>.
async function createProfile(bundleId: string, certId: string, name: string, outFile: string) {
  const b = await api('GET', `/v1/bundleIds?filter[identifier]=${encodeURIComponent(bundleId)}`);
  const bid = b.data.find((x: any) => x.attributes.identifier === bundleId);
  if (!bid) throw new Error(`bundle id ${bundleId} is not registered`);
  const r = await api('POST', '/v1/profiles', {
    data: { type: 'profiles', attributes: { name, profileType: 'IOS_APP_STORE' }, relationships: { bundleId: { data: { type: 'bundleIds', id: bid.id } }, certificates: { data: [{ type: 'certificates', id: certId }] } } },
  });
  writeFileSync(outFile, Buffer.from(r.data.attributes.profileContent, 'base64'), { mode: 0o600 });
  console.log(`profile "${name}" (${r.data.attributes.uuid}), expires ${r.data.attributes.expirationDate}`);
}

// Applies apps/mobile/store/listing.json: categories, name/subtitle/privacy URL per locale,
// description/keywords/URLs per locale of the editable version, copyright, review notes and
// contact (ASC_REVIEW_FIRST_NAME, _LAST_NAME, _PHONE, _EMAIL; kept if not set).
async function listing(bundleId: string, file: string) {
  const L = JSON.parse(readFileSync(file, 'utf8'));
  const app = await findApp(bundleId);
  await api('PATCH', `/v1/apps/${app.id}`, { data: { type: 'apps', id: app.id, attributes: { contentRightsDeclaration: 'DOES_NOT_USE_THIRD_PARTY_CONTENT' } } });

  const infos = await api('GET', `/v1/apps/${app.id}/appInfos`);
  const info = infos.data.find((x: any) => !['READY_FOR_SALE', 'READY_FOR_DISTRIBUTION'].includes(x.attributes.appStoreState ?? x.attributes.state)) ?? infos.data[0];
  await api('PATCH', `/v1/appInfos/${info.id}`, {
    data: { type: 'appInfos', id: info.id, relationships: {
      primaryCategory: { data: { type: 'appCategories', id: L.primaryCategory } },
      ...(L.secondaryCategory ? { secondaryCategory: { data: { type: 'appCategories', id: L.secondaryCategory } } } : {}),
    } },
  });
  const infoLocs = (await api('GET', `/v1/appInfos/${info.id}/appInfoLocalizations`)).data;
  for (const [locale, x] of Object.entries<any>(L.locales)) {
    const attributes = { name: x.name, subtitle: x.subtitle, privacyPolicyUrl: x.privacyPolicyUrl };
    const hit = infoLocs.find((l: any) => l.attributes.locale === locale);
    if (hit) await api('PATCH', `/v1/appInfoLocalizations/${hit.id}`, { data: { type: 'appInfoLocalizations', id: hit.id, attributes } });
    else await api('POST', '/v1/appInfoLocalizations', { data: { type: 'appInfoLocalizations', attributes: { locale, ...attributes }, relationships: { appInfo: { data: { type: 'appInfos', id: info.id } } } } });
    console.log(`app info ${locale}: ${x.name} – ${x.subtitle}`);
  }

  const versions = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const v = versions.data.find((x: any) => ['PREPARE_FOR_SUBMISSION', 'DEVELOPER_REJECTED', 'REJECTED', 'METADATA_REJECTED'].includes(x.attributes.appStoreState));
  if (!v) return console.log('no editable version – app info updated only');
  await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { copyright: L.copyright } } });
  const vLocs = (await api('GET', `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data;
  for (const [locale, x] of Object.entries<any>(L.locales)) {
    const attributes: Record<string, string> = { description: x.description, keywords: x.keywords, supportUrl: x.supportUrl, marketingUrl: x.marketingUrl };
    attributes.promotionalText = x.promotionalText;
    const hit = vLocs.find((l: any) => l.attributes.locale === locale);
    if (hit) await api('PATCH', `/v1/appStoreVersionLocalizations/${hit.id}`, { data: { type: 'appStoreVersionLocalizations', id: hit.id, attributes } });
    else await api('POST', '/v1/appStoreVersionLocalizations', { data: { type: 'appStoreVersionLocalizations', attributes: { locale, ...attributes }, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } });
    console.log(`version ${v.attributes.versionString} ${locale}: description, keywords, URLs`);
  }

  const env = process.env;
  const contact = Object.fromEntries(Object.entries({ contactFirstName: env.ASC_REVIEW_FIRST_NAME, contactLastName: env.ASC_REVIEW_LAST_NAME, contactPhone: env.ASC_REVIEW_PHONE, contactEmail: env.ASC_REVIEW_EMAIL }).filter(([, val]) => val));
  const attributes = { ...contact, demoAccountRequired: false, notes: L.review.notes };
  const rd = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreReviewDetail`).catch(() => ({ data: null }));
  if (rd.data) await api('PATCH', `/v1/appStoreReviewDetails/${rd.data.id}`, { data: { type: 'appStoreReviewDetails', id: rd.data.id, attributes } });
  else await api('POST', '/v1/appStoreReviewDetails', { data: { type: 'appStoreReviewDetails', attributes, relationships: { appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } });
  console.log(`review notes set${Object.keys(contact).length ? ' (with contact)' : ''}`);
}

// Replaces the screenshots of the editable version: <dir>/<locale>/<displayType>/*.png
// (e.g. en-US/APP_IPHONE_67/01-welcome.png), uploaded in file-name order.
async function screenshots(bundleId: string, dir: string) {
  const uploaded: { id: string; name: string }[] = [];
  const app = await findApp(bundleId);
  const versions = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const v = versions.data.find((x: any) => EDITABLE.includes(x.attributes.appStoreState));
  if (!v) throw new Error('no editable version');
  const locs = (await api('GET', `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`)).data;
  for (const locale of readdirSync(dir)) {
    const loc = locs.find((l: any) => l.attributes.locale === locale);
    if (!loc) { console.log(`skip ${locale}: no localization`); continue; }
    const sets = (await api('GET', `/v1/appStoreVersionLocalizations/${loc.id}/appScreenshotSets`)).data;
    for (const type of readdirSync(join(dir, locale))) {
      let set = sets.find((x: any) => x.attributes.screenshotDisplayType === type);
      if (set) {
        const old = (await api('GET', `/v1/appScreenshotSets/${set.id}/appScreenshots`)).data;
        for (const o of old) await api('DELETE', `/v1/appScreenshots/${o.id}`);
      } else {
        set = (await api('POST', '/v1/appScreenshotSets', { data: { type: 'appScreenshotSets', attributes: { screenshotDisplayType: type }, relationships: { appStoreVersionLocalization: { data: { type: 'appStoreVersionLocalizations', id: loc.id } } } } })).data;
      }
      for (const file of readdirSync(join(dir, locale, type)).filter((f) => f.endsWith('.png')).sort()) {
        const bytes = readFileSync(join(dir, locale, type, file));
        const shot = (await api('POST', '/v1/appScreenshots', { data: { type: 'appScreenshots', attributes: { fileName: file, fileSize: bytes.length }, relationships: { appScreenshotSet: { data: { type: 'appScreenshotSets', id: set.id } } } } })).data;
        for (const op of shot.attributes.uploadOperations) {
          const headers = Object.fromEntries(op.requestHeaders.map((h: any) => [h.name, h.value]));
          const r = await fetch(op.url, { method: op.method, headers, body: bytes.subarray(op.offset, op.offset + op.length) });
          if (!r.ok) throw new Error(`upload ${file}: ${r.status}`);
        }
        await api('PATCH', `/v1/appScreenshots/${shot.id}`, { data: { type: 'appScreenshots', id: shot.id, attributes: { uploaded: true, sourceFileChecksum: createHash('md5').update(bytes).digest('hex') } } });
        uploaded.push({ id: shot.id, name: `${locale} ${type} ${file}` });
        console.log(`${locale} ${type}: ${file}`);
      }
    }
  }
  // Apple processes the images before a version with them can be submitted.
  for (const u of uploaded) {
    for (let i = 0; ; i++) {
      const st = (await api('GET', `/v1/appScreenshots/${u.id}`)).data.attributes.assetDeliveryState?.state;
      if (st === 'COMPLETE') break;
      if (st === 'FAILED') throw new Error(`screenshot ${u.name} was rejected by App Store Connect`);
      if (i > 60) throw new Error(`screenshot ${u.name} still ${st} after 5 minutes`);
      await sleep(5000);
    }
  }
  console.log(`${uploaded.length} screenshots processed`);
}

// Takes the version out of App Review (to change screenshots or the build); `resubmit` sends it again.
async function unsubmit(bundleId: string) {
  const app = await findApp(bundleId);
  const subs = await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=WAITING_FOR_REVIEW,IN_REVIEW,UNRESOLVED_ISSUES`);
  if (!subs.data.length) console.log('nothing in App Review');
  for (const sub of subs.data) {
    await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { canceled: true } } });
    console.log(`review submission ${sub.id} (${sub.attributes.state}) canceled`);
  }
  for (let i = 0; i < 60; i++) {
    const v = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
    const open = v.data.find((x: any) => EDITABLE.includes(x.attributes.appStoreState));
    if (open) return console.log(`version ${open.attributes.versionString} is editable (${open.attributes.appStoreState})`);
    await sleep(10_000);
  }
  throw new Error('the version did not become editable within 10 minutes');
}

// Submits the editable version again with the build that is attached to it.
async function resubmit(bundleId: string) {
  const app = await findApp(bundleId);
  const versions = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const v = versions.data.find((x: any) => EDITABLE.includes(x.attributes.appStoreState));
  if (!v) throw new Error('no editable version to submit');
  const b = (await api('GET', `/v1/appStoreVersions/${v.id}/build`)).data;
  if (!b) throw new Error(`version ${v.attributes.versionString} has no build attached`);
  await submit(bundleId, v.attributes.versionString, b.attributes.version);
}

async function status(bundleId: string) {
  const app = await findApp(bundleId);
  const v = await api('GET', `/v1/apps/${app.id}/appStoreVersions?limit=5`);
  console.log(`${app.attributes.name} (${app.id})`);
  for (const x of v.data) console.log(`  version ${x.attributes.versionString}: ${x.attributes.appStoreState}`);
  const b = await api('GET', `/v1/builds?filter[app]=${app.id}&sort=-uploadedDate&limit=5`);
  for (const x of b.data) console.log(`  build ${x.attributes.version}: ${x.attributes.processingState}`);
}

async function waitForBuild(appId: string, version: string, build: string) {
  for (let i = 0; i < 90; i++) {
    const r = await api('GET', `/v1/builds?filter[app]=${appId}&filter[version]=${encodeURIComponent(build)}&filter[preReleaseVersion.version]=${encodeURIComponent(version)}`);
    const b = r.data[0];
    const state = b?.attributes.processingState;
    if (state === 'VALID') return b;
    if (state === 'FAILED' || state === 'INVALID') throw new Error(`build ${version} (${build}) is ${state}`);
    console.log(`waiting for build ${version} (${build}) – ${state ?? 'not visible yet'}`);
    await sleep(20_000);
  }
  throw new Error(`build ${version} (${build}) did not finish processing in 30 minutes`);
}

async function submit(bundleId: string, version: string, build: string, whatsNew?: string) {
  const app = await findApp(bundleId);
  const b = await waitForBuild(app.id, version, build);

  // Encryption: the app only uses HTTPS (ITSAppUsesNonExemptEncryption = NO in Info.plist),
  // so the build needs no export-compliance answer here.

  const versions = await api('GET', `/v1/apps/${app.id}/appStoreVersions?filter[platform]=IOS&limit=10`);
  const editable = EDITABLE;
  let v = versions.data.find((x: any) => x.attributes.versionString === version);
  if (v && !editable.includes(v.attributes.appStoreState)) {
    console.log(`version ${version} is already ${v.attributes.appStoreState} – nothing to submit`);
    return;
  }
  if (!v) {
    // Only one version can be in preparation; rename it if an older number is still open.
    v = versions.data.find((x: any) => editable.includes(x.attributes.appStoreState));
    if (v) {
      await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { versionString: version } } });
    } else {
      const c = await api('POST', '/v1/appStoreVersions', {
        data: { type: 'appStoreVersions', attributes: { platform: 'IOS', versionString: version, releaseType: 'AFTER_APPROVAL' }, relationships: { app: { data: { type: 'apps', id: app.id } } } },
      });
      v = c.data;
    }
  }
  await api('PATCH', `/v1/appStoreVersions/${v.id}`, { data: { type: 'appStoreVersions', id: v.id, attributes: { releaseType: 'AFTER_APPROVAL' } } });
  await api('PATCH', `/v1/appStoreVersions/${v.id}/relationships/build`, { data: { type: 'builds', id: b.id } });
  console.log(`version ${version}: build ${build} attached`);

  const live = versions.data.some((x: any) => x.attributes.appStoreState === 'READY_FOR_SALE');
  if (live && whatsNew) {
    const locs = await api('GET', `/v1/appStoreVersions/${v.id}/appStoreVersionLocalizations`);
    for (const l of locs.data) {
      await api('PATCH', `/v1/appStoreVersionLocalizations/${l.id}`, { data: { type: 'appStoreVersionLocalizations', id: l.id, attributes: { whatsNew } } });
    }
    console.log(`"What's New" set for ${locs.data.length} localization(s)`);
  }

  const open = await api('GET', `/v1/reviewSubmissions?filter[app]=${app.id}&filter[platform]=IOS&filter[state]=READY_FOR_REVIEW`);
  const sub = open.data[0] ?? (await api('POST', '/v1/reviewSubmissions', { data: { type: 'reviewSubmissions', attributes: { platform: 'IOS' }, relationships: { app: { data: { type: 'apps', id: app.id } } } } })).data;
  try {
    await api('POST', '/v1/reviewSubmissionItems', { data: { type: 'reviewSubmissionItems', relationships: { reviewSubmission: { data: { type: 'reviewSubmissions', id: sub.id } }, appStoreVersion: { data: { type: 'appStoreVersions', id: v.id } } } } });
  } catch (e) {
    if (!String(e).includes('409')) throw e; // already part of this submission
  }
  await api('PATCH', `/v1/reviewSubmissions/${sub.id}`, { data: { type: 'reviewSubmissions', id: sub.id, attributes: { submitted: true } } });
  console.log(`version ${version} submitted for review; it is released automatically once approved`);
}

const [cmd, ...args] = process.argv.slice(2);
const flag = (name: string) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
try {
  if (cmd === 'register-bundle-id') await registerBundleId(args[0], args[1] ?? args[0]);
  else if (cmd === 'status') await status(args[0]);
  else if (cmd === 'screenshots') await screenshots(args[0], args[1]);
  else if (cmd === 'unsubmit') await unsubmit(args[0]);
  else if (cmd === 'resubmit') await resubmit(args[0]);
  else if (cmd === 'listing') await listing(args[0], args[1]);
  else if (cmd === 'create-certificate') await createCertificate(args[0], args[1]);
  else if (cmd === 'create-profile') await createProfile(args[0], args[1], args[2], args[3]);
  else if (cmd === 'submit') {
    const file = flag('--whats-new-file');
    await submit(args[0], args[1], args[2], file ? readFileSync(file, 'utf8').trim() : undefined);
  } else {
    console.error('usage: asc.ts register-bundle-id <id> <name> | status <id> | submit <id> <version> <build> [--whats-new-file f]');
    process.exit(2);
  }
} catch (e) {
  console.error(String(e instanceof Error ? e.message : e));
  process.exit(1);
}
