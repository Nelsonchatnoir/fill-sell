// Autotest de l'ACHAT de l'option Sans ordinateur et de l'écran « Me connecter » (05/10).
//
//     npm run selftest:cloud-achat
//
// Prouve, sans réseau : la préparation dit vrai (pool vide = rien ne s'ouvre ;
// essai refusé = on le dit et on demande) ; l'identifiant d'appareil est stable
// et local ; le drapeau baissé et les témoins (Nico SEUL, 05/10) ne montrent rien à personne d'autre ;
// l'écran ne propose que des plateformes prouvées ; les mots respectent les
// règles (tutoiement, aucune phrase technique, aucune plateforme non prouvée,
// 20 € TTC) ; App passe par l'achat câblé, jamais par onUpgrade pour l'option.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

let ko = 0, n = 0;
const ok = (c, m) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const vite = await createServer({ root: racine, logLevel: 'silent', server: { middlewareMode: true }, appType: 'custom' });
try {
  const A = await vite.ssrLoadModule('/src/cloud/achatCloud.js');
  const C = await vite.ssrLoadModule('/src/config/cloudOffer.js');
  const Tx = await vite.ssrLoadModule('/src/cloud/textesConnexion.js');

  console.log('\n1. La préparation (avant tout paiement)');
  ok(A.lirePreparation({ ok: false, raison: 'pool_vide' }).continuer === false, 'pool vide → rien ne s\'ouvre');
  ok(/réessaie/.test(A.lirePreparation({ ok: false, raison: 'pool_vide' }).message) && /carte/.test(A.lirePreparation({ ok: false, raison: 'pool_vide' }).message), '…et on le dit (rien demandé à la carte)');
  ok(A.lirePreparation({ ok: false, raison: 'deja_client' }).continuer === false, 'déjà client → rien');
  const sans = A.lirePreparation({ ok: true, essai: false, raison: 'appareil_deja_vu' });
  ok(sans.continuer && sans.essai === false && /tout de suite/.test(sans.confirmation) && /20.€\/mois/.test(sans.confirmation), 'essai refusé → on DEMANDE avant de payer (tout de suite, 20 €/mois)');
  ok(A.lirePreparation({ ok: true, essai: true }).essai === true, 'essai permis → on continue avec l\'essai');
  ok(A.lirePreparation(null).continuer === false, 'réponse illisible → rien ne s\'ouvre');
  ok(A.PRODUIT_CLOUD === 'app.fillsell.cloud.sub', 'produit des stores : app.fillsell.cloud.sub (Apple et Google)');

  console.log('\n2. L\'identifiant d\'appareil');
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  const id1 = A.identifiantAppareil(st);
  ok(id1.startsWith('app-') && A.identifiantAppareil(st) === id1, 'stable sur l\'appareil (gardé localement)');
  ok(A.identifiantAppareil({ getItem: () => { throw new Error('privé'); } }) === '', 'stockage refusé → vide (la base répond « appareil_inconnu » : sans essai, jamais un faux verrou)');

  console.log('\n3. Les drapeaux');
  ok(C.CLOUD_OFFER_ENABLED === false && C.cloudOfferVisible('x') === false, 'drapeau baissé : offre fermée à tous (hors témoins)');
  // (05/10, écran B du test) Nico SEUL témoin, des deux listes ; personne d'autre.
  const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  ok(Array.isArray(C.CLOUD_TEMOINS) && C.CLOUD_TEMOINS.length === 1 && C.CLOUD_TEMOINS[0] === NICO, 'témoins de « Me connecter » : Nico SEUL');
  ok(Array.isArray(C.CLOUD_OFFRE_TEMOINS) && C.CLOUD_OFFRE_TEMOINS.length === 1 && C.CLOUD_OFFRE_TEMOINS[0] === NICO, 'témoins de l\'offre : Nico SEUL (achat d\'essai réel)');
  ok(Object.isFrozen(C.CLOUD_TEMOINS) && Object.isFrozen(C.CLOUD_OFFRE_TEMOINS), 'listes figées (aucun ajout à l\'exécution)');
  ok(C.cloudConnexionVisible(NICO) === true && C.cloudOfferVisible(NICO) === true, 'Nico voit « Me connecter » et l\'offre');
  const autres = ['x', '', undefined, null, 0, NICO.toUpperCase(), `${NICO} `, 'f44b5917-bccc-4431-ba41-f40571a2ed19', '00000000-0000-0000-0000-000000000000'];
  ok(autres.every((u) => C.cloudConnexionVisible(u) === false && C.cloudOfferVisible(u) === false), 'tout autre compte (casse, espace, voisin, vide, null) : NON, partout');
  ok(C.CLOUD_PLATEFORMES_CONNEXION.map((p) => p.id).join(',') === 'vinted,leboncoin', 'plateformes proposées : Vinted, Leboncoin (seulement celles prouvées)');
  ok(C.CLOUD_DOMAINE === 'cloud.fillsell.app', 'domaine de l\'écran : cloud.fillsell.app');

  console.log('\n4. Les mots');
  const INTERDITS = [/Beebs/i, /Opla/i, /p[ée]pite/i, /\bproxy\b/i, /\bIP\b/, /serveur Cloud/i, /formule payante/i, /\bvous\b/i];
  for (const lang of ['fr', 'en']) {
    const T = Tx.textesConnexion(lang);
    const tout = Object.values(T).map((v) => (typeof v === 'function' ? v('appareil_deja_vu') : v)).join(' ');
    ok(INTERDITS.every((r) => !r.test(tout)), `${lang} : aucune plateforme non prouvée, aucune phrase technique, tutoiement`);
    ok(/20.€/.test(T.sansEssai('essai_deja_pris')), `${lang} : le prix est dit (20 € TTC)`);
  }

  console.log('\n5. Le câblage dans App');
  const app = lire('src/App.jsx');
  ok(/onCloudSeul=\{cloudOfferVisible\(user\?\.id\)\?/.test(app) && /onAjouterCloud=\{cloudOfferVisible\(user\?\.id\)\?/.test(app), 'onCloudSeul / onAjouterCloud : seulement drapeau levé');
  ok(/actions=\{actionsCloud\}/.test(app) && /actionsCloud=\{actionsCloud\}/.test(app), 'HoteCloud et Réglages reçoivent les gestes (arrêter compris)');
  ok(/meConnecterOuvert&&user&&cloudConnexionVisible\(user\.id\)/.test(app), '« Me connecter » monté seulement pour un témoin ou drapeau levé');
  ok(/if\(opts\?\.cloud===true&&cloudOfferVisible\(user\?\.id\)\)/.test(app), 'formule + option : seulement drapeau levé, sinon le parcours d\'avant, mot pour mot');
  const ecran = lire('src/cloud/MeConnecterCloud.jsx');
  ok(/wss:\/\/\$\{CLOUD_DOMAINE\}\/connexion\/ws/.test(ecran) && !/location\.href|window\.open/.test(ecran), 'l\'écran ouvre la seule connexion (aucune navigation, aucun lien libre)');
  ok(/ebayVoieApiDuCompte/.test(ecran) && /demarrerConnexionEbay/.test(ecran), 'eBay : la connexion officielle (API), jamais le navigateur Cloud');
  // Rendu RÉEL de l'écran (React, rendu serveur) : aucune erreur d'exécution, les mots attendus.
  const React = (await import('react')).default;
  const { renderToString } = await import('react-dom/server');
  const Ecran = (await vite.ssrLoadModule('/src/cloud/MeConnecterCloud.jsx')).default;
  const html = renderToString(React.createElement(Ecran, { userId: 'u-test', lang: 'fr', onFermer: () => {} }));
  ok(/Me connecter/.test(html) && /Lecture de tes connexions/.test(html) && /serveurs/.test(html), 'l\'écran se rend (titre, introduction, lecture en cours)');
  ok(!/Beebs|Opla/.test(html) && /role="dialog"/.test(html), 'aucune plateforme non prouvée ; une fenêtre accessible (dialog)');
  const client = lire('src/cloud/connexion/clientConnexion.js');
  ok(/touchAction: 'none'/.test(client) && /gesturestart/.test(client) && /e\.touches\.length !== 1/.test(client), 'jamais de zoom : un seul doigt, gestes Safari bloqués');
} finally {
  await vite.close();
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
