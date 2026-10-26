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

// ── (26/10, D2 — Nico) LE COLIS LEBONCOIN PAR DÉFAUT, DANS LES RÉGLAGES ──────
// Une taille (un des trois formats de Leboncoin) et un poids, choisis UNE fois
// dans Réglages › Expédition : ils partent avec chaque NOUVELLE annonce dont la
// fiche n'a pas de poids, modifiables article par article (le poids tapé, celui
// de la fiche, passent toujours devant). Le même poids sert à Beebs (son palier
// « Poids jusqu'à … » se lit du poids de la fiche, côté serveur).
// profiles.platform_settings.leboncoin.colis_defaut = { format, poids_g },
// écrit par platform_settings_fusionner seulement. Ce n'est pas une estimation :
// c'est le choix de la personne (règle 7 du 26/10 : « le choix de l'utilisateur »).
export const CLE_COLIS_DEFAUT_LBC = 'colis_defaut';
export const FORMATS_COLIS_DEFAUT_LBC = ['Petit', 'Moyen', 'Volumineux'];
export const POIDS_DEFAUT_LBC_MAX_G = 30000;

/** Un colis par défaut valide ({ format, poids_g }, chacun ou null), ou null quand rien n'est choisi. */
export function colisDefautValide(v) {
  if (!v || typeof v !== 'object') return null;
  const format = FORMATS_COLIS_DEFAUT_LBC.includes(String(v.format ?? '').trim()) ? String(v.format).trim() : null;
  const g = Math.round(Number(v.poids_g));
  const poids_g = Number.isFinite(g) && g >= 1 && g <= POIDS_DEFAUT_LBC_MAX_G ? g : null;
  return format || poids_g ? { format, poids_g } : null;
}

/** Le colis par défaut d'un objet platform_settings, ou null. */
export function colisDefautDesReglages(ps) {
  const l = ps && typeof ps === 'object' ? ps.leboncoin : null;
  return colisDefautValide(l && typeof l === 'object' ? l[CLE_COLIS_DEFAUT_LBC] : null);
}

/**
 * Le poids qui part avec une nouvelle annonce : celui de la fiche, sinon le défaut des Réglages, sinon null
 * (Leboncoin estime, ou la question si le compte « saisit »). Jamais par-dessus un poids connu.
 */
export function poidsAvecDefaut(poidsFicheG, colisDefaut) {
  const f = Number(poidsFicheG);
  if (poidsFicheG != null && Number.isFinite(f) && f > 0) return Math.round(f);
  return colisDefautValide(colisDefaut)?.poids_g ?? null;
}
