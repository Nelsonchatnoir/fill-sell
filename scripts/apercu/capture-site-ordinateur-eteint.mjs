// (09/11) Outil de relecture, jamais livré. Captures du site vitrine (aperçu local, build/site-apercu servi comme Vercel) : les 2 pages corrigées le 09/11.
import { chromium, webkit, devices } from 'playwright';
const BASE = 'http://127.0.0.1:4319';
const SORTIE = process.argv[2];
const PAGES = [
  { id: 'crosslisting', url: '/crosslisting', attendu: "eBay relié, par l'API officielle" },
  { id: 'reposter', url: '/comparatif/fillsell-vs-reposter', attendu: "un compte eBay relié publie aussi ordinateur éteint" },
];
const FORMATS = [
  { nom: 'web-1440', moteur: 'chromium', ctx: { viewport: { width: 1440, height: 900 } } },
  { nom: 'web-390', moteur: 'chromium', ctx: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  { nom: 'iphone-se', moteur: 'webkit', ctx: { ...devices['iPhone SE'] } },
  { nom: 'iphone-15-pro-max', moteur: 'webkit', ctx: { ...devices['iPhone 15 Pro Max'] } },
];
let ko = 0;
const navs = { chromium: await chromium.launch({ channel: 'chrome' }), webkit: await webkit.launch() };
for (const f of FORMATS) {
  const ctx = await navs[f.moteur].newContext({ ...f.ctx, locale: 'fr-FR' });
  const page = await ctx.newPage();
  for (const p of PAGES) {
    await page.goto(BASE + p.url, { waitUntil: 'networkidle', timeout: 60000 });
    const r = await page.evaluate((attendu) => {
      const t = document.body.innerText.replace(/\s+/g, ' ');
      const i = t.indexOf(attendu.split(' ').slice(0, 4).join(' '));
      const el = [...document.querySelectorAll('td, li, p')].find((e) => e.innerText.replace(/\s+/g, ' ').includes(attendu));
      if (el) el.scrollIntoView({ block: 'center' });
      const sortants = [...document.querySelectorAll('main *')].filter((e) => { const b = e.getBoundingClientRect(); return b.width > 0 && (b.right > innerWidth + 1); })
        .filter((e) => !e.closest('[style*="overflow"], .tableau-defile, table')).map((e) => e.tagName).slice(0, 5);
      const table = el?.closest('table');
      const conteneur = table?.parentElement;
      return {
        present: t.includes(attendu), deborde: document.documentElement.scrollWidth > innerWidth + 1, sortants,
        tableDefile: table ? (getComputedStyle(conteneur).overflowX + ' ' + conteneur.scrollWidth + '/' + conteneur.clientWidth) : null,
        vieux: /seul un compte eBay relié|eBay relié seulement|seulement eBay relié/.test(t),
      };
    }, p.attendu);
    const okp = r.present && !r.deborde && !r.vieux;
    if (!okp) ko++;
    console.log(`${okp ? '✓' : '✗'} ${f.nom} ${p.id} : présent=${r.present} débordePage=${r.deborde} ancienne=${r.vieux} table=${r.tableDefile} sortants=${r.sortants.join(',')}`);
    await page.screenshot({ path: `${SORTIE}/site-${f.nom}-${p.id}.png` });
  }
  await ctx.close();
}
await navs.chromium.close(); await navs.webkit.close();
process.exit(ko ? 1 : 0);
