/**
 * Dev-only content server: compiles the YAML sources on every request so
 * authors see changes immediately (live preview). Production builds use
 * `lumen build` output in public/content instead.
 */
import { resolve } from 'node:path';
import type { Plugin } from 'vite';
import { canonicalJson, compileContent, splitBundles, type ContentManifest } from '@lumen/engine';
import { loadSourceFiles, sha256 } from '@lumen/cli';

export function lumenContent(): Plugin {
  const dir = resolve(process.env.LUMEN_CONTENT_DIR ?? resolve(import.meta.dirname, '../../content'));
  let cache: { at: number; files: Map<string, string> } | null = null;

  async function compileAll(): Promise<Map<string, string>> {
    if (cache && Date.now() - cache.at < 300) return cache.files;
    const sources = await loadSourceFiles(dir);
    const files = new Map<string, string>();
    const manifest: ContentManifest = { format: 'lumen-content', schema: '0.1', version: 'dev', generatedAt: new Date().toISOString(), locales: {} };
    for (const locale of ['de', 'en']) {
      const { course } = compileContent(sources, locale);
      const { catalog, topics } = splitBundles(course);
      const entry: ContentManifest['locales'][string] = { catalog: { path: '', sha256: '' }, topics: {} };
      for (const t of topics) {
        const json = JSON.stringify(t);
        const path = `${locale}/topics/${t.topicId}.json`;
        files.set(path, json);
        entry.topics[t.topicId] = { path, sha256: sha256(json) };
      }
      const cat = JSON.stringify(catalog);
      files.set(`${locale}/catalog.json`, cat);
      entry.catalog = { path: `${locale}/catalog.json`, sha256: sha256(cat) };
      manifest.locales[locale] = entry;
    }
    manifest.version = 'dev-' + sha256(canonicalJson(manifest.locales)).slice(0, 8);
    files.set('manifest.json', JSON.stringify(manifest));
    cache = { at: Date.now(), files };
    return files;
  }

  return {
    name: 'lumen-content',
    apply: 'serve',
    configureServer(server) {
      server.watcher.add(dir);
      server.watcher.on('change', (file) => {
        if (file.startsWith(dir) && /\.ya?ml$/.test(file)) {
          cache = null;
          server.ws.send({ type: 'full-reload' });
        }
      });
      server.middlewares.use('/content/', async (req, res, next) => {
        try {
          const files = await compileAll();
          const key = decodeURIComponent((req.url ?? '').split('?')[0].replace(/^\//, ''));
          const body = files.get(key);
          if (!body) return next();
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
          res.setHeader('Cache-Control', 'no-store');
          res.end(body);
        } catch (e) {
          res.statusCode = 500;
          res.end(String(e));
        }
      });
    },
  };
}
