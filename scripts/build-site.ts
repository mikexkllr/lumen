/**
 * Builds the Lumen website (landing page in English and German) from one template.
 *   node scripts/build-site.ts            → site/index.html, site/de/index.html
 * The site is plain static HTML served next to the app (/app/) – no build step at runtime.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ORIGIN = process.env.LUMEN_SITE_ORIGIN ?? 'https://lumen.mikekeller.cloud';
const REPO = 'https://github.com/mikexkllr/lumen';
const root = resolve(import.meta.dirname, '../site');

type Locale = 'en' | 'de';

const subjects = [
  { id: 'math', color: '#5145f0', courses: 28, icon: '<path d="M5 7h6M8 4v6M14 7h5M5 17l4-4M9 17l-4-4M14 15h5M14 19h5"/>' },
  { id: 'physics', color: '#2563eb', courses: 13, icon: '<circle cx="12" cy="12" r="1.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(60 12 12)"/><ellipse cx="12" cy="12" rx="9" ry="3.6" transform="rotate(120 12 12)"/>' },
  { id: 'chemistry', color: '#0d9488', courses: 10, icon: '<path d="M9 3h6M10 3v6L4.6 18.2A2 2 0 0 0 6.3 21h11.4a2 2 0 0 0 1.7-2.8L14 9V3"/><path d="M7.5 15h9"/>' },
  { id: 'cs', color: '#334155', courses: 13, icon: '<path d="m8 8-4 4 4 4M16 8l4 4-4 4M13.5 5l-3 14"/>' },
  { id: 'data', color: '#16a34a', courses: 13, icon: '<path d="M4 20V10M10 20V4M16 20v-7M22 20H2"/>' },
  { id: 'ai', color: '#9333ea', courses: 10, icon: '<path d="M12 3v3M12 18v3M3 12h3M18 12h3"/><rect x="6.5" y="6.5" width="11" height="11" rx="3"/><path d="M10 10h4v4h-4z"/>' },
  { id: 'logic', color: '#d97706', courses: 11, icon: '<path d="M9.5 18h5M10 21h4"/><path d="M12 3a6 6 0 0 0-3.6 10.8c.6.5 1.1 1.3 1.1 2.2h5c0-.9.5-1.7 1.1-2.2A6 6 0 0 0 12 3Z"/>' },
] as const;

const t = {
  en: {
    lang: 'en', other: 'de', otherLabel: 'Deutsch', otherHref: '/de/', self: '/',
    title: 'Lumen – a free alternative to Brilliant.org',
    desc: 'Lumen is a free alternative to Brilliant.org: learn math, science, computer science, data and AI by doing – with interactive problems, instant feedback and an AI tutor. Free, ad-free, open source.',
    nav: ['Subjects', 'How it works', 'Lux', 'Open source'],
    start: 'Start learning', github: 'View on GitHub',
    eyebrow: 'Free forever · no account needed',
    h1: 'Learn by <em>doing</em>,<br>not by watching.',
    lead: 'Lumen is a free alternative to Brilliant.org. Short, hands-on lessons in math, science, computer science, data and AI – with instant feedback and Lux, a tutor that helps you think instead of handing you the answer.',
    fine: ['No ads, no paywall', 'No tracking', 'Works offline'],
    demo: { chip: 'Fractions', q: 'Shade <b>three quarters</b> of the bar.', count: (n: number) => `${n} of 8 shaded`, check: 'Check', again: 'Try another', hint: 'Tap the parts to shade them.',
      ok: '<strong>Right!</strong> 6 of 8 parts = 6/8 = 3/4. Two eighths make one quarter.',
      three: 'You shaded 3 of 8 – that is 3/8. A quarter is 2 of the 8 parts. How many parts are three quarters?',
      other: (n: number) => `That is ${n}/8. One quarter of the bar is 2 parts – so three quarters is …?` },
    stats: [['7', 'subjects'], ['98', 'courses'], ['525', 'lessons'], ['3,482', 'problems'], ['EN · DE', 'languages']],
    subjK: 'Subjects', subjH: 'From zero to hero in seven subjects', subjP: 'Every subject is one learning path through five stages – Starter, Foundations, Intermediate, Advanced and Expert. Pick it up wherever you are.',
    subj: {
      math: ['Mathematics', 'Mental arithmetic and fractions all the way to calculus, matrices and complex numbers.'],
      physics: ['Physics', 'From the scale of the universe to optics, nuclear physics, relativity and the quantum world.'],
      chemistry: ['Chemistry', 'Mixtures, atoms and reactions up to redox, equilibrium and the climate.'],
      cs: ['Computer science', 'Code and bits, algorithms, networks, databases, IT security and complexity.'],
      data: ['Data science', 'Charts and averages up to Bayes, regression, time series and hypothesis tests.'],
      ai: ['Artificial intelligence', 'Machine learning, generative AI, transformers, agents – and using AI responsibly.'],
      logic: ['Logic & reasoning', 'Puzzles and fallacies up to quantifiers, proofs and Gödel.'],
    } as Record<string, [string, string]>,
    courses: (n: number) => `${n} courses →`,
    howK: 'How it works', howH: 'Every lesson starts with a problem', howP: '31 kinds of interactive problems – drag, build, simulate, play against the computer – instead of videos and walls of text.',
    how: [
      ['Try it first', 'You get your hands on the idea right away: shade, sort, program a robot, tune a simulation. Explanations come when they help.'],
      ['Instant, targeted feedback', 'Lumen recognises typical mistakes and tells you what went wrong – then gives you a second try. Each lesson goes deeper in three stages: core, deeper, expert.'],
      ['Remember it for good', 'Spaced repetition (FSRS) brings problems back right before you forget them – with new numbers every time. Daily puzzle, streaks and XP keep you going.'],
    ],
    luxK: 'Meet Lux', luxH: 'A tutor that asks before it tells', luxP: 'Lux is in every lesson. Stuck? Lux gives a hint. Wrong? Lux first asks how you got your answer and builds on your reasoning. A built-in guard makes sure Lux never just gives the solution away.',
    luxList: [['Hints, examples and “explain it simpler”', ' on every screen'], ['Mistakes review', ' at the end of every lesson'], ['Explain it to Lux', ' – teaching is the best way to learn']],
    chat: [['me', 'I shaded 3 parts. Isn’t that three quarters?'], ['lux', 'Good start! How big is one quarter of the bar – how many of the 8 parts is that?'], ['me', 'Oh – 2 parts. So I need 6!'], ['lux', 'Exactly. 6/8 and 3/4 are the same amount. ✨']],
    openK: 'Open & private', openH: 'Yours to use, yours to keep', openP: 'Lumen is built in the open. No account, no tracking – your progress lives on your device.',
    pillars: [
      ['Free forever', 'No subscription, no paywall, no ads. Every course is free.', '<path d="M20 12v9H4v-9M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 1 1 0-5C11 2 12 7 12 7Zm0 0h4.5a2.5 2.5 0 1 0 0-5C13 2 12 7 12 7Z"/>'],
      ['Private by design', 'Progress stays in your browser. Optional sync uses a random code – no email, no profile.', '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>'],
      ['Open source', 'Code under MIT and AGPL, content under CC BY-SA 4.0. Contributions welcome.', '<circle cx="6" cy="6" r="2.5"/><circle cx="6" cy="18" r="2.5"/><circle cx="18" cy="8" r="2.5"/><path d="M6 8.5v7M18 10.5c0 4-6 3-11 6"/>'],
      ['Self-host it', 'Run Lumen at your school with one Docker command. Works offline as an installable app.', '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>'],
    ],
    finalH: 'Ready to light it up?', finalP: 'Open Lumen in your browser and start your first lesson in seconds – no sign-up, no download.',
    footer: ['Imprint', 'Privacy', 'GitHub'],
    disclaimer: 'Lumen is an independent open-source project. It is not affiliated with, endorsed by or sponsored by Brilliant.org; “Brilliant” is only used to describe what Lumen is an alternative to.',
  },
  de: {
    lang: 'de', other: 'en', otherLabel: 'English', otherHref: '/', self: '/de/',
    title: 'Lumen – die kostenlose Alternative zu Brilliant.org',
    desc: 'Lumen ist eine kostenlose Alternative zu Brilliant.org: Mathe, Naturwissenschaften, Informatik, Data Science und KI lernen durch Ausprobieren – mit interaktiven Aufgaben, sofortigem Feedback und KI-Tutor. Kostenlos, werbefrei, Open Source.',
    nav: ['Fächer', 'So funktioniert’s', 'Lux', 'Open Source'],
    start: 'Jetzt lernen', github: 'Auf GitHub ansehen',
    eyebrow: 'Für immer kostenlos · ohne Konto',
    h1: 'Lernen durch <em>Tun</em>,<br>nicht durch Zuschauen.',
    lead: 'Lumen ist die kostenlose Alternative zu Brilliant.org. Kurze Lektionen zum Mitmachen in Mathe, Naturwissenschaften, Informatik, Data Science und KI – mit sofortigem Feedback und Lux, einem Tutor, der dich zum Denken bringt, statt dir die Lösung zu verraten.',
    fine: ['Keine Werbung, keine Paywall', 'Kein Tracking', 'Funktioniert offline'],
    demo: { chip: 'Brüche', q: 'Färbe <b>drei Viertel</b> des Balkens.', count: (n: number) => `${n} von 8 gefärbt`, check: 'Prüfen', again: 'Nochmal', hint: 'Tippe auf die Teile, um sie zu färben.',
      ok: '<strong>Richtig!</strong> 6 von 8 Teilen = 6/8 = 3/4. Zwei Achtel ergeben ein Viertel.',
      three: 'Du hast 3 von 8 gefärbt – das sind 3/8. Ein Viertel sind 2 der 8 Teile. Wie viele Teile sind dann drei Viertel?',
      other: (n: number) => `Das sind ${n}/8. Ein Viertel des Balkens sind 2 Teile – drei Viertel sind also …?` },
    stats: [['7', 'Fächer'], ['98', 'Kurse'], ['525', 'Lektionen'], ['3.482', 'Aufgaben'], ['DE · EN', 'Sprachen']],
    subjK: 'Fächer', subjH: 'Von null auf Profi in sieben Fächern', subjP: 'Jedes Fach ist ein Lernpfad durch fünf Stufen – Einstieg, Grundlagen, Aufbau, Fortgeschritten und Experte. Steig dort ein, wo du gerade stehst.',
    subj: {
      math: ['Mathematik', 'Vom Kopfrechnen und Brüchen bis zu Analysis, Matrizen und komplexen Zahlen.'],
      physics: ['Physik', 'Von den Größenordnungen des Universums bis Optik, Kernphysik, Relativität und Quantenwelt.'],
      chemistry: ['Chemie', 'Gemische, Atome und Reaktionen bis Redox, Gleichgewicht und Klima.'],
      cs: ['Informatik', 'Code und Bits, Algorithmen, Netze, Datenbanken, IT-Sicherheit und Komplexität.'],
      data: ['Data Science', 'Diagramme und Mittelwerte bis Bayes, Regression, Zeitreihen und Hypothesentests.'],
      ai: ['Künstliche Intelligenz', 'Maschinelles Lernen, generative KI, Transformer, Agenten – und verantwortungsvoller Umgang.'],
      logic: ['Logik & Denken', 'Rätsel und Fehlschlüsse bis Quantoren, Beweise und Gödel.'],
    } as Record<string, [string, string]>,
    courses: (n: number) => `${n} Kurse →`,
    howK: 'So funktioniert’s', howH: 'Jede Lektion beginnt mit einer Aufgabe', howP: '31 Arten interaktiver Aufgaben – ziehen, bauen, simulieren, gegen den Computer spielen – statt Videos und Textwüsten.',
    how: [
      ['Erst ausprobieren', 'Du packst die Idee sofort selbst an: färben, sortieren, einen Roboter programmieren, eine Simulation einstellen. Erklärt wird, wenn es hilft.'],
      ['Sofort gezieltes Feedback', 'Lumen erkennt typische Denkfehler, sagt dir, was schiefging, und gibt dir einen zweiten Versuch. Jede Lektion geht in drei Stufen tiefer: Kern, Tiefer, Experte.'],
      ['Dauerhaft behalten', 'Wiederholung mit Abstand (FSRS) holt Aufgaben genau dann zurück, bevor du sie vergisst – jedes Mal mit neuen Zahlen. Tagesrätsel, Streak und XP halten dich dran.'],
    ],
    luxK: 'Das ist Lux', luxH: 'Ein Tutor, der erst fragt und dann erklärt', luxP: 'Lux ist in jeder Lektion dabei. Du hängst fest? Lux gibt einen Tipp. Falsch? Lux fragt zuerst, wie du auf deine Antwort gekommen bist, und baut auf deinem Gedanken auf. Ein eingebauter Schutz sorgt dafür, dass Lux nie einfach die Lösung verrät.',
    luxList: [['Tipps, Beispiele und „einfacher erklären“', ' auf jedem Bildschirm'], ['Fehler-Rückblick', ' am Ende jeder Lektion'], ['Erklär’s Lux', ' – wer erklärt, versteht']],
    chat: [['me', 'Ich habe 3 Teile gefärbt. Sind das nicht drei Viertel?'], ['lux', 'Guter Anfang! Wie groß ist ein Viertel des Balkens – wie viele der 8 Teile sind das?'], ['me', 'Ah – 2 Teile. Also brauche ich 6!'], ['lux', 'Genau. 6/8 und 3/4 sind gleich viel. ✨']],
    openK: 'Offen & privat', openH: 'Für dich, ohne Haken', openP: 'Lumen wird offen entwickelt. Kein Konto, kein Tracking – dein Fortschritt bleibt auf deinem Gerät.',
    pillars: [
      ['Für immer kostenlos', 'Kein Abo, keine Paywall, keine Werbung. Jeder Kurs ist frei.', ''],
      ['Datenschutz eingebaut', 'Der Fortschritt bleibt im Browser. Der optionale Sync nutzt einen Zufallscode – keine E-Mail, kein Profil.', ''],
      ['Open Source', 'Code unter MIT und AGPL, Inhalte unter CC BY-SA 4.0. Beiträge sind willkommen.', ''],
      ['Selbst hosten', 'Betreibe Lumen an deiner Schule mit einem Docker-Befehl. Läuft offline als installierbare App.', ''],
    ],
    finalH: 'Bereit, Licht ins Dunkel zu bringen?', finalP: 'Öffne Lumen im Browser und starte deine erste Lektion in Sekunden – ohne Anmeldung, ohne Download.',
    footer: ['Impressum', 'Datenschutz', 'GitHub'],
    disclaimer: 'Lumen ist ein unabhängiges Open-Source-Projekt und steht in keiner Verbindung zu Brilliant.org, wird von dort weder unterstützt noch gesponsert; „Brilliant“ dient nur zur Beschreibung, wozu Lumen eine Alternative ist.',
  },
};
// German pillars reuse the English icons.
t.de.pillars.forEach((p, i) => (p[2] = t.en.pillars[i][2]));

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const lux = (cls = '') => `<svg class="${cls}" viewBox="0 0 64 64" aria-hidden="true"><defs><radialGradient id="lb${cls}" cx="38%" cy="30%" r="78%"><stop offset="0%" stop-color="#FFF6CF"/><stop offset="34%" stop-color="#FFD45E"/><stop offset="100%" stop-color="#FF9A1F"/></radialGradient><radialGradient id="lh${cls}" cx="50%" cy="50%" r="50%"><stop offset="55%" stop-color="#FFC24A" stop-opacity=".42"/><stop offset="100%" stop-color="#FFC24A" stop-opacity="0"/></radialGradient></defs><circle cx="32" cy="35" r="30" fill="url(#lh${cls})"/><path d="M32 3.5 L33.7 9.3 L39.5 11 L33.7 12.7 L32 18.5 L30.3 12.7 L24.5 11 L30.3 9.3 Z" fill="#FFC23D"/><circle cx="32" cy="35" r="19" fill="url(#lb${cls})" stroke="#E8860F" stroke-opacity=".35" stroke-width=".8"/><ellipse cx="24.5" cy="26.5" rx="5.2" ry="3" fill="#fff" opacity=".5" transform="rotate(-32 24.5 26.5)"/><ellipse cx="22.4" cy="40.6" rx="3" ry="1.7" fill="#FF6F4F" opacity=".26"/><ellipse cx="41.6" cy="40.6" rx="3" ry="1.7" fill="#FF6F4F" opacity=".26"/><g fill="#1d1a33"><ellipse cx="25.8" cy="34" rx="2.4" ry="3.3"/><ellipse cx="38.2" cy="34" rx="2.4" ry="3.3"/><circle cx="26.6" cy="32.6" r=".85" fill="#fff"/><circle cx="39" cy="32.6" r=".85" fill="#fff"/></g><path d="M28.8 41 Q32 43.6 35.2 41" fill="none" stroke="#1d1a33" stroke-width="1.9" stroke-linecap="round"/></svg>`;

const icon = (d: string, extra = '') => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" ${extra}>${d}</svg>`;
const check = icon('<path d="M20 6 9 17l-5-5"/>');
const arrow = icon('<path d="M5 12h14M13 6l6 6-6 6"/>');
const gh = `<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 .5a11.5 11.5 0 0 0-3.64 22.41c.58.1.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.71.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.7 1.26 3.36.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.68 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.17 1.18a11 11 0 0 1 5.77 0c2.2-1.49 3.17-1.18 3.17-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14v3.17c0 .31.21.67.8.56A11.5 11.5 0 0 0 12 .5Z"/></svg>`;

function page(l: Locale): string {
  const s = t[l];
  const legal = l === 'de' ? ['/impressum.html', '/datenschutz.html'] : ['/impressum.html', '/datenschutz.html'];
  const ids = ['subjects', 'how', 'lux', 'open'];
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

<div class="stats"><div class="wrap">${s.stats.map(([b, sp]) => `<div class="stat"><b>${b}</b><span>${esc(sp)}</span></div>`).join('')}</div></div>

<section id="subjects">
  <div class="wrap">
    <div class="sec-head reveal"><span class="kicker">${esc(s.subjK)}</span><h2>${esc(s.subjH)}</h2><p>${esc(s.subjP)}</p></div>
    <div class="subjects">
      ${subjects.map((x) => `<a class="subject reveal" href="/app/#/discover/${x.id}"><span class="ic" style="background:${x.color}">${icon(x.icon)}</span><h3>${esc(s.subj[x.id][0])}</h3><p>${esc(s.subj[x.id][1])}</p><small>${esc(s.courses(x.courses))}</small></a>`).join('\n      ')}
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

<script>
(() => {
  const T = ${JSON.stringify({ count: s.demo.count(999), other: s.demo.other(999), ok: s.demo.ok, three: s.demo.three, check: s.demo.check, again: s.demo.again })};
  const count = (k) => T.count.replace('999', k), other = (k) => T.other.replace('999', k);
  const segs = [...document.querySelectorAll('.seg')], c = document.getElementById('count'), btn = document.getElementById('checkBtn');
  const fb = document.getElementById('fb'), fbText = document.getElementById('fbText'), xp = document.getElementById('xp'), p4 = document.getElementById('p4');
  let done = false;
  const n = () => segs.filter((s) => s.getAttribute('aria-pressed') === 'true').length;
  const reset = () => { segs.forEach((s) => s.setAttribute('aria-pressed', 'false')); done = false; fb.className = 'feedback'; xp.className = 'xp'; p4.className = ''; btn.textContent = T.check; c.textContent = count(0); };
  segs.forEach((s) => s.addEventListener('click', () => { if (done) return; s.setAttribute('aria-pressed', String(s.getAttribute('aria-pressed') !== 'true')); c.textContent = count(n()); fb.className = 'feedback'; }));
  btn.addEventListener('click', () => {
    if (done) return reset();
    const k = n();
    if (k === 6) { done = true; fb.className = 'feedback ok show'; fbText.innerHTML = T.ok; xp.className = 'xp show'; p4.className = 'on'; btn.textContent = T.again; }
    else { fb.className = 'feedback bad show'; fbText.textContent = k === 3 ? T.three : other(k); }
  });
  const nav = document.getElementById('nav');
  const onScroll = () => nav.classList.toggle('scrolled', scrollY > 8);
  addEventListener('scroll', onScroll, { passive: true }); onScroll();
  const io = 'IntersectionObserver' in window ? new IntersectionObserver((es) => es.forEach((e) => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { rootMargin: '0px 0px -8% 0px' }) : null;
  document.querySelectorAll('.reveal').forEach((el) => (io ? io.observe(el) : el.classList.add('in')));
})();
</script>
</body>
</html>
`;
}

writeFileSync(resolve(root, 'index.html'), page('en'));
mkdirSync(resolve(root, 'de'), { recursive: true });
writeFileSync(resolve(root, 'de/index.html'), page('de'));
console.log('site/index.html, site/de/index.html');
