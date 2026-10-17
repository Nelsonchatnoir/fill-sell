// Contrôles et captures de l'écran bêta « Messages » / « À expédier » EN PAGE (17/10/2026).
// Outil de relecture, jamais livré. Constat de Nico (iPhone, Safari, 390 px) :
// pastille « Messages » verte comme sélectionnée, retour impossible, défilement
// bloqué, mauvais onglet allumé, vignette cassée. Ce script le rejoue, à 390 px,
// dans WebKit (le moteur de Safari) PUIS dans Chromium (Android), sur la coquille
// d'App (scripts/apercu/espace-beta-page.jsx) et les VRAIS composants de la bêta.
// (17/10, « tout dans FillSell ») + chaque carte de chaque plateforme (16 cas),
// l'adresse Colissimo demandée une fois, Vinted papier/QR, les expédiées et leur suivi.
//
//   npx vite --config scripts/apercu/vite-stock-refonte.config.mjs --port 5231
//   APERCU_PORT=5231 node scripts/apercu/capture-espace-beta-page.mjs
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium, webkit } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'espace-beta-page-1710');
const PORT = Number(process.env.APERCU_PORT || 5231);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/espace-beta-page.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const echecs = [];
let total = 0;
const verifier = (moteur, cond, quoi, detail = '') => {
  total++;
  console.log(`${cond ? '  ✓' : '  ✗'} [${moteur}] ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`);
  if (!cond) echecs.push(`[${moteur}] ${quoi}`);
};
const attendre = (ms) => new Promise((r) => { setTimeout(r, ms); });

async function ouvrir(navigateur, nom, query) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  await ctx.route((url) => !url.href.startsWith(`http://127.0.0.1:${PORT}/`), (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.goto(`${BASE}?${query}`);
  // Premier passage du serveur Vite : il ré-optimise ses dépendances (504
  // « Outdated Optimize Dep ») — un rechargement, une fois.
  if (!(await page.waitForSelector('[data-onglet="stock"]', { timeout: 15000 }).catch(() => null))) {
    erreurs.length = 0;
    await page.reload();
    await page.waitForSelector('[data-onglet="stock"]');
  }
  await attendre(300);
  return { ctx, page, erreurs, nom };
}

// L'élément est-il VRAIMENT touchable (rien par-dessus, en particulier ni l'en-tête ni la barre du bas) ?
const touchable = (page, sel) => page.evaluate((s) => {
  const el = document.querySelector(s);
  if (!el) return { ok: false, pourquoi: 'absent' };
  const r = el.getBoundingClientRect();
  const x = r.left + r.width / 2; const y = r.top + r.height / 2;
  if (y < 0 || y > innerHeight) return { ok: false, pourquoi: `hors écran (${Math.round(y)})` };
  const dessus = document.elementFromPoint(x, y);
  return { ok: !!dessus && (el === dessus || el.contains(dessus)), pourquoi: dessus ? `${dessus.tagName}.${dessus.className}` : 'rien' };
}, sel);
const hautBarre = (page) => page.evaluate(() => {
  const b = document.querySelector('.bnav');
  if (!b || getComputedStyle(b).display === 'none') return innerHeight;
  return b.firstElementChild.getBoundingClientRect().top;
});
const basEnTete = (page) => page.evaluate(() => document.querySelector('.topbar').getBoundingClientRect().bottom);
const etat = (page) => page.evaluate(() => ({ tab: window.__etat?.tab, n: window.__etat?.ecran?.n ?? 0, onglet: window.__etat?.ecran?.onglet ?? null, conv: window.__etat?.ecran?.conversation ?? null, hist: history.state?.fsEcranBeta?.n ?? 0, longueur: history.length, marque: history.state?.marque ?? null }));
// Marque l'entrée d'historique courante : on doit y revenir, exactement
// (history.length compte aussi les entrées « en avant », qui restent après un recul).
const marquer = (page, m) => page.evaluate((v) => history.replaceState({ ...(history.state ?? {}), marque: v }, ''), m);
const defile = (page) => page.evaluate(() => { const z = document.getElementById('zone-defilement'); return { haut: z.scrollTop, hauteur: z.scrollHeight, visible: z.clientHeight }; });
const allerEn = (page, y) => page.evaluate((v) => { document.getElementById('zone-defilement').scrollTop = v; }, y);
const enBas = (page) => page.evaluate(() => { const z = document.getElementById('zone-defilement'); z.scrollTop = z.scrollHeight; });
const ongletActif = (page) => page.evaluate(() => Number(document.querySelector('[data-onglet-bas][data-actif="1"]')?.dataset.ongletBas ?? -1));
const capture = (page, moteur, nom) => page.screenshot({ path: path.join(SORTIE, `${moteur}-${nom}.png`) });
const debordement = (page) => page.evaluate(() => ({ doc: document.documentElement.scrollWidth, zone: document.getElementById('zone-defilement').scrollWidth, larg: document.getElementById('zone-defilement').clientWidth }));

async function scenarioPlein(navigateur, moteur) {
  const { ctx, page, erreurs } = await ouvrir(navigateur, moteur, 'commandes=12');
  // 1. Les pastilles du Stock : même style neutre, seul le compteur est coloré.
  const p = await page.evaluate(() => {
    const st = (s) => { const c = getComputedStyle(document.querySelector(s)); return { fond: c.backgroundColor, bord: c.borderColor }; };
    const badge = document.querySelector('[data-entree-beta="messages"] .sk-chiffres');
    return { m: st('[data-entree-beta="messages"]'), e: st('[data-entree-beta="expedier"]'), badge: badge ? getComputedStyle(badge).backgroundColor : null, texte: badge?.textContent };
  });
  verifier(moteur, p.m.fond === p.e.fond && p.m.bord === p.e.bord && p.m.fond === 'rgb(255, 255, 255)', 'pastilles « Messages » et « À expédier » : le même style neutre (fond blanc, même bord)', JSON.stringify(p));
  verifier(moteur, p.texte === '9' && p.badge && p.badge !== 'rgb(255, 255, 255)', 'seul le compteur « 9 » porte la couleur', JSON.stringify(p));
  verifier(moteur, (await ongletActif(page)) === 1, 'Stock : « Stock IA » allumé');
  await capture(page, moteur, '01-stock');

  // 2. Messages : une page sous l'en-tête, la flèche et le titre touchables, le Stock masqué, une entrée d'historique.
  const avant = await etat(page);
  await page.click('[data-entree-beta="messages"]');
  await page.waitForSelector('[data-ecran-beta="messages"]');
  await attendre(400);
  let e = await etat(page);
  verifier(moteur, e.n === 1 && e.hist === 1 && e.longueur === avant.longueur + 1, 'ouvrir Messages crée UNE entrée d\'historique', JSON.stringify({ avant, e }));
  verifier(moteur, (await page.textContent('[data-ecran-beta="messages"] h1')) === 'Messages', 'titre « Messages »');
  const fleche = await touchable(page, '[data-ecran-beta="messages"] button[aria-label="Retour"]');
  verifier(moteur, fleche.ok, 'la flèche ← est visible et touchable (rien par-dessus, ni l\'en-tête)', fleche.pourquoi);
  const rFleche = await page.evaluate(() => document.querySelector('[data-ecran-beta="messages"] button[aria-label="Retour"]').getBoundingClientRect().top);
  verifier(moteur, rFleche >= (await basEnTete(page)) - 1, 'la flèche est SOUS l\'en-tête, pas cachée dessous', `${rFleche} / ${await basEnTete(page)}`);
  verifier(moteur, await page.evaluate(() => getComputedStyle(document.querySelector('[data-onglet="stock"]')).display === 'none'), 'le contenu du Stock est masqué (monté)');
  verifier(moteur, (await ongletActif(page)) === 1, 'Messages ouvert : l\'onglet allumé reste « Stock IA »');
  // Les filtres : jamais écrasés, ils défilent sur le côté.
  const f = await page.evaluate(() => { const r = document.querySelector('[data-filtres-messages]'); const bs = [...r.querySelectorAll('button')]; return { h: r.getBoundingClientRect().height, min: Math.min(...bs.map((b) => b.getBoundingClientRect().height)), ox: getComputedStyle(r).overflowX }; });
  verifier(moteur, f.h >= 36 && f.min >= 36 && f.ox === 'auto', 'la rangée de filtres est entière (≥ 36 px) et défile sur le côté', JSON.stringify(f));
  await capture(page, moteur, '02-messages-haut');
  // Vignettes : la photo de la fiche quand celle de l'annonce casse ; une icône sinon ; jamais une image cassée.
  await attendre(800);
  const v = await page.evaluate(() => {
    const ligne = (t) => [...document.querySelectorAll('[data-conversation]')].find((b) => b.textContent.includes(t));
    const vg = (t) => { const l = ligne(t); const img = l?.querySelector('[data-vignette] img'); return { type: l?.querySelector('[data-vignette]')?.dataset.vignette, src: img?.src?.slice(0, 22) ?? null, w: img?.naturalWidth ?? null }; };
    const cassees = [...document.querySelectorAll('[data-ecran-beta] img')].filter((i) => i.complete && i.naturalWidth === 0).length;
    return { genevieve: vg('genevieve-69'), mika: vg('mika_4803'), fff: vg('fff0_7'), marc: vg('@acheteuse_a'), cassees };
  });
  verifier(moteur, v.genevieve.type === 'photo' && v.genevieve.src?.startsWith('data:image/png') && v.genevieve.w > 0, '@genevieve-69 : la photo de la fiche du stock (la première, cassée, est sautée)', JSON.stringify(v.genevieve));
  verifier(moteur, v.mika.type === 'photo' && v.mika.w > 0, 'photo de l\'annonce lisible : affichée', JSON.stringify(v.mika));
  verifier(moteur, v.fff.type === 'icone', 'annonce et fiche illisibles : une icône neutre', JSON.stringify(v.fff));
  verifier(moteur, v.cassees === 0, 'aucune image cassée affichée', String(v.cassees));
  // Défilement jusqu'en bas : la dernière conversation et « Messages des plateformes » au-dessus de la barre du bas.
  const d = await defile(page);
  verifier(moteur, d.hauteur > d.visible + 50, 'la page des Messages défile (contenu plus haut que l\'écran)', JSON.stringify(d));
  await enBas(page);
  await attendre(250);
  const bas = await page.evaluate(() => {
    const lignes = [...document.querySelectorAll('[data-conversation]')];
    const titre = [...document.querySelectorAll('[data-ecran-beta] span')].find((s) => /Messages des plateformes/i.test(s.textContent));
    return { derniere: lignes.at(-1).getBoundingClientRect().bottom, titre: titre?.getBoundingClientRect().top ?? null, note: document.querySelector('[data-ecran-beta] > p:last-of-type').getBoundingClientRect().bottom };
  });
  const barre = await hautBarre(page);
  verifier(moteur, bas.derniere <= barre && bas.note <= barre && bas.titre != null && bas.titre < barre, 'en bas : dernière conversation, « Messages des plateformes » et la note entièrement au-dessus de la barre du bas', JSON.stringify({ ...bas, barre }));
  const derniere = await page.evaluate(() => { const l = [...document.querySelectorAll('[data-conversation]')].at(-1); l.setAttribute('data-test-derniere', '1'); return true; });
  verifier(moteur, derniere && (await touchable(page, '[data-test-derniere]')).ok, 'la dernière conversation est touchable');
  const deb = await debordement(page);
  verifier(moteur, deb.doc <= 390 && deb.zone <= deb.larg, 'aucun débordement horizontal', JSON.stringify(deb));
  await capture(page, moteur, '03-messages-bas');

  // 3. Une conversation : une entrée de plus ; la flèche ramène à la liste ; la fin au-dessus de la barre.
  await allerEn(page, 0);
  await page.click('[data-conversation] >> text=genevieve-69');
  await page.waitForSelector('[data-ecran-beta="conversation"]');
  await attendre(500);
  e = await etat(page);
  verifier(moteur, e.n === 2 && e.hist === 2 && e.conv === 'c0', 'ouvrir une conversation : une entrée de plus', JSON.stringify(e));
  const zone = await page.evaluate(() => { const t = document.querySelector('[data-ecran-beta="conversation"] textarea'); const r = t.getBoundingClientRect(); return { haut: r.top, bas: r.bottom }; });
  const barre2 = await hautBarre(page);
  verifier(moteur, zone.bas <= barre2, 'la zone de réponse est au-dessus de la barre du bas (fin de conversation)', JSON.stringify({ ...zone, barre2 }));
  verifier(moteur, (await touchable(page, '[data-ecran-beta="conversation"] textarea')).ok, 'la zone de réponse est touchable');
  await capture(page, moteur, '04-conversation-bas');
  await allerEn(page, 0);
  verifier(moteur, (await touchable(page, '[data-ecran-beta="conversation"] button[aria-label="Retour"]')).ok, 'conversation : la flèche ← est touchable');
  await page.click('[data-ecran-beta="conversation"] button[aria-label="Retour"]');
  await page.waitForSelector('[data-ecran-beta="messages"]');
  await attendre(300);
  e = await etat(page);
  verifier(moteur, e.n === 1 && e.hist === 1, 'la flèche ← ramène à la liste (l\'entrée est défaite)', JSON.stringify(e));
  // 4. Le retour du navigateur (= geste iOS, = retour Android) depuis la liste : le Stock.
  await page.evaluate(() => history.back());
  await page.waitForSelector('[data-ecran-beta]', { state: 'detached' });
  await attendre(300);
  e = await etat(page);
  verifier(moteur, e.n === 0 && e.tab === 1 && await page.isVisible('[data-onglet="stock"]') && await page.isVisible('[data-entree-beta="messages"]'), 'retour du navigateur : le Stock, avec ses pastilles', JSON.stringify(e));
  // 5. Depuis une carte du Stock défilé : au retour, le Stock retrouve sa place.
  await allerEn(page, 600);
  await page.evaluate(() => window.__ouvrirDepuisCarte(11));
  await page.waitForSelector('[data-ecran-beta="messages"]');
  await attendre(300);
  verifier(moteur, (await defile(page)).haut === 0, 'l\'écran ouvert commence en haut');
  verifier(moteur, await page.isVisible('[data-ecran-beta="messages"] >> text=Cet article'), 'depuis une carte : filtré sur l\'article');
  await page.click('[data-ecran-beta="messages"] button[aria-label="Retour"]');
  await page.waitForSelector('[data-ecran-beta]', { state: 'detached' });
  await attendre(300);
  const place = (await defile(page)).haut;
  verifier(moteur, Math.abs(place - 600) <= 2, 'retour par la flèche : le Stock retrouve sa place (600 px)', String(place));

  // 6. À expédier (12 commandes) : titre, défilement jusqu'en bas, feuille de confirmation au-dessus de tout.
  await allerEn(page, 0);
  await marquer(page, 'avant-expedier');
  await page.click('[data-entree-beta="expedier"]');
  await page.waitForSelector('[data-ecran-beta="expedier"] [data-commande]');
  await attendre(500);
  verifier(moteur, (await page.textContent('[data-ecran-beta="expedier"] h1')) === 'À expédier', 'titre « À expédier »');
  verifier(moteur, (await touchable(page, '[data-ecran-beta="expedier"] button[aria-label="Retour"]')).ok, 'À expédier : la flèche ← est touchable');
  verifier(moteur, (await ongletActif(page)) === 1, 'À expédier ouvert : l\'onglet allumé reste « Stock IA »');
  await capture(page, moteur, '05-expedier-haut');
  await enBas(page);
  await attendre(250);
  const finCmd = await page.evaluate(() => [...document.querySelectorAll('[data-commande]')].at(-1).getBoundingClientRect().bottom);
  verifier(moteur, finCmd <= (await hautBarre(page)), 'À expédier (12 commandes) : la dernière entièrement au-dessus de la barre du bas', `${finCmd} / ${await hautBarre(page)}`);
  await capture(page, moteur, '06-expedier-bas');
  await allerEn(page, 0);
  const generer = page.locator('[data-commande] button', { hasText: 'Générer le bordereau' }).first();
  if (await generer.count()) {
    await generer.click();
    await page.waitForSelector('[role="dialog"][aria-label="Générer le bordereau"]');
    await attendre(300);
    const feuille = await page.evaluate(() => {
      const d = document.querySelector('[role="dialog"][aria-label="Générer le bordereau"]');
      const b = [...d.querySelectorAll('button')].find((x) => /Commander|Confirmer|Accepter/.test(x.textContent));
      const r = b.getBoundingClientRect();
      const dessus = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return { portail: d.parentElement === document.body, barre: getComputedStyle(document.querySelector('.bnav')).display, touche: b === dessus || b.contains(dessus) };
    });
    verifier(moteur, feuille.portail && feuille.barre === 'none' && feuille.touche, 'feuille « Générer le bordereau » : montée sur body, barre du bas masquée, bouton de confirmation touchable', JSON.stringify(feuille));
    await capture(page, moteur, '07-confirmation');
    await page.click('[role="dialog"][aria-label="Générer le bordereau"] button[aria-label="Annuler"]');
    await page.waitForSelector('[role="dialog"][aria-label="Générer le bordereau"]', { state: 'detached' });
    verifier(moteur, await page.evaluate(() => getComputedStyle(document.querySelector('.bnav')).display !== 'none'), '« Annuler » : la barre du bas revient, rien n\'est demandé', '');
    verifier(moteur, !(await page.evaluate(() => window.__appels.some((a) => a.rpc === 'bordereau_generer'))), 'aucune génération déposée sans « Confirmer »');
  } else verifier(moteur, false, 'un bouton « Générer le bordereau » existe dans les données d\'essai');
  // 7. Un appui sur un onglet de la barre du bas ferme l'écran et va sur cet onglet.
  const avantOnglet = await etat(page);
  await page.click('[data-onglet-bas="0"]');
  await page.waitForSelector('[data-onglet="tableau"]');
  await attendre(400);
  e = await etat(page);
  verifier(moteur, e.n === 0 && e.tab === 0 && (await ongletActif(page)) === 0 && !(await page.$('[data-ecran-beta]')), 'appui sur « Tableau » : l\'écran se ferme, le Tableau s\'ouvre', JSON.stringify(e));
  verifier(moteur, e.hist === 0 && e.marque === 'avant-expedier', 'les entrées d\'historique de l\'écran sont retirées (retour sur l\'entrée d\'avant)', JSON.stringify({ avantOnglet, e }));
  verifier(moteur, !(await page.isVisible('[data-entree-beta="messages"]')), 'Tableau : pas de pastilles (elles vivent sur le Stock)');
  await capture(page, moteur, '08-tableau');
  // 8. Appui sur « Stock IA » pendant que l'écran est ouvert : retour au Stock.
  await page.click('[data-onglet-bas="1"]');
  await page.waitForSelector('[data-entree-beta="messages"]');
  await page.click('[data-entree-beta="messages"]');
  await page.waitForSelector('[data-ecran-beta="messages"]');
  await page.click('[data-onglet-bas="1"]');
  await page.waitForSelector('[data-ecran-beta]', { state: 'detached' });
  await attendre(300);
  e = await etat(page);
  verifier(moteur, e.n === 0 && e.tab === 1 && await page.isVisible('[data-onglet="stock"]') && e.hist === 0, 'appui sur « Stock IA » pendant l\'écran : retour au Stock', JSON.stringify(e));
  // 9. Un changement d'onglet venu d'ailleurs (lien, notification) pendant une conversation.
  await marquer(page, 'avant-lien');
  const avantLien = await etat(page);
  await page.click('[data-entree-beta="messages"]');
  await page.waitForSelector('[data-ecran-beta="messages"]');
  await page.click('[data-conversation] >> text=genevieve-69');
  await page.waitForSelector('[data-ecran-beta="conversation"]');
  await page.evaluate(() => window.__changerOnglet(3));
  await page.waitForSelector('[data-onglet="ventes"]');
  await attendre(500);
  e = await etat(page);
  verifier(moteur, e.n === 0 && e.tab === 3 && !(await page.$('[data-ecran-beta]')) && e.hist === 0 && e.marque === 'avant-lien' && page.url().includes('espace-beta-page.html'),
    'onglet changé par un lien pendant une conversation : l\'écran se ferme, les 2 entrées partent, l\'app reste', JSON.stringify({ avantLien, e }));
  verifier(moteur, erreurs.length === 0, 'aucune erreur de page', erreurs.join(' | '));
  await ctx.close();
}

async function scenarioVide(navigateur, moteur) {
  const { ctx, page, erreurs } = await ouvrir(navigateur, moteur, 'commandes=0');
  await page.click('[data-entree-beta="expedier"]');
  await page.waitForSelector('[data-ecran-beta="expedier"] >> text=Aucune commande à expédier');
  await attendre(300);
  const r = await page.evaluate(() => [...document.querySelectorAll('[data-ecran-beta="expedier"] span')].find((s) => s.textContent === 'Aucune commande à expédier').closest('section').getBoundingClientRect().bottom);
  verifier(moteur, r <= (await hautBarre(page)), 'À expédier (0 commande) : la carte vide entière au-dessus de la barre du bas', `${r}`);
  verifier(moteur, (await touchable(page, '[data-ecran-beta="expedier"] button[aria-label="Retour"]')).ok, 'À expédier vide : la flèche ← est touchable');
  await capture(page, moteur, '09-expedier-vide');
  await page.click('[data-ecran-beta="expedier"] button[aria-label="Retour"]');
  await page.waitForSelector('[data-ecran-beta]', { state: 'detached' });
  verifier(moteur, (await etat(page)).n === 0 && await page.isVisible('[data-onglet="stock"]'), 'la flèche ← ramène au Stock');
  verifier(moteur, erreurs.length === 0, 'aucune erreur de page (vide)', erreurs.join(' | '));
  await ctx.close();
}

async function scenarioHorsBeta(navigateur, moteur) {
  const { ctx, page, erreurs } = await ouvrir(navigateur, moteur, 'commandes=3&beta=0');
  const avant = await etat(page);
  verifier(moteur, !(await page.$('[data-entree-beta]')) && !(await page.$('.fs-espace-beta')), 'compte sans le drapeau : aucune pastille, aucun écran bêta');
  await page.click('[data-onglet-bas="0"]'); await page.click('[data-onglet-bas="1"]');
  const apres = await etat(page);
  verifier(moteur, apres.longueur === avant.longueur && apres.hist === 0, 'compte sans le drapeau : l\'historique n\'est pas touché', JSON.stringify({ avant, apres }));
  verifier(moteur, await page.evaluate(() => document.getElementById('zone-defilement').className === 'wrap page-pad'), 'compte sans le drapeau : le conteneur garde sa classe d\'origine');
  await capture(page, moteur, '10-hors-beta');
  verifier(moteur, erreurs.length === 0, 'aucune erreur de page (hors bêta)', erreurs.join(' | '));
  await ctx.close();
}

// (17/10, règle de Nico : « tout dans FillSell ») Chaque carte de chaque plateforme.
async function scenarioCartes(navigateur, moteur) {
  const { ctx, page, erreurs } = await ouvrir(navigateur, moteur, 'commandes=16');
  await page.click('[data-entree-beta="expedier"]');
  await page.waitForSelector('[data-ecran-beta="expedier"] [data-commande]');
  await attendre(700);
  const cartes = await page.evaluate(() => window.__cartes);
  const lues = await page.evaluate(() => [...document.querySelectorAll('[data-ecran-beta="expedier"] article[data-commande]')].map((a) => ({
    titre: a.querySelector('div[style*="font-weight: 700"]')?.textContent ?? a.textContent.slice(0, 80),
    texte: a.textContent, action: a.dataset.action,
    boutons: [...a.querySelectorAll('button:not([data-lien-secours])')].map((b) => b.textContent.trim()),
    secours: !!a.querySelector('[data-lien-secours]'), suivi: a.querySelector('[data-suivi]')?.textContent ?? null,
  })));
  verifier(moteur, lues.length === 16, 'les 16 cartes (une par cas possible) sont affichées', String(lues.length));
  for (const c of cartes) {
    const l = lues.find((x) => x.texte.includes(c.titre));
    if (!l) { verifier(moteur, false, `carte « ${c.titre} » affichée`); continue; }
    const okType = l.action === c.attendu;
    const okBouton = c.attendu === 'generer' ? l.boutons.includes('Générer le bordereau')
      : c.attendu === 'bordereau' ? l.boutons.some((b) => /Récupérer le bordereau/.test(b))
      : c.attendu === 'attente' ? l.boutons.length === 0 : l.boutons.length === 1;
    const okSecours = c.attendu === 'lien' ? !l.secours : l.secours;
    verifier(moteur, okType && okBouton && okSecours && !/c’est toi qui le fais/i.test(l.texte),
      `${c.titre} → ${c.attendu === 'generer' ? '« Générer » dans FillSell' : c.attendu === 'bordereau' ? '« Récupérer » dans FillSell' : c.attendu === 'attente' ? 'attente dite, aucun bouton, lien discret' : 'un seul bouton vers la plateforme (ce que FillSell ne fait pas)'}`,
      JSON.stringify({ action: l.action, boutons: l.boutons, secours: l.secours }));
  }
  const depop = lues.find((x) => x.texte.includes('Depop — à expédier'));
  verifier(moteur, /XY987654/.test(depop?.suivi ?? ''), 'Depop : le suivi lisible s\'affiche sur la carte', depop?.suivi ?? 'absent');
  const beebs = lues.find((x) => x.texte.includes('Beebs — bordereau prêt'));
  verifier(moteur, /MR123456/.test(beebs?.suivi ?? ''), 'Beebs : le numéro d\'envoi s\'affiche sur la carte', beebs?.suivi ?? 'absent');
  const ebay = lues.find((x) => x.texte.includes('eBay — étiquette à acheter'));
  verifier(moteur, ebay?.boutons[0]?.startsWith('Acheter l’étiquette sur eBay') === true, 'eBay : le seul bouton sert à ACHETER l\'étiquette', JSON.stringify(ebay?.boutons));
  const exp = await page.evaluate(() => document.querySelector('[data-expediees]')?.textContent ?? '');
  verifier(moteur, /6A1234567890/.test(exp) && /Depop — expédiée/.test(exp), 'expédiées depuis 3 jours : le suivi d\'une étiquette eBay achetée s\'affiche dans FillSell', exp.slice(0, 160));
  await capture(page, moteur, '11-cartes-haut');
  await enBas(page);
  await attendre(250);
  const finExp = await page.evaluate(() => document.querySelector('[data-expediees]').getBoundingClientRect().bottom);
  verifier(moteur, finExp <= (await hautBarre(page)), '16 cartes : la fin (« Expédiées ») entièrement au-dessus de la barre du bas', `${finExp} / ${await hautBarre(page)}`);
  await capture(page, moteur, '12-cartes-bas');

  // Leboncoin Colissimo (décision de Nico, 17/10) : l'expéditeur = l'adresse du COMPTE Leboncoin ;
  // rien à saisir dans FillSell, l'écran le dit, puis UNE demande.
  const colis = page.locator('article[data-commande="leboncoin"]', { hasText: 'Colissimo, disponibilité à confirmer' });
  await colis.scrollIntoViewIfNeeded();
  await colis.locator('button[aria-label="Générer le bordereau"]').click();
  await page.waitForSelector('[data-expediteur="compte-leboncoin"]');
  await attendre(300);
  const blocExp = await page.textContent('[data-expediteur="compte-leboncoin"]');
  verifier(moteur, /adresse enregistrée dans ton compte Leboncoin/.test(blocExp) && !(await page.$('[role="dialog"] input:not([type="radio"])')),
    'Colissimo : l\'écran dit que l\'expéditeur est l\'adresse du compte Leboncoin — aucun champ à remplir', blocExp);
  verifier(moteur, !(await page.evaluate(() => document.querySelector('[role="dialog"] button[aria-label="Confirmer la disponibilité"]').disabled)), 'Colissimo : la confirmation est disponible tout de suite');
  const phrase = await page.textContent('[role="dialog"] [role="note"]');
  verifier(moteur, /adresse de ton compte Leboncoin/.test(phrase), 'Colissimo : la phrase dit ce que le geste engage, adresse du compte comprise', phrase);
  await capture(page, moteur, '13-colissimo-confirmation');
  await page.click('[role="dialog"] button[aria-label="Confirmer la disponibilité"]');
  await page.waitForSelector('[role="dialog"][aria-label="Générer le bordereau"]', { state: 'detached' });
  await attendre(500);
  const appels = await page.evaluate(() => window.__appels.filter((a) => a.rpc));
  const gen = appels.filter((a) => a.rpc === 'bordereau_generer');
  verifier(moteur, !appels.some((a) => a.rpc === 'platform_settings_fusionner'), 'Colissimo : aucune adresse écrite dans FillSell');
  verifier(moteur, gen.length === 1 && /adresse de ton compte Leboncoin/.test(gen[0].params.p_engagement), 'Colissimo : UNE demande de génération, avec la phrase montrée', String(gen.length));
  const etatColis = await colis.textContent();
  verifier(moteur, /Génération demandée/.test(etatColis) && /En attente de ton ordinateur/.test(etatColis) && !(await colis.locator('button[aria-label="Générer le bordereau"]').count()),
    'après la demande : la carte dit qu\'elle attend l\'ordinateur, plus de bouton « Générer »', etatColis.slice(0, 200));

  // Vinted, options pas encore relues : papier ou QR au choix, le choix part avec la demande.
  const vinted = page.locator('article[data-commande="vinted"]', { hasText: 'options pas encore relues' });
  await vinted.scrollIntoViewIfNeeded();
  await vinted.locator('button[aria-label="Générer le bordereau"]').click();
  await page.waitForSelector('[role="dialog"][aria-label="Générer le bordereau"]');
  await attendre(300);
  const radios = await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] input[type="radio"]')].map((r) => r.parentElement.textContent.trim()));
  verifier(moteur, radios.length === 2 && /PDF/.test(radios[0]) && /QR/.test(radios[1]), 'Vinted (options pas encore relues) : papier ou QR au choix', JSON.stringify(radios));
  verifier(moteur, await page.isVisible('[role="dialog"] >> text=vérifie juste avant de commander'), 'Vinted : l\'écran dit que le type est vérifié juste avant, sinon rien n\'est commandé');
  await capture(page, moteur, '14-vinted-papier-qr');
  await page.click('[role="dialog"] >> text=Code QR à montrer au point relais');
  await page.click('[role="dialog"] button[aria-label="Commander l’étiquette"]');
  await page.waitForSelector('[role="dialog"][aria-label="Générer le bordereau"]', { state: 'detached' });
  await attendre(400);
  const genV = await page.evaluate(() => window.__appels.filter((a) => a.rpc === 'bordereau_generer').at(-1));
  verifier(moteur, genV?.params?.p_choix?.type_etiquette === 3, 'Vinted : le type choisi (QR) part avec la demande', JSON.stringify(genV?.params?.p_choix));
  verifier(moteur, erreurs.length === 0, 'aucune erreur de page (cartes)', erreurs.join(' | '));
  await ctx.close();
}

for (const [moteur, type] of [['webkit', webkit], ['chromium', chromium]]) {
  console.log(`\n── ${moteur} (390 × 844) ──`);
  const navigateur = await type.launch({ headless: true });
  try {
    await scenarioPlein(navigateur, moteur);
    await scenarioVide(navigateur, moteur);
    await scenarioHorsBeta(navigateur, moteur);
    await scenarioCartes(navigateur, moteur);
  } catch (e) {
    verifier(moteur, false, 'scénario mené jusqu\'au bout', String(e?.message ?? e).split('\n')[0]);
  }
  await navigateur.close();
}
console.log(echecs.length ? `\n✗ ${echecs.length} contrôle(s) rouge(s) sur ${total}` : `\n✓ ${total} contrôles verts (WebKit + Chromium, 390 px) — captures : ${path.relative(RACINE, SORTIE)}`);
process.exit(echecs.length ? 1 : 0);
