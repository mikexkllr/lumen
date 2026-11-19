import { createHash, createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join, relative } from 'node:path';
import { canonicalJson, compileContent, manifestPayload, runEvals, splitBundles, summarize, type ContentManifest, type Course, type EvalOptions, type Issue, type SourceFile } from '@lumen/engine';

export { canonicalJson, manifestPayload };

export async function loadSourceFiles(dir: string): Promise<SourceFile[]> {
  const out: SourceFile[] = [];
  const walk = async (d: string) => {
    for (const entry of await readdir(d, { withFileTypes: true })) {
      const p = join(d, entry.name);
      if (entry.isDirectory()) {
        if (!entry.name.startsWith('.') && entry.name !== 'node_modules') await walk(p);
      } else if (/\.ya?ml$/.test(entry.name)) {
        out.push({ path: relative(process.cwd(), p), text: await readFile(p, 'utf8') });
      }
    }
  };
  await walk(dir);
  return out.sort((a, b) => a.path.localeCompare(b.path));
}

export async function checkContent(dir: string, locale = 'de', opts: EvalOptions = {}): Promise<{ course: Course; issues: Issue[]; stats: ReturnType<typeof runEvals>['stats'] }> {
  const files = await loadSourceFiles(dir);
  const { course, issues } = compileContent(files, locale);
  const report = runEvals(course, opts);
  return { course, issues: [...issues, ...report.issues], stats: report.stats };
}

export function sha256(text: string): string {
  return createHash('sha256').update(text).digest('hex');
}

export type Manifest = ContentManifest;

export interface BuildOptions {
  locales?: string[];
  /** PKCS8 PEM of an Ed25519 key. */
  signingKeyPem?: string;
  allowErrors?: boolean;
  evals?: EvalOptions;
}

/** Compiles, evaluates and writes content-hashed JSON bundles plus a (signed) manifest. */
export async function buildBundles(dir: string, outDir: string, opts: BuildOptions = {}): Promise<{ manifest: Manifest; issues: Issue[] }> {
  const locales = opts.locales ?? ['de'];
  const files = await loadSourceFiles(dir);
  await rm(outDir, { recursive: true, force: true });
  const allIssues: Issue[] = [];
  const manifest: Manifest = { format: 'lumen-content', schema: '0.1', version: '', generatedAt: new Date().toISOString(), locales: {} };
  for (const locale of locales) {
    const { course, issues } = compileContent(files, locale);
    const report = runEvals(course, opts.evals ?? { variantSamples: 6, fuzzRuns: 8 });
    allIssues.push(...issues, ...report.issues);
    const { catalog, topics } = splitBundles(course);
    const base = join(outDir, locale);
    await mkdir(join(base, 'topics'), { recursive: true });
    const entry: Manifest['locales'][string] = { catalog: { path: '', sha256: '' }, topics: {} };
    for (const t of topics) {
      const json = JSON.stringify(t);
      const hash = sha256(json);
      const rel = `${locale}/topics/${t.topicId}.${hash.slice(0, 10)}.json`;
      await writeFile(join(outDir, rel), json);
      entry.topics[t.topicId] = { path: rel, sha256: hash };
    }
    const catJson = JSON.stringify(catalog);
    const catHash = sha256(catJson);
    const catRel = `${locale}/catalog.${catHash.slice(0, 10)}.json`;
    await writeFile(join(outDir, catRel), catJson);
    entry.catalog = { path: catRel, sha256: catHash };
    manifest.locales[locale] = entry;
  }
  const errors = summarize(allIssues).errors;
  if (errors && !opts.allowErrors) {
    await rm(outDir, { recursive: true, force: true });
    const err = new Error(`${errors} Fehler in den Inhalten – Build abgebrochen. Details: lumen check`);
    (err as Error & { issues?: Issue[] }).issues = allIssues;
    throw err;
  }
  manifest.version = sha256(canonicalJson(manifest.locales)).slice(0, 12);
  if (opts.signingKeyPem) manifest.signature = signManifest(manifest, opts.signingKeyPem);
  await writeFile(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  return { manifest, issues: allIssues };
}

export function signManifest(m: Manifest, privatePem: string): NonNullable<Manifest['signature']> {
  const key = createPrivateKey(privatePem);
  const value = sign(null, Buffer.from(manifestPayload(m)), key).toString('base64');
  const spki = createPublicKey(key).export({ format: 'der', type: 'spki' }) as Buffer;
  // raw 32-byte key = last 32 bytes of the SPKI DER
  return { alg: 'Ed25519', publicKey: spki.subarray(spki.length - 32).toString('base64'), value };
}

export function verifyManifest(m: Manifest, publicKeyRawB64: string): boolean {
  if (!m.signature) return false;
  const raw = Buffer.from(publicKeyRawB64, 'base64');
  const der = Buffer.concat([Buffer.from('302a300506032b6570032100', 'hex'), raw]);
  const key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  return verify(null, Buffer.from(manifestPayload(m)), key, Buffer.from(m.signature.value, 'base64'));
}

export function generateSigningKey(): { privatePem: string; publicKeyRawB64: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519');
  const spki = publicKey.export({ format: 'der', type: 'spki' }) as Buffer;
  return {
    privatePem: privateKey.export({ format: 'pem', type: 'pkcs8' }) as string,
    publicKeyRawB64: spki.subarray(spki.length - 32).toString('base64'),
  };
}

export function formatIssues(issues: Issue[], opts: { color?: boolean; showInfo?: boolean } = {}): string {
  const c = opts.color ?? false;
  const paint = (code: string, s: string) => (c ? `\x1b[${code}m${s}\x1b[0m` : s);
  const icon = { error: paint('31', '✖ Fehler'), warning: paint('33', '▲ Warnung'), info: paint('36', '● Hinweis') };
  const groups = new Map<string, Issue[]>();
  for (const i of issues) {
    if (i.level === 'info' && !opts.showInfo) continue;
    const k = i.file ?? '(allgemein)';
    groups.set(k, [...(groups.get(k) ?? []), i]);
  }
  const lines: string[] = [];
  for (const [file, list] of [...groups.entries()].sort()) {
    lines.push(paint('1', file));
    for (const i of list) lines.push(`  ${icon[i.level]} ${paint('2', `[${i.code}]`)} ${i.step ? paint('2', i.step + ': ') : ''}${i.message}`);
  }
  return lines.join('\n');
}
