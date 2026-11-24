/**
 * Builds the Lumen website (landing page in English and German) from one template.
 *   npm run build:content && node scripts/build-site.ts   → site/index.html, site/de/index.html
 * Subjects, colours, descriptions and the totals come from the built content bundles
 * (apps/web/public/content), so the page follows the catalogue. The site is plain static
 * HTML served next to the app (/app/); its script is site/site.js (CSP: no inline scripts).
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = process.env.LUMEN_SITE_ORIGIN ?? 'https://lumen.mikekeller.cloud';
const REPO = 'https://github.com/mikexkllr/lumen';
const root = resolve(import.meta.dirname, '../site');
const contentDir = resolve(import.meta.dirname, '../apps/web/public/content');
if (!existsSync(resolve(contentDir, 'manifest.json'))) throw new Error('content bundles missing – run `npm run build:content` first');
const json = (rel: string) => JSON.parse(readFileSync(resolve(contentDir, rel), 'utf8'));
const manifest = json('manifest.json') as { locales: Record<string, { catalog: { path: string }; topics: Record<string, { path: string }> }> };
type CatalogPath = { area: string; title: string; description: string; color: string; topics: string[] };
const catalogs = Object.fromEntries((['en', 'de'] as const).map((l) => [l, json(manifest.locales[l].catalog.path) as { paths: CatalogPath[]; topics: unknown[]; concepts: Record<string, unknown> }]));
let problemCount = 0;
for (const { path } of Object.values(manifest.locales.en.topics)) {
  const bundle = json(path) as { concepts: { steps: { kind?: string }[] }[] };
  for (const c of bundle.concepts) problemCount += c.steps.filter((st) => st.kind === 'problem').length;
}
const totals = { subjects: catalogs.en.paths.length, courses: catalogs.en.topics.length, lessons: Object.keys(catalogs.en.concepts).length, problems: problemCount };

type Locale = 'en' | 'de';

// Display order and icons per subject area; everything else comes from the catalogue.
const ICONS: Record<string, string> = {
  math: '<path d="M5 7h6M8 4v6M14 7h5M5 17l4-4M9 17l-4-4M14 15h5M14 19h5"/>',
  physics: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>',
  chemistry: '<path d="M9 3h6M10 3v6L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9V3"/><path d="M7.5 15h9"/>',
  biology: '<path d="M11 20A7 7 0 0 1 9.8 6.1C15.5 5 17 4.5 19 2c1 2 2 4.2 2 8 0 5.5-4.8 10-10 10Z"/><path d="M2 21c0-3 1.9-5.4 5.2-6.1 2.4-.5 4.8-2 6.8-4.9"/>',
  ee: '<path d="M13 2 4 14h7l-1 8 9-12h-7l1-8Z"/>',
  cs: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>',
  data: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>',
  ai: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><rect x="6.5" y="6.5" width="11" height="11" rx="3"/><path d="M10 10h4v4h-4z"/>',
  logic: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>',
};
const ORDER = Object.keys(ICONS);
const subjectsFor = (l: 'en' | 'de') =>
  [...catalogs[l].paths]
    .sort((a, b) => (ORDER.indexOf(a.area) + 1 || 99) - (ORDER.indexOf(b.area) + 1 || 99))
    .map((p) => ({ id: p.area, title: p.title, description: p.description, color: p.color, courses: p.topics.length, icon: ICONS[p.area] ?? ICONS.logic }));
const fmt = (n: number, l: 'en' | 'de') => n.toLocaleString(l === 'de' ? 'de-DE' : 'en-US');

const t = {
  en: {
    lang: 'en', other: 'de', otherLabel: 'Deutsch', otherHref: '/de/', self: '/',
    title: 'Lumen – free microlearning for curious minds of every age',
    desc: 'Lumen is free microlearning for every age – a free alternative to Brilliant.org: learn math, science, tech, data and AI in a few minutes a day, by doing – with interactive problems, instant feedback and an AI tutor. Free, ad-free, open source.',
    nav: ['For you', 'Subjects', 'How it works', 'Lux', 'Open source'],
    start: 'Start learning', github: 'View on GitHub',
    eyebrow: 'Free microlearning · for every age',
    h1: 'A few minutes a day.<br>Understand <em>how things work</em>.',
    lead: 'Lumen is microlearning for curious people of every age – whether you are 14 or 74. Bite-sized, hands-on lessons on the ideas behind everyday life: math, physics, chemistry, biology, electronics, computing, data and AI. Instant feedback, and Lux, a tutor that helps you think instead of handing you the answer.',
    fine: ['No ads, no paywall', 'No tracking', 'Works offline'],
    demo: { chip: 'Everyday math', q: 'Your phone is at <b>75 %</b>. Fill the battery bar to match.', count: (n: number) => `${n} of 8 filled`, check: 'Check', again: 'Try another', hint: 'Tap the parts to fill them.',
      ok: '<strong>Right!</strong> Each part is 12.5 %, and 6 × 12.5 % = 75 %. That is three quarters of the bar.',
      three: 'You filled 3 of 8 – that is only 37.5 %. Each part is 12.5 %. How many parts make 75 %?',
      other: (n: number) => `That is ${n} of 8 parts. Each part is 12.5 % – how many parts make 75 %?` },
    stats: ['subjects', 'courses', 'lessons', 'problems', 'languages'], langs: 'EN · DE',
    subjK: 'Subjects', subjH: (n: number) => `From zero to hero in ${n} subjects`, subjP: 'Every subject is one learning path through five stages – Starter, Foundations, Intermediate, Advanced and Expert. Pick it up wherever you are.',
    courses: (n: number) => `${n} courses →`,
    howK: 'How it works', howH: 'Microlearning that sticks', howP: 'Lessons take a few minutes and start with a problem, not a lecture: 31 kinds of interactive problems – drag, build, simulate, play against the computer – instead of videos and walls of text.',
    how: [
      ['Try it first', 'You get your hands on the idea right away: fill, sort, program a robot, tune a simulation. Explanations come when they help – one small step at a time.'],
      ['Instant, targeted feedback', 'Lumen recognises typical mistakes and tells you what went wrong – then gives you a second try. Each lesson goes deeper in three stages: core, deeper, expert.'],
      ['Remember it for good', 'Spaced repetition (FSRS) brings problems back right before you forget them – with new numbers every time. Daily puzzle, streaks and XP keep you going.'],
    ],
    luxK: 'Meet Lux', luxH: 'A tutor that asks before it tells', luxP: 'Lux is in every lesson. Stuck? Lux gives a hint. Wrong? Lux first asks how you got your answer and builds on your reasoning. A built-in guard makes sure Lux never just gives the solution away.',
    luxList: [['Hints, examples and “explain it simpler”', ' on every screen'], ['Mistakes review', ' at the end of every lesson'], ['Explain it to Lux', ' – teaching is the best way to learn']],
    chat: [['me', 'I filled 3 parts. Isn’t that 75 %?'], ['lux', 'Good start! The bar has 8 parts. How many percent is one part worth?'], ['me', 'Oh – 12.5 %. So I need 6!'], ['lux', 'Exactly. 6 × 12.5 % = 75 %. ✨']],
    openK: 'Open & private', openH: 'Yours to use, yours to keep', openP: 'Lumen is built in the open. No account, no tracking – your progress lives on your device.',
    pillars: [
      ['Free forever', 'No subscription, no paywall, no ads. Every course is free.', '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z"/>'],
      ['Private by design', 'Progress stays in your browser. Optional sync uses a random code – no email, no profile.', '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
      ['Open source', 'Code under MIT and AGPL, content under CC BY-SA 4.0. Contributions welcome.', '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 6"/>'],
      ['Self-host it', 'Run Lumen for your team, club or school with one Docker command. Works offline as an installable app.', '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>'],
    ],
    finalH: 'Ready to light it up?', finalP: 'Open Lumen in your browser and start your first lesson in seconds – no sign-up, no download. Five minutes today is a great start.',
    audK: 'For you', audH: 'Made for every age', audP: 'No grades, no pressure, no age limit. Lumen meets you where you are – and grows with you.',
    aud: [
      ['Curious minds', 'Finally understand how batteries, vaccines, the internet or ChatGPT actually work – in a coffee break.', '<path d="M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V18h6v-1.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2Z"/>'],
      ['Work and career', 'Read data with confidence, spot a misleading chart, understand AI before your colleagues do.', '<rect x="3" y="7" width="18" height="13" rx="2"/><path d="M8 7V5a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M3 13h18"/>'],
      ['School and studies', 'Close gaps, get ahead or prepare for exams – from fractions to calculus, at your own pace.', '<path d="M22 10 12 5 2 10l10 5 10-5Z"/><path d="M6 12v5c3 2 9 2 12 0v-5"/>'],
      ['Lifelong learners', 'Keep your mind sharp with a daily puzzle and small steps that add up – no matter how long ago school was.', '<path d="M12 21s-7-4.4-9.2-9A5 5 0 0 1 12 6a5 5 0 0 1 9.2 6c-2.2 4.6-9.2 9-9.2 9Z"/>'],
    ],
    footer: ['Imprint', 'Privacy', 'GitHub'],
    disclaimer: 'Lumen is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Brilliant.org; “Brilliant” is only used to describe what Lumen is an alternative to.',
  },
  de: {
    lang: 'de', other: 'en', otherLabel: 'English', otherHref: '/', self: '/de/',
    title: 'Lumen – kostenloses Microlearning für Neugierige jeden Alters',
    desc: 'Lumen ist kostenloses Microlearning für jedes Alter – eine freie Alternative zu Brilliant.org: Mathe, Naturwissenschaften, Technik, Daten und KI in wenigen Minuten am Tag verstehen, durch Ausprobieren – mit interaktiven Aufgaben, sofortigem Feedback und KI-Tutor. Kostenlos, werbefrei, Open Source.',
    nav: ['Für dich', 'Fächer', 'So funktioniert’s', 'Lux', 'Open Source'],
    start: 'Jetzt lernen', github: 'Auf GitHub ansehen',
    eyebrow: 'Kostenloses Microlearning · für jedes Alter',
    h1: 'Ein paar Minuten am Tag.<br>Verstehen, <em>wie die Welt funktioniert</em>.',
    lead: 'Lumen ist Microlearning für Neugierige jeden Alters – ob du 14 bist oder 74. Kurze Lektionen zum Mitmachen über die Ideen hinter unserem Alltag: Mathe, Physik, Chemie, Biologie, Elektrotechnik, Informatik, Daten und KI. Mit sofortigem Feedback und Lux, einem Tutor, der dich zum Denken bringt, statt dir die Lösung zu verraten.',
    fine: ['Keine Werbung, keine Paywall', 'Kein Tracking', 'Funktioniert offline'],
    demo: { chip: 'Alltagsmathe', q: 'Dein Handy hat noch <b>75 %</b> Akku. Füll den Balken passend.', count: (n: number) => `${n} von 8 gefüllt`, check: 'Prüfen', again: 'Nochmal', hint: 'Tippe auf die Teile, um sie zu füllen.',
      ok: '<strong>Richtig!</strong> Jedes Teil sind 12,5 %, und 6 × 12,5 % = 75 %. Das sind drei Viertel des Balkens.',
      three: 'Du hast 3 von 8 gefüllt – das sind erst 37,5 %. Jedes Teil sind 12,5 %. Wie viele Teile ergeben 75 %?',
      other: (n: number) => `Das sind ${n} von 8 Teilen. Jedes Teil sind 12,5 % – wie viele Teile ergeben 75 %?` },
    stats: ['Fächer', 'Kurse', 'Lektionen', 'Aufgaben', 'Sprachen'], langs: 'DE · EN',
    subjK: 'Fächer', subjH: (n: number) => `Von null auf Profi in ${n} Fächern`, subjP: 'Jedes Fach ist ein Lernpfad durch fünf Stufen – Einstieg, Grundlagen, Aufbau, Fortgeschritten und Experte. Steig dort ein, wo du gerade stehst.',
    courses: (n: number) => `${n} Kurse →`,
    howK: 'So funktioniert’s', howH: 'Microlearning, das hängen bleibt', howP: 'Lektionen dauern ein paar Minuten und beginnen mit einer Aufgabe statt mit einem Vortrag: 31 Arten interaktiver Aufgaben – ziehen, bauen, simulieren, gegen den Computer spielen – statt Videos und Textwüsten.',
    how: [
      ['Erst ausprobieren', 'Du packst die Idee sofort selbst an: füllen, sortieren, einen Roboter programmieren, eine Simulation einstellen. Erklärt wird, wenn es hilft – in kleinen Schritten.'],
      ['Sofort gezieltes Feedback', 'Lumen erkennt typische Denkfehler, sagt dir, was schiefging, und gibt dir einen zweiten Versuch. Jede Lektion geht in drei Stufen tiefer: Kern, Tiefer, Experte.'],
      ['Dauerhaft behalten', 'Wiederholung mit Abstand (FSRS) holt Aufgaben genau dann zurück, bevor du sie vergisst – jedes Mal mit neuen Zahlen. Tagesrätsel, Streak und XP halten dich dran.'],
    ],
    luxK: 'Das ist Lux', luxH: 'Ein Tutor, der erst fragt und dann erklärt', luxP: 'Lux ist in jeder Lektion dabei. Du hängst fest? Lux gibt einen Tipp. Falsch? Lux fragt zuerst, wie du auf deine Antwort gekommen bist, und baut auf deinem Gedanken auf. Ein eingebauter Schutz sorgt dafür, dass Lux nie einfach die Lösung verrät.',
    luxList: [['Tipps, Beispiele und „einfacher erklären“', ' auf jedem Bildschirm'], ['Fehler-Rückblick', ' am Ende jeder Lektion'], ['Erklär’s Lux', ' – wer erklärt, versteht']],
    chat: [['me', 'Ich habe 3 Teile gefüllt. Sind das nicht 75 %?'], ['lux', 'Guter Anfang! Der Balken hat 8 Teile. Wie viel Prozent ist ein Teil wert?'], ['me', 'Ah – 12,5 %. Also brauche ich 6!'], ['lux', 'Genau. 6 × 12,5 % = 75 %. ✨']],
    openK: 'Offen & privat', openH: 'Für dich, ohne Haken', openP: 'Lumen wird offen entwickelt. Kein Konto, kein Tracking – dein Fortschritt bleibt auf deinem Gerät.',
    pillars: [
      ['Für immer kostenlos', 'Kein Abo, keine Paywall, keine Werbung. Jeder Kurs ist frei.', ''],
      ['Datenschutz eingebaut', 'Der Fortschritt bleibt im Browser. Der optionale Sync nutzt einen Zufallscode – keine E-Mail, kein Profil.', ''],
      ['Open Source', 'Code unter MIT und AGPL, Inhalte unter CC BY-SA 4.0. Beiträge sind willkommen.', ''],
      ['Selbst hosten', 'Betreibe Lumen für dein Team, deinen Verein oder deine Schule mit einem Docker-Befehl. Läuft offline als installierbare App.', ''],
    ],
    finalH: 'Bereit, Licht ins Dunkel zu bringen?', finalP: 'Öffne Lumen im Browser und starte deine erste Lektion in Sekunden – ohne Anmeldung, ohne Download. Fünf Minuten heute sind ein guter Anfang.',
    audK: 'Für dich', audH: 'Gemacht für jedes Alter', audP: 'Keine Noten, kein Druck, keine Altersgrenze. Lumen holt dich dort ab, wo du stehst – und wächst mit dir.',
    aud: [
      ['Neugierige', 'Endlich verstehen, wie Akkus, Impfstoffe, das Internet oder ChatGPT wirklich funktionieren – in der Kaffeepause.', ''],
      ['Beruf und Karriere', 'Daten sicher lesen, irreführende Diagramme erkennen, KI verstehen, bevor es die Kolleg:innen tun.', ''],
      ['Schule und Studium', 'Lücken schließen, vorauslernen oder für Prüfungen üben – von Brüchen bis Analysis, in deinem Tempo.', ''],
      ['Lebenslang Lernende', 'Den Kopf fit halten mit Tagesrätsel und kleinen Schritten, die sich summieren – egal, wie lange die Schule her ist.', ''],
    ],
    footer: ['Impressum', 'Datenschutz', 'GitHub'],
    disclaimer: 'Lumen ist ein unabhängiges Open-Source-Projekt und steht in keiner Verbindung zu Brilliant.org, wird von dort weder unterstützt noch gesponsert; „Brilliant“ dient nur zur Beschreibung, wozu Lumen eine Alternative ist.',
  },
};
// German pillars reuse the English icons.
t.de.pillars.forEach((p, i) => (p[2] = t.en.pillars[i][2]));
t.de.aud.forEach((p, i) => (p[2] = t.en.aud[i][2]));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const lux = (cls = '') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="lb${cls}" cx="38%" cy="30%" r="78%"><stop offset="0%" stop-color="#FFF6CF"/><stop offset="34%" stop-color="#FFD45E"/><stop offset="100%" stop-color="#FF9A1F"/></radialGradient><radialGradient id="lh${cls}" cx="50%" cy="50%" r="50%"><stop offset="55%" stop-color="#FFC24A" stop-opacity=".42"/><stop offset="100%" stop-color="#FFC24A" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="35" r="30" fill="url(#lh${cls})"/><path d="M32 3.5 L33.7 9.3 L39.5 11 L33.7 12.7 L32 18.5 L30.3 12.7 L24.5 11 L30.3 9.3 Z" fill="#FFC23D"/><circle cx="32" cy="35" r="19" fill="url(#lb${cls})" stroke="#E8860F" stroke-opacity=".35" stroke-width=".8"/><ellipse cx="24.5" cy="26.5" rx="5.2" ry="3" fill="#fff" opacity=".5" transform="rotate(-32 24.5 26.5)"/><ellipse cx="22.4" cy="40.6" rx="3" ry="1.7" fill="#FF6F4F" opacity=".26"/><ellipse cx="41.6" cy="40.6" rx="3" ry="1.7" fill="#FF6F4F" opacity=".26"/><g fill="#1d1a33"><ellipse cx="25.8" cy="34" rx="2.4" ry="3.3"/><ellipse cx="38.2" cy="34" rx="2.4" ry="3.3"/><circle cx="26.6" cy="32.6" r=".85" fill="#fff"/><circle cx="39" cy="32.6" r=".85" fill="#fff"/></g><path d="M28.8 41 Q32 43.6 35.2 41" fill="none" stroke="#1d1a33" stroke-width="1.9" stroke-linecap="round"/></svg>`;

const icon = (d: string, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const check = icon('<path d="M20 6 9 17l-5-5"/>');
const arrow = icon('<path d="M5 12h14M13 6l6 6-6 6"/>');
const gh = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>`;

function page(l: Locale): string {
  const s = t[l];
  const legal = ['/app/#/legal/imprint', '/app/#/legal/privacy'];
  const ids = ['for-you', 'subjects', 'how', 'lux', 'open'];
  const jsonLd = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Lumen', url: `${ORIGIN}${s.self}`, description: s.desc,
    applicationCategory: 'EducationalApplication', operatingSystem: 'Any (web, PWA)', inLanguage: ['en', 'de'], isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' }, license: 'https://www.gnu.org/licenses/agpl-3.0.html', codeRepository: REPO,
  };
  return `<!doctype html>
<html lang="${s.lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(s.title)}</title>
<meta name="description" content="${esc(s.desc)}">
<link rel="canonical" href="${ORIGIN}${s.self}">
<link rel="alternate" hreflang="en" href="${ORIGIN}/">
<link rel="alternate" hreflang="de" href="${ORIGIN}/de/">
<link rel="alternate" hreflang="x-default" href="${ORIGIN}/">
<meta property="og:type" content="website">
<meta property="og:site_name" content="Lumen">
<meta property="og:title" content="${esc(s.title)}">
<meta property="og:description" content="${esc(s.desc)}">
<meta property="og:url" content="${ORIGIN}${s.self}">
<meta property="og:image" content="${ORIGIN}/icon-512.png">
<meta name="twitter:card" content="summary">
<meta name="theme-color" content="#f7f7f5" media="(prefers-color-scheme: light)">
<meta name="theme-color" content="#0b0b0d" media="(prefers-color-scheme: dark)">
<link rel="icon" href="/icon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/icon-192.png">
<link rel="preload" href="/fonts/inter-latin-wght-normal.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/style.css">
<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>
</head>
<body>
<header class="nav" id="nav">
  <div class="wrap">
    <a class="brand" href="${s.self}">${lux('brand-lux')}Lumen</a>
    <nav class="nav-links" aria-label="${l === 'de' ? 'Seiten' : 'Sections'}">${s.nav.map((n, i) => `<a href="#${ids[i]}">${esc(n)}</a>`).join('')}</nav>
    <div class="nav-end">
      <a class="lang" href="${s.otherHref}" hreflang="${s.other}" lang="${s.other}">${s.otherLabel}</a>
      <a class="btn btn-primary btn-sm" href="/app/">${esc(s.start)}</a>
    </div>
  </div>
</header>

<main>
<section class="hero">
  <div class="wrap">
    <div>
      <span class="eyebrow"><span class="dot"></span>${esc(s.eyebrow)}</span>
      <h1>${s.h1}</h1>
      <p class="lead">${esc(s.lead)}</p>
      <div class="cta-row">
        <a class="btn btn-primary" href="/app/">${esc(s.start)} ${arrow}</a>
        <a class="btn btn-ghost" href="${REPO}">${gh} ${esc(s.github)}</a>
      </div>
      <p class="fine">${s.fine.map((f) => `<span>${check}${esc(f)}</span>`).join('')}</p>
    </div>
    <div class="demo">
      <div class="card" id="demo">
        <div class="card-top"><span class="chip">${esc(s.demo.chip)}</span><div class="progress" aria-hidden="true"><i class="on"></i><i class="on"></i><i class="on"></i><i id="p4"></i><i></i></div></div>
        <p class="q">${s.demo.q}</p>
        <div class="bar" role="group" aria-label="${esc(s.demo.hint)}">${Array.from({ length: 8 }, (_, i) => `<button class="seg" type="button" aria-pressed="false" aria-label="${i + 1} / 8"></button>`).join('')}</div>
        <p class="count" id="count" aria-live="polite">${esc(s.demo.count(0))}</p>
        <div class="demo-actions"><button class="btn btn-primary" type="button" id="checkBtn">${esc(s.demo.check)}</button><span class="xp" id="xp">+3 XP</span></div>
        <div class="feedback" id="fb" role="status">${lux('fb-lux')}<p id="fbText"></p></div>
      </div>
    </div>
  </div>
</section>

<div class="stats"><div class="wrap">${[fmt(totals.subjects, l), fmt(totals.courses, l), fmt(totals.lessons, l), fmt(totals.problems, l), s.langs].map((b, i) => `<div class="stat"><b>${b}</b><span>${esc(s.stats[i])}</span></div>`).join('')}</div></div>

<section id="for-you">
  <div class="wrap">
    <div class="sec-head reveal"><span class="kicker">${esc(s.audK)}</span><h2>${esc(s.audH)}</h2><p>${esc(s.audP)}</p></div>
    <div class="pillars">${s.aud.map(([h, p, d]) => `<div class="pillar reveal">${icon(d)}<h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
  </div>
</section>

<section id="subjects" style="padding-top:24px">
  <div class="wrap">
    <div class="sec-head reveal"><span class="kicker">${esc(s.subjK)}</span><h2>${esc(s.subjH(totals.subjects))}</h2><p>${esc(s.subjP)}</p></div>
    <div class="subjects">
      ${subjectsFor(l).map((x) => `<a class="subject reveal" href="/app/#/discover/${x.id}"><span class="ic" style="--c:${x.color}">${icon(x.icon)}</span><h3>${esc(x.title)}</h3><p>${esc(x.description)}</p><small>${esc(s.courses(x.courses))}</small></a>`).join('\n      ')}
    </div>
  </div>
</section>

<section id="how" style="background:var(--surface);border-top:1px solid var(--line);border-bottom:1px solid var(--line)">
  <div class="wrap">
    <div class="sec-head reveal"><span class="kicker">${esc(s.howK)}</span><h2>${esc(s.howH)}</h2><p>${esc(s.howP)}</p></div>
    <div class="steps">${s.how.map(([h, p], i) => `<div class="step reveal" style="background:var(--bg)"><span class="n">${i + 1}</span><h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
  </div>
</section>

<section id="lux">
  <div class="wrap split">
    <div class="reveal">
      <span class="kicker">${esc(s.luxK)}</span>
      <h2 style="font-size:clamp(1.875rem,3.6vw,2.75rem);margin:10px 0 14px">${esc(s.luxH)}</h2>
      <p style="color:var(--ink-2);font-size:1.0625rem">${esc(s.luxP)}</p>
      <ul class="checks">${s.luxList.map(([b, r]) => `<li>${check}<span><b>${esc(b)}</b>${esc(r)}</span></li>`).join('')}</ul>
    </div>
    <div class="chat reveal" aria-label="${l === 'de' ? 'Beispiel-Gespräch mit Lux' : 'Example conversation with Lux'}">
      ${s.chat.map(([who, m]) => (who === 'lux' ? `<div class="msg lux">${lux('chat-lux')}<span><span class="who">Lux</span>${esc(m)}</span></div>` : `<div class="msg me">${esc(m)}</div>`)).join('\n      ')}
    </div>
  </div>
</section>

<section id="open" style="padding-top:24px">
  <div class="wrap">
    <div class="sec-head reveal"><span class="kicker">${esc(s.openK)}</span><h2>${esc(s.openH)}</h2><p>${esc(s.openP)}</p></div>
    <div class="pillars">${s.pillars.map(([h, p, d]) => `<div class="pillar reveal">${icon(d)}<h3>${esc(h)}</h3><p>${esc(p)}</p></div>`).join('')}</div>
  </div>
</section>

<section class="final" style="padding-top:0">
  <div class="wrap">
    <div class="box reveal">
      ${lux('lux-big')}
      <h2>${esc(s.finalH)}</h2>
      <p>${esc(s.finalP)}</p>
      <div class="cta-row"><a class="btn btn-primary" href="/app/">${esc(s.start)} ${arrow}</a><a class="btn btn-ghost" href="${REPO}">${gh} GitHub</a></div>
    </div>
  </div>
</section>
</main>

<footer>
  <div class="wrap">
    <span>© ${new Date().getFullYear()} Lumen · ${l === 'de' ? 'Inhalte' : 'Content'} CC BY-SA 4.0</span>
    <nav aria-label="Footer"><a href="${legal[0]}">${esc(s.footer[0])}</a><a href="${legal[1]}">${esc(s.footer[1])}</a><a href="${REPO}">${esc(s.footer[2])}</a><a href="${s.otherHref}" hreflang="${s.other}">${s.otherLabel}</a></nav>
    <p class="disclaimer">${esc(s.disclaimer)}</p>
  </div>
</footer>

<script type="application/json" id="site-i18n">${JSON.stringify({ count: s.demo.count(999), other: s.demo.other(999), ok: s.demo.ok, three: s.demo.three, check: s.demo.check, again: s.demo.again }).replace(/</g, '\\u003c')}</script>
<script src="/site.js" defer></script>
</body>
</html>
`;
}

writeFileSync(resolve(root, 'index.html'), page('en'));
mkdirSync(resolve(root, 'de'), { recursive: true });
writeFileSync(resolve(root, 'de/index.html'), page('de'));
console.log('site/index.html, site/de/index.html');
