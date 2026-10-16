// Captures et contrôles des écrans de la bêta « messages + bordereaux » (16/10/2026, clôture le soir).
// Outil de relecture, jamais livré — même patron que capture-refonte-1610.mjs.
//
//   npx vite --config scripts/apercu/vite-stock-refonte.config.mjs --port 5218
//   APERCU_PORT=5218 node scripts/apercu/capture-messagerie-beta.mjs
//
// Ce qu'il PROUVE, à 390 px, sur des données SYNTHÉTIQUES (aucun message réel) :
//   · aucune erreur de page, aucun débordement horizontal, aucun émoji ;
//   · le mur Beebs (téléphone non vérifié) est DIT en tête des messages ; un 401
//     seul (Leboncoin) n'affiche aucun mur ;
//   · la réponse verrouillée le dit (« liste blanche ») ; en liste blanche, « envoi actif » ;
//   · « À expédier » : les cinq plateformes ; « Bordereau » ACTIF seulement pour
//     Vinted et Leboncoin prêts ; un clic = UNE demande (bordereau_demander),
//     puis l'état « demande envoyée » ; les gestes qui engagent sont des liens ;
//   · ouvrir une conversation appelle messagerie_vue (FillSell seulement) et
//     n'appelle AUCUN « marquer lu » d'une plateforme ;
//   · la carte : l'indicateur n'existe que s'il y a des non-lus, et un appui
//     ouvre les messages de CET article.
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const SORTIE = path.join(RACINE, 'screenshots-review', 'messagerie-beta-1610');
const PORT = Number(process.env.APERCU_PORT || 5218);
const BASE = `http://127.0.0.1:${PORT}/scripts/apercu/messagerie-beta.html`;
fs.mkdirSync(SORTIE, { recursive: true });

const echecs = [];
const verifier = (cond, quoi, detail = '') => { console.log(`${cond ? '  ✓' : '  ✗'} ${quoi}${cond || !detail ? '' : `   ← ${detail}`}`); if (!cond) echecs.push(quoi); };
const EMOJI = /\p{Extended_Pictographic}/u;

const navigateur = await chromium.launch({ headless: true });
async function ouvrir(ecran) {
  const ctx = await navigateur.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'fr-FR', timezoneId: 'Europe/Paris' });
  // Tout ce qui n'est pas le serveur local est coupé (aucune requête ne part).
  await ctx.route((url) => !url.href.startsWith(`http://127.0.0.1:${PORT}/`), (r) => r.abort());
  const page = await ctx.newPage();
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(String(e.message)));
  await page.goto(`${BASE}?ecran=${ecran}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1600);
  return { ctx, page, erreurs };
}
const mesures = (page) => page.evaluate(() => ({
  debordement: document.documentElement.scrollWidth - window.innerWidth,
  texte: document.body.innerText,
}));

for (const ecran of ['barre', 'messages', 'blanche', 'expedier', 'carte']) {
  const { ctx, page, erreurs } = await ouvrir(ecran);
  const m = await mesures(page);
  console.log(`— ${ecran}`);
  verifier(erreurs.length === 0, `${ecran} : aucune erreur de page`, erreurs.join(' | '));
  verifier(m.debordement <= 0, `${ecran} : aucun débordement horizontal`, `${m.debordement} px`);
  verifier(!EMOJI.test(m.texte), `${ecran} : aucun émoji`);
  if (ecran === 'expedier') {
    await page.screenshot({ path: path.join(SORTIE, 'expedier.png'), fullPage: true });
    const commandes = await page.$$eval('[data-commande]', (els) => els.map((e) => e.getAttribute('data-commande')));
    verifier(['vinted', 'leboncoin', 'beebs', 'ebay', 'depop'].every((p) => commandes.includes(p)), 'À expédier : les cinq plateformes', JSON.stringify(commandes));
    verifier(commandes[0] === 'leboncoin' || commandes[0] === 'beebs', 'À expédier : « à confirmer » en tête', JSON.stringify(commandes));
    const actifs = await page.$$eval('button[aria-label="Récupérer le bordereau"]', (bs) => bs.map((b) => !b.disabled));
    verifier(actifs.length === 2 && actifs.every(Boolean), 'À expédier : « Bordereau » actif pour Vinted et Leboncoin prêts (2)', JSON.stringify(actifs));
    for (const libelle of ['Confirmer sur Leboncoin', 'Accepter sur Beebs', 'Étiquette sur eBay', 'Voir sur Depop']) {
      verifier(await page.locator(`button[aria-label="${libelle}"]`).count() >= 1, `À expédier : geste qui engage → lien « ${libelle} »`);
    }
    verifier(/Disponibilité à confirmer/.test(m.texte) && /Commande à accepter/.test(m.texte), 'À expédier : états lisibles par plateforme');
    verifier(/accepter la commande/.test(m.texte) && /FillSell ne le fait jamais/.test(m.texte), 'À expédier : ce qui engage est dit');
    verifier(/À déposer avant le/.test(m.texte), 'À expédier : date limite affichée');
    verifier(/@acheteuse_a/.test(m.texte) && /Commande 9001/.test(m.texte) && /Dans ton stock/.test(m.texte), 'À expédier : pseudo, numéro, article du stock');
    verifier(/Mondial Relay/.test(m.texte) && /Colissimo/.test(m.texte) && !/mondial_relay|FR_Coliposte/.test(m.texte), 'À expédier : transporteurs en clair');
    await page.locator('button[aria-label="Récupérer le bordereau"]').first().click();
    await page.waitForTimeout(500);
    const appels = await page.evaluate(() => window.__appels);
    const demandes = appels.filter((a) => a.rpc === 'bordereau_demander');
    verifier(demandes.length === 1 && typeof demandes[0].params?.p_commande === 'string', 'clic « Bordereau » → UNE demande (bordereau_demander)', JSON.stringify(demandes));
    const t2 = (await mesures(page)).texte;
    verifier(/Demande envoyée/.test(t2) && /Récupération…/.test(t2), 'après le clic : « demande envoyée », bouton en attente');
    await page.screenshot({ path: path.join(SORTIE, 'expedier-demande.png') });
  }
  if (ecran === 'carte') {
    const n = await page.$$eval('[data-messages-non-lus]', (els) => els.map((e) => `${e.tagName}:${e.getAttribute('data-messages-non-lus')}`));
    verifier(n.length === 1 && n[0] === 'BUTTON:2', 'carte : indicateur seulement sur l’article qui a des non-lus, et c’est un bouton', JSON.stringify(n));
    await page.locator('[data-messages-non-lus]').click();
    const appels = await page.evaluate(() => window.__appels);
    verifier(appels.some((a) => a.ouvrir === 11), 'carte : un appui ouvre les messages de CET article');
    await page.screenshot({ path: path.join(SORTIE, 'carte.png') });
  }
  if (ecran === 'messages' || ecran === 'blanche') {
    if (ecran === 'messages') {
      verifier(/Vérifie ton numéro sur Beebs/.test(m.texte), 'messages : le mur Beebs (téléphone non vérifié) est dit en tête');
      verifier(!/Connecte-toi à Leboncoin/.test(m.texte), 'messages : un 401 seul (Leboncoin) n’affiche aucun mur');
      verifier(/@acheteuse_a/.test(m.texte) && /Marc/.test(m.texte) && !/@Marc/.test(m.texte) && /Julie D\./.test(m.texte) && !/@Julie/.test(m.texte), 'messages : pseudos (@ pour Vinted), noms publics sans @ (Leboncoin, Beebs)');
      verifier(/Messages des plateformes/i.test(m.texte), 'messages : messages des plateformes à part');
      await page.screenshot({ path: path.join(SORTIE, 'messages-liste.png'), fullPage: true });
    }
    await page.getByText('@acheteuse_a').first().click();
    await page.waitForTimeout(600);
    const t2 = (await mesures(page)).texte;
    if (ecran === 'messages') {
      verifier(/verrouillé pendant la bêta/.test(t2) && /liste blanche/.test(t2), 'conversation : la réponse verrouillée le dit (liste blanche)');
      verifier(/Offre/.test(t2) && /Article de ton stock/.test(t2), 'conversation : offre reçue et article du stock affichés');
      const appels = await page.evaluate(() => window.__appels);
      verifier(appels.some((a) => a.rpc === 'messagerie_vue'), 'conversation : messagerie_vue appelée (FillSell seulement)');
      verifier(!appels.some((a) => /mark|read/i.test(JSON.stringify(a)) && a.rpc !== 'messagerie_vue'), 'conversation : aucun « marquer lu » de plateforme');
      verifier((await mesures(page)).debordement <= 0, 'conversation : aucun débordement horizontal');
      await page.screenshot({ path: path.join(SORTIE, 'messages-conversation.png') });
      await page.fill('textarea', 'Oui, toujours disponible.');
      await page.click('button[aria-label="Enregistrer la réponse (verrouillée)"]');
      await page.waitForTimeout(400);
      const appels2 = await page.evaluate(() => window.__appels);
      const rep = appels2.find((a) => a.rpc === 'messagerie_repondre');
      verifier(Boolean(rep) && typeof rep.params?.p_cle === 'string' && rep.params.p_cle.length >= 8, 'réponse : enregistrée avec une clé d’envoi (idempotence)');
    } else {
      verifier(/Envoi actif/.test(t2) && /une seule fois/.test(t2), 'liste blanche : « envoi actif », une seule fois');
      verifier(await page.locator('button[aria-label="Envoyer la réponse"]').count() === 1, 'liste blanche : bouton « Envoyer la réponse »');
      await page.screenshot({ path: path.join(SORTIE, 'messages-conversation-liste-blanche.png') });
    }
  }
  if (ecran === 'barre') await page.screenshot({ path: path.join(SORTIE, 'barre.png') });
  await ctx.close();
}
await navigateur.close();
console.log(echecs.length ? `\n✗ ${echecs.length} échec(s)` : '\n✓ tout est vert');
process.exit(echecs.length ? 1 : 0);
