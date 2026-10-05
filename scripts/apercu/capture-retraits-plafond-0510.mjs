// Captures + contrôles : retraits bloqués par une connexion et limite du jour
// de la republication (05/10/2026). Outil de relecture, jamais livré — même
// patron que capture-stock-refonte.mjs, MÊME harnais (stock-refonte.jsx, faux
// client Supabase), données FICTIVES (retraits-plafond-0510-donnees.js).
//
//   node scripts/apercu/capture-retraits-plafond-0510.mjs
//   (APERCU_DEJA_LANCE=1 réutilise un Vite déjà servi sur APERCU_PORT, 5216 par défaut)
//
// Aucune requête ne part vers la base : le faux client la remplace, et
// playwright coupe en plus tout appel *.supabase.co et fillsell.app. Le bouton
// de confirmation de la feuille de republication n'est JAMAIS pressé ; « Me
// connecter » non plus.
//
// Ce qu'il PROUVE, à 390 px et à 360 px :
//   A. le bandeau rouge en tête du Stock (replié, déplié), « risque de double
//      vente », « Me connecter » pour Opla ; la carte vendue (ligne rouge,
//      bouton, pastille rouge) ; la première ligne de « À régler » ;
//   B. la feuille de republication ouverte par le VRAI geste (tuile
//      « Remonter » → sélection → « Remonter 8 annonces ») dit la limite du
//      jour au-dessus d'un bouton de confirmation ACTIF ;
//   · aucun débordement horizontal, aucun émoji, aucune écriture tentée.
import { spawn, spawnSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', '0510-retraits-plafond');
const PORT = Number(process.env.APERCU_PORT || 5216);
const DEJA = !!process.env.APERCU_DEJA_LANCE;
const URL_PAGE = `http://127.0.0.1:${PORT}/scripts/apercu/retraits-plafond-0510.html`;
const LARGEURS = [{ l: 390, h: 844 }, { l: 360, h: 780 }];
fs.mkdirSync(SORTIE, { recursive: true });

const MESSAGE_PLAFOND = "Ta limite du jour est de 50 republications : 5 partent aujourd'hui, les 3 autres partiront demain, toutes seules. Rien n'est perdu.";
const LIGNE_CARTE = (nom) => `Encore en ligne sur ${nom} — reconnecte-toi pour le retirer (risque de double vente)`;

let serveur = null;
const stop = () => { if (!serveur) return; try { if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(serveur.pid), '/f', '/t'], { stdio: 'ignore' }); else serveur.kill(); } catch { /* déjà arrêté */ } serveur = null; };
process.on('exit', stop);
if (!DEJA) {
  serveur = spawn('npx', ['vite', '--config', 'scripts/apercu/vite-stock-refonte.config.mjs', '--host', '127.0.0.1', '--port', String(PORT), '--strictPort'], { cwd: RACINE, shell: true, stdio: ['ignore', 'pipe', 'pipe'] });
  serveur.stderr.on('data', (d) => process.stderr.write(`[vite] ${d}`));
}
{
  const fin = Date.now() + 300000;
  let ok = false;
  while (Date.now() < fin) { try { if ((await fetch(URL_PAGE)).ok) { ok = true; break; } } catch { /* pas prêt */ } await new Promise((r) => setTimeout(r, 1000)); }
  if (!ok) { console.error(`pas de réponse : ${URL_PAGE}`); process.exit(1); }
}

const echecs = [];
const resultats = [];
const verifier = (cond, quoi, detail = '') => {
  console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${String(detail).slice(0, 400)}`}`);
  resultats.push({ ok: !!cond, quoi, detail: cond ? '' : String(detail).slice(0, 400) });
  if (!cond) echecs.push(quoi);
};

// ── Mesures ────────────────────────────────────────────────────────────────
// Débordement horizontal : la page, la zone qui défile, et toute couche plein
// écran (portail) ouverte.
async function debordement(page) {
  return page.evaluate(() => {
    const z = document.getElementById('zone-defilement');
    const res = [];
    if (document.documentElement.scrollWidth > window.innerWidth + 1) res.push(`document ${document.documentElement.scrollWidth} > ${window.innerWidth}`);
    if (z && z.scrollWidth > z.clientWidth + 1) res.push(`zone ${z.scrollWidth} > ${z.clientWidth}`);
    for (const el of document.querySelectorAll('[role="dialog"], body > div')) {
      const st = getComputedStyle(el);
      if (st.position !== 'fixed' && !el.matches('[role="dialog"]')) continue;
      for (const n of [el, ...el.querySelectorAll('*')]) {
        const s = getComputedStyle(n);
        if ((s.overflowY === 'auto' || s.overflowY === 'scroll' || n === el) && n.scrollWidth > n.clientWidth + 1 && s.overflowX !== 'hidden' && s.overflowX !== 'clip') {
          res.push(`couche ${n.tagName.toLowerCase()}${n.getAttribute('aria-label') ? `[${n.getAttribute('aria-label')}]` : ''} ${n.scrollWidth} > ${n.clientWidth}`);
          break;
        }
      }
    }
    // Tout élément visible qui dépasse le bord droit de la fenêtre.
    const W = window.innerWidth;
    const hors = [...document.querySelectorAll('button, a, span, div, li, p')]
      .filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > W + 1 && getComputedStyle(e).position !== 'fixed')
      .filter((e) => { // un élément rogné par un ancêtre qui défile horizontalement (rangée de puces) n'est pas un débordement
        for (let n = e.parentElement; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' || s.overflowX === 'clip') return n.id === 'zone-defilement' ? true : false; }
        return true;
      })
      .slice(0, 3).map((e) => `${e.tagName.toLowerCase()} « ${e.textContent.trim().slice(0, 40)} » droite=${Math.round(e.getBoundingClientRect().right)}`);
    res.push(...hors);
    return res;
  });
}
const emojis = (texte) => [...new Set(String(texte).match(/\p{Extended_Pictographic}/gu) || [])];

// Le texte qui déborde de sa boîte (nowrap, ou scrollWidth > clientWidth) dans une zone.
async function texteCoupe(locator) {
  return locator.evaluate((racine) => [...racine.querySelectorAll('*')]
    .filter((n) => n.offsetParent && n.children.length === 0 && n.textContent.trim() && n.scrollWidth > n.clientWidth + 1)
    .map((n) => `« ${n.textContent.trim().slice(0, 50)} » (${n.scrollWidth} > ${n.clientWidth}, ${getComputedStyle(n).textOverflow === 'ellipsis' ? 'points de suspension' : 'coupé'})`));
}
// Un élément entièrement contenu dans un autre (bouton dans sa carte, etc.).
async function contenuDans(interieur, exterieur) {
  const a = await interieur.boundingBox(); const b = await exterieur.boundingBox();
  if (!a || !b) return { ok: false, detail: 'boîte introuvable' };
  const ok = a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;
  return { ok, detail: `intérieur [${Math.round(a.x)},${Math.round(a.x + a.width)}] / extérieur [${Math.round(b.x)},${Math.round(b.x + b.width)}]` };
}

// Le LIBELLÉ d'un bouton, mesuré sur ses rectangles de texte (Range) : la
// hauteur du bouton ne dit rien (minHeight 44 tient deux lignes de 14 px).
//   lignes : nombre de lignes du texte ;
//   horsContenu : px de texte au-delà de la boîte de contenu (dans le padding) ;
//   horsBouton : px de texte au-delà du bord du bouton (dehors, visible).
async function mesureLibelle(locator) {
  return locator.evaluate((b) => {
    const rb = b.getBoundingClientRect();
    const st = getComputedStyle(b);
    const droiteContenu = rb.right - parseFloat(st.paddingRight) - parseFloat(st.borderRightWidth);
    const r = document.createRange();
    const rects = [];
    const marcher = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3 && c.textContent.trim()) { r.selectNodeContents(c); rects.push(...r.getClientRects()); } else if (c.nodeType === 1) marcher(c); } };
    marcher(b);
    const tops = new Set(rects.map((x) => Math.round(x.top)));
    const droite = Math.max(...rects.map((x) => x.right));
    return {
      texte: b.textContent.trim(), lignes: tops.size,
      horsContenu: Math.max(0, Math.round(droite - droiteContenu)), horsBouton: Math.max(0, Math.round(droite - rb.right)),
      largeurBouton: Math.round(rb.width),
    };
  });
}

async function haut(page) { await page.locator('#zone-defilement').evaluate((z) => { z.scrollTop = 0; }); await page.waitForTimeout(350); }
// Amène l'élément juste SOUS l'en-tête fixe, `marge` px plus bas.
async function defilerVers(page, locator, marge = 8) {
  const h = await locator.elementHandle();
  await page.evaluate(([el, m]) => {
    const z = document.getElementById('zone-defilement');
    const barre = document.querySelector('.topbar');
    const sous = Math.max(z.getBoundingClientRect().top, barre ? barre.getBoundingClientRect().bottom : 0);
    z.scrollTop += el.getBoundingClientRect().top - sous - m;
  }, [h, marge]);
  await page.waitForTimeout(400);
}

const navigateur = await chromium.launch({ channel: 'chrome' });
const fichiers = {};
try {
  for (const { l, h } of LARGEURS) {
    console.log(`\n══ ${l} px — ${URL_PAGE}`);
    const ctx = await navigateur.newContext({ viewport: { width: l, height: h }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true });
    // Aucun appel réseau vers la prod : ni Supabase (images comprises — elles sont
    // fictives, en data:), ni fillsell.app, ni les plateformes.
    await ctx.route(/https?:\/\/[^/]*(supabase\.co|fillsell\.app|vinted\.fr|opla\.fr|leboncoin\.fr|beebs\.app|ebay\.)/, (r) => r.abort());
    const page = await ctx.newPage();
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    const f = (fichiers[l] = {});
    const capture = async (nom) => { const p = path.join(SORTIE, `${l}-${nom}.png`); await page.screenshot({ path: p }); f[nom] = p; return p; };

    await page.goto(URL_PAGE, { waitUntil: 'domcontentloaded', timeout: 300000 });
    await page.waitForFunction(() => window.__pret === true || window.__erreurChargement, null, { timeout: 300000 });
    await page.waitForTimeout(4500);
    const erreurChargement = await page.evaluate(() => window.__erreurChargement ?? null);
    verifier(!erreurChargement, `${l} : la page se charge (données fictives)`, erreurChargement);
    const origine = await page.evaluate(() => window.__donneesFictives?.origine ?? null);
    verifier(/FICTIVES/.test(String(origine)), `${l} : données FICTIVES servies au harnais (aucun compte réel)`, origine);

    // ── A1. Le haut, bandeau replié ─────────────────────────────────────────
    await haut(page);
    const bandeaux = page.locator('#zone-defilement [role="alert"]');
    const nbBandeaux = await bandeaux.count();
    const textes = await bandeaux.allInnerTexts();
    verifier(nbBandeaux === 2, `${l} : deux bandeaux rouges (Vinted, Opla)`, `${nbBandeaux} : ${textes.join(' | ')}`);
    const opla = bandeaux.filter({ hasText: 'sur Opla' }).first();
    const vinted = bandeaux.filter({ hasText: 'sur Vinted' }).first();
    const texteOpla = (await opla.innerText().catch(() => '')).replace(/\s+/g, ' ');
    verifier(texteOpla.includes('risque de double vente'), `${l} : le bandeau Opla dit « risque de double vente »`, texteOpla);
    verifier(texteOpla.startsWith('3 articles vendus encore en ligne sur Opla : FillSell ne peut pas les retirer tant que tu ne te reconnectes pas à Opla dans Chrome, sur ton ordinateur — risque de double vente.'),
      `${l} : la phrase Opla, au mot près`, texteOpla);
    const texteVinted = (await vinted.innerText().catch(() => '')).replace(/\s+/g, ' ');
    verifier(texteVinted.startsWith('1 article vendu encore en ligne sur Vinted : FillSell ne peut pas le retirer'), `${l} : la phrase Vinted (singulier)`, texteVinted);
    const ordre = await bandeaux.evaluateAll((els) => els.map((e) => (/sur Vinted/.test(e.textContent) ? 'vinted' : /sur Opla/.test(e.textContent) ? 'opla' : '?')).join(','));
    verifier(ordre === 'vinted,opla', `${l} : ordre des bandeaux Vinted puis Opla`, ordre);
    const btnOpla = opla.getByRole('button', { name: 'Me connecter' });
    verifier(await btnOpla.count() === 1 && await btnOpla.isVisible(), `${l} : « Me connecter » présent et visible dans le bandeau Opla`);
    const dansOpla = await contenuDans(btnOpla, opla);
    verifier(dansOpla.ok, `${l} : « Me connecter » (Opla) tient dans son bandeau`, dansOpla.detail);
    const meVinted = vinted.getByRole('link', { name: 'Me connecter' }).or(vinted.getByRole('button', { name: 'Me connecter' }));
    verifier(await meVinted.count() === 1, `${l} : « Me connecter » présent dans le bandeau Vinted`);
    for (const [nom, b] of [['Opla', btnOpla], ['Vinted', meVinted]]) {
      const m = await mesureLibelle(b);
      verifier(m.lignes === 1 && m.horsContenu === 0, `${l} : bandeau ${nom} — « Me connecter » sur une ligne, dans son bouton`, `${m.lignes} lignes, ${m.horsContenu} px dans le padding`);
    }
    {
      const memeRangee = await opla.evaluate((el) => {
        const me = [...el.querySelectorAll('button')].find((b) => /Me connecter/.test(b.textContent));
        const voir = [...el.querySelectorAll('button')].find((b) => /^Voir /.test(b.textContent.trim()));
        return me && voir ? Math.abs(me.getBoundingClientRect().top - voir.getBoundingClientRect().top) < 4 : null;
      });
      // Relevé, sans échec : la rangée a flexWrap, le passage à la ligne est permis.
      console.log(`    (bandeau Opla : « Voir les 3 articles » ${memeRangee ? 'sur la même rangée que' : 'passe SOUS'} « Me connecter »)`);
    }
    const coupesHaut = await texteCoupe(page.locator('#zone-defilement [role="alert"]').first().locator('xpath=..'));
    verifier(coupesHaut.length === 0, `${l} : aucun texte coupé dans les bandeaux (replié)`, coupesHaut.join(' | '));
    verifier(emojis(textes.join(' ')).length === 0, `${l} : aucun émoji dans les bandeaux`, emojis(textes.join(' ')).join(' '));
    const tuileARegler = page.locator('[aria-label^="À régler :"]').first();
    const ariaARegler = await tuileARegler.getAttribute('aria-label').catch(() => null);
    verifier(/^À régler : 5 /.test(String(ariaARegler)), `${l} : la tuile « À régler » compte les 4 retraits (+1 prix d'achat) = 5`, ariaARegler);
    const deb1 = await debordement(page);
    verifier(deb1.length === 0, `${l} : haut — aucun débordement horizontal`, deb1.join(' | '));
    await capture('01-haut-bandeau-replie');

    // ── A2. La liste dépliée (Opla) ─────────────────────────────────────────
    await opla.getByRole('button', { name: /Voir les 3 articles/ }).click();
    await page.waitForTimeout(400);
    const items = opla.locator('ul > li');
    const nbItems = await items.count();
    const lignes = (await items.allInnerTexts()).map((t) => t.replace(/\s+/g, ' ').trim());
    verifier(nbItems === 3 && lignes.every((t) => t.endsWith('Vendu')), `${l} : déplié — 3 articles, chacun « Vendu »`, lignes.join(' | '));
    verifier(await opla.getByRole('button', { name: /Masquer la liste/ }).getAttribute('aria-expanded') === 'true', `${l} : déplié — aria-expanded=true, « Masquer la liste »`);
    const coupesListe = await texteCoupe(opla);
    // Les titres longs SONT tronqués volontairement (ellipsis) : on les relève, sans échec.
    const coupesHorsTitres = coupesListe.filter((c) => !/points de suspension/.test(c));
    verifier(coupesHorsTitres.length === 0, `${l} : déplié — aucun texte coupé sans points de suspension`, coupesHorsTitres.join(' | '));
    if (coupesListe.length) console.log(`    (titres tronqués par « … », voulu : ${coupesListe.join(' | ')})`);
    await defilerVers(page, opla, 8);
    const deb2 = await debordement(page);
    verifier(deb2.length === 0, `${l} : déplié — aucun débordement horizontal`, deb2.join(' | '));
    await capture('02-haut-bandeau-deplie');
    await opla.getByRole('button', { name: /Masquer la liste/ }).click();
    await page.waitForTimeout(300);

    // ── A3. La carte vendue ─────────────────────────────────────────────────
    await haut(page);
    await page.getByRole('button', { name: /^Vendus/ }).first().click();
    await page.waitForTimeout(800);
    const carte = (titre) => page.locator('article[data-carte]').filter({ hasText: titre }).first();
    const montre = carte('Montre acier bracelet cuir');
    const lampe = carte('Lampe de chevet en laiton');
    const blouson = carte('Blouson aviateur marron');
    verifier(await montre.count() === 1 && await blouson.count() === 1, `${l} : vue « Vendus » — les cartes vendues sont là`);
    const tMontre = (await montre.innerText().catch(() => '')).replace(/\s+/g, ' ');
    verifier(tMontre.includes(LIGNE_CARTE('Opla')) && tMontre.includes(LIGNE_CARTE('Vinted')), `${l} : carte « Montre » — les deux lignes rouges (Vinted, Opla)`, tMontre);
    const mcMontre = montre.getByRole('button', { name: 'Me connecter' }).or(montre.getByRole('link', { name: 'Me connecter' }));
    verifier(await mcMontre.count() === 2, `${l} : carte « Montre » — deux « Me connecter »`, String(await mcMontre.count()));
    const mcOplaLampe = lampe.getByRole('button', { name: 'Me connecter' });
    verifier(await mcOplaLampe.count() === 1, `${l} : carte « Lampe » — « Me connecter » (Opla, un bouton)`);
    for (const [nom, c] of [['Montre', montre], ['Lampe', lampe]]) {
      const btns = c.getByRole('button', { name: 'Me connecter' }).or(c.getByRole('link', { name: 'Me connecter' }));
      for (let i = 0; i < await btns.count(); i++) {
        const r = await contenuDans(btns.nth(i), c);
        verifier(r.ok, `${l} : carte « ${nom} » — « Me connecter » nº${i + 1} tient dans la carte`, r.detail);
        const m = await mesureLibelle(btns.nth(i));
        verifier(m.lignes === 1, `${l} : carte « ${nom} » — « Me connecter » nº${i + 1} sur une seule ligne`, `${m.lignes} lignes (bouton ${m.largeurBouton} px)`);
        verifier(m.horsContenu === 0, `${l} : carte « ${nom} » — libellé nº${i + 1} dans la boîte du bouton (pas dans le padding)`, `${m.horsContenu} px dans le padding droit`);
        verifier(m.horsBouton === 0, `${l} : carte « ${nom} » — libellé nº${i + 1} ne sort pas du bouton`, `${m.horsBouton} px au-delà du bord droit du bouton`);
      }
      const coupes = await texteCoupe(c);
      const coupesRouges = coupes.filter((x) => /Encore en ligne|Me connecter/.test(x));
      verifier(coupesRouges.length === 0, `${l} : carte « ${nom} » — ligne rouge et bouton non coupés`, coupesRouges.join(' | '));
    }
    const tBlouson = (await blouson.innerText().catch(() => '')).replace(/\s+/g, ' ');
    verifier(!/Encore en ligne|Me connecter/.test(tBlouson), `${l} : carte « Blouson » (retrait abouti) — ni ligne rouge ni bouton`, tBlouson);
    const point = async (c) => c.locator('[data-pastille] > span[aria-hidden="true"]').first().evaluate((s) => getComputedStyle(s).backgroundColor).catch(() => null);
    const pMontre = await point(montre); const pBlouson = await point(blouson);
    verifier(pMontre === 'rgb(185, 28, 28)', `${l} : pastille « Vendu » rouge sur la carte bloquée`, pMontre);
    verifier(pBlouson !== 'rgb(185, 28, 28)', `${l} : pastille « Vendu » non rouge sur la carte ordinaire`, pBlouson);
    const titrePastille = await montre.locator('span[title]').first().getAttribute('title').catch(() => null);
    verifier(String(titrePastille).includes('risque de double vente'), `${l} : le survol de la pastille dit pourquoi`, titrePastille);
    await defilerVers(page, montre, 8);
    const deb3 = await debordement(page);
    verifier(deb3.length === 0, `${l} : vue « Vendus » — aucun débordement horizontal`, deb3.join(' | '));
    verifier(emojis(tMontre).length === 0, `${l} : carte vendue — aucun émoji`, emojis(tMontre).join(' '));
    await capture('03-carte-vendue');
    // La carte entière (elle peut dépasser la hauteur de l'écran) : capture de l'élément.
    { const p = path.join(SORTIE, `${l}-03b-carte-vendue-entiere.png`); await montre.screenshot({ path: p }); f['03b-carte-vendue-entiere'] = p; }
    await haut(page);
    await page.getByRole('button', { name: /^Tous/ }).first().click();
    await page.waitForTimeout(600);

    // ── A4. « À régler » : la première ligne ────────────────────────────────
    await haut(page);
    await tuileARegler.click();
    await page.waitForTimeout(900);
    const ecran = page.locator('[role="dialog"][aria-label="À régler"]');
    verifier(await ecran.count() === 1, `${l} : l'écran « À régler » s'ouvre`);
    const premiere = ecran.locator('button.sk-presse').first();
    const tPremiere = (await premiere.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    verifier(tPremiere === '4 Annonces encore en ligne à retirer Reconnecte-toi à Vinted et Opla pour que FillSell les retire — risque de double vente.',
      `${l} : « À régler » — première ligne, au mot près`, tPremiere);
    const fondIcone = await premiere.locator('span').first().evaluate((s) => getComputedStyle(s).backgroundColor);
    verifier(fondIcone === 'rgb(254, 242, 242)', `${l} : « À régler » — icône de la ligne sur fond rouge`, fondIcone);
    const phraseEcran = (await ecran.innerText()).replace(/\s+/g, ' ');
    verifier(phraseEcran.includes('Des annonces encore en ligne à retirer'), `${l} : « À régler » — la phrase d'en-tête nomme les retraits`, phraseEcran.slice(0, 200));
    const coupesAR = await texteCoupe(ecran);
    verifier(coupesAR.length === 0, `${l} : « À régler » — aucun texte coupé`, coupesAR.join(' | '));
    const deb4 = await debordement(page);
    verifier(deb4.length === 0, `${l} : « À régler » — aucun débordement horizontal`, deb4.join(' | '));
    await capture('04-a-regler');
    // Le tap ramène au bandeau du haut.
    await premiere.click();
    await page.waitForTimeout(1200);
    const ferme = await page.locator('[role="dialog"][aria-label="À régler"]').count() === 0;
    const bandeauVu = await page.locator('#zone-defilement [role="alert"]').first().evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.top < window.innerHeight * 0.6; });
    verifier(ferme && bandeauVu, `${l} : « À régler » — le tap sur la ligne ferme l'écran et montre le bandeau`, `fermé=${ferme} bandeau visible=${bandeauVu}`);

    // ── B. La feuille de republication, par le vrai geste ───────────────────
    await haut(page);
    await page.locator('[aria-label^="Remonter mes annonces :"]').first().click();
    await page.waitForTimeout(900);
    const selection = page.locator('[role="dialog"][aria-label="Remonter mes annonces"]');
    verifier(await selection.count() === 1, `${l} : « Remonter » — l'écran de sélection s'ouvre`);
    const remonter = selection.getByRole('button', { name: /^Remonter \d+ annonces?$/ });
    const libRemonter = (await remonter.innerText().catch(() => '')).trim();
    verifier(libRemonter === 'Remonter 8 annonces' && await remonter.isEnabled(), `${l} : « Remonter » — 8 annonces pré-cochées`, libRemonter);
    await capture('05-remonter-selection');
    await remonter.click();
    await page.waitForTimeout(900);
    const statut = page.locator('div[role="status"]').filter({ hasText: 'Ta limite du jour' });
    verifier(await statut.count() === 1, `${l} : feuille — le message de la limite du jour est là`);
    const texteStatut = (await statut.innerText().catch(() => '')).replace(/\s+/g, ' ').trim();
    verifier(texteStatut === MESSAGE_PLAFOND, `${l} : feuille — le message, au mot près`, texteStatut);
    const confirmer = page.getByRole('button', { name: /^Republier 8 annonces/ });
    const libConfirmer = (await confirmer.innerText().catch(() => '')).trim();
    verifier(await confirmer.count() === 1 && await confirmer.isEnabled(), `${l} : feuille — bouton de confirmation ACTIF (non pressé)`, libConfirmer);
    const juste = await statut.evaluate((s) => s.nextElementSibling?.tagName === 'BUTTON' && /^Republier/.test(s.nextElementSibling.textContent));
    verifier(juste, `${l} : feuille — le message est juste au-dessus du bouton`);
    const feuille = statut.locator('xpath=..');
    const coupesF = await texteCoupe(feuille);
    verifier(coupesF.length === 0, `${l} : feuille — aucun texte coupé`, coupesF.join(' | '));
    const mStatut = await contenuDans(statut, feuille);
    verifier(mStatut.ok, `${l} : feuille — le message tient dans la feuille`, mStatut.detail);
    const deb5 = await debordement(page);
    verifier(deb5.length === 0, `${l} : feuille — aucun débordement horizontal`, deb5.join(' | '));
    verifier(emojis(await feuille.innerText()).length === 0, `${l} : feuille — aucun émoji`, emojis(await feuille.innerText()).join(' '));
    // La feuille défile : on amène le bas (message + bouton) à l'écran.
    await feuille.evaluate((el) => { el.scrollTop = el.scrollHeight; });
    await page.waitForTimeout(300);
    const visibles = await page.evaluate(() => {
      const s = [...document.querySelectorAll('div[role="status"]')].find((e) => /Ta limite du jour/.test(e.textContent));
      const b = s?.nextElementSibling; const H = window.innerHeight;
      const r1 = s?.getBoundingClientRect(); const r2 = b?.getBoundingClientRect();
      return !!(r1 && r2 && r1.top >= 0 && r2.bottom <= H);
    });
    verifier(visibles, `${l} : feuille — message et bouton visibles ensemble à l'écran`);
    await capture('06-feuille-republication');
    // Fermer SANS confirmer.
    await page.getByRole('button', { name: 'Annuler', exact: true }).click();
    await page.waitForTimeout(500);
    verifier(await page.locator('div[role="status"]').filter({ hasText: 'Ta limite du jour' }).count() === 0, `${l} : feuille fermée par « Annuler »`);

    // ── Rien n'est parti ────────────────────────────────────────────────────
    const { ecritures, rpcs, fonctions } = await page.evaluate(() => ({
      ecritures: (window.__ecrituresRefusees || []).map((e) => `${e.op} ${e.table}`),
      rpcs: [...new Set((window.__supabaseJournal || []).filter((e) => e.rpc).map((e) => e.rpc))],
      fonctions: (window.__supabaseJournal || []).filter((e) => e.fonction).map((e) => `${e.fonction}${e.servie ? ' (servie)' : ''}`),
    }));
    const donnees = ecritures.filter((e) => !e.endsWith(' usage_logs'));
    verifier(donnees.length === 0, `${l} : aucune écriture de données tentée`, donnees.join(', '));
    const mutations = rpcs.filter((r) => /^(spend_coins|relancer|republish_planifiee_(regler|pause_generale)|inventaire_|rapprochement_decider|enregistrer_vente|supprimer_mon_stock|plateforme_ecarter|platform_settings_fusionner|demander_connexion)/.test(r));
    verifier(mutations.length === 0, `${l} : aucune RPC de publication, republication ou modification`, mutations.join(', '));
    verifier(fonctions.some((x) => x === 'get-pending-jobs (servie)'), `${l} : get-pending-jobs {plafond_only} servie par le harnais`, fonctions.join(', '));
    verifier(erreurs.length === 0, `${l} : aucune erreur de page`, erreurs.slice(0, 3).join(' | '));
    if (ecritures.length || rpcs.length) console.log(`    (refusé, sans effet : ${ecritures.join(', ') || '—'} · RPC lues : ${rpcs.join(', ') || '—'})`);
    await ctx.close();
  }
} finally {
  await navigateur.close();
}
fs.writeFileSync(path.join(SORTIE, 'resultats.json'), JSON.stringify({ fichiers, resultats }, null, 2));
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) en échec` : '\n✓ tous les contrôles passent');
stop();
process.exit(echecs.length ? 1 : 0);
