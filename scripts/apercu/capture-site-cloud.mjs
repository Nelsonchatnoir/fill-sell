// (09/11/2026, décision de Nico : « aucun Cloud » levé sur le site) Relecture « ultra carrée » des pages du site vitrine
// qui présentent FillSell Cloud. Outil, jamais livré. Sur l'aperçu local (npm run site:apercu → build/site-apercu servi
// comme Vercel, http://127.0.0.1:4319) ; Chrome 1440 et 390, WebKit iPhone SE et 15 Pro Max.
//   node scripts/apercu/capture-site-cloud.mjs <dossier de sortie> /faq /crosslisting /blog/xxx …
// Contrôles par page et par format : la page ne déborde jamais à l'horizontale (un tableau peut défiler DANS son cadre,
// comme avant) ; aucune phrase n'annonce FillSell Cloud avec Android ; aucun « Opla » ; le prix du Cloud, s'il est
// écrit, est 24,99 € / €24.99 ; capture du 1er passage qui nomme FillSell Cloud (bannière de consentement refusée).
import fs from 'node:fs';
import path from 'node:path';
import { chromium, webkit, devices } from 'playwright';

const BASE = process.env.APERCU_BASE ?? 'http://127.0.0.1:4319';
const [SORTIE, ...URLS] = process.argv.slice(2);
if (!SORTIE || !URLS.length) { console.error('usage : capture-site-cloud.mjs <sortie> <url>…'); process.exit(2); }
fs.mkdirSync(SORTIE, { recursive: true });
const FORMATS = [
  { nom: 'web-1440', moteur: 'chromium', ctx: { viewport: { width: 1440, height: 900 } } },
  { nom: 'web-390', moteur: 'chromium', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { nom: 'iphone-se', moteur: 'webkit', ctx: { ...devices['iPhone SE'] } },
  { nom: 'iphone-15-pro-max', moteur: 'webkit', ctx: { ...devices['iPhone 15 Pro Max'] } },
];
let ko = 0, n = 0;
const releve = {};
const navs = { chromium: await chromium.launch({ channel: 'chrome' }), webkit: await webkit.launch() };
try {
  for (const f of FORMATS) {
    const ctx = await navs[f.moteur].newContext({ ...f.ctx, locale: 'fr-FR' });
    const page = await ctx.newPage();
    for (const url of URLS) {
      const r404 = await page.goto(BASE + url, { waitUntil: 'networkidle', timeout: 60000 });
      const refus = page.locator('button', { hasText: /^(Refuser|Decline|Refuse)$/ }).first();
      if (await refus.count()) await refus.click().catch(() => {});
      const r = await page.evaluate(() => {
        const t = document.querySelector('main')?.innerText ?? document.body.innerText;
        const phrases = t.split(/(?<=[.!?])\s+|\n+/);
        const sortants = [...document.querySelectorAll('main *')].filter((e) => {
          const b = e.getBoundingClientRect();
          if (!(b.width > 0) || b.right <= innerWidth + 1) return false;
          for (let p = e.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/auto|scroll|hidden/.test(s.overflowX) && p.scrollWidth > p.clientWidth) return false; }
          return true;
        }).map((e) => `${e.tagName}:${(e.innerText || '').trim().slice(0, 30)}`).slice(0, 4);
        return {
          deborde: document.documentElement.scrollWidth > innerWidth + 1, sortants,
          cloud: (t.match(/FillSell Cloud/g) || []).length,
          android: phrases.filter((p) => /FillSell Cloud/.test(p) && /\bAndroid\b/.test(p)).map((p) => p.slice(0, 120)),
          opla: /\bopla\b/i.test(t),
          prix: [...t.matchAll(/FillSell Cloud[^.!?\n]{0,160}?(\d+[,.]\d{2})\s?€|€\s?(\d+[.,]\d{2})[^.!?\n]{0,40}FillSell Cloud/g)].map((m) => m[1] ?? m[2]).filter((p) => !/^24[,.]99$/.test(p)),
        };
      });
      n++;
      const okp = r404?.status() === 200 && !r.deborde && !r.sortants.length && !r.android.length && !r.opla && !r.prix.length;
      if (!okp) ko++;
      (releve[url] ??= {})[f.nom] = r;
      console.log(`${okp ? '✓' : '✗'} ${f.nom.padEnd(17)} ${url.padEnd(48)} cloud=${r.cloud} déborde=${r.deborde}${r.sortants.length ? ` sortants=${r.sortants.join('|')}` : ''}${r.android.length ? ` ANDROID=${r.android.join(' | ')}` : ''}${r.opla ? ' OPLA' : ''}${r.prix.length ? ` PRIX=${r.prix}` : ''}${r404?.status() !== 200 ? ` HTTP=${r404?.status()}` : ''}`);
      const passage = page.locator('main p, main li, main td, main dd, main h2, main h3, main summary').filter({ hasText: 'FillSell Cloud' }).first();
      const nomFichier = `${f.nom}${url.replace(/\//g, '_') || '_accueil'}.png`;
      if (await passage.count()) {
        await passage.scrollIntoViewIfNeeded().catch(() => {});
        await page.waitForTimeout(150);
        // WebKit attend parfois les polices au-delà de 30 s : la capture est une preuve visuelle EN PLUS des mesures,
        // jamais une raison d'arrêter la relecture des autres pages.
        try { await page.screenshot({ path: path.join(SORTIE, nomFichier), timeout: 60000, animations: 'disabled' }); } catch (e) { console.log(`  (capture impossible : ${f.nom} ${url} — ${String(e.message).split('\n')[0]})`); }
      }
    }
    await ctx.close();
  }
} finally {
  await navs.chromium.close(); await navs.webkit.close();
  fs.writeFileSync(path.join(SORTIE, 'releve.json'), JSON.stringify(releve, null, 1));
}
console.log(ko ? `\n✗ ${ko} rouge(s) sur ${n}` : `\n✓ ${n} contrôles verts (${URLS.length} pages × ${FORMATS.length} formats)`);
process.exit(ko ? 1 : 0);
