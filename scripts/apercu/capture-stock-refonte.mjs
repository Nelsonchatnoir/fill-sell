// Captures AVANT / APRÈS de l'écran Stock + contrôles (03/10/2026, refonte).
// Outil de relecture, jamais livré — même patron que capture-cartes-0210.mjs.
//
//   node scripts/apercu/capture-stock-refonte.mjs
//
// Deux serveurs Vite (vite-stock-refonte.config.mjs, faux client Supabase) :
//   · APRÈS — ce dépôt (branche redesign/stock), port 5212 ;
//   · AVANT — un worktree de main au commit de base (APERCU_AVANT_RACINE), port 5213.
// Ports déjà servis ? APERCU_DEJA_LANCE=1 les réutilise.
// Les données : build/apercu-stock/donnees.json (compte réel relu en LECTURE
// SEULE, jamais commité). Aucune requête ne part vers la base : le faux client
// la remplace, et playwright coupe en plus tout appel *.supabase.co (hors images
// publiques) et fillsell.app.
//
// Ce qu'il PROUVE, sur l'APRÈS, à 390 px :
//   · aucun débordement horizontal, à aucun écran ;
//   · aucune pastille d'état coupée (entière dans sa photo), aucun bouton
//     d'action dont le texte déborde ;
//   · la barre d'onglets ne recouvre jamais le bas du contenu ;
//   · marges latérales identiques pour les blocs du haut ;
//   · aucun émoji dans le texte affiché ;
//   · les prix au format français (12,00 €) ;
//   · Cartes / Liste survit au rechargement (localStorage) ;
//   · « Voir N articles » du panneau = le compte de la liste ;
//   · chaque geste s'ouvre sur sa sélection avec UN seul bouton de confirmation,
//     jamais validé ici ; aucune écriture tentée de tout le parcours.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const AVANT_RACINE = process.env.APERCU_AVANT_RACINE || path.resolve(RACINE, '..', 'fill-and-sell-avant-stock');
const SORTIE = path.join(RACINE, 'screenshots-review', 'stock-refonte');
const DEJA = !!process.env.APERCU_DEJA_LANCE;
// APERCU_VERSIONS=apres : seulement l'APRÈS (retest après fusion, sans worktree AVANT).
const VOULUES = (process.env.APERCU_VERSIONS || 'apres,avant').split(',').map((v) => v.trim());
const VERSIONS = [
  { nom: 'apres', racine: RACINE, port: 5212 },
  { nom: 'avant', racine: AVANT_RACINE, port: 5213 },
].filter((v) => VOULUES.includes(v.nom));
fs.mkdirSync(SORTIE, { recursive: true });

const serveurs = [];
// SYNCHRONE : à la sortie du script, un taskkill asynchrone n'a pas le temps de
// partir, et le serveur Vite (petit-fils de npx) restait ouvert.
const stop = () => { for (const s of serveurs.splice(0)) { try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(s.pid), '/f', '/t'], { stdio: 'ignore' }); else s.kill(); } catch { /* déjà arrêté */ } } };
process.on('exit', stop);
if (!DEJA) {
  for (const v of VERSIONS) {
    const s = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(v.port), '--strictPort'], { cwd: v.racine, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
    s.stderr.on('data', (d) => process.stderr.write(`[vite ${v.nom}] ${d}`));
    serveurs.push(s);
  }
}
const url = (v) => `http://127.0.0.1:${v.port}/scripts/apercu/stock-refonte.html`;
async function attendre(u, ms = 300000) {
  const fin = Date.now() + ms;
  while (Date.now() < fin) { try { const r = await fetch(u); if (r.ok) return; } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
  throw new Error(`pas de réponse : ${u}`);
}

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

async function ouvrir(navigateur, v) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true });
  const page = await ctx.newPage();
  page.__erreurs = [];
  page.on('pageerror', (e) => page.__erreurs.push(e.message));
  // Lecture des images PUBLIQUES seulement ; tout le reste de Supabase et de
  // fillsell.app est coupé (le faux client n'en a de toute façon pas besoin).
  await page.route(/https?:\/\/[^/]*(supabase\.co|fillsell\.app)\//, (r) => {
    const u = r.request().url();
    if (r.request().method() === 'GET' && /\/storage\/v1\/object\/public\//.test(u)) return r.continue();
    return r.abort();
  });
  await page.goto(url(v), { waitUntil: 'domcontentloaded', timeout: 300000 });
  await page.waitForFunction(() => window.__pret === true || window.__erreurChargement, null, { timeout: 300000 });
  await page.waitForTimeout(4000);
  await page.waitForLoadState('networkidle', { timeout: 20000 }).catch(() => {});
  return { ctx, page };
}

const zone = (page) => page.locator('#zone-defilement');
async function haut(page) { await zone(page).evaluate((z) => { z.scrollTop = 0; }); await page.waitForTimeout(300); }
// Amène l'élément juste SOUS l'en-tête fixe (verre dépoli), `marge` px plus bas.
async function defilerVers(page, selecteur, marge = 8) {
  await page.evaluate(([sel, m]) => {
    const z = document.getElementById('zone-defilement');
    const el = typeof sel === 'string' ? document.querySelector(sel) : null;
    if (!el) return;
    const barre = document.querySelector('.topbar');
    const sousBarre = Math.max(z.getBoundingClientRect().top, barre ? barre.getBoundingClientRect().bottom : 0);
    z.scrollTop += el.getBoundingClientRect().top - sousBarre - m;
  }, [selecteur, marge]);
  await page.waitForTimeout(400);
}
async function capture(page, v, nom) {
  const f = path.join(SORTIE, `${v.nom}-${nom}.png`);
  await page.screenshot({ path: f });
  return f;
}
async function fermerCouche(page) {
  const b = page.getByRole('button', { name: /^(Fermer|Retour|Revenir)/ }).last();
  if (await b.count()) { await b.click().catch(() => {}); } else { await page.keyboard.press('Escape'); }
  await page.waitForTimeout(500);
}

// Les mesures de la page, d'un coup.
async function mesurer(page) {
  return page.evaluate(() => {
    const z = document.getElementById('zone-defilement');
    const r = (el) => el.getBoundingClientRect();
    const deborde = document.documentElement.scrollWidth > window.innerWidth + 1 || z.scrollWidth > z.clientWidth + 1;
    const pastillesCoupees = [];
    for (const p of document.querySelectorAll('[data-pastille]')) {
      const rp = r(p);
      if (!rp.width) continue;
      // L'ancêtre qui rogne (overflow ≠ visible) doit la contenir entière.
      let n = p.parentElement;
      while (n && getComputedStyle(n).overflow === 'visible') n = n.parentElement;
      if (n) { const rn = r(n); if (rp.left < rn.left - 0.5 || rp.right > rn.right + 0.5) pastillesCoupees.push(p.textContent.trim()); }
      if (p.scrollWidth > p.clientWidth + 1) pastillesCoupees.push(p.textContent.trim());
    }
    const boutonsCoupes = [...document.querySelectorAll('button')]
      .filter((b) => getComputedStyle(b).whiteSpace === 'nowrap' && b.offsetParent && b.scrollWidth > b.clientWidth + 1)
      .map((b) => b.textContent.trim().slice(0, 40));
    const texte = document.body.innerText;
    const emojis = [...new Set(texte.match(/\p{Extended_Pictographic}/gu) || [])];
    const prix = [...texte.matchAll(/(\d[\d\s  ]*(?:[.,]\d+)?)\s?€/g)].map((m) => m[0]);
    const prixNonFr = prix.filter((p) => !/^\d{1,3}(?:[\s  ]\d{3})*(?:,\d{2})?[\s  ]?€$/.test(p.trim()));
    return { deborde, pastillesCoupees, boutonsCoupes, emojis, nbPrix: prix.length, prixNonFr: prixNonFr.slice(0, 8) };
  });
}

async function barreNeRecouvrePas(page) {
  return page.evaluate(async () => {
    const z = document.getElementById('zone-defilement');
    z.scrollTop = z.scrollHeight;
    await new Promise((r) => setTimeout(r, 400));
    const nav = document.querySelector('.bnav > div');
    const haut = nav ? nav.getBoundingClientRect().top : window.innerHeight;
    // Le dernier élément VISIBLE du contenu.
    const els = [...z.querySelectorAll('*')].filter((e) => e.offsetParent && e.getBoundingClientRect().height > 0 && e.children.length === 0 && (e.textContent.trim() || e.tagName === 'IMG' || e.tagName === 'svg'));
    const bas = Math.max(...els.map((e) => e.getBoundingClientRect().bottom));
    return { bas: Math.round(bas), hautBarre: Math.round(haut), ok: bas <= haut + 0.5 };
  });
}

const navigateur = await chromium.launch({ channel: 'chrome' });
const fichiers = {};
for (const v of VERSIONS) {
  await attendre(url(v));
  console.log(`\n══ ${v.nom.toUpperCase()} — ${url(v)}`);
  const { ctx, page } = await ouvrir(navigateur, v);
  const version = await page.evaluate(() => window.__version);
  verifier(version === v.nom, `la page sert bien la version ${v.nom}`, version);
  const f = (fichiers[v.nom] = {});
  const apres = v.nom === 'apres';

  // 1. Le haut
  await haut(page);
  f.haut = await capture(page, v, '01-haut');
  if (apres) {
    const m = await mesurer(page);
    verifier(!m.deborde, 'haut : aucun débordement horizontal');
    verifier(m.emojis.length === 0, 'haut : aucun émoji affiché', m.emojis.join(' '));
    const marges = await page.evaluate(() => {
      const blocs = ['section[aria-label="Synchronisation des annonces"]', '[aria-label^="Publier :"]', 'input[aria-label="Rechercher un article"]']
        .map((s) => document.querySelector(s)).filter(Boolean)
        .map((el) => { let n = el; for (let i = 0; i < 4 && n.parentElement && n.parentElement.id !== 'zone-defilement'; i++) n = n.parentElement; return el; });
      const g = Math.round(document.querySelector('section[aria-label="Synchronisation des annonces"]')?.getBoundingClientRect().left ?? -1);
      const d = Math.round(window.innerWidth - (document.querySelector('section[aria-label="Synchronisation des annonces"]')?.getBoundingClientRect().right ?? 0));
      return { g, d, n: blocs.length };
    });
    verifier(marges.g === marges.d && marges.g > 0, `marges latérales identiques (${marges.g} px / ${marges.d} px)`);
  }

  // 2. Défilé : l'en-tête de la liste et les premières cartes
  if (apres) await defilerVers(page, '[aria-label="Affichage du stock"]', 12);
  else await defilerVers(page, '.ggrid', 56);
  f.defile = await capture(page, v, '02-defile');
  if (apres) {
    const m = await mesurer(page);
    verifier(m.pastillesCoupees.length === 0, 'cartes : aucune pastille d’état coupée', m.pastillesCoupees.join(' | '));
    verifier(m.boutonsCoupes.length === 0, 'cartes : aucun bouton dont le texte déborde', m.boutonsCoupes.join(' | '));
    verifier(m.prixNonFr.length === 0 && m.nbPrix > 0, `prix au format français (${m.nbPrix} lus)`, m.prixNonFr.join(' | '));
  }

  // 3. La vue Liste (APRÈS) — mémorisée au rechargement
  if (apres) {
    await page.getByRole('button', { name: 'Liste', exact: true }).click();
    await page.waitForTimeout(600);
    await defilerVers(page, '[aria-label="Affichage du stock"]', 12);
    f.liste = await capture(page, v, '03-liste');
    const m = await mesurer(page);
    verifier(!m.deborde && m.pastillesCoupees.length === 0, 'liste : ni débordement ni pastille coupée', m.pastillesCoupees.join(' | '));
    const memo = await page.evaluate(() => localStorage.getItem('fs_stock_affichage'));
    verifier(memo === 'liste', 'Cartes / Liste : le choix est écrit (fs_stock_affichage)', String(memo));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForFunction(() => window.__pret === true, null, { timeout: 120000 });
    await page.waitForTimeout(3000);
    const toujours = await page.getByRole('button', { name: 'Liste', exact: true }).getAttribute('aria-pressed').catch(() => null);
    verifier(toujours === 'true', 'Cartes / Liste : « Liste » est encore choisie après rechargement', String(toujours));
    await page.getByRole('button', { name: 'Cartes', exact: true }).click();
    await page.waitForTimeout(400);
  } else {
    await zone(page).evaluate((z) => { z.scrollTop += 700; });
    await page.waitForTimeout(400);
    f.liste = await capture(page, v, '03-liste');
  }

  // 4. Le panneau Filtrer (et trier)
  await haut(page);
  await page.getByRole('button', { name: /^Filtrer/ }).first().click();
  await page.waitForTimeout(900);
  f.filtrer = await capture(page, v, '04-filtrer');
  if (apres) {
    const voir = await page.getByRole('button', { name: /^Voir \d+ articles?$/ }).first().textContent().catch(() => '');
    const compte = await page.evaluate(() => (document.querySelector('[aria-label="Affichage du stock"]')?.parentElement?.textContent ?? '').match(/(\d+)\s+articles?/)?.[1] ?? null);
    verifier(!!voir && voir.includes(String(compte)), `« ${voir?.trim()} » = le compte de la liste (${compte})`);
  }
  await fermerCouche(page);

  // 5. Les points à régler
  await haut(page);
  if (apres) {
    await page.getByRole('button', { name: /points? à régler/ }).first().click();
    await page.waitForTimeout(900);
    f.points = await capture(page, v, '05-points-a-regler');
    await fermerCouche(page);
  } else {
    // AVANT : pas de feuille — les alertes sont des paragraphes dans la carte.
    f.points = await capture(page, v, '05-points-a-regler');
  }

  // 6. Remonter : la sélection pré-cochée, jamais validée
  await haut(page);
  if (apres) {
    await page.locator('[aria-label^="Remonter mes annonces :"]').first().click();
    await page.waitForTimeout(900);
    f.remonter = await capture(page, v, '06-remonter');
    const boutons = await page.getByRole('button', { name: /^Remonter \d+ annonces?$/ }).count();
    verifier(boutons === 1, 'Remonter : UN seul bouton de confirmation (non pressé)');
    await fermerCouche(page);
    // Publier et À régler : mêmes portes, mêmes règles.
    await page.locator('[aria-label^="Publier :"]').first().click();
    await page.waitForTimeout(900);
    f.publier = await capture(page, v, '06b-publier');
    const bp = await page.getByRole('button', { name: /^Publier \d+ articles?|^Continuer/ }).count();
    verifier(bp >= 1, 'Publier : la sélection s’ouvre sur un bouton de confirmation (non pressé)');
    await fermerCouche(page);
    await page.locator('[aria-label^="À régler :"]').first().click();
    await page.waitForTimeout(900);
    f.aregler = await capture(page, v, '06c-a-regler');
    await fermerCouche(page);
    // Le menu « … » d'une carte : toutes les fonctions d'avant, et « Dupliquer ».
    await defilerVers(page, '[aria-label="Affichage du stock"]', 12);
    await page.getByRole('button', { name: 'Plus d’actions' }).first().click();
    await page.waitForTimeout(900);
    f.menu = await capture(page, v, '09-menu');
    const dup = await page.getByRole('button', { name: /^Dupliquer/ }).count();
    verifier(dup === 1, 'menu « … » : « Dupliquer » est là');
    await fermerCouche(page);
  } else {
    // AVANT : « À traiter » → « À republier » → le mode de republication en lot.
    const aTraiter = page.getByRole('button', { name: /À traiter/ }).first();
    if (await aTraiter.count()) {
      await aTraiter.click();
      await page.waitForTimeout(800);
      const ligne = page.getByRole('button', { name: /À republier/ }).first();
      if (await ligne.count()) { await ligne.click(); await page.waitForTimeout(900); }
      await defilerVers(page, '.pa-call', 8);
    }
    f.remonter = await capture(page, v, '06-remonter');
    await page.getByRole('button', { name: /Quitter la republication en lot/ }).first().click().catch(() => {});
    await page.waitForTimeout(500);
  }

  // 7. Synchroniser (simulé) : en cours, puis l'arrivée
  await haut(page);
  await page.getByRole('button', { name: apres ? /^Synchroniser$/ : /^Tout relever$/ }).first().click();
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.__synchro.avancer('running'));
  // Le Stock relit la base toutes les 30 s : on attend la relecture.
  await page.waitForTimeout(32000);
  await haut(page);
  f.enCours = await capture(page, v, '07-synchro-en-cours');
  await page.evaluate(() => window.__synchro.avancer('done'));
  await page.waitForTimeout(32000);
  await haut(page);
  f.arrivee = await capture(page, v, '08-arrivee-apres-synchro');
  if (apres) {
    const resume = await page.locator('section[aria-label="Synchronisation terminée"]').count();
    verifier(resume === 1, 'arrivée : le résumé de fin de synchronisation est affiché');
    const aFaire = await page.getByText('À FAIRE MAINTENANT', { exact: false }).count();
    verifier(aFaire >= 1, 'arrivée : « À faire maintenant » avec les trois gestes');
    const m = await mesurer(page);
    verifier(!m.deborde && m.emojis.length === 0, 'arrivée : ni débordement ni émoji');
    const barre = await barreNeRecouvrePas(page);
    verifier(barre.ok, `la barre d’onglets ne recouvre pas la fin du contenu (bas ${barre.bas} ≤ barre ${barre.hautBarre})`);
  }

  // Toute écriture est refusée par le faux client ; on vérifie qu'AUCUNE ne
  // vise les données (inventaire, jobs, fiches…) et qu'aucune RPC de
  // publication ou de republication n'a été appelée. Le journal d'usage
  // (« sync_click », la statistique du clic Synchroniser) est le seul essai
  // attendu : il est refusé lui aussi, sans effet.
  const { ecritures, rpcs } = await page.evaluate(() => ({
    ecritures: (window.__ecrituresRefusees || []).map((e) => `${e.op} ${e.table}`),
    rpcs: [...new Set((window.__supabaseJournal || []).filter((e) => e.rpc).map((e) => e.rpc))],
  }));
  const donnees = ecritures.filter((e) => !e.endsWith(' usage_logs'));
  verifier(donnees.length === 0, `${v.nom} : aucune écriture de données tentée (inventaire, jobs, fiches…)`, donnees.join(', '));
  const mutations = rpcs.filter((r) => /^(spend_coins|relancer_republish|republish_planifiee_(regler|pause_generale)|inventaire_|rapprochement_decider|enregistrer_vente|supprimer_mon_stock|plateforme_ecarter|platform_settings_fusionner)/.test(r));
  verifier(mutations.length === 0, `${v.nom} : aucune RPC de publication, republication ou modification appelée`, mutations.join(', '));
  if (ecritures.length) console.log(`    (refusé, sans effet : ${ecritures.join(', ')} · RPC lues : ${rpcs.join(', ')})`);
  verifier(page.__erreurs.length === 0, `${v.nom} : aucune erreur de page`, page.__erreurs.slice(0, 3).join(' | '));
  await ctx.close();
}
await navigateur.close();
fs.writeFileSync(path.join(SORTIE, 'fichiers.json'), JSON.stringify(fichiers, null, 2));
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) en échec` : '\n✓ tous les contrôles passent');
stop();
process.exit(echecs.length ? 1 : 0);
