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
  ok(sans.continuer && sans.essai === false && /tout de suite/.test(sans.confirmation) && /24,99.€ prélevés aujourd'hui/.test(sans.confirmation), 'essai refusé → on DEMANDE avant de payer (13/11, décision de Nico : « 24,99 € prélevés aujourd’hui », avant « à 24,99 €/mois »)');
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
  // (08/11, points 0 et 1 de Nico) Plus de « formule + option » d'un geste : la formule seule, puis l'étape 2 nommée.
  ok(!/formulePuisCloud/.test(app) && /if\(opts\?\.cloudEnsuite===true&&cloudOffreVendable\(user\?\.id\)\)garderCloudEnsuite\(/.test(app),
    'formule puis Cloud : la formule seule, l’intention gardée pour l’étape 2 (drapeau levé, en France ou témoin)');
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

  // (07/11 soir, essai TestFlight de Nico) « Arrêter » ne faisait RIEN sur un Cloud pris par Apple : l'app demandait
  // toujours au serveur, et cancel-subscription v53 (prod, 02/10) ignorait `option: 'cloud'` et répondait
  // `{ success: true }` (« No Stripe customer — is_premium=false » dans ses journaux, 18:02 UTC). Désormais l'APP
  // décide par le canal qui facture : Apple / Google → la boutique, Stripe seul → le serveur.
  console.log('\n7. L\'arrêt suit le canal qui facture (07/11 soir)');
  ok(A.voieArretCloud('apple', 'ios') === 'apple' && A.voieArretCloud('apple', 'android') === 'apple_ailleurs' && A.voieArretCloud('apple', 'web') === 'apple_ailleurs'
    && A.voieArretCloud('google', 'android') === 'google' && A.voieArretCloud('google', 'web') === 'google' && A.voieArretCloud('stripe', 'ios') === 'stripe'
    && A.voieArretCloud(null, 'ios') === 'serveur' && A.voieArretCloud('offert', 'web') === 'serveur', 'la voie : le CANAL décide (Apple → Apple, Google → Google, Stripe → FillSell), l\'appareil seulement pour ouvrir');
  ok(A.LIEN_GOOGLE === 'https://play.google.com/store/account/subscriptions?sku=app.fillsell.cloud.sub&package=app.fillsell.app', 'Google : la page d\'abonnements de Play, sur le produit Cloud');
  ok(A.LIEN_APPLE === 'https://apps.apple.com/account/subscriptions', 'Apple : la page d\'abonnements de l\'App Store (repli de la feuille native)');
  const arretSur = async ({ platform, canalBase = null, reponse = {}, gerer = 'ok', lienEchoue = false, geste = 'arreter', canal }) => {
    const appels = { fetch: [], liens: [], gerer: 0, journal: [], lectures: 0 };
    const supabase = {
      auth: { getSession: async () => ({ data: { session: { access_token: 't' } } }) },
      from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => { appels.lectures++; return { data: { cloud_canal: canalBase }, error: null }; } }) }) }),
      rpc: async () => ({ data: null }),
    };
    const vieuxFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => { appels.fetch.push({ url, corps: JSON.parse(init?.body ?? '{}') }); return { json: async () => reponse }; };
    try {
      const achat = A.creerAchatCloud({ supabase, supabaseUrl: 'https://x', supabaseAnonKey: 'k', user: { id: 'u', email: 'e' }, lang: 'fr', platform,
        purchasePremium: async () => ({}), confirmer: async () => true, notifier: () => {}, paiementsAndroidCoupes: async () => false, demanderConditions: async () => true,
        ouvrirLien: async (u) => { if (lienEchoue) throw new Error('lien'); appels.liens.push(u); },
        gererAbonnements: gerer === null ? null : async () => { appels.gerer++; if (gerer === 'refus') throw new Error('refus'); },
        journal: (ev, meta) => appels.journal.push({ ev, meta }) });
      appels.r = await achat[geste](canal === undefined ? {} : { canal });
    } finally { globalThis.fetch = vieuxFetch; }
    return appels;
  };
  const SANS_PROMESSE = /rien n.est factur|tout de suite|imm[ée]diat|c.est arrêté/i;
  const iosApple = await arretSur({ platform: 'ios', canal: 'apple' });
  ok(iosApple.gerer === 1 && iosApple.fetch.length === 0 && iosApple.liens.length === 0, 'iPhone, Cloud Apple : la feuille d\'abonnements d\'Apple s\'ouvre (StoreKit) — AUCUN appel au serveur');
  ok(iosApple.r.etat === 'boutique' && iosApple.r.voie === 'apple' && /abonnements Apple/.test(iosApple.r.message) && /dès qu.Apple aura confirmé/.test(iosApple.r.message) && !SANS_PROMESSE.test(iosApple.r.message),
    'iPhone, Cloud Apple : on dit où l\'arrêter et que FillSell le verra dès qu\'Apple l\'aura confirmé — jamais « c\'est arrêté » ni « rien n\'est facturé »', iosApple.r.message);
  ok(iosApple.journal.map((j) => j.ev).join(',') === 'cloud_arret_clic,cloud_arret_issue' && iosApple.journal[0].meta.canal === 'apple' && iosApple.journal[1].meta.etat === 'boutique',
    'le geste laisse sa trace (usage_logs cloud_arret_clic puis cloud_arret_issue) — le 07/11, aucune ligne nulle part', JSON.stringify(iosApple.journal));
  // (08/11, ordre de Nico) iPhone : la feuille du SYSTÈME seulement — plus de repli silencieux vers une page web ; si
  // elle refuse, l'échec est DIT avec le chemin exact (l'écran propose « Réessayer »), sans appel au serveur.
  const iosRefus = await arretSur({ platform: 'ios', canal: 'apple', gerer: 'refus' });
  ok(iosRefus.gerer === 1 && iosRefus.liens.length === 0 && iosRefus.r.etat === 'erreur' && iosRefus.r.voie === 'apple' && iosRefus.fetch.length === 0
    && /Réglages › ton nom › Abonnements › FillSell Cloud/.test(iosRefus.r.message) && /réessaie/.test(iosRefus.r.message),
    'iPhone, feuille native refusée : jamais une page web en silence — le chemin exact (Réglages › ton nom › Abonnements › FillSell Cloud) et « réessaie »', iosRefus.r.message);
  const iosSansModule = await arretSur({ platform: 'ios', canal: 'apple', gerer: null });
  ok(iosSansModule.r.etat === 'erreur' && iosSansModule.liens.length === 0 && /Réglages › ton nom › Abonnements/.test(iosSansModule.r.message), 'iPhone sans module natif : l\'échec est dit, jamais un silence', iosSansModule.r.message);
  const androidGoogle = await arretSur({ platform: 'android', canal: 'google' });
  ok(androidGoogle.gerer === 1 && androidGoogle.liens.length === 0 && androidGoogle.fetch.length === 0 && androidGoogle.r.etat === 'boutique' && /Google Play/.test(androidGoogle.r.message) && !SANS_PROMESSE.test(androidGoogle.r.message),
    'Android, Cloud Google : la page d\'abonnements du Play Store pour l\'app (intention native), aucun appel au serveur, aucune promesse', androidGoogle.r.message);
  const androidRepli = await arretSur({ platform: 'android', canal: 'google', gerer: 'refus' });
  ok(androidRepli.gerer === 1 && androidRepli.liens[0] === A.LIEN_GOOGLE && androidRepli.r.etat === 'boutique', 'Android, intention refusée : le lien Play du produit Cloud');
  const androidEchec = await arretSur({ platform: 'android', canal: 'google', gerer: 'refus', lienEchoue: true });
  ok(androidEchec.r.etat === 'erreur' && /Paiements et abonnements › Abonnements › FillSell Cloud/.test(androidEchec.r.message), 'Android, rien ne s\'ouvre : le chemin exact, jamais un silence', androidEchec.r.message);
  const webGoogle = await arretSur({ platform: 'web', canal: 'google' });
  ok(webGoogle.gerer === 0 && webGoogle.liens[0] === A.LIEN_GOOGLE && webGoogle.r.etat === 'boutique', 'web, Cloud Google : le lien Play du produit Cloud');
  const webApple = await arretSur({ platform: 'web', canal: 'apple' });
  ok(webApple.liens.length === 0 && webApple.gerer === 0 && webApple.fetch.length === 0 && webApple.r.voie === 'apple_ailleurs' && /iPhone ou ton iPad/.test(webApple.r.message),
    'web, Cloud Apple : rien à ouvrir ici, on dit où l\'arrêter (iPhone / iPad), aucun appel au serveur', webApple.r.message);
  const lu = await arretSur({ platform: 'ios', canalBase: 'apple' });
  ok(lu.lectures === 1 && lu.gerer === 1 && lu.fetch.length === 0, 'canal non transmis par l\'écran : relu en base (profiles.cloud_canal) au moment du geste');
  const v53 = await arretSur({ platform: 'web', canal: 'stripe', reponse: { success: true, period_end: null } });
  ok(v53.fetch[0]?.url === 'https://x/functions/v1/cancel-subscription' && v53.fetch[0].corps.option === 'cloud' && v53.r.etat === 'non_confirme' && /pas été confirmé/.test(v53.r.message),
    'Stripe, serveur d\'avant l\'option (v53 : { success: true } sans « option ») : JAMAIS pris pour un arrêt — on le dit', v53.r.message);
  const essaiStripe = await arretSur({ platform: 'web', canal: 'stripe', reponse: { success: true, option: 'cloud', essai_arrete: true } });
  ok(essaiStripe.r.etat === 'ok' && essaiStripe.r.essai_arrete === true && essaiStripe.gerer === 0 && essaiStripe.liens.length === 0, 'Stripe : cancel-subscription { option: \'cloud\' } arrête vraiment (essai arrêté, confirmé par le serveur)');
  // (08/11) « aucun prélèvement » à l'écran SEULEMENT si la réponse de Stripe (relue par cancel-subscription) le porte.
  ok(!/prélèvement/.test(essaiStripe.r.message ?? ''), 'Stripe, essai arrêté SANS la confirmation des factures : l\'app ne dit pas « aucun prélèvement »', essaiStripe.r.message);
  const essaiConfirme = await arretSur({ platform: 'web', canal: 'stripe', reponse: { success: true, option: 'cloud', essai_arrete: true, aucun_prelevement: true } });
  ok(essaiConfirme.r.etat === 'ok' && /aucun prélèvement/.test(essaiConfirme.r.message), 'Stripe, essai arrêté ET factures à 0 relues chez Stripe : « aucun prélèvement »', essaiConfirme.r.message);
  const programme = await arretSur({ platform: 'web', canal: 'stripe', reponse: { success: true, option: 'cloud', period_end: '08/12/2026' } });
  ok(programme.r.etat === 'ok' && /jusqu'au 08\/12\/2026/.test(programme.r.message), 'Stripe, période payée : la date de fin confirmée par Stripe est dite', programme.r.message);
  const deja = await arretSur({ platform: 'web', canal: 'stripe', reponse: { success: true, option: 'cloud', deja: true } });
  ok(deja.r.etat === 'rien' && /rien à arrêter/.test(deja.r.message), 'Stripe, aucun abonnement en cours : on le dit (avant : un succès muet)');
  const auServeur = await arretSur({ platform: 'ios', canal: undefined, canalBase: null, reponse: { success: false, error: 'resilier_dans_la_boutique', canal: 'apple' } });
  ok(auServeur.fetch.length === 1 && auServeur.gerer === 1 && auServeur.r.etat === 'boutique', 'canal illisible : le serveur décide ; s\'il dit « boutique », la boutique s\'ouvre');
  const erreur = await arretSur({ platform: 'web', canal: 'stripe', reponse: { error: 'x' } });
  ok(erreur.r.etat === 'erreur' && /Réessaie/.test(erreur.r.message), 'Stripe, erreur du serveur : l\'échec est dit');
  const garde = await arretSur({ platform: 'ios', canal: 'apple', geste: 'reprendre' });
  ok(garde.gerer === 1 && garde.fetch.length === 0 && /se garde dans tes abonnements Apple/.test(garde.r.message) && garde.journal[0].ev === 'cloud_reprise_clic',
    '« Garder le Cloud » d\'un Cloud Apple : dans la boutique, jamais par le serveur (v53 aurait mis is_premium à faux)', garde.r.message);
  const gardeStripe = await arretSur({ platform: 'web', canal: 'stripe', geste: 'reprendre', reponse: { success: true, option: 'cloud', reprise: true } });
  ok(gardeStripe.fetch[0]?.corps.reprendre === true && gardeStripe.r.etat === 'ok', '« Garder le Cloud » Stripe : cancel-subscription { reprendre: true }, comme avant');
  for (const lang of ['fr', 'en']) {
    const TT = Tx.textesConnexion(lang);
    const phrases = ['apple', 'google', 'apple_ailleurs'].flatMap((v) => [TT.arretBoutique(v), TT.repriseBoutique(v)]);
    ok(phrases.every((p) => !SANS_PROMESSE.test(p) && !/nothing (is|will be) (billed|charged)|right away|immediately|it is stopped/i.test(p)) && phrases.every((p) => /FillSell/.test(p)),
      `${lang} : les messages de la boutique ne promettent ni l'arrêt immédiat ni « rien facturé » ; ils disent que FillSell suivra`, phrases.join(' | '));
  }
  const appArret = lire('src/App.jsx');
  ok(/gererAbonnements:isNative\?gererAbonnementsBoutique:null,/.test(appArret) && /journal:\(evenement,metadata\)=>logTunnel\(evenement,metadata\),/.test(appArret), 'App : la feuille native des boutiques et la trace du geste sont branchées');
  ok(/arreter:async\(opts\)=>\{const r=await achatCloud\.arreter\(\{canal:opts\?\.canal\}\);/.test(appArret) && /reprendre:async\(opts\)=>\{const r=await achatCloud\.reprendre\(\{canal:opts\?\.canal\}\);/.test(appArret), 'App : le canal de l\'écran passe jusqu\'à l\'achat');
  ok(/export const gererAbonnementsBoutique = \(\) => NativePurchases\.manageSubscriptions\(\);/.test(lire('src/lib/iap.js')), 'iap.js : NativePurchases.manageSubscriptions (iOS : AppStore.showManageSubscriptions)');
  const bloc = lire('src/cloud/BlocCloudReglages.jsx');
  ok(/await actions\.arreter\(\{ canal \}\)/.test(bloc) && /onClick=\{\(\) => actions\.reprendre\(\{ canal \}\)\}/.test(bloc) && !/onClick=\{actions\.(arreter|reprendre)\}/.test(bloc),
    'Réglages : le geste reçoit le canal, jamais l\'événement du clic');
  ok(/canal=\{lecture\.profil\?\.cloud_canal \?\? null\}/.test(bloc) && /plateforme=\{c\?\.plateforme \?\? 'web'\}/.test(bloc), 'Réglages : le canal vient de la lecture Cloud (useCloudReglages), la plateforme de l\'hôte');
  const veille = lire('src/cloud/FinEssaiCloud.jsx'), hote = lire('src/cloud/HoteCloud.jsx');
  ok(/await actions\.arreter\(\{ canal \}\)/.test(veille) && /r\?\.etat === 'boutique' \? 'boutique'/.test(veille) && /canal=\{lecture\.profil\?\.cloud_canal \?\? null\} plateforme=\{plateforme\}/.test(hote),
    'la veille de la fin d\'essai : même voie, et « boutique » n\'est jamais « c\'est arrêté »');
} finally {
  await vite.close();
}
console.log(`\n${ko === 0 ? 'Tout est vert' : `${ko} ÉCHEC(S)`} — ${n} contrôles.`);
process.exit(ko === 0 ? 0 : 1);
