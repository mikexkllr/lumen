import { mkdtemp, readFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildBundles, checkContent, generateSigningKey, sha256, verifyManifest, type Manifest } from '../src/index.ts';

const CONTENT = join(import.meta.dirname, '../../../content');

// Checking every lesson and variant takes several seconds on the full catalogue.
describe('lumen check', { timeout: 120_000 }, () => {
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

describe('lumen build', { timeout: 120_000 }, () => {
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
    // a concept is cut into short lessons: core parts on the path, deeper and expert as extras
    const lessons: string[] = catalog.groups['alg.linear.balance-01'];
    expect(lessons.length).toBeGreaterThan(1);
    expect(lessons[0]).toBe('alg.linear.balance-01~c1');
    expect(lessons.flatMap((id) => catalog.concepts[id].srsCards).sort()).toEqual(['alg.linear.balance-01/rechnen', 'alg.linear.balance-01/x-allein']);
    for (const id of lessons) expect(catalog.concepts[id].steps).toBeLessThanOrEqual(6);
    const unit = catalog.topics.find((t: { id: string }) => t.id === 'alg.linear').units.find((u: { concepts: string[] }) => u.concepts.includes(lessons[0]));
    expect(unit.concepts.every((id: string) => catalog.concepts[id].depth === 1)).toBe(true);
    // every lesson of the bundle is in the catalog and the other way round
    const bundle = JSON.parse(await readFile(join(out, de.topics['alg.linear'].path), 'utf8'));
    expect(bundle.concepts.map((c: { id: string }) => c.id).sort()).toEqual(Object.values(catalog.concepts as Record<string, { id: string; topicId: string }>).filter((c) => c.topicId === 'alg.linear').map((c) => c.id).sort());
  });
});
