/**
 * Loads content bundles: manifest → catalog → topic bundles (on demand).
 * Every file is checked against the SHA-256 in the manifest; the manifest
 * signature is verified when a public key is configured.
 */
import { manifestPayload, type Catalog, type Concept, type ContentManifest, type TopicBundle } from '@lumen/engine';

const BASE = `${import.meta.env.BASE_URL}content/`;

async function sha256Hex(text: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

async function fetchText(path: string): Promise<string> {
  const res = await fetch(BASE + path);
  if (!res.ok) throw new Error(`${path}: HTTP ${res.status}`);
  return res.text();
}

async function fetchVerified<T>(entry: { path: string; sha256: string }): Promise<T> {
  const text = await fetchText(entry.path);
  if ((await sha256Hex(text)) !== entry.sha256) throw new Error(`Integritätsprüfung fehlgeschlagen: ${entry.path}`);
  return JSON.parse(text) as T;
}

async function verifySignature(m: ContentManifest, publicKeyB64: string): Promise<boolean> {
  if (!m.signature) return false;
  const raw = Uint8Array.from(atob(publicKeyB64), (c) => c.charCodeAt(0));
  const sig = Uint8Array.from(atob(m.signature.value), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', raw, { name: 'Ed25519' }, false, ['verify']);
  return crypto.subtle.verify({ name: 'Ed25519' }, key, sig, new TextEncoder().encode(manifestPayload(m)));
}

export class ContentLibrary {
  readonly manifest: ContentManifest;
  readonly locale: string;
  readonly catalog: Catalog;
  private topics = new Map<string, Promise<TopicBundle>>();

  private constructor(manifest: ContentManifest, locale: string, catalog: Catalog) {
    this.manifest = manifest;
    this.locale = locale;
    this.catalog = catalog;
  }

  static async load(preferred: string): Promise<ContentLibrary> {
    const manifest = JSON.parse(await fetchText('manifest.json')) as ContentManifest;
    const pub = import.meta.env.VITE_LUMEN_PUBLIC_KEY;
    if (pub && !(await verifySignature(manifest, pub))) throw new Error('Signatur der Inhalte ungültig');
    const locale = manifest.locales[preferred] ? preferred : Object.keys(manifest.locales)[0];
    const catalog = await fetchVerified<Catalog>(manifest.locales[locale].catalog);
    return new ContentLibrary(manifest, locale, catalog);
  }

  topic(topicId: string): Promise<TopicBundle> {
    let p = this.topics.get(topicId);
    if (!p) {
      const entry = this.manifest.locales[this.locale].topics[topicId];
      if (!entry) return Promise.reject(new Error(`Unbekanntes Topic ${topicId}`));
      p = fetchVerified<TopicBundle>(entry);
      p.catch(() => this.topics.delete(topicId));
      this.topics.set(topicId, p);
    }
    return p;
  }

  async concept(conceptId: string): Promise<Concept> {
    const meta = this.catalog.concepts[conceptId];
    if (!meta) throw new Error(`Unbekanntes Concept ${conceptId}`);
    const bundle = await this.topic(meta.topicId);
    const c = bundle.concepts.find((x) => x.id === conceptId);
    if (!c) throw new Error(`Concept ${conceptId} fehlt im Bundle`);
    return c;
  }

  /** Loads all topic bundles so the service worker has everything for offline use. */
  prefetchAll(): void {
    for (const id of Object.keys(this.manifest.locales[this.locale].topics)) this.topic(id).catch(() => {});
  }
}
