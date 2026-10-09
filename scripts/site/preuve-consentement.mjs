#!/usr/bin/env node
// Preuve RÉELLE des balises sous consentement (09/10/2026, chantier SEO, CNIL).
//
// Un vrai Chromium (Playwright) ouvre le site servi comme sur Vercel
// (npm run site:serveur, ou la prévisualisation) et note TOUTES les requêtes
// et TOUS les cookies :
//   A. accueil, première visite : aucune requête chez Google, aucun cookie
//      Google ; le bandeau est là ; « Accepter » → GTM, gtag AW, puis la
//      requête Google Ads (page vue / conversion) et les cookies _ga, _gcl_au ;
//      page suivante de l'APP (/login) : balises chargées d'emblée ;
//   B. app web (/login) en première visite : même règle avec le bandeau React ;
//   C. « Refuser » : aucune requête Google, ni sur la page ni sur la suivante ;
//   D. accord donné à l'ANCIEN bandeau (Meta seul) : redemandé, rien chargé.
// Les requêtes vers les points de collecte de Google (Analytics, Ads) sont
// COUPÉES à la sortie (route.abort) : elles sont émises — c'est la preuve —
// mais n'atteignent jamais Google (aucune visite de test dans les
// statistiques ni dans les conversions de Nico). Les scripts, eux, se
// chargent vraiment.
//
// Usage : node scripts/site/preuve-consentement.mjs [origine] [fichier JSON de sortie]
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

const ORIGINE = process.argv[2] ?? 'http://127.0.0.1:4319';
const SORTIE = process.argv[3];
const GOOGLE = /googletagmanager\.com|google-analytics\.com|doubleclick\.net|googleadservices\.com|google\.[a-z.]+\/(pagead|ccm|ads|rmkt)|googlesyndication|gstatic\.com\/(gtag|ads)/;
// (09/10 : « google.com/rmkt/collect » manquait à la première passe — deux
// passages de remarketing depuis 127.0.0.1 sont partis ; corrigé.)
const COLLECTE = /google-analytics\.com\/g\/collect|doubleclick\.net|googleadservices\.com|google\.[a-z.]+\/(pagead|ccm|rmkt)\//;
const COOKIE_GOOGLE = /^(_ga|_gid|_gat|_gcl_|_gac_|__gads|__gpi)/;

const resultat = { origine: ORIGINE, scenarios: {} };
let echecs = 0;
function ok(cond, message, scenario) {
  (resultat.scenarios[scenario].verifs ??= []).push({ ok: !!cond, message });
  if (!cond) { echecs++; console.error(`  ✗ [${scenario}] ${message}`); } else console.log(`  ✓ [${scenario}] ${message}`);
}

const navigateur = await chromium.launch({ channel: 'chrome' }); // Chrome installé (comme scripts/site/og.mjs)
async function contexte(nom, { stockage } = {}) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, locale: 'fr-FR' });
  // Prévisualisation Vercel protégée : FS_PARTAGE = lien « _vercel_share » (outil
  // get_access_to_vercel_url) ; sa visite par l'API du contexte pose le cookie
  // d'accès sans charger aucune page.
  if (process.env.FS_PARTAGE) await ctx.request.get(process.env.FS_PARTAGE, { maxRedirects: 0 }).catch(() => {});
  if (stockage) {
    await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) { try { localStorage.setItem(k, v); } catch { /* rien */ } } }, stockage);
  }
  const journal = [];
  await ctx.route(COLLECTE, (route) => route.abort('blockedbyclient'));
  ctx.on('request', (r) => { if (GOOGLE.test(r.url())) journal.push({ t: Date.now(), url: r.url().slice(0, 160) }); });
  resultat.scenarios[nom] = { journal: [] };
  const page = await ctx.newPage();
  const etape = (titre) => resultat.scenarios[nom].journal.push({ etape: titre, requetes_google: journal.length });
  const cookiesGoogle = async () => (await ctx.cookies()).filter((c) => COOKIE_GOOGLE.test(c.name)).map((c) => c.name);
  return { ctx, page, journal, etape, cookiesGoogle };
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

// ── A. Accueil du site, première visite, puis Accepter ───────────────────────
{
  const s = 'A-site-accepter';
  const { ctx, page, journal, etape, cookiesGoogle } = await contexte(s);
  await page.goto(`${ORIGINE}/`, { waitUntil: 'load' });
  await attendre(4000);
  etape('accueil chargé, aucune réponse');
  ok(journal.length === 0, `avant l'accord : 0 requête chez Google (${journal.length})`, s);
  ok((await cookiesGoogle()).length === 0, `avant l'accord : 0 cookie Google (${await cookiesGoogle()})`, s);
  const bandeau = page.locator('.consentement');
  ok(await bandeau.isVisible(), 'bandeau de consentement affiché', s);
  ok(/Google et de Meta/.test(await bandeau.innerText()), 'le bandeau nomme Google et Meta', s);
  await page.locator('button[data-consentement="accepte"]').click();
  await attendre(6000);
  etape('après « Accepter »');
  const urls = journal.map((j) => j.url);
  ok(urls.some((u) => u.includes('gtm.js?id=GTM-TJNKL6T5')), 'après l\'accord : GTM chargé', s);
  ok(urls.some((u) => u.includes('gtag/js?id=AW-16622098460')), 'après l\'accord : balise Google Ads chargée', s);
  const ads = urls.filter((u) => COLLECTE.test(u) && /doubleclick|googleadservices|pagead|ccm/.test(u));
  ok(ads.length > 0, `après l'accord : requête Google Ads émise (${ads[0] ?? 'aucune'})`, s);
  ok(urls.some((u) => /google-analytics\.com\/g\/collect/.test(u)) || urls.some((u) => /gtag\/js\?id=G-2ZYVK404G9/.test(u)), 'après l\'accord : Google Analytics chargé', s);
  const cg = await cookiesGoogle();
  ok(cg.some((c) => c.startsWith('_gcl_au')) && cg.some((c) => c.startsWith('_ga')), `après l'accord : cookies Google posés (${cg.join(', ')})`, s);
  resultat.scenarios[s].requetes_apres_accord = urls;
  const avant = journal.length;
  await page.goto(`${ORIGINE}/login`, { waitUntil: 'load' });
  await attendre(4000);
  etape('page suivante de l\'app (/login)');
  ok(journal.slice(avant).some((j) => j.url.includes('gtm.js?id=GTM-TJNKL6T5')), 'page suivante (app /login) : balises chargées d\'emblée, sans bandeau', s);
  ok(!(await page.locator('[role="dialog"]').filter({ hasText: 'Google' }).count()), 'page suivante : bandeau non reposé', s);
  await ctx.close();
}

// ── B. App web (/login) en première visite, bandeau React ────────────────────
{
  const s = 'B-app-accepter';
  const { ctx, page, journal, etape, cookiesGoogle } = await contexte(s);
  await page.goto(`${ORIGINE}/login`, { waitUntil: 'load' });
  await attendre(5000);
  etape('/login chargé, aucune réponse');
  ok(journal.length === 0, `app avant l'accord : 0 requête chez Google (${journal.length})`, s);
  ok((await cookiesGoogle()).length === 0, 'app avant l\'accord : 0 cookie Google', s);
  const bouton = page.getByRole('button', { name: 'Accepter' });
  ok(await bouton.isVisible(), 'app : bandeau React affiché', s);
  await bouton.click();
  await attendre(6000);
  etape('après « Accepter » (bandeau de l\'app)');
  const urls = journal.map((j) => j.url);
  ok(urls.some((u) => u.includes('gtm.js?id=GTM-TJNKL6T5')) && urls.some((u) => u.includes('gtag/js?id=AW-16622098460')), 'app après l\'accord : GTM et Google Ads chargés', s);
  ok(urls.some((u) => /doubleclick|googleadservices|pagead|ccm/.test(u)), 'app après l\'accord : requête Google Ads émise', s);
  resultat.scenarios[s].requetes_apres_accord = urls;
  await ctx.close();
}

// ── C. Refuser ──────────────────────────────────────────────────────────────
{
  const s = 'C-site-refuser';
  const { ctx, page, journal, etape, cookiesGoogle } = await contexte(s);
  await page.goto(`${ORIGINE}/`, { waitUntil: 'load' });
  await attendre(2000);
  await page.locator('button[data-consentement="refuse"]').click();
  await attendre(4000);
  etape('après « Refuser »');
  await page.goto(`${ORIGINE}/tarifs`, { waitUntil: 'load' });
  await attendre(3000);
  await page.goto(`${ORIGINE}/login`, { waitUntil: 'load' });
  await attendre(4000);
  etape('deux pages plus tard (/tarifs, /login)');
  ok(journal.length === 0, `refus : 0 requête chez Google sur trois pages (${journal.length})`, s);
  ok((await cookiesGoogle()).length === 0, 'refus : 0 cookie Google', s);
  ok(!(await page.locator('.consentement').count()), 'refus : bandeau non reposé', s);
  await ctx.close();
}

// ── D. Accord donné à l'ancien bandeau (Meta seul) ───────────────────────────
{
  const s = 'D-ancien-accord-meta';
  const { ctx, page, journal, etape } = await contexte(s, { stockage: { fs_consent_pub: 'accepte' } });
  await page.goto(`${ORIGINE}/`, { waitUntil: 'load' });
  await attendre(4000);
  etape('accueil, ancien accord (Meta seul)');
  ok(journal.length === 0, `ancien accord Meta : 0 requête chez Google (${journal.length})`, s);
  ok(await page.locator('.consentement').isVisible(), 'ancien accord Meta : la question est reposée (texte qui nomme Google)', s);
  await ctx.close();
}

await navigateur.close();
resultat.echecs = echecs;
if (SORTIE) writeFileSync(SORTIE, JSON.stringify(resultat, null, 2));
console.log(echecs ? `preuve-consentement : ${echecs} ÉCHEC(S)` : 'preuve-consentement : tout est vert');
process.exit(echecs ? 1 : 0);
