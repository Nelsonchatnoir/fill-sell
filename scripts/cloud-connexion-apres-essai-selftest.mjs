// selftest:cloud-connexion-apres-essai — (08/11/2026, urgent U1 à U5 de Nico) APRÈS L'ESSAI, LES CONNEXIONS.
//   Constat du 08/11 (premier vrai client Cloud, web mobile + Stripe) : essai démarré, poste prêt, AUCUN écran de
//   connexion — sur le web, l'essai part chez Stripe et rien ne ramenait aux connexions ; carte « installer
//   l'extension » ; « Synchroniser » a lancé quatre relevés dans le vide ; personne n'a été prévenu.
//   1. Les règles (pures) : plateformes choisies, avancement « 2 sur 4 connectées », carte, ouverture toute seule,
//      refus de « Synchroniser » (« pas encore connecté », jamais « reconnexion » pour qui ne s'est jamais connecté).
//   2. Les TROIS CANAUX mènent à l'écran de connexion : web (retour de Stripe → /app?connexion=cloud), iPhone et
//      Android (achat dans l'app : parcours d'entrée → étape des connexions ; ailleurs → « Me connecter » ouvert).
//   3. U3 : un client Cloud ne voit ni « installer l'extension » ni ce qui demande un ordinateur (écrans branchés).
//   4. U5 : les événements (écran vu avec son origine, chaque plateforme connectée) et l'alerte à support@ (pure).
//   npm run selftest:cloud-connexion-apres-essai
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  plateformesCloudChoisies, avancementConnexions, carteConnexionVisible, ouvrirConnexionToutSeul, textesConnexionsCloud,
  publierConnexionsCloud, lireConnexionsCloud, poserOuvreurConnexionCloud, connexionCloudDe, refusSyncCloud, gardeSyncCloud,
} from '../src/cloud/connexionsCloud.js';
import { messageSucces } from '../src/pages/succesAchat.js';
import {
  comptesSansConnexion, texteAlerteSansConnexion, passageSansConnexion, cleSansConnexion, DELAI_SANS_CONNEXION_MS, FENETRE_MS,
  EVENEMENT_REGISTRE, TYPE_ALERTE_SANS_CONNEXION,
} from '../supabase/functions/_shared/cloud-alerte-connexion.js';
import { ALERTE_CLOUD_DESTINATAIRE } from '../supabase/functions/_shared/cloud-alerte-nico.js';

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

// ── 1. Les règles ───────────────────────────────────────────────────────────
{
  const ch = plateformesCloudChoisies({ plateformes_vendeur: ['leboncoin', 'vinted', 'ebay'] });
  ok(JSON.stringify(ch.map((p) => p.id)) === '["vinted","leboncoin"]', 'choisies ∩ Cloud, dans l’ordre du Cloud (eBay hors Cloud)');
  ok(plateformesCloudChoisies(null).length === 4, 'rien de choisi : les 4 plateformes du Cloud');
  ok(plateformesCloudChoisies({ plateformes_vendeur: ['vinted', 'leboncoin'] }, ['leboncoin']).map((p) => p.id).join() === 'vinted', 'une plateforme fermée au pays sort');
  const quatre = plateformesCloudChoisies({ plateformes_vendeur: ['vinted', 'leboncoin', 'beebs', 'depop'] });
  const a0 = avancementConnexions({ plateformes: quatre, etats: {} });
  ok(a0.total === 4 && a0.connectees === 0 && a0.aucune && !a0.toutes, '0 sur 4 : aucune');
  const a2 = avancementConnexions({ plateformes: quatre, etats: { vinted: { connecte: true }, beebs: { connecte: false } }, isoles: ['depop'] });
  ok(a2.connectees === 2 && a2.aConnecter.map((p) => p.id).join() === 'leboncoin,beebs', '2 sur 4 (une isolée compte), Beebs tombée reste à connecter');
  const T = textesConnexionsCloud('fr');
  ok(T.avancement(a2) === '2 sur 4 connectées', 'avancement : « 2 sur 4 connectées »');
  ok(T.carteTitre === 'Connecte tes comptes pour démarrer FillSell Cloud', 'le titre de la carte, mot pour mot');
  ok(textesConnexionsCloud('en').avancement(a2) === '2 of 4 connected', 'anglais');
  ok(carteConnexionVisible({ clientCloud: true, lu: true, avancement: a2 }), 'carte : client Cloud, une plateforme choisie pas connectée');
  ok(!carteConnexionVisible({ clientCloud: false, lu: true, avancement: a2 }), 'carte : jamais hors Cloud');
  ok(!carteConnexionVisible({ clientCloud: true, lu: false, avancement: a2 }), 'carte : jamais avant lecture');
  ok(!carteConnexionVisible({ clientCloud: true, lu: true, avancement: avancementConnexions({ plateformes: quatre, etats: { vinted: { connecte: true }, leboncoin: { connecte: true }, beebs: { connecte: true }, depop: { connecte: true } } }) }), 'carte : tout connecté → rien');
  ok(ouvrirConnexionToutSeul({ clientCloud: true, lu: true, avancement: a0 }), 'écran tout seul : rien connecté, jamais ouvert ici');
  ok(!ouvrirConnexionToutSeul({ clientCloud: true, lu: true, avancement: a0, dejaOuvert: true }), '… une fois par appareil');
  ok(!ouvrirConnexionToutSeul({ clientCloud: true, lu: true, avancement: a0, parcoursEntree: true }), '… jamais par-dessus le parcours d’entrée');
  ok(!ouvrirConnexionToutSeul({ clientCloud: true, lu: true, avancement: a2 }), '… pas quand une plateforme est déjà connectée (la carte suffit)');
  ok(ouvrirConnexionToutSeul({ clientCloud: true, lu: true, avancement: a2, demande: true, dejaOuvert: true }), '… le retour de Stripe le demande : ouvert');
}
// Synchroniser (U4)
{
  const quatre = plateformesCloudChoisies(null);
  publierConnexionsCloud({ clientCloud: true, lu: true, etats: { beebs: { connecte: false } }, isoles: [], avancement: avancementConnexions({ plateformes: quatre, etats: { beebs: { connecte: false } } }) });
  const e = lireConnexionsCloud();
  ok(connexionCloudDe(e, 'vinted') === 'a_connecter' && connexionCloudDe(e, 'beebs') === 'a_reconnecter' && connexionCloudDe(e, 'ebay') === null, 'jamais connectée / tombée / hors Cloud');
  ok(refusSyncCloud(e, null, 'fr')?.texte === textesConnexionsCloud('fr').syncPasConnecte, 'Tout synchroniser sans aucune connexion : refusé');
  ok(/pas encore connecté/.test(refusSyncCloud(e, 'vinted', 'fr').texte) && !/reconne/i.test(refusSyncCloud(e, 'vinted', 'fr').texte), 'Vinted jamais connecté : « pas encore connecté », jamais « reconnexion »');
  ok(/connexion à refaire/.test(refusSyncCloud(e, 'beebs', 'fr').texte), 'Beebs tombée : « connexion à refaire »');
  ok(refusSyncCloud(e, 'ebay', 'fr') === null, 'eBay (API) : rien à refuser');
  let ouvert = null;
  poserOuvreurConnexionCloud((o) => { ouvert = o; });
  ok(gardeSyncCloud('vinted', 'fr') && ouvert === 'synchroniser', 'le refus ouvre l’écran de connexion');
  publierConnexionsCloud({ clientCloud: false, lu: true, avancement: null });
  ouvert = null;
  ok(gardeSyncCloud(null, 'fr') === null && ouvert === null, 'hors Cloud : Synchroniser inchangé');
  poserOuvreurConnexionCloud(null);
  publierConnexionsCloud(null);
}

// ── 2. Les trois canaux ─────────────────────────────────────────────────────
const app = lire('src/App.jsx');
{
  const m = messageSucces({ produit: 'cloud', essai: '1' }, 'fr');
  ok(m.vers === '/app?connexion=cloud' && m.bouton === 'Connecter mes comptes →', 'WEB : la page de retour de Stripe (Cloud) mène à /app?connexion=cloud');
  ok(messageSucces({ produit: 'pro' }, 'fr').vers === undefined, 'WEB : les formules gardent « Accéder à l’app »');
  ok(/nav\(m\.vers \?\? "\/app"\)/.test(lire('src/pages/Success.jsx')), 'WEB : le bouton suit m.vers');
  ok(/searchParams\.get\('connexion'\)==='cloud'/.test(app) && /origine=demande\?'retour_stripe':'auto'/.test(app), 'WEB : l’app lit ?connexion=cloud et ouvre l’écran (retour_stripe)');
  ok(/useConnexionsCloud\(user\?\.id\?\?null,clientCloud\|\|retourStripeCx,plateformesFermees\)/.test(app), 'WEB : le retour de Stripe lit les plateformes choisies même avant le webhook');
  const etape = lire('src/entree/EtapeCloud.jsx');
  ok(/onAller\('cloud_connexion'\)/.test(etape) && /id: 'cloud_connexion'/.test(lire('src/entree/plan.js')), 'iPHONE / ANDROID : le parcours d’entrée enchaîne sur l’étape des connexions (inchangé)');
  ok(/if\(r\?\.etat==='actif'\)ouvrirMeConnecter\('achat'\)/.test(app), 'iPHONE / ANDROID : un achat hors parcours ouvre « Me connecter » (inchangé)');
  ok(/ouvrirConnexionToutSeul\(\{clientCloud,lu:cxCloud\.lu,avancement:cxCloud\.avancement,dejaOuvert:deja,parcoursEntree:showOnboardingFlow\}\)/.test(app), 'TOUS : après le parcours, rien de connecté → l’écran s’ouvre tout seul, une fois');
  ok(/choisies=\{cxOrigine&&cxCloud\.lu\?cxCloud\.plateformes\.map\(\(p\)=>p\.id\):null\} origine=\{cxOrigine\}/.test(app), 'l’écran montre les plateformes choisies quand il est ouvert par ce parcours (Réglages : toutes, inchangé)');
  const me = lire('src/cloud/MeConnecterCloud.jsx');
  ok(/data-cloud-avancement/.test(me) && /plateformesEcran\.map/.test(me), 'l’écran : une ligne par plateforme choisie + « N sur M connectées »');
}
// U2 : la carte
{
  ok(/porteCx&&\(tab===0\|\|\(tab===1&&!espaceMessagerie\)\)&&!meConnecterOuvert&&carteConnexionVisible\(/.test(app), 'U2 : la carte en haut du Tableau et du Stock');
  ok(/ouvrirMeConnecter\(o\)/.test(app) && /carte_tableau/.test(app) && /carte_stock/.test(app), 'U2 : elle ouvre l’écran de connexion (origine tracée)');
}

// ── 3. U3 : rien qui demande un ordinateur ─────────────────────────────────
{
  ok(/const extensionNeverSeenEcran=clientCloud\?false:/.test(app), 'U3 : « extension jamais vue » vaut false pour un client Cloud');
  ok(!/extensionAbsente=\{extensionNeverSeen===true\}/.test(app) && !/extensionNeverSeen=\{extensionNeverSeen\}/.test(app), 'U3 : aucun onglet ne reçoit l’ancienne valeur');
  const stock = lire('src/tabs/StockTab.jsx');
  ok(/else if \(!compteCloud && shouldShowExtensionReminder\(\)\)/.test(stock), 'U3 : Stock — pas de rappel « extension requise »');
  ok(/if\(!compteCloud&&shouldShowExtensionReminder\(\)\)/.test(lire('src/tabs/LensTab.jsx')), 'U3 : Lens — pas de rappel « extension requise »');
  ok(/<JobStatusModal\n\s*\/\/[^\n]*\n\s*userId=\{user\?\.id\?\?null\}/.test(stock), 'U3 : la fiche « statut » connaît le compte (plus de « Ouvre Chrome »)');
  ok(/if \(isMobile && !stockVide && !compteCloud\)/.test(stock) && /retard\.enRetard && !compteCloud/.test(stock), 'U3 : alertes de l’extension et horloge de l’ordinateur : jamais pour un client Cloud');
  ok(/blocage&&source==='stock_empty'&&!compteCloudSync\?\(/.test(stock) && /const MESSAGE_BLOCAGE = compteCloudSync/.test(stock), 'U3 : synchro — ni carte d’installation, ni phrase d’ordinateur');
  const bloc = lire('src/stock/BlocSynchro.jsx');
  ok(/const extVue = compteCloud \|\|/.test(bloc), 'U3 : BlocSynchro — jamais « Extension requise » pour un client Cloud');
  ok(/pfCloud\(t\.p\) \? \{ cle: t\.p, platform: t\.p, titre: titreNonConnecteCloud\(t\)/.test(bloc), 'U3-U4 : « pas connecté » d’une plateforme du Cloud → « Connecter mes comptes »');
  ok(/compteCloud \? TC\.titreCloudPasPris : T\.titreEndormie/.test(bloc), 'U3 : « ton ordinateur n’a pas répondu » → FillSell Cloud');
  const bouton = lire('src/components/BoutonMeConnecter.jsx');
  ok(/if \(compteCloud && PLATEFORMES_CLOUD\.includes\(platform\) && motif === MOTIFS\.CONNEXION\)/.test(bouton) && /ouvrirConnexionCloud\('me_connecter'\)/.test(bouton), 'U3 : « Me connecter » d’un client Cloud ouvre la connexion Cloud (partout)');
  ok(/parCloud && PLATEFORMES_CLOUD\.includes\(p\)/.test(lire('src/utils/ebayCompte.js')), 'U3 : publication — les plateformes du Cloud partent « de nos serveurs » (aucun « ordinateur allumé »)');
  ok(/clientCloud\n?\s*\? \(fr \? "Tu pilotes depuis ton téléphone, FillSell Cloud/.test(lire('src/ecrans/vides/TableauVide.jsx')), 'U3 : Tableau vide — la phrase Cloud');
}
// U4 : les gestes de relevé
{
  const rel = lire('src/annonces/useReleveAnnonces.js');
  ok(/const pasConnecte = gardeSyncCloud\(platform, lang\);/.test(rel) && /const pasConnecte = gardeSyncCloud\(null, lang\);/.test(rel), 'U4 : relevé d’une plateforme et « Tout synchroniser » gardés');
  ok(/refusSyncCloud\(lireConnexionsCloud\(\), p, lang\)/.test(rel) && /if \(aConnecterCloud\) ouvrirConnexionCloud\('synchroniser'\)/.test(rel), 'U4 : une plateforme pas connectée sautée, l’écran ouvert une fois');
  ok(/const pasConnecte = gardeSyncCloud\('vinted', lang\);/.test(lire('src/tabs/StockTab.jsx')), 'U4 : la synchro Vinted gardée aussi');
}

// ── 4. U5 : événements et alerte ───────────────────────────────────────────
{
  ok(/logTunnel\('cloud_connexion_auto'/.test(app) && /logTunnel\('cloud_connexion_plateforme'/.test(app), 'U5 : écran ouvert tout seul et chaque plateforme connectée tracés');
  ok(/cloud_me_connecter_ouvert', \{ visible: vu\.visible, \.\.\.\(origine \? \{ origine \} : \{\}\) \}/.test(lire('src/cloud/MeConnecterCloud.jsx')), 'U5 : « écran vu » avec son origine');
  const T0 = Date.parse('2026-11-08T14:16:08Z');
  const comptes = [
    { id: 'u1', email: 'a@b.fr', cloud_voie: true, cloud_essai_debut: new Date(T0).toISOString(), cloud_canal: 'stripe', platform_settings: { plateformes_vendeur: ['vinted', 'leboncoin', 'beebs', 'depop'] } },
    { id: 'u2', email: 'c@d.fr', cloud_voie: true, cloud_essai_debut: new Date(T0).toISOString(), cloud_canal: 'apple', platform_settings: null },
    { id: 'u3', email: 'e@f.fr', cloud_voie: true, cloud_essai_debut: new Date(T0).toISOString(), platform_settings: { vinted: { cloud_isole: { connecte: true } } } },
    { id: 'u4', email: 'g@h.fr', cloud_voie: false, cloud_essai_debut: new Date(T0).toISOString() },
  ];
  const coffre = [{ user_id: 'u1', plateforme: 'fillsell', connecte: true }, { user_id: 'u2', plateforme: 'vinted', connecte: true }];
  const c29 = comptesSansConnexion({ comptes, coffre, maintenant: T0 + DELAI_SANS_CONNEXION_MS - 60_000 });
  ok(c29.length === 0, 'U5 : rien avant 30 min');
  const c31 = comptesSansConnexion({ comptes, coffre, vus: [{ user_id: 'u1', feature: 'cloud_me_connecter_ouvert', created_at: new Date(T0 + 60_000).toISOString() }], maintenant: T0 + 31 * 60_000 });
  ok(c31.length === 1 && c31[0].userId === 'u1' && c31[0].ecranVu === 1 && c31[0].minutes === 31, 'U5 : 31 min, 0 plateforme (la ligne « fillsell » ne compte pas) → alerte ; connectée / isolée / pas Cloud → rien');
  ok(comptesSansConnexion({ comptes, coffre, maintenant: T0 + FENETRE_MS + 1 }).length === 0, 'U5 : un vieil essai n’alerte jamais en retard');
  const t = texteAlerteSansConnexion(c31[0], T0 + 31 * 60_000);
  ok(t.to === ALERTE_CLOUD_DESTINATAIRE && t.to === 'support@fillsell.app' && t.type === TYPE_ALERTE_SANS_CONNEXION, 'U5 : à support@fillsell.app, type à part');
  ok(/0 plateforme connectée 31 min/.test(t.sujet) && /a@b\.fr/.test(t.sujet) && /Mail au client/.test(t.html) && /aucun/.test(t.html), 'U5 : sujet clair ; « aucun mail au client » écrit');
  ok(cleSansConnexion(comptes[0].cloud_essai_debut).startsWith('alerte:zero_connexion:') && EVENEMENT_REGISTRE === 'essai_debut', 'U5 : clé à part dans le registre (événement autorisé par la contrainte)');
  // Le passage : une alerte par essai, rejouée = rien ; envoi raté = clé libérée ; aperçu = rien réservé.
  const pris = new Set(); const envois = []; const liberees = [];
  const deps = {
    lireComptes: async () => comptes, lireCoffre: async () => coffre, lireVus: async () => [],
    reserver: async ({ userId, cle }) => { const k = `${userId}|${cle}`; if (pris.has(k)) return 'deja'; pris.add(k); return 'pris'; },
    liberer: async ({ userId, cle }) => { pris.delete(`${userId}|${cle}`); liberees.push(userId); },
    noter: async () => {}, envoyer: async (m) => { envois.push(m); return { envoye: true }; },
  };
  const b1 = await passageSansConnexion({ deps, maintenant: T0 + 31 * 60_000 });
  const b2 = await passageSansConnexion({ deps, maintenant: T0 + 91 * 60_000 });
  ok(b1.envoyes === 1 && b2.envoyes === 0 && b2.deja === 1 && envois.length === 1 && envois[0].to === 'support@fillsell.app', 'U5 : un mail par essai, le passage suivant ne refait rien');
  const ap = await passageSansConnexion({ deps: { ...deps, reserver: async () => { throw new Error('jamais en aperçu'); } }, maintenant: T0 + 31 * 60_000, apercu: true });
  ok(ap.apercu && ap.a_alerter === 1 && ap.envoyes === 0, 'U5 : aperçu — la cible, rien réservé ni envoyé');
  const pris2 = new Set();
  const b3 = await passageSansConnexion({ deps: { ...deps, reserver: async ({ userId, cle }) => { pris2.add(`${userId}|${cle}`); return 'pris'; }, liberer: async ({ userId, cle }) => { pris2.delete(`${userId}|${cle}`); }, envoyer: async () => ({ envoye: false, motif: 'resend' }) }, maintenant: T0 + 31 * 60_000 });
  ok(b3.echecs === 1 && pris2.size === 0, 'U5 : envoi raté → clé libérée (renvoyée au passage suivant)');
  const b4 = await passageSansConnexion({ deps: { ...deps, lireCoffre: async () => { throw new Error('illisible'); } }, maintenant: T0 + 31 * 60_000 });
  ok(b4.erreur && b4.envoyes === 0, 'U5 : coffre illisible → AUCUNE alerte (jamais un faux « 0 »)');
  const tunnel = lire('supabase/functions/email-tunnel/index.ts');
  const blocHoraire = tunnel.slice(tunnel.indexOf('if (body?.job_relaunch === true) {'));
  ok(/const bilanZero = await alerteSansConnexion\(dryRun\);/.test(blocHoraire) && blocHoraire.indexOf('const bilanZero') < blocHoraire.indexOf('RELANCE_H_DEBUT || h >= RELANCE_H_FIN'),'U5 : branché au passage horaire, avant la fenêtre de nuit des mails clients');
  ok(!/to: *c\.email|to: *a\.email/.test(lire('supabase/functions/_shared/cloud-alerte-connexion.js')), 'U5 : jamais l’adresse du client en destinataire');
}

console.log(`\nTout est vert — ${n} contrôles.`);
