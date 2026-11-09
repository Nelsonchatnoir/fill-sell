// Captures + relevés du point C4 « Voir les autres formules » (09/11/2026 nuit). Outil de relecture, jamais livré.
// Chrome 1440, 390 et 320 ; WebKit iPhone SE (375) et 15 Pro Max (430) ; FR et EN. Le VRAI bloc
// (scripts/apercu/c4-formule.jsx), interrupteur ouvert POUR L'APERÇU, réponses de changer-formule simulées.
//   node scripts/apercu/capture-c4-formule.mjs
// Le parcours, par de VRAIS clics : replié → déplié (les formules plus basses, leur prix, « Passer à X le 9 décembre »)
// → confirmation (tout est dit) → confirmé (« Ta formule passera à X le 9 décembre » + « Garder Pro ») → gardé
// (replié de nouveau). Plus : un refus (arret_deja_prevu) dit une phrase. Assertions écrites AVANT de regarder :
// rien ne déborde, aucun texte coupé, boutons ≥ 44 px, textes ≥ 4,5:1, aucune erreur de page.
// Sorties : screenshots-review/c4-<format>-<étape>-<lang>.png (ignoré par git).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit, devices } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review');
const PORT = 5217;
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/c4-formule.html`;
fs.mkdirSync(SORTIE, { recursive: true });
const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-bandeau-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
  { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
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
{
  const fin = Date.now() + 90_000;
  while (Date.now() < fin) { try { if ((await fetch(BASE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
}
let ko = 0, n = 0;
const ok = (c, m, d) => { n++; if (!c) { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 500)}` : ''}`); } };

const RELEVE = () => {
  const vis = (e) => { const r = e.getBoundingClientRect(); const s = getComputedStyle(e); return r.width > 0 && r.height > 0 && s.visibility !== 'hidden' && s.display !== 'none'; };
  const parse = (s) => { const m = String(s).match(/rgba?\(([^)]+)\)/); if (!m) return null; const q = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return [q[0], q[1], q[2], q.length > 3 ? q[3] : 1]; };
  const lum = (c) => { const f = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const fond = (el) => { for (let e = el; e; e = e.parentElement) { const s = getComputedStyle(e); const c = parse(s.backgroundColor); if (c && c[3] > 0.5) return c; if (/gradient/.test(s.backgroundImage)) return [27, 110, 98, 1]; } return [255, 255, 255, 1]; };
  const ratio = (el) => { const a = lum(parse(getComputedStyle(el).color)); const b = lum(fond(el)); return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05); };
  const tous = [...document.querySelectorAll('body *')].filter(vis);
  const texteDepasse = (e) => {
    const b = e.getBoundingClientRect();
    const w = document.createTreeWalker(e, NodeFilter.SHOW_TEXT, { acceptNode: (t) => (t.parentElement?.closest('style,script') || !t.textContent.trim() ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT) });
    for (let t = w.nextNode(); t; t = w.nextNode()) { const rg = document.createRange(); rg.selectNodeContents(t); for (const r of rg.getClientRects()) if (r.width > 0 && (r.right > b.right + 1 || r.left < b.left - 1)) return true; }
    return false;
  };
  const coupes = tous.filter((e) => { const s = getComputedStyle(e); return (/hidden|clip/.test(s.overflowX) || s.textOverflow === 'ellipsis') && (e.innerText || '').trim() && texteDepasse(e); }).map((e) => e.innerText.trim().slice(0, 40));
  const sortants = tous.filter((e) => { const r = e.getBoundingClientRect(); return r.right > window.innerWidth + 1 || r.left < -1; }).map((e) => `${e.tagName}:${(e.innerText || '').slice(0, 30)}`);
  const petits = [...document.querySelectorAll('button')].filter(vis).map((b) => ({ t: (b.innerText || '').trim().slice(0, 40), h: Math.round(b.getBoundingClientRect().height) })).filter((b) => b.h < 44);
  const textes = tous.filter((e) => [...e.childNodes].some((x) => x.nodeType === 3 && x.textContent.trim())).map((e) => ({ t: (e.innerText || '').trim().slice(0, 30), r: Math.round(ratio(e) * 100) / 100 })).filter((x) => x.r < 4.5);
  return { texte: document.body.innerText.replace(/\s+/g, ' '), deborde: document.documentElement.scrollWidth > window.innerWidth + 1, sortants: sortants.slice(0, 5), coupes, petits, contrastesFaibles: textes, appels: window.__appels };
};
const ECRANS = [
  { nom: 'web-1440', moteur: 'chromium', ctx: { viewport: { width: 1440, height: 900 } } },
  { nom: 'web-390', moteur: 'chromium', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { nom: 'web-320', moteur: 'chromium', ctx: { viewport: { width: 320, height: 640 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { nom: 'iphone-se', moteur: 'webkit', ctx: { ...devices['iPhone SE'] } },
  { nom: 'iphone-15-pro-max', moteur: 'webkit', ctx: { ...devices['iPhone 15 Pro Max'] } },
];
const navs = { chromium: await chromium.launch({ channel: 'chrome', headless: true }), webkit: await webkit.launch({ headless: true }) };
try {
  for (const f of ECRANS) {
    const contexte = await navs[f.moteur].newContext({ ...f.ctx, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
    await contexte.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
    const page = await contexte.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(String(e.message).slice(0, 200)));
    for (const lang of ['fr', 'en']) {
      for (const formule of ['pro', 'business']) {
        erreurs.length = 0;
        const quoi = (etape) => `${f.nom} ${formule} ${lang} ${etape}`;
        const verifier = async (etape, attendus) => {
          await page.waitForTimeout(250);
          const r = await page.evaluate(RELEVE);
          ok(!r.deborde && r.sortants.length === 0, `${quoi(etape)} : rien ne déborde`, r.sortants.join(' | '));
          ok(r.coupes.length === 0, `${quoi(etape)} : aucun texte coupé`, r.coupes.join(' | '));
          ok(r.petits.length === 0, `${quoi(etape)} : boutons ≥ 44 px`, JSON.stringify(r.petits));
          ok(r.contrastesFaibles.length === 0, `${quoi(etape)} : textes ≥ 4,5:1`, JSON.stringify(r.contrastesFaibles));
          for (const a of attendus) ok(r.texte.includes(a), `${quoi(etape)} : « ${a} »`, r.texte.slice(0, 400));
          await page.screenshot({ path: path.join(SORTIE, `c4-${f.nom}-${formule}-${etape}-${lang}.png`), fullPage: true });
          return r;
        };
        const fr = lang === 'fr';
        await page.goto(`${BASE}?formule=${formule}&lang=${lang}`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.waitForSelector('text=' + (fr ? 'Voir les autres formules' : 'See other plans'), { timeout: 120000 });
        await page.evaluate(() => document.fonts?.ready);
        await verifier('replie', [fr ? 'Voir les autres formules' : 'See other plans']);
        await page.click('text=' + (fr ? 'Voir les autres formules' : 'See other plans'));
        const deplie = await verifier('deplie', fr ? ['Premium', '12,99 €/mois', 'Passer à Premium le 9 décembre', ...(formule === 'business' ? ['Passer à Pro le 9 décembre', '29,99 €/mois'] : [])]
          : ['Premium', '€12.99/mo', 'Switch to Premium on 9 December']);
        ok(!deplie.texte.includes(fr ? 'Passer à Business' : 'Switch to Business'), `${quoi('deplie')} : jamais une formule PLUS HAUTE ni la même`);
        await page.click(`[data-autre-formule="premium"] button`);
        await verifier('confirmer', [fr ? 'Passer à Premium le 9 décembre ?' : 'Switch to Premium on 9 December?', fr ? "Rien n'est remboursé ni prélevé aujourd'hui" : 'Nothing is refunded or charged today']);
        await page.click(`[data-confirmer-formule="premium"] button >> nth=0`);
        await page.waitForSelector('[data-formule-prevue]', { timeout: 10000 });
        const prevue = await verifier('prevue', [fr ? 'Ta formule passera à Premium le 9 décembre.' : 'Your plan will switch to Premium on 9 December.', fr ? `Garder ${formule === 'business' ? 'Business' : 'Pro'}` : `Keep ${formule === 'business' ? 'Business' : 'Pro'}`]);
        ok(JSON.stringify(prevue.appels) === JSON.stringify([{ action: 'lire' }, { action: 'programmer', vers: 'premium' }]), `${quoi('prevue')} : appels lire puis programmer(premium), rien d’autre`, JSON.stringify(prevue.appels));
        await page.click('[data-formule-prevue] ~ button');
        await page.waitForSelector('text=' + (fr ? 'Voir les autres formules' : 'See other plans'), { timeout: 10000 });
        const garde = await verifier('garde', []);
        ok(garde.appels.at(-1)?.action === 'annuler', `${quoi('garde')} : « Garder » appelle annuler`);
        // Un refus du serveur dit une phrase.
        await page.goto(`${BASE}?formule=${formule}&lang=${lang}&refus=arret_deja_prevu`, { waitUntil: 'domcontentloaded', timeout: 120000 });
        await page.click('text=' + (fr ? 'Voir les autres formules' : 'See other plans'));
        await page.click(`[data-autre-formule="premium"] button`);
        await page.click(`[data-confirmer-formule="premium"] button >> nth=0`);
        await page.waitForSelector('[role="alert"]', { timeout: 10000 });
        await verifier('refus', [fr ? "Ta formule s'arrête déjà à la fin de la période" : 'Your plan already stops at the end of the period']);
        ok(erreurs.length === 0, `${quoi('parcours')} : aucune erreur de page`, erreurs.join(' | '));
      }
    }
    await contexte.close();
    console.log(`${f.nom} : relu`);
  }
} finally {
  await navs.chromium.close().catch(() => {});
  await navs.webkit.close().catch(() => {});
  stop();
}
console.log(ko ? `\n✗ ${ko} rouge(s) sur ${n}` : `\n✓ ${n} contrôles verts — captures dans screenshots-review/c4-*.png`);
process.exit(ko ? 1 : 0);
