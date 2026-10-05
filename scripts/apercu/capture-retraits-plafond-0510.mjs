// Captures + contrôles : retraits bloqués par une connexion et limite du jour
// de la republication (05/10/2026). Outil de relecture, jamais livré — même
// patron que capture-stock-refonte.mjs, MÊME harnais (stock-refonte.jsx, faux
// client Supabase), données FICTIVES (retraits-plafond-0510-donnees.js).
//
//   node scripts/apercu/capture-retraits-plafond-0510.mjs
//   (APERCU_DEJA_LANCE=1 réutilise un Vite déjà servi sur APERCU_PORT, 5216 par défaut)
//
// Aucune requête ne part vers la base : le faux client la remplace, et
// playwright coupe en plus tout appel *.supabase.co, fillsell.app et aux
// plateformes. Le bouton de confirmation de la feuille de republication n'est
// JAMAIS pressé ; « Me connecter » non plus.
//
// DÉCISION DE NICO (05/10, après relecture) : pas de bandeau rouge en haut du
// Stock — le haut de la refonte, c'est la carte de synchro et les trois
// gestes. Les retraits bloqués vivent dans « À régler » :
//   · la tuile les compte (« ventes, retraits, infos à compléter ») ;
//   · la 1re ligne de « À régler » (rouge) ouvre « Annonces à retirer »
//     (src/stock/EcranRetraitsBloques.jsx) : une carte par plateforme, la
//     phrase, « Me connecter », les articles ; le retour ramène à « À régler » ;
//   · la carte vendue garde sa ligne rouge et « Me connecter » compact.
//
// Ce qu'il PROUVE, à 390 px et à 360 px :
//   A. un compte RELEVÉ (carte « Synchronisé il y a … », pastilles chiffrées,
//      trois tuiles), AUCUN bandeau rouge au-dessus des tuiles ; « À régler »
//      → ligne rouge → « Annonces à retirer » → retour ; la carte vendue ;
//   B. la feuille de republication ouverte par le VRAI geste (tuile
//      « Remonter » → sélection → « Remonter 8 annonces ») dit la limite du
//      jour au-dessus d'un bouton de confirmation ACTIF ;
//   · aucun débordement horizontal, aucun texte coupé, aucun émoji, aucune
//     écriture tentée.
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
// Les captures d'un passage précédent (l'ancien bandeau) ne doivent pas rester à côté des nouvelles.
for (const f of fs.readdirSync(SORTIE)) if (/\.png$/.test(f)) fs.rmSync(path.join(SORTIE, f));

const MESSAGE_PLAFOND = "Ta limite du jour est de 50 republications : 5 partent aujourd'hui, les 3 autres partiront demain, toutes seules. Rien n'est perdu.";
const LIGNE_CARTE = (nom) => `Encore en ligne sur ${nom} — reconnecte-toi pour le retirer (risque de double vente)`;
const PHRASE = {
  vinted: '1 article vendu encore en ligne sur Vinted : FillSell ne peut pas le retirer tant que tu ne te reconnectes pas à Vinted dans Chrome, sur ton ordinateur — risque de double vente.',
  opla: '3 articles vendus encore en ligne sur Opla : FillSell ne peut pas les retirer tant que tu ne te reconnectes pas à Opla dans Chrome, sur ton ordinateur — risque de double vente.',
};
const ROUGE_FOND = 'rgb(254, 242, 242)';
const ROUGE = 'rgb(185, 28, 28)';

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
const releve = (texte) => { console.log(`    (${texte})`); resultats.push({ ok: true, quoi: `relevé : ${texte}`, detail: '' }); };
const net = (t) => String(t ?? '').replace(/\s+/g, ' ').trim();

// ── Mesures ────────────────────────────────────────────────────────────────
// Débordement horizontal : la page, la zone qui défile, toute couche plein
// écran (portail) ouverte, et tout élément visible qui dépasse le bord droit.
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
    const W = window.innerWidth;
    const hors = [...document.querySelectorAll('button, a, span, div, li, p, h1, h3')]
      .filter((e) => e.offsetParent && e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().right > W + 1 && getComputedStyle(e).position !== 'fixed')
      .filter((e) => { // rogné par un ancêtre qui défile horizontalement (rangée de puces) : pas un débordement
        for (let n = e.parentElement; n; n = n.parentElement) { const s = getComputedStyle(n); if (s.overflowX === 'auto' || s.overflowX === 'scroll' || s.overflowX === 'hidden' || s.overflowX === 'clip') return n.id === 'zone-defilement' || n.matches('[role="dialog"] *'); }
        return true;
      })
      .slice(0, 3).map((e) => `${e.tagName.toLowerCase()} « ${e.textContent.trim().slice(0, 40)} » droite=${Math.round(e.getBoundingClientRect().right)}`);
    res.push(...hors);
    return res;
  });
}
const emojis = (texte) => [...new Set(String(texte).match(/\p{Extended_Pictographic}/gu) || [])];

// Le texte qui déborde de sa boîte (scrollWidth > clientWidth) dans une zone ;
// « points de suspension » = troncature voulue (text-overflow: ellipsis).
async function texteCoupe(locator) {
  return locator.evaluate((racine) => [...racine.querySelectorAll('*')]
    .filter((n) => n.offsetParent && n.children.length === 0 && n.textContent.trim() && n.scrollWidth > n.clientWidth + 1)
    .map((n) => `« ${n.textContent.trim().slice(0, 50)} » (${n.scrollWidth} > ${n.clientWidth}, ${getComputedStyle(n).textOverflow === 'ellipsis' ? 'points de suspension' : 'coupé'})`));
}
async function contenuDans(interieur, exterieur) {
  const a = await interieur.boundingBox(); const b = await exterieur.boundingBox();
  if (!a || !b) return { ok: false, detail: 'boîte introuvable' };
  const ok = a.x >= b.x - 0.5 && a.y >= b.y - 0.5 && a.x + a.width <= b.x + b.width + 0.5 && a.y + a.height <= b.y + b.height + 0.5;
  return { ok, detail: `intérieur [${Math.round(a.x)},${Math.round(a.x + a.width)}] / extérieur [${Math.round(b.x)},${Math.round(b.x + b.width)}]` };
}
// Le LIBELLÉ d'un bouton, mesuré sur ses rectangles de texte (Range) : la
// hauteur du bouton ne dit rien (minHeight 44 tient deux lignes de 14 px).
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
      texte: b.textContent.trim(), tag: b.tagName.toLowerCase(), lignes: tops.size,
      horsContenu: Math.max(0, Math.round(droite - droiteContenu)), horsBouton: Math.max(0, Math.round(droite - rb.right)),
      largeurBouton: Math.round(rb.width),
    };
  });
}
// Le texte d'un bloc à hauteur FIXE (tuile de 128 px) : ses lignes tiennent-elles
// dans la boîte de contenu (au-dessus du padding bas) et dans la tuile ?
async function texteEnHauteur(locator) {
  return locator.evaluate((b) => {
    const rb = b.getBoundingClientRect();
    const st = getComputedStyle(b);
    const basContenu = rb.bottom - parseFloat(st.paddingBottom) - parseFloat(st.borderBottomWidth);
    const r = document.createRange();
    const rects = [];
    const marcher = (n) => { for (const c of n.childNodes) { if (c.nodeType === 3 && c.textContent.trim()) { r.selectNodeContents(c); rects.push(...r.getClientRects()); } else if (c.nodeType === 1) marcher(c); } };
    marcher(b);
    const bas = Math.max(...rects.map((x) => x.bottom));
    return { dansPadding: Math.max(0, Math.round(bas - basContenu)), horsTuile: Math.max(0, Math.round(bas - rb.bottom)), hauteur: Math.round(rb.height) };
  });
}
async function verifierLibelle(l, ou, locator) {
  const m = await mesureLibelle(locator);
  verifier(m.lignes === 1, `${l} : ${ou} — libellé « ${m.texte} » sur une seule ligne`, `${m.lignes} lignes (bouton ${m.largeurBouton} px)`);
  verifier(m.horsContenu === 0 && m.horsBouton === 0, `${l} : ${ou} — libellé dans la boîte du bouton`, `${m.horsContenu} px dans le padding, ${m.horsBouton} px hors du bouton`);
  return m;
}

async function haut(page) { await page.locator('#zone-defilement').evaluate((z) => { z.scrollTop = 0; }); await page.waitForTimeout(350); }
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
// Le conteneur qui défile d'un écran plein (EcranPlein) : en bas, s'il déborde.
async function ecranEnBas(ecran) {
  return ecran.evaluate((d) => {
    const z = [...d.querySelectorAll('div')].find((n) => getComputedStyle(n).overflowY === 'auto');
    if (!z || z.scrollHeight <= z.clientHeight + 1) return false;
    z.scrollTop = z.scrollHeight;
    return true;
  });
}

const navigateur = await chromium.launch({ channel: 'chrome' });
const fichiers = {};
try {
  for (const { l, h } of LARGEURS) {
    console.log(`\n══ ${l} px — ${URL_PAGE}`);
    const ctx = await navigateur.newContext({ viewport: { width: l, height: h }, deviceScaleFactor: 2, locale: 'fr-FR', timezoneId: 'Europe/Paris', hasTouch: true });
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

    // ── A1. Le haut : un compte relevé, aucun bandeau rouge ─────────────────
    await haut(page);
    const synchro = page.locator('section[aria-label="Synchronisation des annonces"]');
    verifier(await synchro.count() === 1, `${l} : la carte de synchro de la refonte est là (pas l'accueil)`);
    verifier(await page.getByText('Tu vends déjà sur Vinted', { exact: false }).count() === 0, `${l} : pas de carte d'accueil « Tu vends déjà sur Vinted ? »`);
    const lignesSynchro = (await synchro.locator('.sk-une-ligne').allInnerTexts()).map(net);
    verifier(/^Synchronisé il y a /.test(lignesSynchro[0] ?? ''), `${l} : « Synchronisé il y a … »`, lignesSynchro.join(' | '));
    verifier(/^\d+ annonces?$/.test(lignesSynchro[1] ?? ''), `${l} : le nombre d'annonces relevées sous le titre`, lignesSynchro[1]);
    const pastilles = await synchro.locator('button[aria-label*=" : "]').evaluateAll((bs) => bs.map((b) => b.getAttribute('aria-label')));
    verifier(pastilles.length === 5 && pastilles.every((a) => /: \d+ annonces?, à jour$/.test(a)), `${l} : 5 pastilles de plateforme chiffrées, à jour`, pastilles.join(' | '));
    releve(`${l} : pastilles ${pastilles.join(' · ')} ; carte « ${lignesSynchro.slice(0, 2).join(' · ')} »`);
    const tuileARegler = page.locator('[aria-label^="À régler :"]').first();
    const tuiles = await page.locator('[aria-label^="Publier :"], [aria-label^="Remonter mes annonces :"], [aria-label^="À régler :"]').count();
    verifier(tuiles >= 3, `${l} : les trois tuiles (Publier, Remonter, À régler)`, String(tuiles));
    const ariaARegler = await tuileARegler.getAttribute('aria-label').catch(() => null);
    verifier(ariaARegler === 'À régler : 5, dont 4 annonces encore en ligne à retirer', `${l} : la tuile « À régler » compte les 4 retraits (+1 prix d'achat) = 5 et le dit`, ariaARegler);
    const texteTuile = net(await tuileARegler.innerText().catch(() => ''));
    verifier(texteTuile.includes('annonces à retirer'), `${l} : sous-titre de la tuile « annonces à retirer » (le plus urgent, court)`, texteTuile);
    const coupesTuile = await texteCoupe(tuileARegler);
    verifier(coupesTuile.length === 0, `${l} : tuile « À régler » — aucun texte coupé en largeur`, coupesTuile.join(' | '));
    for (const [nom, sel] of [['Publier', '[aria-label^="Publier :"]'], ['Remonter', '[aria-label^="Remonter mes annonces :"]'], ['À régler', '[aria-label^="À régler :"]']]) {
      const v = await texteEnHauteur(page.locator(sel).first());
      verifier(v.horsTuile === 0, `${l} : tuile « ${nom} » — le texte ne sort pas de la tuile (${v.hauteur} px)`, `${v.horsTuile} px sous le bord bas de la tuile`);
      verifier(v.dansPadding === 0, `${l} : tuile « ${nom} » — le texte tient au-dessus du padding bas`, `${v.dansPadding} px dans le padding bas (16 px)`);
    }
    // Rien de rouge, aucun « encore en ligne », du haut de la zone jusqu'au bas des tuiles.
    const rougesHaut = await page.evaluate(([rf]) => {
      const tuile = document.querySelector('[aria-label^="À régler :"]');
      const bas = tuile ? tuile.getBoundingClientRect().bottom : 0;
      const z = document.getElementById('zone-defilement');
      return [...z.querySelectorAll('*')]
        .filter((e) => e.offsetParent && e.getBoundingClientRect().top < bas)
        .filter((e) => e.matches('[role="alert"]') || getComputedStyle(e).backgroundColor === rf
          || (e.children.length === 0 && /encore en ligne|double vente/i.test(e.textContent)))
        .map((e) => `${e.tagName.toLowerCase()} « ${e.textContent.trim().slice(0, 50)} »`).slice(0, 4);
    }, [ROUGE_FOND]);
    verifier(rougesHaut.length === 0, `${l} : AUCUN bandeau rouge au-dessus des tuiles (haut = synchro + trois gestes)`, rougesHaut.join(' | '));
    const ordreHaut = await page.evaluate(() => {
      const titre = [...document.querySelectorAll('#zone-defilement *')].find((e) => e.children.length === 0 && e.textContent.trim() === 'Mon stock');
      const s = document.querySelector('section[aria-label="Synchronisation des annonces"]');
      return titre && s ? Math.round(s.getBoundingClientRect().top - titre.getBoundingClientRect().bottom) : null;
    });
    verifier(ordreHaut != null && ordreHaut <= 40, `${l} : la carte de synchro suit directement « Mon stock » (rien entre les deux)`, `écart ${ordreHaut} px`);
    const deb1 = await debordement(page);
    verifier(deb1.length === 0, `${l} : haut — aucun débordement horizontal`, deb1.join(' | '));
    verifier(emojis(await page.locator('#zone-defilement').innerText()).length === 0, `${l} : haut — aucun émoji`);
    await capture('01-haut');

    // ── A2. « À régler » : la première ligne, rouge ─────────────────────────
    await tuileARegler.click();
    await page.waitForTimeout(900);
    const ecranAR = page.locator('[role="dialog"][aria-label="À régler"]');
    verifier(await ecranAR.count() === 1, `${l} : l'écran « À régler » s'ouvre`);
    const premiere = ecranAR.locator('button.sk-presse').first();
    const tPremiere = net(await premiere.innerText().catch(() => ''));
    verifier(tPremiere === '4 Annonces encore en ligne à retirer Reconnecte-toi à Vinted et Opla pour que FillSell les retire — risque de double vente.',
      `${l} : « À régler » — première ligne, au mot près`, tPremiere);
    const fondIcone = await premiere.locator('span').first().evaluate((s) => getComputedStyle(s).backgroundColor);
    verifier(fondIcone === ROUGE_FOND, `${l} : « À régler » — icône de la ligne sur fond rouge`, fondIcone);
    const phraseAR = net(await ecranAR.innerText());
    verifier(phraseAR.includes('5 choses à régler') && phraseAR.includes('Des annonces encore en ligne à retirer'), `${l} : « À régler » — « 5 choses à régler », la phrase nomme les retraits`, phraseAR.slice(0, 200));
    const coupesAR = await texteCoupe(ecranAR);
    verifier(coupesAR.length === 0, `${l} : « À régler » — aucun texte coupé`, coupesAR.join(' | '));
    const deb2 = await debordement(page);
    verifier(deb2.length === 0, `${l} : « À régler » — aucun débordement horizontal`, deb2.join(' | '));
    await capture('02-a-regler');

    // ── A3. « Annonces à retirer » ─────────────────────────────────────────
    await premiere.click();
    await page.waitForTimeout(900);
    const retirer = page.locator('[role="dialog"][aria-label="Annonces à retirer"]');
    verifier(await retirer.count() === 1, `${l} : la 1re ligne ouvre « Annonces à retirer »`);
    verifier(await page.locator('[role="dialog"][aria-label="À régler"]').count() === 0, `${l} : « À régler » laisse la place (un écran à la fois)`);
    const tRetirer = net(await retirer.innerText().catch(() => ''));
    verifier(tRetirer.includes('4 annonces encore en ligne'), `${l} : « Annonces à retirer » — « 4 annonces encore en ligne »`, tRetirer.slice(0, 160));
    const cartes = await retirer.evaluate((d) => [...d.querySelectorAll('ul')].map((ul) => {
      const carte = ul.parentElement;
      const phrase = carte.firstElementChild?.textContent.replace(/\s+/g, ' ').trim() ?? '';
      const me = [...carte.querySelectorAll('a, button')].filter((b) => /Me connecter/.test(b.textContent)).map((b) => b.tagName.toLowerCase());
      // Titre puis état (les deux derniers enfants du <li>) — le logo, devant, porte son propre nom.
      const lignes = [...ul.querySelectorAll('li')].map((li) => { const e = [...li.children]; return `${e[e.length - 2]?.textContent.trim()} ${e[e.length - 1]?.textContent.trim()}`; });
      const fond = getComputedStyle(carte).backgroundColor;
      const etat = [...ul.querySelectorAll('li > span:last-child')].map((s) => getComputedStyle(s).color);
      return { phrase, me, lignes, fond, etat };
    }));
    verifier(cartes.length === 2, `${l} : « Annonces à retirer » — une carte par plateforme (2)`, JSON.stringify(cartes).slice(0, 300));
    const [cV, cO] = cartes;
    verifier(cV?.phrase === PHRASE.vinted, `${l} : carte Vinted (1re) — la phrase au mot près`, cV?.phrase);
    verifier(cO?.phrase === PHRASE.opla, `${l} : carte Opla (2e) — la phrase au mot près`, cO?.phrase);
    verifier(cV?.fond === 'rgb(255, 255, 255)' && cO?.fond === 'rgb(255, 255, 255)', `${l} : cartes blanches`, `${cV?.fond} / ${cO?.fond}`);
    verifier(JSON.stringify(cV?.me) === '["a"]', `${l} : carte Vinted — « Me connecter » est un LIEN`, JSON.stringify(cV?.me));
    verifier(JSON.stringify(cO?.me) === '["button"]', `${l} : carte Opla — « Me connecter » est un BOUTON`, JSON.stringify(cO?.me));
    verifier(JSON.stringify(cV?.lignes) === '["Montre acier bracelet cuir Vendu"]', `${l} : carte Vinted — la liste (1 article, « Vendu »)`, JSON.stringify(cV?.lignes));
    verifier(JSON.stringify(cO?.lignes) === '["Montre acier bracelet cuir Vendu","Lampe de chevet en laiton Vendu","Livre de recettes illustré Vendu"]',
      `${l} : carte Opla — la liste (3 articles, le plus récent d'abord, « Vendu »)`, JSON.stringify(cO?.lignes));
    verifier([...(cV?.etat ?? []), ...(cO?.etat ?? [])].every((c) => c === ROUGE), `${l} : « Vendu » en rouge dans les listes`, JSON.stringify([cV?.etat, cO?.etat]));
    const meOpla = retirer.getByRole('button', { name: 'Me connecter' });
    const meVinted = retirer.getByRole('link', { name: 'Me connecter' });
    verifier(await meOpla.count() === 1 && await meVinted.count() === 1, `${l} : « Me connecter » présent (Opla bouton, Vinted lien)`);
    await verifierLibelle(l, '« Annonces à retirer », Opla', meOpla);
    await verifierLibelle(l, '« Annonces à retirer », Vinted', meVinted);
    const coupesR = await texteCoupe(retirer);
    const coupesRDures = coupesR.filter((c) => !/points de suspension/.test(c));
    verifier(coupesRDures.length === 0, `${l} : « Annonces à retirer » — aucun texte coupé`, coupesRDures.join(' | '));
    if (coupesR.length) releve(`${l} : titres tronqués par « … » (voulu) : ${coupesR.join(' | ')}`);
    const deb3 = await debordement(page);
    verifier(deb3.length === 0, `${l} : « Annonces à retirer » — aucun débordement horizontal`, deb3.join(' | '));
    verifier(emojis(tRetirer).length === 0, `${l} : « Annonces à retirer » — aucun émoji`, emojis(tRetirer).join(' '));
    await capture('03-annonces-a-retirer');
    if (await ecranEnBas(retirer)) { await page.waitForTimeout(300); await capture('03b-annonces-a-retirer-bas'); }

    // ── A4. Le retour ramène à « À régler » ─────────────────────────────────
    await retirer.getByRole('button', { name: 'Retour' }).click();
    await page.waitForTimeout(700);
    const revenu = await page.locator('[role="dialog"][aria-label="À régler"]').count() === 1
      && await page.locator('[role="dialog"][aria-label="Annonces à retirer"]').count() === 0;
    verifier(revenu, `${l} : la flèche retour de « Annonces à retirer » ramène à « À régler »`);
    await page.locator('[role="dialog"][aria-label="À régler"]').getByRole('button', { name: 'Retour' }).click();
    await page.waitForTimeout(600);
    verifier(await page.locator('[role="dialog"]').count() === 0, `${l} : retour de « À régler » → le Stock`);

    // ── A5. La carte vendue ─────────────────────────────────────────────────
    await haut(page);
    await page.getByRole('button', { name: /^Vendus/ }).first().click();
    await page.waitForTimeout(800);
    const carte = (titre) => page.locator('article[data-carte]').filter({ hasText: titre }).first();
    const montre = carte('Montre acier bracelet cuir');
    const lampe = carte('Lampe de chevet en laiton');
    const blouson = carte('Blouson aviateur marron');
    verifier(await montre.count() === 1 && await blouson.count() === 1, `${l} : vue « Vendus » — les cartes vendues sont là`);
    const tMontre = net(await montre.innerText().catch(() => ''));
    verifier(tMontre.includes(LIGNE_CARTE('Opla')) && tMontre.includes(LIGNE_CARTE('Vinted')), `${l} : carte « Montre » — les deux lignes rouges (Vinted, Opla)`, tMontre);
    const meCarte = (c) => c.getByRole('button', { name: 'Me connecter' }).or(c.getByRole('link', { name: 'Me connecter' }));
    verifier(await meCarte(montre).count() === 2, `${l} : carte « Montre » — deux « Me connecter »`, String(await meCarte(montre).count()));
    verifier(await lampe.getByRole('button', { name: 'Me connecter' }).count() === 1, `${l} : carte « Lampe » — « Me connecter » (Opla, un bouton)`);
    for (const [nom, c] of [['Montre', montre], ['Lampe', lampe]]) {
      const btns = meCarte(c);
      for (let i = 0; i < await btns.count(); i++) {
        const r = await contenuDans(btns.nth(i), c);
        verifier(r.ok, `${l} : carte « ${nom} » — « Me connecter » nº${i + 1} tient dans la carte`, r.detail);
        await verifierLibelle(l, `carte « ${nom} », « Me connecter » nº${i + 1}`, btns.nth(i));
      }
      const coupes = (await texteCoupe(c)).filter((x) => /Encore en ligne|Me connecter/.test(x));
      verifier(coupes.length === 0, `${l} : carte « ${nom} » — ligne rouge et bouton non coupés`, coupes.join(' | '));
    }
    const tBlouson = net(await blouson.innerText().catch(() => ''));
    verifier(!/Encore en ligne|Me connecter/.test(tBlouson), `${l} : carte « Blouson » (retrait abouti) — ni ligne rouge ni bouton`, tBlouson);
    const point = async (c) => c.locator('[data-pastille] > span[aria-hidden="true"]').first().evaluate((s) => getComputedStyle(s).backgroundColor).catch(() => null);
    const pMontre = await point(montre); const pBlouson = await point(blouson);
    verifier(pMontre === ROUGE, `${l} : pastille « Vendu » rouge sur la carte bloquée`, pMontre);
    verifier(pBlouson !== ROUGE, `${l} : pastille « Vendu » non rouge sur la carte ordinaire`, pBlouson);
    const titrePastille = await montre.locator('span[title]').first().getAttribute('title').catch(() => null);
    verifier(String(titrePastille).includes('risque de double vente'), `${l} : le survol de la pastille dit pourquoi`, titrePastille);
    await defilerVers(page, montre, 8);
    const deb5 = await debordement(page);
    verifier(deb5.length === 0, `${l} : vue « Vendus » — aucun débordement horizontal`, deb5.join(' | '));
    verifier(emojis(tMontre).length === 0, `${l} : carte vendue — aucun émoji`, emojis(tMontre).join(' '));
    await capture('04-carte-vendue');
    { const p = path.join(SORTIE, `${l}-04b-carte-vendue-entiere.png`); await montre.screenshot({ path: p }); f['04b-carte-vendue-entiere'] = p; }
    await haut(page);
    await page.getByRole('button', { name: /^Tous/ }).first().click();
    await page.waitForTimeout(600);

    // ── B. La feuille de republication, par le vrai geste ───────────────────
    await haut(page);
    await page.locator('[aria-label^="Remonter mes annonces :"]').first().click();
    await page.waitForTimeout(900);
    const selection = page.locator('[role="dialog"][aria-label="Remonter mes annonces"]');
    verifier(await selection.count() === 1, `${l} : « Remonter » — l'écran de sélection s'ouvre`);
    const remonter = selection.getByRole('button', { name: /^Remonter \d+ annonces?$/ });
    const libRemonter = net(await remonter.innerText().catch(() => ''));
    verifier(libRemonter === 'Remonter 8 annonces' && await remonter.isEnabled(), `${l} : « Remonter » — 8 annonces pré-cochées`, libRemonter);
    await capture('05-remonter-selection');
    await remonter.click();
    await page.waitForTimeout(900);
    const statut = page.locator('div[role="status"]').filter({ hasText: 'Ta limite du jour' });
    verifier(await statut.count() === 1, `${l} : feuille — le message de la limite du jour est là`);
    const texteStatut = net(await statut.innerText().catch(() => ''));
    verifier(texteStatut === MESSAGE_PLAFOND, `${l} : feuille — le message, au mot près`, texteStatut);
    const confirmer = page.getByRole('button', { name: /^Republier 8 annonces/ });
    const libConfirmer = net(await confirmer.innerText().catch(() => ''));
    verifier(await confirmer.count() === 1 && await confirmer.isEnabled(), `${l} : feuille — bouton de confirmation ACTIF (non pressé)`, libConfirmer);
    const juste = await statut.evaluate((s) => s.nextElementSibling?.tagName === 'BUTTON' && /^Republier/.test(s.nextElementSibling.textContent));
    verifier(juste, `${l} : feuille — le message est juste au-dessus du bouton`);
    const feuille = statut.locator('xpath=..');
    const coupesF = await texteCoupe(feuille);
    verifier(coupesF.length === 0, `${l} : feuille — aucun texte coupé`, coupesF.join(' | '));
    const mStatut = await contenuDans(statut, feuille);
    verifier(mStatut.ok, `${l} : feuille — le message tient dans la feuille`, mStatut.detail);
    const deb6 = await debordement(page);
    verifier(deb6.length === 0, `${l} : feuille — aucun débordement horizontal`, deb6.join(' | '));
    verifier(emojis(await feuille.innerText()).length === 0, `${l} : feuille — aucun émoji`, emojis(await feuille.innerText()).join(' '));
    const lignesConfirmer = (await mesureLibelle(confirmer)).lignes;
    if (lignesConfirmer > 1) releve(`${l} : le libellé « ${libConfirmer} » passe sur ${lignesConfirmer} lignes (existait avant le 05/10)`);
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
    const mutations = rpcs.filter((r) => /^(spend_coins|relancer|republish_planifiee_(regler|pause_generale)|inventaire_|rapprochement_decider|enregistrer_vente|supprimer_mon_stock|plateforme_ecarter|platform_settings_fusionner|demander_)/.test(r));
    verifier(mutations.length === 0, `${l} : aucune RPC de publication, republication, relevé ou modification`, mutations.join(', '));
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
