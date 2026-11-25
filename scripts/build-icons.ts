/**
 * Draws every icon from Lux, the robot mascot (same shapes as apps/web/src/components/Lux.tsx):
 *   apps/mobile/assets/icon-ios.svg, apps/web/public/icon.svg, site/icon.svg   (sources)
 *   iOS AppIcon 1024 (no alpha, as App Store Connect requires), PWA icons 192/512,
 *   site icons, iOS splash screens (light and dark), apps/mobile/assets/logo.png
 * Renders with Playwright's Chromium and strips the alpha channel with macOS `sips`.
 *
 *   node scripts/build-icons.ts
 */
import { chromium } from '@playwright/test';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const defs = `
  <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7B6DFF"/><stop offset="1" stop-color="#3B2FD0"/></linearGradient>
  <radialGradient id="glow" cx="50%" cy="22%" r="42%"><stop offset="0" stop-color="#FFF1B8" stop-opacity="0.45"/><stop offset="1" stop-color="#FFF1B8" stop-opacity="0"/></radialGradient>
  <linearGradient id="shell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFFFFF"/><stop offset="1" stop-color="#E3DEFA"/></linearGradient>
  <linearGradient id="face" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2E2869"/><stop offset="1" stop-color="#16133A"/></linearGradient>`;

/** Lux's head (antenna, ears, screen face) in the 64×64 space of the component. */
const head = `
  <line x1="32" y1="13" x2="32" y2="7.6" stroke="#9A90DE" stroke-width="1.8" stroke-linecap="round"/>
  <circle cx="32" cy="6" r="5.4" fill="#FFC93D" opacity="0.3"/>
  <circle cx="32" cy="6" r="3.2" fill="#FFC93D"/>
  <circle cx="31" cy="5" r="1" fill="#fff" opacity="0.8"/>
  <rect x="9.4" y="23" width="5" height="11" rx="2.5" fill="#6C5CE7"/>
  <rect x="49.6" y="23" width="5" height="11" rx="2.5" fill="#6C5CE7"/>
  <rect x="12" y="12.5" width="40" height="32" rx="14" fill="url(#shell)" stroke="#C9C2F0" stroke-width="0.9"/>
  <rect x="17" y="18" width="30" height="21" rx="9" fill="url(#face)"/>
  <path d="M21 21.4 Q24 19.6 28 19.8" fill="none" stroke="#fff" stroke-opacity="0.22" stroke-width="1.4" stroke-linecap="round"/>
  <ellipse cx="21.4" cy="33.4" rx="2.3" ry="1.3" fill="#FF8FB3" opacity="0.6"/>
  <ellipse cx="42.6" cy="33.4" rx="2.3" ry="1.3" fill="#FF8FB3" opacity="0.6"/>
  <rect x="22.4" y="23.6" width="5.2" height="7.4" rx="2.6" fill="#FFE27A"/>
  <rect x="36.4" y="23.6" width="5.2" height="7.4" rx="2.6" fill="#FFE27A"/>
  <circle cx="26" cy="25.6" r="0.95" fill="#fff"/>
  <circle cx="40" cy="25.6" r="0.95" fill="#fff"/>
  <path d="M29.4 34 Q32 36 34.6 34" fill="none" stroke="#FFE27A" stroke-width="1.6" stroke-linecap="round"/>`;

/** The whole robot: arms, body with chest light, head. */
const robot = `
  <rect x="18.5" y="45.5" width="5" height="9.5" rx="2.5" fill="#6C5CE7" transform="rotate(40 21 47)"/>
  <rect x="40.5" y="45.5" width="5" height="9.5" rx="2.5" fill="#6C5CE7" transform="rotate(-40 43 47)"/>
  <rect x="21" y="43" width="22" height="14" rx="6.5" fill="url(#shell)" stroke="#C9C2F0" stroke-width="0.9"/>
  <circle cx="32" cy="50.6" r="2.4" fill="#FFC93D"/>${head}`;

const svg = (body: string) => `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><defs>${defs}</defs>${body}</svg>`;
// head centred a little low so the glowing bulb has room; ~70 % of the width (iOS safe area)
// on the purple icon background the ears are lighter, so they still read
const mark = `<g transform="translate(32 34) scale(1.08) translate(-32 -22.6)">${head.replaceAll('fill="#6C5CE7"', 'fill="#D4CCFF"')}</g>`;
const iconSquare = svg(`<rect width="64" height="64" fill="url(#bg)"/><rect width="64" height="64" fill="url(#glow)"/>${mark}`);
const iconRounded = svg(`<rect width="64" height="64" rx="15" fill="url(#bg)"/><rect width="64" height="64" rx="15" fill="url(#glow)"/>${mark}`);
const robotOnly = svg(robot);

writeFileSync(join(root, 'apps/mobile/assets/icon-ios.svg'), iconSquare);
writeFileSync(join(root, 'apps/web/public/icon.svg'), iconRounded);
writeFileSync(join(root, 'site/icon.svg'), iconRounded);

const tmp = mkdtempSync(join(tmpdir(), 'lumen-icons-'));
const browser = await chromium.launch();
async function render(markup: string, size: number, out: string, opts: { background?: string; inner?: number; opaque?: boolean } = {}) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  const inner = opts.inner ?? size;
  await page.setContent(`<html><body style="margin:0;display:grid;place-items:center;width:${size}px;height:${size}px;background:${opts.background ?? 'transparent'}"><div style="width:${inner}px;height:${inner}px">${markup.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body></html>`);
  const png = join(tmp, 'x.png');
  await page.screenshot({ path: png, omitBackground: !opts.background && !opts.opaque });
  await page.close();
  if (opts.opaque) {
    // App Store icons must not have an alpha channel: PNG → TIFF without alpha → PNG
    execFileSync('sips', ['-s', 'format', 'jpeg', '-s', 'formatOptions', '100', png, '--out', join(tmp, 'x.jpg')], { stdio: 'ignore' });
    execFileSync('sips', ['-s', 'format', 'png', join(tmp, 'x.jpg'), '--out', out], { stdio: 'ignore' });
  } else execFileSync('cp', [png, out]);
  console.log(out.replace(`${root}/`, ''));
}

const ios = join(root, 'apps/mobile/ios/App/App/Assets.xcassets');
await render(iconSquare, 1024, join(ios, 'AppIcon.appiconset/AppIcon-512@2x.png'), { opaque: true });
for (const dir of ['apps/web/public', 'site']) {
  await render(iconSquare, 512, join(root, dir, 'icon-512.png'), { opaque: true });
  await render(iconSquare, 192, join(root, dir, 'icon-192.png'), { opaque: true });
}
await render(robotOnly, 1024, join(root, 'apps/mobile/assets/logo.png'));
// splash: the whole robot, small and centred, on the app's background colours
for (const [suffix, bg] of [['', '#fbf8f2'], ['-dark', '#1c1a3a']] as const) {
  for (const scale of [1, 2, 3]) await render(robotOnly, 2732, join(ios, `Splash.imageset/Default@${scale}x~universal~anyany${suffix}.png`), { background: bg, inner: 360, opaque: true });
}
await browser.close();
