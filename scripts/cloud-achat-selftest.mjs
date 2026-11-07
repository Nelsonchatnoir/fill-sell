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

// (17/10) Sans noDiscovery, Vite balayait au démarrage tous les .html du dépôt
// (build/, screenshots-review/, docs/…) : 94 s, au-delà des 60 s du chargement
// d'un module → rouge sans rapport avec le code. Même réglage que cloud-ecrans.
const vite = await createServer({
  root: racine, logLevel: 'silent', appType: 'custom',
  server: { middlewareMode: true, hmr: false, watch: null },
  optimizeDeps: { noDiscovery: true, include: [] },
});
try {
  const A = await vite.ssrLoadModule('/src/cloud/achatCloud.js');
  const C = await vite.ssrLoadModule('/src/config/cloudOffer.js');
  const Tx = await vite.ssrLoadModule('/src/cloud/textesConnexion.js');

  console.log('\n1. La préparation (avant tout paiement)');
  ok(A.lirePreparation({ ok: false, raison: 'pool_vide' }).continuer === false, 'pool vide → rien ne s\'ouvre');
  ok(/réessaie/.test(A.lirePreparation({ ok: false, raison: 'pool_vide' }).message) && /carte/.test(A.lirePreparation({ ok: false, raison: 'pool_vide' }).message), '…et on le dit (rien demandé à la carte)');
  ok(A.lirePreparation({ ok: false, raison: 'deja_client' }).continuer === false, 'déjà client → rien');
  const sans = A.lirePreparation({ ok: true, essai: false, raison: 'appareil_deja_vu' });
  ok(sans.continuer && sans.essai === false && /tout de suite/.test(sans.confirmation) && /24,99.€\/mois/.test(sans.confirmation), 'essai refusé → on DEMANDE avant de payer (tout de suite, 24,99 €/mois)');
  ok(A.lirePreparation({ ok: true, essai: true }).essai === true, 'essai permis → on continue avec l\'essai');
  ok(A.lirePreparation(null).continuer === false, 'réponse illisible → rien ne s\'ouvre');
  ok(A.PRODUIT_CLOUD === 'app.fillsell.cloud.sub', 'produit des stores : app.fillsell.cloud.sub (Apple et Google)');

  // (03/11, point 5 de Nico) Pas de place serveur ni d'IP : aucune vente, la liste d'attente proposée.
  console.log('\n1 bis. Contrôle de place avant la vente, liste d\'attente');
  const complet = A.lirePreparation({ ok: false, raison: 'complet', inscrit: false });
  ok(complet.continuer === false && complet.attente === true && /prises/.test(complet.message), 'complet → rien ne s\'ouvre, la liste d\'attente est proposée');
  ok(A.lirePreparation({ ok: false, raison: 'pool_vide', inscrit: true }).attente === false && A.lirePreparation({ ok: false, raison: 'pool_vide', inscrit: true }).inscrit === true, 'déjà inscrit(e) → pas reproposée');
  const scenario = async ({ raison, accepte, rpc }) => {
    const appels = { stripe: 0, store: 0, rpc: [] };
    const supabase = {
      rpc: async (nom) => { appels.rpc.push(nom); if (nom === 'cloud_essai_preparer_moi') return { data: { ok: false, raison, inscrit: false } }; return rpc?.(nom) ?? { data: null }; },
      auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    };
    const vieuxFetch = globalThis.fetch;
    globalThis.fetch = async () => { appels.stripe++; return { json: async () => ({}) }; };
    try {
      for (const platform of ['web', 'ios', 'android']) {
        const achat = A.creerAchatCloud({ supabase, supabaseUrl: 'https://x', supabaseAnonKey: 'k', user: { id: 'u', email: 'e' }, lang: 'fr', platform,
          purchasePremium: async () => { appels.store++; return {}; }, ouvrirLien: async () => {}, confirmer: async () => accepte, notifier: () => {},
          paiementsAndroidCoupes: async () => false, demanderConditions: async () => true });
        appels[platform] = await achat.acheter('test');
      }
    } finally { globalThis.fetch = vieuxFetch; }
    return appels;
  };
  for (const raison of ['complet', 'pool_vide']) {
    const sansInscription = await scenario({ raison, accepte: false });
    ok(sansInscription.stripe === 0 && sansInscription.store === 0, `${raison} : ni Stripe, ni la feuille d'achat Apple / Google`);
    ok(sansInscription.web.etat === 'refuse' && !sansInscription.rpc.includes('cloud_attente_inscrire_moi'), `${raison}, « non » : rien de plus, aucune inscription`);
    const avec = await scenario({ raison, accepte: true, rpc: (nom) => nom === 'cloud_attente_inscrire_moi' ? { data: { ok: true, attente: { rang: 2 } } } : { data: null } });
    ok(avec.stripe === 0 && avec.store === 0 && avec.web.etat === 'attente' && /n° 2/.test(avec.web.message) && /notification/.test(avec.web.message) && !/mail/i.test(avec.web.message),
      `${raison}, « oui » : inscrit(e), prévenu(e) par notification (jamais un mail), rang dit`);
  }

  console.log('\n2. L\'identifiant d\'appareil');
  const m = new Map();
  const st = { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) };
  const id1 = A.identifiantAppareil(st);
  ok(id1.startsWith('app-') && A.identifiantAppareil(st) === id1, 'stable sur l\'appareil (gardé localement)');
  ok(A.identifiantAppareil({ getItem: () => { throw new Error('privé'); } }) === '', 'stockage refusé → vide (la base répond « appareil_inconnu » : sans essai, jamais un faux verrou)');

  console.log('\n3. Les drapeaux');
  ok(!('CLOUD_OFFER_ENABLED' in C) && C.cloudOffreOuverte() === false && C.cloudOfferVisible('x') === false, 'interrupteur serveur non lu (= fermé) : offre fermée à tous (hors témoins)');
  // (30/10, lot D, Nico : « drapeau PAR COMPTE ») Aucun identifiant écrit en dur : un témoin porte
  // profiles.beta_flags.cloud = true, lu par chargerTemoinCloud. Personne d'autre.
  const NICO = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  ok(Array.isArray(C.CLOUD_TEMOINS) && C.CLOUD_TEMOINS.length === 0 && Array.isArray(C.CLOUD_OFFRE_TEMOINS) && C.CLOUD_OFFRE_TEMOINS.length === 0, 'listes écrites en dur : VIDES');
  ok(Object.isFrozen(C.CLOUD_TEMOINS) && Object.isFrozen(C.CLOUD_OFFRE_TEMOINS), 'listes figées (aucun ajout à l\'exécution)');
  ok(C.cloudConnexionVisible(NICO) === false && C.cloudOfferVisible(NICO) === false, 'avant la lecture du drapeau : même Nico ne voit rien');
  const baseFausse = (flags) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { beta_flags: flags }, error: null }) }) }) }) });
  ok(await C.chargerTemoinCloud(baseFausse({ cloud: true }), NICO) === true && C.cloudConnexionVisible(NICO) === true && C.cloudOfferVisible(NICO) === true, 'drapeau vrai en base → CE compte voit « Me connecter » et l\'offre');
  const autres = ['x', '', undefined, null, 0, NICO.toUpperCase(), `${NICO} `, 'f44b5917-bccc-4431-ba41-f40571a2ed19', '00000000-0000-0000-0000-000000000000'];
  ok(autres.every((u) => C.cloudConnexionVisible(u) === false && C.cloudOfferVisible(u) === false), 'tout autre compte (casse, espace, voisin, vide, null) : NON, partout');
  ok(await C.chargerTemoinCloud(baseFausse({ cloud: 'true' }), 'u2') === false && C.cloudOfferVisible('u2') === false, 'drapeau non booléen → non');
  ok(await C.chargerTemoinCloud(baseFausse({}), NICO) === false && C.cloudOfferVisible(NICO) === false, 'drapeau retiré → l\'écran se referme pour ce compte');
  ok(await C.chargerTemoinCloud({ from: () => { throw new Error('réseau'); } }, NICO) === false, 'lecture impossible → non (jamais une exception)');
  // (30/10, lot D, Nico : « un bouton Me connecter par plateforme ») — pour le compte témoin, en test.
  ok(C.CLOUD_PLATEFORMES_CONNEXION.map((p) => p.id).join(',') === 'vinted,leboncoin,beebs,depop', 'plateformes proposées au témoin : Vinted, Leboncoin, Beebs, Depop (une ligne chacune, eBay à part)');
  // (07/11, décision de Nico, voie b) Plus aucun domaine fixe : cloud.fillsell.app n'a plus ni serveur ni DNS.
  ok(C.CLOUD_DOMAINE === undefined, 'aucun domaine fixe exporté (cloud.fillsell.app retiré, 07/11)');

  console.log('\n4. Les mots');
  const INTERDITS = [/Beebs/i, /Opla/i, /p[ée]pite/i, /\bproxy\b/i, /\bIP\b/, /serveur Cloud/i, /formule payante/i, /\bvous\b/i];
  for (const lang of ['fr', 'en']) {
    const T = Tx.textesConnexion(lang);
    const tout = Object.values(T).map((v) => (typeof v === 'function' ? v('appareil_deja_vu') : v)).join(' ');
    ok(INTERDITS.every((r) => !r.test(tout)), `${lang} : aucune plateforme non prouvée, aucune phrase technique, tutoiement`);
    // (07/11, décision de Nico) Montants en anglais au format anglais : « €24.99 » en anglais, « 24,99 € » en français.
    ok(lang === 'en' ? (/€24\.99/.test(T.sansEssai('essai_deja_pris')) && !/24,99/.test(T.sansEssai('essai_deja_pris'))) : /24,99.€/.test(T.sansEssai('essai_deja_pris')),
      `${lang} : le prix est dit (${lang === 'en' ? '€24.99' : '24,99 €'} TTC)`);
  }

  console.log('\n5. Le câblage dans App');
  const app = lire('src/App.jsx');
  // (05/11 soir, phase 3 point 3) La vente du Cloud : drapeau levé ET téléphone en France, ou témoin (cloudOffreVendable).
  ok(/onCloudSeul=\{cloudOffreVendable\(user\?\.id\)\?/.test(app) && /onAjouterCloud=\{cloudOffreVendable\(user\?\.id\)\?/.test(app), 'onCloudSeul / onAjouterCloud : seulement drapeau levé (et en France, ou témoin)');
  ok(/actions=\{actionsCloud\}/.test(app) && /actionsCloud=\{actionsCloud\}/.test(app), 'HoteCloud et Réglages reçoivent les gestes (arrêter compris)');
  ok(/meConnecterOuvert&&user&&cloudConnexionVisible\(user\.id\)/.test(app), '« Me connecter » monté seulement pour un témoin ou drapeau levé');
  ok(/if\(opts\?\.cloud===true&&cloudOffreVendable\(user\?\.id\)\)/.test(app), 'formule + option : seulement drapeau levé (et en France, ou témoin), sinon le parcours d\'avant, mot pour mot');
  const ecran = lire('src/cloud/MeConnecterCloud.jsx');
  ok(/wss:\/\/\$\{domaine\}\/connexion\/ws/.test(ecran) && !/location\.href|window\.open/.test(ecran), 'l\'écran ouvre la seule connexion (aucune navigation, aucun lien libre)');
  // (07/11, voie b) L'adresse = le serveur du compte, jamais un repli : illisible → reprise bornée, comme une coupure.
  const ecranCode = ecran.replace(/\/\/.*$/gm, '');
  ok(!/cloud\.fillsell\.app|CLOUD_DOMAINE/.test(ecranCode), 'aucun repli codé vers cloud.fillsell.app (07/11)');
  ok(/return null;\s*\}/.test(ecranCode) && /if \(!domaine\) \{ if \(!finale\) reprendre\(\); return; \}/.test(ecranCode), 'serveur du compte illisible : aucune adresse, reprise bornée (07/11)');
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

  // (07/11, Nico) « Restaurer les achats » retrouve aussi un Cloud pris seul (Free + Cloud), iOS et Android.
  console.log('\n6. Restaurer les achats : l\'option Cloud aussi (07/11)');
  const R = await vite.ssrLoadModule('/src/lib/restauration.js');
  const FORMULES = ['app.fillsell.premium.sub', 'app.fillsell.premium.standard', 'app.fillsell.pro2.sub', 'app.fillsell.business.sub'];
  const demain = new Date(Date.now() + 86400000).toISOString(), hier = new Date(Date.now() - 86400000).toISOString();
  const cloudSeul = R.lireRestauration([{ productIdentifier: 'app.fillsell.cloud.sub', expirationDate: demain, receipt: 'R', purchaseToken: 'G' }], FORMULES);
  ok(R.PRODUIT_CLOUD_BOUTIQUE === A.PRODUIT_CLOUD, 'le produit lu = le produit vendu (app.fillsell.cloud.sub)');
  ok(cloudSeul.isPremium === false && cloudSeul.cloud?.actif === true && cloudSeul.cloud.receipt === 'R' && cloudSeul.cloud.purchaseToken === 'G',
    'Free + Cloud : aucune formule, l\'option ACTIVE est retrouvée (avant : « Aucun achat actif trouvé »)');
  const lesDeux = R.lireRestauration([{ productIdentifier: 'app.fillsell.cloud.sub', isActive: true }, { productIdentifier: 'app.fillsell.pro2.sub', isActive: true, receipt: 'R2' }], FORMULES);
  ok(lesDeux.isPremium === true && lesDeux.productId === 'app.fillsell.pro2.sub' && lesDeux.cloud?.actif === true, 'formule + Cloud : les deux retrouvées');
  ok(R.lireRestauration([{ productIdentifier: 'app.fillsell.cloud.sub', expirationDate: hier }], FORMULES).cloud?.actif === false, 'Cloud échu : retrouvé mais inactif (rien à restaurer)');
  const deux = R.lireRestauration([{ productIdentifier: 'app.fillsell.premium.sub', expirationDate: hier }, { productIdentifier: 'app.fillsell.business.sub', purchaseState: '1', purchaseToken: 'B' }], FORMULES);
  ok(deux.isPremium === true && deux.productId === 'app.fillsell.business.sub', 'formule : l\'ACTIVE est choisie avant une ancienne échue (avant : la première trouvée)');
  ok(R.lireRestauration([], FORMULES).cloud === null && R.lireRestauration(undefined, FORMULES).isPremium === false, 'rien dans la boutique : rien');
  const restaurerSur = async (platform, cloud, opts) => {
    const appels = [];
    const supabase = {
      functions: { invoke: async (nom, { body }) => { appels.push({ nom, body }); return { data: { success: true }, error: null }; } },
      rpc: async (nom) => { appels.push({ nom }); return { data: nom === 'cloud_etat_moi' ? { actif: true } : null }; },
      auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
    };
    const achat = A.creerAchatCloud({ supabase, supabaseUrl: 'https://x', supabaseAnonKey: 'k', user: { id: 'u', email: 'e' }, lang: 'fr', platform,
      purchasePremium: async () => ({}), ouvrirLien: async () => {}, confirmer: async () => true, notifier: () => {}, paiementsAndroidCoupes: async () => false, demanderConditions: async () => true });
    return { r: await achat.restaurer(cloud, opts), appels };
  };
  const ios = await restaurerSur('ios', cloudSeul.cloud);
  ok(ios.appels[0]?.nom === 'validate-apple-receipt' && ios.appels[0].body.option === 'cloud' && ios.appels[0].body.receipt === 'R' && ios.appels[0].body.userId === 'u',
    'iOS, Cloud seul : le reçu revalidé par le serveur en mode « cloud » (la formule du profil jamais touchée)');
  ok(ios.r.etat === 'actif' && /restauré/.test(ios.r.message) && ios.appels.some((a) => a.nom === 'cloud_etat_moi'), 'iOS : actif seulement quand le SERVEUR le dit (cloud_etat_moi)');
  const iosDeja = await restaurerSur('ios', cloudSeul.cloud, { recuDejaValide: true });
  ok(!iosDeja.appels.some((a) => a.nom === 'validate-apple-receipt') && iosDeja.r.etat === 'actif', 'iOS, formule + Cloud : le reçu déjà validé par la formule (il porte l\'option) — pas de second appel');
  const android = await restaurerSur('android', cloudSeul.cloud);
  ok(android.appels[0]?.nom === 'validate-google-purchase' && android.appels[0].body.productId === 'app.fillsell.cloud.sub' && android.appels[0].body.purchaseToken === 'G',
    'Android : le jeton Google de l\'option revalidé (validate-google-purchase, produit Cloud)');
  ok(android.r.etat === 'actif', 'Android : actif quand le serveur le dit');
  ok((await restaurerSur('ios', { actif: false })).r.etat === 'aucun' && (await restaurerSur('web', cloudSeul.cloud)).r.etat === 'aucun', 'rien d\'actif, ou sur le web : rien n\'est appelé');
  ok((await restaurerSur('android', { actif: true, purchaseToken: null })).r.etat === 'erreur', 'Android sans jeton : erreur dite, jamais un Cloud cru sur parole');
  const iap = lire('src/lib/iap.js');
  ok(/return lireRestauration\(purchases, Object\.values\(PRODUCT_IDS\)\);/.test(iap), 'restorePurchases rend la lecture pure (formule ET option)');
  const appRestaure = lire('src/App.jsx');
  const corps = appRestaure.slice(appRestaure.indexOf('async function handleIAPRestore'), appRestaure.indexOf('async function handleIAPRestore') + 4000);
  ok(/achatCloud\.restaurer\(lu\.cloud,\{recuDejaValide:platform==='ios'&&recuValide\}\)/.test(corps), 'le bouton restaure l\'option après la formule');
  ok(/\}else if\(!lu\.cloud\?\.actif\)\{\s*setToast\(\{visible:true,message:lang==='fr'\?'Aucun achat actif trouvé'/.test(corps), '« Aucun achat actif trouvé » seulement sans formule NI Cloud actif');
  const fnApple = lire('supabase/functions/validate-apple-receipt/index.ts').replace(/\r\n/g, '\n');
  const iSeul = fnApple.indexOf('if (seulementCloud) {\n        return');
  const iStatut = fnApple.indexOf('update({ is_premium: false })');
  const iRetourCloud = fnApple.indexOf('if (seulementCloud) {\n      // L\'option seule');
  const iUpdate = fnApple.indexOf('.update(update).eq("id", userId)');
  ok(/const seulementCloud = option === "cloud";/.test(fnApple) && iSeul > 0 && iSeul < iStatut, 'serveur Apple, mode « cloud », reçu invalide : on rend la main AVANT d\'écrire is_premium = false');
  ok(iRetourCloud > 0 && iRetourCloud < iUpdate && iUpdate < fnApple.indexOf('if (isFounderPurchase)'), 'serveur Apple, mode « cloud » : seule l\'option s\'écrit, rendu AVANT la formule et le Founder');
} finally {
  await vite.close();
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
