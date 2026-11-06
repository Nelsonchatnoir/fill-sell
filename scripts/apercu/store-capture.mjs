// ═══════════════════════════════════════════════════════════════════════════
// VISUELS DES STORES — les ÉCRANS BRUTS de l'app, FR et EN (06/11/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Outil, jamais livré. Monte les VRAIS composants (harnais store-*.html, copies
// des harnais site-* avec la langue) sur le compte de DÉMONSTRATION « Camille »
// (site-donnees-demo.js : aucune donnée réelle), joue les vrais gestes (jamais
// un bouton de confirmation) et écrit les PNG dans build/visuels-stores/ecrans/
// <langue>/<appareil>/<clé>.png. Les visuels se composent ensuite
// (store-composer.mjs) ; rien n'est écrit dans site/ ni ailleurs dans le dépôt.
//
//     node scripts/apercu/store-capture.mjs                  (tout)
//     node scripts/apercu/store-capture.mjs fr cloud stock   (filtres : langue, appareil ou clé)
//
// Réseau : local et Google Fonts seulement (le reste est coupé et compté) ;
// l'état eBay (ebay-account) est servi « relié » pour l'écran Cloud.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

process.env.TZ = 'Europe/Paris';
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const { HORLOGE_DEMO } = await import(pathToFileURL(path.join(RACINE, 'scripts', 'apercu', 'site-donnees-demo.js')).href);
const SORTIE = path.join(RACINE, 'build', 'visuels-stores', 'ecrans');
const PORT = Number(process.env.APERCU_PORT || 5241);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu`;
const FILTRES = process.argv.slice(2);

const APPAREILS = {
  telephone: { largeur: 390, hauteur: 844, dsf: 3 },     // 1170 × 2532
  tablette: { largeur: 1032, hauteur: 1376, dsf: 2 },    // 2064 × 2752 (iPad 13")
};

async function cliquer(page, re, re2 = null) {
  const ok = await page.evaluate(([s1, f1, s2, f2]) => {
    const r1 = new RegExp(s1, f1); const r2 = s2 ? new RegExp(s2, f2) : null;
    const b = [...document.querySelectorAll('button,[role=button]')].find((e) => r1.test(e.textContent.trim()) && (!r2 || r2.test(e.textContent)) && e.offsetParent);
    if (!b) return false;
    b.click();
    return true;
  }, [re.source, re.flags, re2?.source ?? null, re2?.flags ?? '']);
  await page.waitForTimeout(1300);
  return ok;
}
async function defiler(page, re, marge = 12) {
  const ok = await page.evaluate(([src, drapeaux, m]) => {
    const r = new RegExp(src, drapeaux);
    const el = [...document.querySelectorAll('body *')].find((e) => e.children.length === 0 && r.test(e.textContent.trim()) && e.getClientRects().length);
    if (!el) return false;
    let n = el.parentElement;
    while (n && !(n.scrollHeight > n.clientHeight + 2 && /(auto|scroll)/.test(getComputedStyle(n).overflowY))) n = n.parentElement;
    const cont = n ?? document.scrollingElement;
    const tb = document.querySelector('.topbar');
    const haut = Math.max(n ? n.getBoundingClientRect().top : 0, tb ? tb.getBoundingClientRect().bottom : 0);
    cont.scrollTop += el.getBoundingClientRect().top - haut - m;
    return true;
  }, [re.source, re.flags, marge]);
  await page.waitForTimeout(800);
  return ok;
}

// clé → harnais et gestes. `fr`/`en` : le texte qui DOIT être à l'écran (preuve que la scène est la bonne).
const SCENES = [
  { cle: 'accueil', url: 'store-app.html?ecran=accueil', fr: /Bonjour Camille/, en: /Hello Camille/ },
  { cle: 'lens-photo', url: 'store-app.html?ecran=lens-photo' },
  { cle: 'lens', url: 'store-app.html?ecran=lens', fr: /Picture/, en: /Picture/ },
  { cle: 'ou-publier', url: 'store-publication.html?ecran=ou-publier', fr: /Où publier/, en: /Where to (post|publish|list)/i },
  { cle: 'verifier', url: 'store-publication.html?ecran=verifier' },
  { cle: 'stock', url: 'store-stock.html' },
  { cle: 'stock-cartes', url: 'store-stock.html', geste: (p) => defiler(p, /^\d+ (articles|items)$/, 4) },
  { cle: 'synchro', url: 'store-stock.html?synchro=en-cours' },
  { cle: 'retrait', url: 'store-stock.html?vente=recente', geste: async (p) => { await p.evaluate(() => document.querySelector('button[aria-haspopup="dialog"]')?.click()); await p.waitForTimeout(1600); } },
  { cle: 'remonter', url: 'store-stock.html', geste: (p) => cliquer(p, /Republier|Repost/, /fais remonter|bump your/i) },
  { cle: 'ventes', url: 'store-app.html?ecran=ventes' },
  { cle: 'stats', url: 'store-app.html?ecran=stats', geste: async (p) => { await cliquer(p, /^(Octobre|October)$/); } },
  { cle: 'stats-plateformes', url: 'store-app.html?ecran=stats', geste: async (p) => { await cliquer(p, /^(Octobre|October)$/); await defiler(p, /^(Quelle plateforme rapporte le plus|Which platform earns the most)$/, 12); } },
  { cle: 'cloud', url: 'store-cloud.html', fr: /En marche/, en: /Running/ },
  // ── Les états de la vidéo d'aperçu (téléphone seulement) : les vrais gestes, image par image ──
  { cle: 'video-lens-bas', video: true, url: 'store-app.html?ecran=lens', geste: (p) => defiler(p, /^(Prix de revente|Resale price)$/, 40) },
  ...[0, 1, 2, 3, 4, 5].map((k) => ({
    cle: `video-publier-${k}`, video: true, url: 'store-publication.html?ecran=ou-publier',
    geste: async (p) => {
      // Les vraies cases de l'écran (.fsn-pf, aria-pressed) : tout décocher, puis cocher les k premières, une à une.
      for (let i = 0; i < 6; i += 1) { if (!(await p.evaluate(() => { const b = document.querySelector('.fsn-pf[aria-pressed="true"]'); b?.click(); return !!b; }))) break; await p.waitForTimeout(250); }
      for (let i = 0; i < k; i += 1) { await p.evaluate((j) => document.querySelectorAll('.fsn-pf')[j]?.click(), i); await p.waitForTimeout(250); }
      await p.waitForTimeout(600);
    },
  })),
  { cle: 'video-retrait-tot', video: true, url: 'store-stock.html?vente=recente&depuis=6', geste: async (p) => { await p.evaluate(() => document.querySelector('button[aria-haspopup="dialog"]')?.click()); await p.waitForTimeout(300); } },
  { cle: 'video-retrait-tard', video: true, url: 'store-stock.html?vente=recente&depuis=40', geste: async (p) => { await p.evaluate(() => document.querySelector('button[aria-haspopup="dialog"]')?.click()); await p.waitForTimeout(9000); } },
];

// ── Le serveur ──────────────────────────────────────────────────────────────
let serveur = null;
const stop = () => { if (!serveur) return; try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } serveur = null; };
process.on('exit', stop);
if (!process.env.APERCU_DEJA_LANCE) {
  serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
}
{
  const fin = Date.now() + 300000;
  let ok = false;
  while (Date.now() < fin) { try { if ((await fetch(`${BASE}/store-app.html`)).ok) { ok = true; break; } } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
  if (!ok) { console.error('Vite ne répond pas'); process.exit(1); }
}

const bilan = [];
const navigateur = await chromium.launch({ channel: 'chrome' });
try {
  for (const lang of ['fr', 'en']) {
    for (const [appareil, v] of Object.entries(APPAREILS)) {
      for (const s of SCENES) {
        if (s.video && appareil !== 'telephone') continue;
        if (FILTRES.includes('video') && !s.video) continue;
        if (FILTRES.some((f) => ['fr', 'en'].includes(f)) && !FILTRES.includes(lang)) continue;
        if (FILTRES.some((f) => ['telephone', 'tablette'].includes(f)) && !FILTRES.includes(appareil)) continue;
        if (FILTRES.some((f) => SCENES.some((x) => x.cle === f)) && !FILTRES.includes(s.cle)) continue;
        const contexte = await navigateur.newContext({
          viewport: { width: v.largeur, height: v.hauteur }, deviceScaleFactor: v.dsf,
          locale: lang === 'en' ? 'en-GB' : 'fr-FR', timezoneId: 'Europe/Paris', reducedMotion: 'reduce',
        });
        await contexte.clock.install({ time: new Date(HORLOGE_DEMO) });
        const page = await contexte.newPage();
        const erreurs = []; const sortantes = [];
        page.on('pageerror', (x) => erreurs.push(String(x)));
        await page.route(/127\.0\.0\.1:9\/faux-supabase\/functions\/v1\/ebay-account/, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ etat: { connecte: true, voie: 'api' } }) }));
        await page.route(/^https?:\/\/(?!127\.0\.0\.1|localhost|fonts\.googleapis\.com|fonts\.gstatic\.com)/, (r) => { sortantes.push(r.request().url()); r.abort(); });
        await page.routeWebSocket(/./, () => {});
        await page.addInitScript((l) => { try { localStorage.setItem('fs_lang', l); } catch { /* rien */ } }, lang);
        const sep = s.url.includes('?') ? '&' : '?';
        await page.goto(`${BASE}/${s.url}${sep}lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 240000 });
        await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 }).catch(() => {});
        for (let essai = 0; essai < 3; essai += 1) {
          await page.waitForTimeout(1500);
          const t = await page.locator('body').innerText().catch(() => '');
          if (t.trim().length > 40 && (!s[lang] || s[lang].test(t))) break;
          await page.reload({ waitUntil: 'domcontentloaded', timeout: 240000 });
          await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 }).catch(() => {});
        }
        await page.evaluate(() => document.fonts?.ready).catch(() => {});
        await page.waitForTimeout(1800);
        if (s.geste) await s.geste(page);
        await page.waitForFunction(() => [...document.images].filter((i) => i.offsetParent).every((i) => i.complete), null, { timeout: 30000 }).catch(() => {});
        await page.waitForTimeout(600);
        const texte = await page.locator('body').innerText().catch(() => '');
        const attendu = s[lang];
        const masquees = lang === 'en' ? (texte.match(/\b(Leboncoin|Beebs)\b/g) ?? []) : [];
        const dossier = path.join(SORTIE, lang, appareil);
        fs.mkdirSync(dossier, { recursive: true });
        const fichier = path.join(dossier, `${s.cle}.png`);
        await page.screenshot({ path: fichier });
        const ligne = {
          lang, appareil, cle: s.cle, fichier: path.relative(RACINE, fichier),
          attendu: attendu ? attendu.test(texte) : null, erreurs: erreurs.length, sortantes: sortantes.length,
          masquees_vues: masquees.length,
        };
        bilan.push(ligne);
        console.log(`${ligne.attendu === false ? '✗' : '✓'} ${lang}/${appareil}/${s.cle}  erreurs=${ligne.erreurs} sortantes=${ligne.sortantes}${masquees.length ? `  ⚠ Leboncoin/Beebs à l'écran : ${masquees.length}` : ''}${erreurs.length ? `  ← ${erreurs[0].slice(0, 200)}` : ''}`);
        await contexte.close();
      }
    }
  }
} finally {
  await navigateur.close();
  stop();
}
fs.writeFileSync(path.join(SORTIE, 'bilan.json'), JSON.stringify(bilan, null, 2));
console.log(`\n${bilan.length} écrans → ${path.relative(RACINE, SORTIE)}`);
