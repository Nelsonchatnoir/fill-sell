// ═══════════════════════════════════════════════════════════════════════════
// Autotest — UN SEUL état eBay, pour tous les écrans et pour le serveur (17/10)
//   node --import ./scripts/loader-ext.mjs scripts/ebay-etat-unique-selftest.mjs
// ═══════════════════════════════════════════════════════════════════════════
// Louis, 17/10 : la carte du Stock disait « il reste 2 étapes, à commencer par
// comment tu es payé », Réglages › Compte eBay disait « eBay est prêt, tes
// articles peuvent partir », et eBay plafonnait le compte à 0 article / 0 €.
// Trois règles, deux sources, et un plafond que personne ne lisait.
//
// Ce test EXÉCUTE la règle livrée (supabase/functions/_shared/ebay-etat-compte.js)
// et ceux qui la lisent : l'écran (src/utils/ebayParcours.js, ebayCompte.js) et
// le serveur (supabase/functions/_shared/ebay-voie.ts — Node efface les types).
// Il refuse :
//   1. un compte au plafond eBay nul (quantité OU montant) déclaré « prêt » ;
//   2. une politique qui EXISTE chez eBay sans être retenue comptée comme faite ;
//   3. un écran et le serveur qui ne disent pas la même chose du même compte ;
//   4. une phrase qui ne dit pas que c'est eBay, ou qui porte un mot interdit ;
//   5. un écran qui tire encore un verdict d'ailleurs (lignes du relevé,
//      bloque_par_etat_ebay, selling_limit lus en direct).
// Les formes de compte sont celles de la base (relevées le 17/10), sans
// aucune donnée personnelle.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const imp = (p) => import(pathToFileURL(path.join(ROOT, p)).href);
const lire = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8').split('\r\n').join('\n');

const { etatCompteEbay, plafondEbay } = await imp('supabase/functions/_shared/ebay-etat-compte.js');
const { resumeEbay, MOTS_INTERDITS_ECRAN } = await imp('src/utils/ebayParcours.js');
const { ebayCompteUtilisable, motifEbayInutilisable } = await imp('src/utils/ebayCompte.js');
const voie = await imp('supabase/functions/_shared/ebay-voie.ts');

let ko = 0;
let nb = 0;
const ok = (c, nom, d = '') => { nb++; if (c) console.log(`  ✓ ${nom}`); else { ko++; console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ''}`); } };
const json = (x) => JSON.stringify(x);

// ── LES FORMES RÉELLES ─────────────────────────────────────────────────────
// Louis (faf5021a), relevé du 17/10 09:48 : tout est vert chez eBay, deux
// politiques de paiement/retours EXISTENT mais aucune n'est retenue, et le
// plafond de vente est à 0 article / 0 €.
const SS_LOUIS = {
  inscription_vendeur: true, politiques_activees: true,
  politiques: { livraison: 4, paiement: 1, retours: 2 }, lieu_expedition: true,
  selling_limit: { amount: { currency: 'EUR', value: '0' }, quantity: 0 },
  bloque_par_etat_ebay: false, indeterminees: [],
};
// Fluxen (3b7e2361), relevé du 15/10 23:22 : tout retenu, plafond non nul.
const SS_FLUXEN = {
  inscription_vendeur: true, politiques_activees: true,
  politiques: { livraison: 1, paiement: 1, retours: 1 }, lieu_expedition: true,
  selling_limit: { amount: { currency: 'EUR', value: '888375.61' }, quantity: 100000 },
  bloque_par_etat_ebay: false, indeterminees: [],
};
// Romain (22/09) : des politiques chez eBay, aucune retenue, lieu manquant.
const SS_ROMAIN = { inscription_vendeur: true, politiques_activees: true, politiques: { livraison: 2, paiement: 1, retours: 1 }, lieu_expedition: false };
// Les 14 comptes à l'inscription vendeur pas finie : eBay ne donne aucun plafond.
const SS_INSCRIPTION = { inscription_vendeur: false, politiques_activees: null, politiques: { livraison: null, paiement: null, retours: null }, lieu_expedition: true, selling_limit: null };

// La même réalité sous ses deux formes : vue publique (app) et ligne (serveur).
const vue = (pol, ss) => ({ connecte: true, a_reconnecter: false, seller_state: ss, politiques: { fulfillment: pol[0], payment: pol[1], return: pol[2] } });
const ligne = (pol, ss, revoque = null) => ({ revoked_at: revoque, fulfillment_policy_id: pol[0], payment_policy_id: pol[1], return_policy_id: pol[2], seller_state: ss });
const TROIS = ['a', 'b', 'c'];
const CAS = {
  louis_avant_choix: [['297861005015', null, null], SS_LOUIS],
  louis_apres_choix: [TROIS, SS_LOUIS],
  fluxen: [TROIS, SS_FLUXEN],
  romain: [[null, null, null], SS_ROMAIN],
  inscription_pas_finie: [[null, null, null], SS_INSCRIPTION],
  jamais_releve: [TROIS, null],
};

console.log('\n1. LA RÈGLE');
const louis = etatCompteEbay(vue(...CAS.louis_avant_choix));
ok(louis.statut === 'bloque_par_ebay' && louis.pret === false, 'Louis (17/10) : bloqué par eBay, jamais prêt', json(louis));
ok(json(louis.manquantes) === json(['politique_paiement', 'politique_retours']) && json(louis.aChoisir) === json(['politique_paiement', 'politique_retours']),
  'Louis : paiement et retours EXISTENT chez eBay mais ne sont pas retenus → à choisir, pas faits', json(louis));
ok(json(louis.plafond) === json({ quantite: 0, montant: 0, devise: 'EUR', nul: true }), 'Louis : le plafond lu tel qu’eBay le rend (0 article, 0 €)', json(louis.plafond));
const louisFini = etatCompteEbay(vue(...CAS.louis_apres_choix));
ok(louisFini.statut === 'bloque_par_ebay' && louisFini.pret === false && louisFini.manquantes.length === 0,
  'tout retenu, plafond à zéro : TOUJOURS pas prêt', json(louisFini));
ok(plafondEbay({ quantity: 0, amount: { value: '500', currency: 'EUR' } })?.nul === true, 'quantité 0, montant non nul : bloqué');
ok(plafondEbay({ quantity: 10, amount: { value: '0', currency: 'EUR' } })?.nul === true, 'montant 0, quantité non nulle : bloqué');
ok(plafondEbay({ quantity: 5000, amount: { value: '43622.4', currency: 'EUR' } })?.nul === false, 'plafond ordinaire : pas bloqué');
ok(plafondEbay(null) === null && plafondEbay({ quantity: 'x' }) === null, 'plafond illisible : on ne conclut rien');
ok(etatCompteEbay(ligne(...CAS.fluxen)).pret === true, 'Fluxen (15/10) : prêt');
const romain = etatCompteEbay(vue(...CAS.romain));
ok(romain.statut === 'a_finir' && romain.manquantes[0] === 'politique_livraison' && romain.aChoisir.length === 3, 'Romain : à finir, la livraison d’abord, trois politiques à choisir', json(romain));
const inscr = etatCompteEbay(vue(...CAS.inscription_pas_finie));
ok(inscr.statut === 'a_finir' && inscr.manquantes[0] === 'inscription_vendeur' && inscr.plafond === null, 'inscription pas finie : l’étape le dit, le plafond absent ne bloque rien', json(inscr));
const jamais = etatCompteEbay(vue(...CAS.jamais_releve));
ok(jamais.statut === 'inconnu' && Object.values(jamais.etapes).every((v) => v === 'inconnu'), 'jamais relevé : rien de conclu, même des politiques retenues', json(jamais));
ok(etatCompteEbay(null).statut === 'non_relie' && etatCompteEbay({ connecte: false, a_reconnecter: false }).statut === 'non_relie', 'pas relié');
ok(etatCompteEbay({ connecte: false, a_reconnecter: true }).statut === 'a_reconnecter' && etatCompteEbay(ligne(TROIS, SS_FLUXEN, '2026-10-01T00:00:00Z')).statut === 'a_reconnecter', 'à reconnecter (vue) / révoqué (ligne)');
ok(etatCompteEbay(ligne(TROIS, { ...SS_FLUXEN, politiques: { livraison: 1, paiement: 1, retours: 0 } })).etapes.politique_retours === 'manque',
  'une politique retenue qu’eBay ne connaît plus (0 de ce type) n’est pas faite');

console.log('\n2. LE MÊME VERDICT PARTOUT (écran = serveur)');
for (const [nom, [pol, ss]] of Object.entries(CAS)) {
  const v = vue(pol, ss);
  const l = ligne(pol, ss);
  const verdicts = [etatCompteEbay(v).pret, etatCompteEbay(l).pret, ebayCompteUtilisable(v), voie.compteEbayApiUsableDepuisLigne(l), resumeEbay(v, 'fr').pret];
  ok(verdicts.every((x) => x === verdicts[0]), `${nom} : ${verdicts[0] ? 'prêt' : 'pas prêt'} pour la règle, la carte, le stepper, le lot et le serveur`, json(verdicts));
}
ok(ebayCompteUtilisable(null) === null && ebayCompteUtilisable(undefined) === null, 'pas encore lu : l’écran ne conclut pas');
ok(motifEbayInutilisable(vue(...CAS.louis_avant_choix)) === 'bloque_par_ebay' && motifEbayInutilisable(vue(...CAS.romain)) === 'a_finir' && motifEbayInutilisable(null) === 'non_connecte',
  'le motif du stepper suit la même règle');

console.log('\n3. CE QUE LIT LA PERSONNE');
const fr = resumeEbay(vue(...CAS.louis_avant_choix), 'fr');
ok(fr.motif === 'bloque_par_ebay' && /^eBay n'autorise pas encore ce compte à vendre : son plafond de vente est à 0 article et 0 €\./.test(fr.phrase) && /comment tu es payé/.test(fr.phrase),
  'carte (fr) : c’est eBay qui n’autorise pas, puis ce qui reste ici', fr.phrase);
const en = resumeEbay(vue(...CAS.louis_avant_choix), 'en');
ok(/^eBay does not let this account sell yet: its selling limit is 0 items and €0\./.test(en.phrase) && /how you get paid/.test(en.phrase), 'carte (en)', en.phrase);
const seul = resumeEbay(vue(...CAS.louis_apres_choix), 'fr');
ok(seul.pret === false && /C'est eBay qui le relève/.test(seul.phrase) && !/prêt/.test(seul.phrase), 'plus rien à faire ici : la carte dit que c’est eBay, jamais « prêt »', seul.phrase);
const phrases = [fr.phrase, en.phrase, seul.phrase, resumeEbay(vue(...CAS.louis_apres_choix), 'en').phrase];
const fautes = phrases.filter((p) => MOTS_INTERDITS_ECRAN.some((m) => ` ${p.toLowerCase()} `.includes(m.toLowerCase())));
ok(fautes.length === 0, 'aucun mot interdit', fautes.join(' | '));

console.log('\n4. LE SERVEUR PARQUE AVANT TOUT APPEL, ET DIT QUOI');
const eLouis = voie.etapeEbayAFinir(ligne(...CAS.louis_avant_choix));
ok(eLouis?.etape === 'plafond' && eLouis.url === 'https://www.ebay.fr/sh/ovw', 'Louis : « plafond », lien vers le compte vendeur eBay', json(eLouis));
const mLouis = voie.messageEbayCompteAFinir(eLouis);
ok(/plafond de vente est à zéro/.test(mLouis) && /C'est ici : https:\/\/www\.ebay\.fr\/sh\/ovw/.test(mLouis), 'le message nomme le plafond et porte le lien', mLouis);
const eRomain = voie.etapeEbayAFinir(ligne(...CAS.romain));
ok(eRomain?.etape === 'parcours' && eRomain.url === null, 'des conditions qui EXISTENT chez eBay : à choisir dans FillSell, jamais « crée-les chez eBay »', json(eRomain));
const mRomain = voie.messageEbayCompteAFinir(eRomain);
ok(!/C'est ici/.test(mRomain) && /Réglages › Compte eBay/.test(mRomain) && / Rien n'a été envoyé à eBay/.test(mRomain), 'sans lien eBay, la phrase reste juste', mRomain);
const eRetours = voie.etapeEbayAFinir(ligne(['a', 'b', null], SS_FLUXEN));
ok(eRetours?.etape === 'retours' && eRetours.url === null, 'seuls les retours manquent : « retours », à choisir dans FillSell', json(eRetours));
const eConditions = voie.etapeEbayAFinir(ligne(['a', null, 'c'], { ...SS_FLUXEN, politiques: { livraison: 1, paiement: 0, retours: 1 } }));
ok(eConditions?.etape === 'conditions' && eConditions.url === 'https://www.ebay.fr/bp/manage', 'une condition qui n’existe nulle part : la page eBay du 12/10', json(eConditions));
ok(voie.etapeEbayAFinir(ligne(...CAS.inscription_pas_finie))?.etape === 'vendeur' && voie.etapeEbayAFinir(ligne(...CAS.jamais_releve))?.etape === 'vendeur', 'inscription vendeur ou rien de relevé : le compte vendeur eBay');
ok(voie.etapeEbayAFinir(ligne(...CAS.fluxen)) === null, 'compte prêt : rien à finir');
const vendeur = voie.messageEbayCompteAFinir({ etape: 'vendeur', url: 'https://www.ebay.fr/sh/ovw' });
ok(vendeur === "Ton compte eBay est bien relié à FillSell, mais eBay ne le laisse pas encore vendre : il reste à finir ton compte vendeur chez eBay (vérification ou inscription vendeur). C'est ici : https://www.ebay.fr/sh/ovw — rien n'a été envoyé à eBay, et l'annonce partira toute seule dès que ton compte sera prêt.",
  'le message « vendeur » du 12/10 est inchangé, à l’octet', vendeur);

console.log('\n5. PLUS AUCUN VERDICT TIRÉ D’AILLEURS');
const section = lire('src/components/EbayCompteSection.jsx');
ok(!/etatsEbayDepuisChecklist/.test(section) && /const etatCompte = useMemo\(\(\) => etatCompteEbay\(etat\), \[etat\]\);/.test(section) && /etatCompte=\{etatCompte\}/.test(section),
  'Réglages › Compte eBay : la règle, sur l’état relu par le serveur — plus les lignes du relevé');
const parcours = lire('src/components/EbayParcours.jsx');
ok(/const pret = etatCompte \? etatCompte\.pret : prog\.pret;/.test(parcours) && /if \(pret\) \{/.test(parcours) && !/if \(prog\.pret\)/.test(parcours) && /LIENS_EBAY\.compte_vendeur/.test(parcours),
  'le parcours ne dit « eBay est prêt » que si la règle le dit, et montre la carte d’eBay sinon');
const lot = lire('src/publication/lot/LotPublication.jsx');
ok(/resumeEbay\(ebayEtat, en \? "en" : "fr"\)\.phrase/.test(lot) && !/termine-le dans Réglages/.test(lot), 'le lot dit la même phrase que la carte');
const compte = lire('supabase/functions/ebay-account/index.ts');
ok(/plafondEbay\(sellingLimit\)\?\.nul === true/.test(compte), 'ebay-account : bloque_par_etat_ebay porte aussi le plafond');
const voieSrc = lire('supabase/functions/_shared/ebay-voie.ts');
ok(/return etatCompteEbay\(a\)\.pret;/.test(voieSrc), 'serveur : compteEbayApiUsableDepuisLigne = la règle');
// Aucun écran ne relit le drapeau ou le plafond en direct (hors commentaires).
const fuites = [];
const parcourir = (d) => {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = path.join(d, e.name);
    if (e.isDirectory()) { parcourir(p); continue; }
    if (!/\.(js|jsx|ts|tsx)$/.test(e.name)) continue;
    fs.readFileSync(p, 'utf8').split(/\r?\n/).forEach((l, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(l)) return;
      if (/bloque_par_etat_ebay|selling_limit|sellingLimit/.test(l.replace(/\/\/.*$/, ''))) fuites.push(`${path.relative(ROOT, p)}:${i + 1}`);
    });
  }
};
parcourir(path.join(ROOT, 'src'));
ok(fuites.length === 0, 'aucun fichier de src/ ne lit bloque_par_etat_ebay ni le plafond en direct', fuites.join(', '));

if (ko) { console.error(`\n✗ ${ko} échec(s) sur ${nb}`); process.exit(1); }
console.log(`\n✓ un seul état eBay, partout — ${nb} contrôles`);
