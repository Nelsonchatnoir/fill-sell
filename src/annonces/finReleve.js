// ═══════════════════════════════════════════════════════════════════════════
// LA FIN D'UN RELEVÉ (05/10, Marine) — module PUR (aucun import), testé par
// scripts/releve-fin-claire-selftest.mjs. Ré-exporté par etatReleve.js.
// ═══════════════════════════════════════════════════════════════════════════
const MUR_OPLA = /acc[èe]s opla non accord/i;

// ── LA FIN D'UN RELEVÉ, DITE EN CLAIR (05/10, Marine) ───────────────────────
// Chaque relevé qui n'aboutit pas se résume à UNE situation, lue sur les
// marqueurs que NOS relevés écrivent (extension 0.6.99, handler-watch) — et
// sur les textes des versions précédentes, pour les lignes déjà en base. La
// phrase montrée est choisie ici ; le texte brut de `erreur` (codes HTTP,
// pages, minutes) reste en base pour nous, jamais à l'écran.
//   pas_connecte  la personne n'est pas connectée à la plateforme sur son
//                 ordinateur → « Connecte-toi à X sur ton ordinateur… »
//   autre_compte  Chrome est sur une autre boutique que celle suivie — ou
//                 (18/10, Louis) sur une boutique déjà suivie par un AUTRE
//                 compte FillSell ([boutique_autre_compte] : sa phrase à elle,
//                 le pseudo vu par le run, cf. annonces/boutiqueAutreCompte.js)
//   anti_robot    la plateforme a bloqué la lecture un moment
//   arret         la lecture s'est arrêtée avant la fin (chien de garde)
//   pas_prise     l'ordinateur n'a jamais pris la demande (Chrome fermé)
//   cloud_*       (12/11) client au Cloud actif : eBay à relier, eBay relu par l'API, plateforme à connecter au Cloud,
//                 Cloud qui n'a pas pris la demande à temps — jamais « ordinateur » ni « Chrome »
//   echec         tout le reste
// (29/10) « jeton non renouvelé (session_fermee) » : le renouvellement du jeton Leboncoin a VU « Mes annonces »
// renvoyer vers la connexion — runs des extensions ≤ 0.6.152, écrits « n'a pas rendu sa liste ».
const RE_PAS_CONNECTE = /\[pas_connecte\]|aucune session vinted|session_absente|session vinted.{0,40}401|refusé la lecture du compte|page de connexion|jeton non renouvelé \(session_fermee\)/i;
const RE_BOUTIQUE_AUTRE_COMPTE = /\[boutique_autre_compte\]/i;
const RE_AUTRE_COMPTE = /\[boutique_a_confirmer\]|\[boutique_autre_compte\]|\[hors-compte-ebay\]/i;
const RE_ANTI_ROBOT = /\[anti_robot\]|anti-robot|\[retry403\]/i;
const RE_ARRET = /\[watchdog\]/i;
const RE_PAS_PRISE = /jamais réclamée|sans extension disponible/i;
// (12/11, complément de Nico — cas b695d990) Les demandes expirées d'un client au Cloud actif portent un marqueur du Cloud
// (supabase/functions/_shared/cloud-voie.js, texteDemandeExpireeCloud) : leur phrase ne parle jamais de l'ordinateur.
const RE_CLOUD_RELIER_EBAY = /\[cloud:relier_ebay\]/;
const RE_CLOUD_EBAY_API = /\[cloud:ebay_api\]/;
const RE_CLOUD_CONNECTER = /\[cloud:connecter\]/;
const RE_CLOUD_PAS_PRIS = /\[cloud:pas_pris\]/;

export function situationFinReleve(run) {
  const e = String(run?.erreur ?? '');
  if (RE_CLOUD_RELIER_EBAY.test(e)) return 'cloud_relier_ebay';
  if (RE_CLOUD_EBAY_API.test(e)) return 'cloud_ebay_api';
  if (RE_CLOUD_CONNECTER.test(e)) return 'cloud_connecter';
  if (RE_CLOUD_PAS_PRIS.test(e)) return 'cloud_pas_pris';
  if (RE_PAS_CONNECTE.test(e) || MUR_OPLA.test(e)) return 'pas_connecte';
  if (RE_AUTRE_COMPTE.test(e)) return 'autre_compte';
  if (RE_ANTI_ROBOT.test(e)) return 'anti_robot';
  if (RE_ARRET.test(e)) return 'arret';
  if (RE_PAS_PRISE.test(e)) return 'pas_prise';
  return 'echec';
}

// La phrase d'une situation, pour une plateforme nommée. T = textesAnnonces(lang).
// `run` (facultatif) : le run lu, pour la boutique d'un autre compte FillSell.
export function texteSituation(situation, nom, T, run = null) {
  if (situation === 'pas_connecte') return T.signalNonConnecte(nom);
  if (situation === 'autre_compte' && RE_BOUTIQUE_AUTRE_COMPTE.test(String(run?.erreur ?? '')) && T.finBoutiqueAutreCompte) {
    const login = typeof run?.vinted_login === 'string' ? run.vinted_login.trim().replace(/^@/, '') : '';
    return T.finBoutiqueAutreCompte(login || null);
  }
  if (situation === 'autre_compte') return T.finAutreCompte(nom);
  if (situation === 'anti_robot') return T.finAntiRobot(nom);
  if (situation === 'arret') return T.finArret(nom);
  if (situation === 'pas_prise') return T.finPasPrise(nom);
  if (situation === 'cloud_relier_ebay') return T.finCloudRelierEbay;
  if (situation === 'cloud_ebay_api') return T.finCloudEbayApi;
  if (situation === 'cloud_connecter') return T.finCloudConnecter(nom);
  if (situation === 'cloud_pas_pris') return T.finCloudPasPris(nom);
  return T.finEchec(nom);
}

export function texteFinReleve(run, nom, T) {
  if (/acc[èe]s opla non accord/i.test(String(run?.erreur ?? ''))) return T.signalOpla;
  return texteSituation(situationFinReleve(run), nom, T, run);
}
