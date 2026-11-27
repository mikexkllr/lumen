/**
 * The native shells are not built in the unit tests, so these checks read their sources: the
 * app's own Capacitor plugins must be registered with the bridge that actually runs, or every
 * call to them fails at once ("not implemented") – as Sign in with Apple and Google once did.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const mobile = resolve(import.meta.dirname, '../../mobile');
const read = (p: string) => readFileSync(resolve(mobile, p), 'utf8');
const jsNames = (src: string) => [...src.matchAll(/registerPlugin<[^>]+>\('(\w+)'\)/g)].map((m) => m[1]);

describe('native shells register the app plugins', () => {
  const web = jsNames(readFileSync(resolve(import.meta.dirname, '../src/lib/signIn.ts'), 'utf8'));

  it('iOS: the scene starts with LumenViewController, which registers every plugin the web app calls', () => {
    const scene = read('ios/App/App/SceneDelegate.swift');
    expect(scene).toMatch(/rootViewController\s*=\s*LumenViewController\(\)/);
    expect(scene).not.toMatch(/rootViewController\s*=\s*CAPBridgeViewController\(\)/);
    const vc = read('ios/App/App/LumenViewController.swift');
    expect(web).toEqual(['AppleSignIn', 'GoogleSignIn']);
    for (const name of web) {
      const file = read(`ios/App/App/${name}Plugin.swift`);
      expect(file).toContain(`jsName = "${name}"`);
      expect(vc).toContain(`registerPluginInstance(${name}Plugin())`);
    }
  });

  it('Android: MainActivity registers Google sign-in before the bridge starts', () => {
    const main = read('android/app/src/main/java/cloud/mikekeller/lumen/MainActivity.java');
    expect(main).toMatch(/registerPlugin\(GoogleSignInPlugin\.class\);\s*super\.onCreate/);
  });
});
