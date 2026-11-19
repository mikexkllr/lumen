#!/usr/bin/env node
/**
 * lumen – authoring CLI
 *   lumen check [dir]            validate schema + run all content evals
 *   lumen build [dir] --out d    write content-hashed (optionally signed) bundles
 *   lumen keygen [--out dir]     create an Ed25519 signing key pair
 *   lumen schema [--out file]    write the JSON Schema for editor support
 *   lumen dev                    start the web app with live content preview
 */
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { contentJsonSchema, summarize } from '@lumen/engine';
import { buildBundles, checkContent, formatIssues, generateSigningKey } from './index.ts';

const args = process.argv.slice(2);
const cmd = args[0];
const flag = (name: string) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? (args[i + 1] ?? '') : undefined;
};
const has = (name: string) => args.includes(`--${name}`);
const VALUE_FLAGS = new Set(['--out', '--locale', '--locales', '--key']);
const positional = args.slice(1).filter((a, i, arr) => !a.startsWith('--') && !VALUE_FLAGS.has(arr[i - 1]));
const color = process.stdout.isTTY;
const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');

async function main() {
  switch (cmd) {
    case 'check': {
      const dir = positional[0] ?? 'content';
      const t0 = Date.now();
      const { issues, stats } = await checkContent(dir, flag('locale') ?? 'de');
      if (has('json')) {
        console.log(JSON.stringify({ issues, stats }, null, 2));
      } else {
        const text = formatIssues(issues, { color, showInfo: has('info') });
        if (text) console.log(text + '\n');
        const s = summarize(issues);
        console.log(
          `${stats.paths} Pfade · ${stats.topics} Topics · ${stats.concepts} Concepts · ${stats.steps} Steps · ${stats.problems} Aufgaben · ${stats.checkedInstances} geprüfte Instanzen (${Date.now() - t0} ms)`,
        );
        console.log(`Widgets: ${Object.entries(stats.byWidget).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        console.log(`Referenzlösungen: ${Object.entries(stats.solvedBy).map(([k, v]) => `${k} ${v}`).join(', ')}`);
        console.log(`${s.errors ? (color ? `\x1b[31m${s.errors} Fehler\x1b[0m` : `${s.errors} Fehler`) : '0 Fehler'} · ${s.warnings} Warnungen · ${s.infos} Hinweise${has('info') ? '' : ' (mit --info anzeigen)'}`);
        if (!s.errors) console.log(color ? '\x1b[32m✔ Alle Inhalte bestehen die Evals.\x1b[0m' : '✔ Alle Inhalte bestehen die Evals.');
      }
      const s = summarize(issues);
      process.exitCode = s.errors || (has('strict') && s.warnings) ? 1 : 0;
      return;
    }
    case 'build': {
      const dir = positional[0] ?? 'content';
      const out = flag('out') ?? 'dist/content';
      const keyPath = flag('key') ?? process.env.LUMEN_SIGNING_KEY_FILE;
      const signingKeyPem = process.env.LUMEN_SIGNING_KEY ?? (keyPath ? await readFile(keyPath, 'utf8') : undefined);
      try {
        const { manifest, issues } = await buildBundles(dir, out, { locales: (flag('locales') ?? 'de,en').split(','), signingKeyPem });
        const s = summarize(issues);
        console.log(`✔ Bundles geschrieben nach ${out} (Version ${manifest.version}, ${Object.keys(manifest.locales).join('/')}, ${s.warnings} Warnungen)${manifest.signature ? ' – signiert' : ''}`);
      } catch (e) {
        const err = e as Error & { issues?: never[] };
        if (err.issues) console.error(formatIssues(err.issues, { color }));
        console.error(err.message);
        process.exitCode = 1;
      }
      return;
    }
    case 'keygen': {
      const out = flag('out') ?? 'keys';
      const { privatePem, publicKeyRawB64 } = generateSigningKey();
      await mkdir(out, { recursive: true });
      await writeFile(join(out, 'content-signing.pem'), privatePem, { mode: 0o600 });
      await writeFile(join(out, 'content-signing.pub'), publicKeyRawB64 + '\n');
      console.log(`Privater Schlüssel: ${join(out, 'content-signing.pem')} (geheim halten, nicht committen)`);
      console.log(`Öffentlicher Schlüssel für die App (VITE_LUMEN_PUBLIC_KEY): ${publicKeyRawB64}`);
      return;
    }
    case 'schema': {
      const out = flag('out') ?? 'content/lumen.schema.json';
      await writeFile(out, JSON.stringify(contentJsonSchema(), null, 2));
      console.log(`JSON Schema geschrieben: ${out}`);
      return;
    }
    case 'dev': {
      const contentDir = resolve(positional[0] ?? 'content');
      const child = spawn('npm', ['run', 'dev', '-w', '@lumen/web'], { cwd: root, stdio: 'inherit', env: { ...process.env, LUMEN_CONTENT_DIR: contentDir } });
      child.on('exit', (code) => process.exit(code ?? 0));
      return;
    }
    default:
      console.log(`lumen – Werkzeuge für Lumen-Inhalte

  lumen check [dir] [--info] [--strict] [--json]   Schema prüfen und alle Evals laufen lassen
  lumen build [dir] --out <dir> [--locales de,en] [--key key.pem]
  lumen keygen [--out keys]                        Ed25519-Schlüsselpaar zum Signieren erzeugen
  lumen schema [--out content/lumen.schema.json]   JSON Schema für Editoren schreiben
  lumen dev [dir]                                  Web-App mit Live-Vorschau der Inhalte starten`);
      process.exitCode = cmd ? 1 : 0;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
