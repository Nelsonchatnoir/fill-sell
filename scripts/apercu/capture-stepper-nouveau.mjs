// Capture PNG du NOUVEAU stepper (U1 → U4), à 380 px et en large — outil de
// relecture, jamais livré. Même patron que capture-bloc-general.mjs.
//
//     node scripts/apercu/capture-stepper-nouveau.mjs
//
// Ce qu'il PROUVE, en plus de montrer :
//   · aucun débordement horizontal à 380 px sur les quatre écrans ;
//   · tous les champs de saisie font au moins 16 px (pas de zoom Safari iOS) ;
//   · le contenu ne dépasse pas 640 px de large sur un écran de 1280 px ;
//   · les textes secondaires et les cartes d'état tiennent le contraste AA
//     (≥ 4,5:1), bouton désactivé compris ;
//   · aucune erreur de page.
import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'stepper-nouveau');
const PORT = 5203;
const BASE = `http://localhost:${PORT}/scripts/apercu/stepper-nouveau.html`;

fs.mkdirSync(SORTIE, { recursive: true });

const vite = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
  cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'],
});
vite.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
const stop = () => {
  try {
    if (process.platform === 'win32') spawn('taskkill', ['/pid', String(vite.pid), '/f', '/t'], { stdio: 'ignore' });
    else vite.kill();
  } catch { /* déjà mort */ }
};
process.on('exit', stop);

async function attendreServeur(limiteMs = 60000) {
  const fin = Date.now() + limiteMs;
  while (Date.now() < fin) {
    try { const r = await fetch(BASE); if (r.ok) return; } catch { /* pas encore debout */ }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('vite n’a pas répondu dans le délai');
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`  ${cond ? '✓' : '✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };

// Contraste WCAG entre la couleur du texte et le premier fond opaque au-dessus.
const SCRIPT_CONTRASTE = `(() => {
  const lum = (r, g, b) => { const f = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b); };
  const rgb = (s) => { const m = String(s).match(/rgba?\\(([^)]+)\\)/); if (!m) return null; const p = m[1].split(',').map(Number); return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 }; };
  const fondDe = (el) => { let e = el; while (e) { const c = rgb(getComputedStyle(e).backgroundColor); if (c && c.a > 0.99) return c; const bg = getComputedStyle(e).backgroundImage; if (bg && bg !== 'none') return null; e = e.parentElement; } return { r: 237, g: 234, b: 224 }; };
  const ratio = (a, b) => { const la = lum(a.r, a.g, a.b), lb = lum(b.r, b.g, b.b); return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05); };
  const sel = ['.fsn-small', '.fsn-hint', '.fsn-eyebrow', '.fsn-lead', '.fsn-pf-t small', '.fsn-card--geste .fsn-card-p', '.fsn-card--refus .fsn-card-p', '.fsn-card--info .fsn-card-p', '.fsn-btn--primary:disabled', '.fsn-chip', '.fsn-q-why', '.fsn-label', '.fsn-top-step', '.fsn-quit'];
  const out = [];
  for (const s of sel) {
    for (const el of document.querySelectorAll(s)) {
      const fg = rgb(getComputedStyle(el).color); const bg = fondDe(el);
      if (!fg || !bg) continue;
      out.push({ sel: s, ratio: Math.round(ratio(fg, bg) * 100) / 100 });
      break;
    }
  }
  return out;
})()`;

try {
  await attendreServeur();
  const navigateur = await chromium.launch({ channel: 'chrome' });
  const ECRANS = [
    { n: 1, nom: 'u1-ou-publier' }, { n: 1, nom: 'u1-ou-publier-fiche', q: '&fiche=1' },
    { n: 2, nom: 'u2-ce-qui-va-partir' }, { n: 3, nom: 'u3-confirmer' }, { n: 4, nom: 'u4-cest-parti' },
  ];
  const TAILLES = [
    { nom: 'mobile', width: 380, height: 1600, scale: 2 },
    { nom: 'telephone', width: 380, height: 780, scale: 2 },
    { nom: 'large', width: 1280, height: 1100, scale: 1 },
  ];
  for (const e of ECRANS) {
    for (const t of TAILLES) {
      const page = await navigateur.newPage({ viewport: { width: t.width, height: t.height }, deviceScaleFactor: t.scale });
      const erreurs = [];
      page.on('pageerror', (x) => erreurs.push(String(x)));
      page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
      await page.goto(`${BASE}?ecran=${e.n}${e.q ?? ''}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(900);
      const fichier = path.join(SORTIE, `${e.nom}-${t.nom}.png`);
      await page.screenshot({ path: fichier, fullPage: false });
      console.log(`écrit : ${path.relative(RACINE, fichier)}`);
      const fsnErreurs = erreurs.filter((x) => !/favicon|fonts\.g|ERR_INTERNET|net::ERR/.test(x));
      verifier(fsnErreurs.length === 0, `${e.nom} @${t.width} : aucune erreur de page`, fsnErreurs.join(' | ').slice(0, 300));
      if (t.nom === 'mobile') {
        const deborde = await page.evaluate(() => {
          const s = document.querySelector('.fsn-scroll');
          return s ? s.scrollWidth > s.clientWidth + 1 : document.documentElement.scrollWidth > document.documentElement.clientWidth;
        });
        verifier(!deborde, `${e.nom} @380 : aucun débordement horizontal`);
        const petits = await page.evaluate(() => [...document.querySelectorAll('.fsn input, .fsn select, .fsn textarea')]
          .map((el) => parseFloat(getComputedStyle(el).fontSize)).filter((v) => v < 16));
        verifier(petits.length === 0, `${e.nom} @380 : tous les champs de saisie font ≥ 16 px`, `plus petits : ${petits.join(', ')}`);
        const contrastes = await page.evaluate(SCRIPT_CONTRASTE);
        const faibles = contrastes.filter((c) => c.ratio < 4.5);
        verifier(faibles.length === 0, `${e.nom} @380 : contraste AA (${contrastes.length} sélecteurs mesurés)`, faibles.map((c) => `${c.sel} ${c.ratio}`).join(', '));
      }
      if (t.nom === 'large') {
        const largeur = await page.evaluate(() => Math.max(...[...document.querySelectorAll('.fsn-col')].map((c) => c.getBoundingClientRect().width)));
        verifier(largeur <= 640, `${e.nom} @1280 : contenu ≤ 640 px (${Math.round(largeur)} px)`);
        if (e.n === 3) {
          const texte = await page.locator('.fsn').innerText();
          verifier(/Vinted\s+Attend une réponse : Taille/.test(texte), 'u3 : la ligne Vinted dit « Attend une réponse : Taille » (pas « Connectée — prête » sous un bouton gris)');
          verifier(/Leboncoin\s+Ne partira pas : attend une réponse \(Produit\)/.test(texte), 'u3 : la ligne Leboncoin nomme son exclusion (Produit)');
        }
      }
      await page.close();
    }
  }
  await navigateur.close();
  if (echecs.length) { console.error(`\n❌ ${echecs.length} vérification(s) en échec`); process.exitCode = 1; }
  else console.log('\n✅ aperçu du nouveau stepper : tout passe');
} finally {
  stop();
  process.exit(process.exitCode ?? 0);
}
