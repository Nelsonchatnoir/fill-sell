// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE POIDS DU COLIS : ESTIMÉ PAR LEBONCOIN OU SAISI (11/10/2026, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Décision de Nico (11/10 soir) : le poids obligatoire est une friction de
// trop. Sans poids, Leboncoin publie et estime lui-même d'après le rayon
// (100 g format S pour un livre, 250 g pour un pyjama) : c'est acceptable.
//
// En lot comme à l'unité, la personne choisit :
//   · « Laisser Leboncoin estimer » (PAR DÉFAUT) : rien n'est demandé ;
//   · « Saisir le poids » : le poids se tape (une fois pour le lot, ou sur
//     « Confirmer »), il part sur l'annonce et reste sur la fiche.
// Le choix est RETENU pour les publications suivantes :
// profiles.platform_settings.leboncoin.poids_choix, écrit par
// platform_settings_fusionner SEULEMENT (jamais l'objet entier, 02/10).
// Une fiche qui porte un poids l'envoie toujours, quel que soit le choix.
// Le serveur ne retient plus aucune publication sans poids
// (supabase/functions/_shared/poids-leboncoin.js).
// Ce fichier est PUR (aucun réseau, aucun import) : la règle du lot
// (publication/lot/regles.js) et les selftests le lisent. La lecture et
// l'écriture du choix : utils/useChoixPoidsLeboncoin.js.
// ═══════════════════════════════════════════════════════════════════════════

export const CLE_REGLAGE_POIDS_LBC = 'poids_choix';
export const POIDS_LBC_ESTIMER = 'estimer';
export const POIDS_LBC_SAISIR = 'saisir';
export const CHOIX_POIDS_LBC_DEFAUT = POIDS_LBC_ESTIMER;
// ── (15/10 soir, PAUGUES) QUAND LEBONCOIN EXIGE LE POIDS ─────────────────────
// Le formulaire Leboncoin PRO rend « Poids du colis* » OBLIGATOIRE et
// n'estime rien : « Laisser Leboncoin estimer » y bloquait 10 articles sur 11
// d'un lot. handler-watch note le compte sur preuve
// (platform_settings.leboncoin.poids_exige) ; le choix devient alors « Saisir
// le poids », sans alternative — au lot comme à l'unité, AVANT l'envoi.
export const CLE_POIDS_EXIGE_LBC = 'poids_exige';
/** Leboncoin exige-t-il le poids pour ce compte ? (preuve notée par le serveur) */
export function poidsExigeDesReglages(ps) {
  const l = ps && typeof ps === 'object' ? ps.leboncoin : null;
  return Boolean(l && typeof l === 'object' && l[CLE_POIDS_EXIGE_LBC]);
}

/** Un choix valide, ou le défaut (« Laisser Leboncoin estimer »). */
export function choixPoidsValide(v) {
  return v === POIDS_LBC_SAISIR ? POIDS_LBC_SAISIR : POIDS_LBC_ESTIMER;
}

/** Le choix retenu d'un objet platform_settings (défaut : estimer). */
export function choixPoidsDesReglages(ps) {
  if (poidsExigeDesReglages(ps)) return POIDS_LBC_SAISIR;
  const l = ps && typeof ps === 'object' ? ps.leboncoin : null;
  return choixPoidsValide(l && typeof l === 'object' ? l[CLE_REGLAGE_POIDS_LBC] : null);
}

/**
 * Le poids manque-t-il AVANT l'envoi ? Seulement quand la personne a choisi
 * « Saisir le poids » et qu'aucun poids n'est connu (copie, lot ou fiche).
 * « Laisser Leboncoin estimer » ne manque jamais de rien.
 */
export function poidsLbcManquantPour(choix, poidsConnuG) {
  return choixPoidsValide(choix) === POIDS_LBC_SAISIR && (poidsConnuG == null || !(Number(poidsConnuG) > 0));
}
