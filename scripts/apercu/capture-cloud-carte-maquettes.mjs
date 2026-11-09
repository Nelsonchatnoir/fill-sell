// Captures des 3 maquettes de la carte FillSell Cloud (09/11/2026, point 2 de Nico). Outil de relecture, jamais livré.
//   node scripts/apercu/capture-cloud-carte-maquettes.mjs <dossier de sortie>
// WebKit iPhone SE (375×667) et iPhone 15 Pro Max (430×932), Chrome 390 ; mesure : rien ne déborde, bouton ≥ 44 px,
// textes ≥ 4,5:1 (le prix compris), « Essai gratuit 7 jours » / « 7 jours gratuits », « Plus besoin d'ordinateur »,
// « Essayer 7 jours », le prix « 24,99 €/mois » et « 5 places restantes » présents ; le prix d'au moins 15 px.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = process.argv[2] ?? path.join(RACINE, 'screenshots-review');
const PORT = 5219;
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/cloud-carte-maquettes.html`;
fs.mkdirSync(SORTIE, { recursive: true });
const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-bandeau-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: 'ignore' });
const stop = () => {
  try {
    if (process.platform === 'win32') {
      spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' });
      const net = spawnSync('netstat', ['-ano'], { encoding: 'utf8' }).stdout || '';
      for (const l of net.split(/\r?\n/)) if (new RegExp(`:${PORT}\\s.*LISTENING`).test(l)) spawnSync('taskkill', ['/pid', l.trim().split(/\s+/).pop(), '/f', '/t'], { stdio: 'ignore' });
    } else serveur.kill();
  } catch { /* déjà arrêté */ }
};
process.on('exit', stop);
{ const fin = Date.now() + 90_000; while (Date.now() < fin) { try { if ((await fetch(BASE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); } }

const MESURE = () => {
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const q = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; };
  const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  // Fond réel : la 1re couleur opaque, ou le bout CLAIR du dégradé (#1B6E62, le cas le plus défavorable au texte blanc).
  const fond = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); if (/gradient/.test(s.backgroundImage)) return [27, 110, 98, 1]; const c = parse(s.backgroundColor); if (c && c[3] > 0.5) return c; } return [255, 255, 255, 1]; };
  const melange = (fg, bg) => [0, 1, 2].map((i) => fg[i] * fg[3] + bg[i] * (1 - fg[3]));
  const ratio = (el) => { const bg = fond(el); const a = lum(melange(parse(getComputedStyle(el).color), bg)); const b = lum(bg); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const carte = document.querySelector('[data-carte-cloud]');
  const textes = [...carte.querySelectorAll('*')].filter((e) => [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim()));
  const faibles = textes.map((e) => ({ t: e.textContent.trim().slice(0, 24), r: Math.round(ratio(e) * 100) / 100 })).filter((x) => x.r < 4.5);
  const btn = carte.querySelector('button');
  const prix = textes.find((e) => /24,99[  ]€\/⁠?mois/.test(e.textContent));
  const t = carte.innerText.replace(/[\s ]+/g, ' ');
  return {
    deborde: document.documentElement.scrollWidth > innerWidth + 1,
    sortants: [...carte.querySelectorAll('*')].filter((e) => e.getBoundingClientRect().right > innerWidth + 1).length,
    bouton: Math.round(btn.getBoundingClientRect().height), boutonTexte: btn.textContent.replace(/ /g, ' ').trim(),
    prixPx: prix ? parseFloat(getComputedStyle(prix).fontSize) : 0,
    essai: /Essai gratuit 7 jours|7 jours gratuits/.test(t), accroche: /Plus besoin d’ordinateur|Plus besoin d'ordinateur/.test(t),
    places: /5 places restantes/.test(t), faibles,
    hauteurCarte: Math.round(carte.getBoundingClientRect().height), hautCarte: Math.round(carte.getBoundingClientRect().top),
  };
};
const FORMATS = [
  { nom: 'iphone-se', moteur: webkit, ctx: { ...devices['iPhone SE'] } },
  { nom: 'iphone-15-pro-max', moteur: webkit, ctx: { ...devices['iPhone 15 Pro Max'] } },
  { nom: 'web-390', moteur: chromium, ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
];
let ko = 0, n = 0;
const navs = new Map();
try {
  for (const f of FORMATS) {
    if (!navs.has(f.moteur)) navs.set(f.moteur, await f.moteur.launch(f.moteur === chromium ? { channel: 'chrome' } : {}));
    const ctx = await navs.get(f.moteur).newContext({ ...f.ctx, locale: 'fr-FR' });
    const page = await ctx.newPage();
    for (const v of ['a', 'b', 'c']) {
      await page.goto(`${BASE}?variante=${v}`, { waitUntil: 'networkidle', timeout: 120000 });
      await page.evaluate(() => document.fonts?.ready);
      await page.waitForTimeout(300);
      const r = await page.evaluate(MESURE);
      n++;
      const okv = !r.deborde && !r.sortants && r.bouton >= 44 && r.boutonTexte === 'Essayer 7 jours' && r.prixPx >= 15 && r.essai && r.accroche && r.places && !r.faibles.length;
      if (!okv) ko++;
      console.log(`${okv ? '✓' : '✗'} ${f.nom.padEnd(18)} variante ${v} : bouton ${r.bouton}px « ${r.boutonTexte} », prix ${r.prixPx}px, carte ${r.hauteurCarte}px (haut ${r.hautCarte}px)${r.faibles.length ? ` CONTRASTE ${JSON.stringify(r.faibles)}` : ''}${r.deborde || r.sortants ? ' DÉBORDE' : ''}`);
      await page.screenshot({ path: path.join(SORTIE, `cloud-carte-${v}-${f.nom}.png`) });
    }
    await ctx.close();
  }
} finally {
  for (const b of navs.values()) await b.close().catch(() => {});
  stop();
}
console.log(ko ? `\n✗ ${ko} rouge(s) sur ${n}` : `\n✓ ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
