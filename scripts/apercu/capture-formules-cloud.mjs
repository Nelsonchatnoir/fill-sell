// Captures des écrans des FORMULES AVEC CLOUD (11/11/2026), en mode DÉMONSTRATION — outil de relecture, jamais livré.
//
//   node scripts/apercu/capture-formules-cloud.mjs [--moteur=webkit|chromium] [--seulement=offres-avec,fin-essai]
//
// Les vrais composants (scripts/apercu/formules-cloud.jsx), un compte de démonstration témoin, un faux client Supabase
// (vite-formules-cloud.config.mjs) ; Playwright coupe en plus tout appel *.supabase.co et fillsell.app.
//   · format iPhone (390 × 844, ×3 = 1170 × 2532), pont natif iOS injecté et prix de boutique SIMULÉS (les mentions disent
//     « compte Apple », les prix sont ceux qu'Apple afficherait en France), une capture d'écran visible + une pleine page ;
//   · Réglages › Abonnement (abonné Pro par carte, sans Cloud) : la page du web, au même format, interrupteur sur « Avec » ;
//   · la version PROPRE pour la revue Apple : fenêtre « Avec Cloud », 430 × 932 ×3 = 1290 × 2796 (iPhone 6,7 / 6,9 pouces),
//     FR et EN, sans aucune donnée client.
// Sorties : build/formules-cloud/ (ignoré par git).
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'build', 'formules-cloud');
const PORT = 5299;
const ARGS = process.argv.slice(2);
const moteurVoulu = ARGS.find((a) => a.startsWith('--moteur='))?.split('=')[1] ?? 'webkit';
const seulement = ARGS.find((a) => a.startsWith('--seulement='))?.split('=')[1]?.split(',');
fs.mkdirSync(SORTIE, { recursive: true });

const serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-formules-cloud.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'],
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
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/formules-cloud.html`;
for (let i = 0; i < 120; i++) { try { if ((await fetch(BASE)).ok) break; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }

const UA_IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148';
const ECRANS = [
  ['entree-ordinateur', 'Parcours — « As-tu un ordinateur ? »'],
  ['entree-extension', 'Parcours — avec ordinateur (4a, l’extension)'],
  ['entree-presentation', 'Parcours — sans ordinateur (4b, présentation du Cloud)'],
  ['entree-offres', 'Parcours — « Choisis ta formule » (Avec Cloud)'],
  ['entree-essai', 'Parcours — « Rien à payer avant le … » (Pro + Cloud)'],
  ['offres-sans', 'Fenêtre d’offres — Sans Cloud'],
  ['offres-avec', 'Fenêtre d’offres — Avec Cloud (Free)'],
  ['offres-avec-pro', 'Fenêtre d’offres — Avec Cloud (abonné Pro)'],
  ['reglages-pro', 'Réglages › Abonnement — abonné Pro sans Cloud'],
  ['fin-essai', 'Rappel avant débit — la veille'],
  ['rappel-jourj', 'Rappel avant débit — le jour J'],
].filter(([e]) => !seulement || seulement.includes(e));


const nav = await (moteurVoulu === 'chromium' ? chromium.launch({ channel: 'chrome' }) : webkit.launch());
const produits = [];
async function page({ largeur, hauteur, lang, natif }) {
  const ctx = await nav.newContext({ viewport: { width: largeur, height: hauteur }, deviceScaleFactor: 3, userAgent: UA_IPHONE, hasTouch: true, isMobile: true,
    locale: lang === 'en' ? 'en-US' : 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.route(/supabase\.co|fillsell\.app/, (r) => r.abort());
  // Le pont natif iOS de Capacitor : getPlatform() = 'ios', isNativePlatform() = vrai (les mentions : « compte Apple »).
  if (natif) await ctx.addInitScript(() => { try { Object.defineProperty(window, 'webkit', { configurable: true, value: { messageHandlers: { bridge: { postMessage() {} } } } }); } catch { /* déjà là */ } });
  return { ctx, p: await ctx.newPage() };
}
const releve = async (p) => p.evaluate(() => ({
  texte: document.body.innerText.replace(/\s+/g, ' ').slice(0, 3000),
  debordePage: document.documentElement.scrollWidth > window.innerWidth + 1,
}));
try {
  for (const [ecran, titre] of ECRANS) {
    const natif = ecran !== 'reglages-pro';
    const { ctx, p } = await page({ largeur: 390, hauteur: 844, lang: 'fr', natif });
    await p.goto(`${BASE}?ecran=${ecran}&lang=fr${natif ? '&prix=boutique' : ''}`, { waitUntil: 'load', timeout: 120000 });
    await p.waitForTimeout(2500);
    if (ecran === 'reglages-pro') { await p.click('[data-formules-vue="avec"]').catch(() => {}); await p.waitForTimeout(400); }
    const vue = path.join(SORTIE, `iphone-${ecran}.png`);
    await p.screenshot({ path: vue });
    produits.push([titre, vue]);
    const r = await releve(p);
    if (ecran === 'offres-avec' || ecran === 'entree-offres') {
      // La carte Business + Cloud, sans essai, à l'écran.
      await p.evaluate(() => document.querySelector('[data-formule-cloud="business_cloud"]')?.scrollIntoView({ block: 'center' }));
      await p.waitForTimeout(500);
      const b = path.join(SORTIE, `iphone-${ecran}-business.png`);
      await p.screenshot({ path: b });
      produits.push([`${titre} — carte Business + Cloud`, b]);
    }
    const plein = path.join(SORTIE, `iphone-${ecran}-pleine-page.png`);
    await p.screenshot({ path: plein, fullPage: true });
    fs.writeFileSync(path.join(SORTIE, `iphone-${ecran}.txt`), `${r.texte}\n`);
    console.log(`${ecran.padEnd(20)} déborde=${r.debordePage} → ${vue}`);
    await ctx.close();
  }
  // La version propre pour la revue Apple (1290 × 2796), FR et EN.
  if (!seulement || seulement.includes('revue-apple')) {
    for (const lang of ['fr', 'en']) {
      const { ctx, p } = await page({ largeur: 430, hauteur: 932, lang, natif: true });
      await p.goto(`${BASE}?ecran=offres-avec&lang=${lang}&prix=boutique`, { waitUntil: 'load', timeout: 120000 });
      await p.waitForTimeout(2500);
      const f = path.join(SORTIE, `revue-apple-avec-cloud-${lang}-1290x2796.png`);
      await p.screenshot({ path: f });
      produits.push([`Revue Apple — fenêtre « Avec Cloud » (${lang})`, f]);
      await ctx.close();
    }
  }
} finally {
  await nav.close();
  stop();
}
fs.writeFileSync(path.join(SORTIE, 'LISTE.txt'), `${produits.map(([t, f]) => `${t}\t${f}`).join('\n')}\n`);
console.log(`\n${produits.length} captures → ${SORTIE}`);
