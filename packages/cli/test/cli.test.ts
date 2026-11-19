import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundles, checkContent, generateSigningKey, sha256, verifyManifest, type Manifest } from '../src/index.ts';

const CONTENT = join(import.meta.dirname, '../../../content');

describe('lumen check', () => {
  it('the shipped content passes all evals without errors or warnings', async () => {
    const { issues, stats } = await checkContent(CONTENT);
    const bad = issues.filter((i) => i.level !== 'info');
    expect(bad, JSON.stringify(bad, null, 2)).toEqual([]);
    expect(stats.topics).toBeGreaterThanOrEqual(3);
    expect(stats.problems).toBeGreaterThan(50);
  });

  it('the English translation is complete and faithful', async () => {
    const { issues } = await checkContent(CONTENT, 'en');
    const bad = issues.filter((i) => i.level !== 'info' || i.code === 'i18n.missing').map((i) => `${i.code} ${i.file ?? i.concept}`);
    expect(bad).toEqual([]);
  });
});

describe('lumen build', () => {
  it('writes content-hashed, signed bundles that verify', async () => {
    const out = await mkdtemp(join(tmpdir(), 'lumen-build-'));
    const { privatePem, publicKeyRawB64 } = generateSigningKey();
    const { manifest } = await buildBundles(CONTENT, out, { locales: ['de'], signingKeyPem: privatePem, evals: { variantSamples: 2, fuzzRuns: 2 } });
    const written = JSON.parse(await readFile(join(out, 'manifest.json'), 'utf8')) as Manifest;
    expect(written.version).toBe(manifest.version);
    expect(verifyManifest(written, publicKeyRawB64)).toBe(true);
    // tampering breaks the signature
    expect(verifyManifest({ ...written, version: 'evil' }, publicKeyRawB64)).toBe(false);
    // hashes match the files
    const de = written.locales.de;
    const cat = await readFile(join(out, de.catalog.path), 'utf8');
    expect(sha256(cat)).toBe(de.catalog.sha256);
    const topics = await readdir(join(out, 'de', 'topics'));
    expect(topics.length).toBe(Object.keys(de.topics).length);
    const catalog = JSON.parse(cat);
    expect(catalog.concepts['alg.linear.balance-01'].srsCards).toEqual(['alg.linear.balance-01/x-allein', 'alg.linear.balance-01/rechnen']);
  });
});
