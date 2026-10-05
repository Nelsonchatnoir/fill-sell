// ═══════════════════════════════════════════════════════════════════════════
// LEBONCOIN — LE COLIS ET LES TRANSPORTEURS (2026-09-20, demande de Louis)
// ═══════════════════════════════════════════════════════════════════════════
// « Il serait intéressant de pouvoir renseigner le poids ainsi que de pouvoir
//  choisir les transporteurs que l'on souhaite. Par exemple, sur un adaptateur
//  laitière, je choisis lettre suivie, que je ne peux pas choisir pour un
//  rangement. » — Louis, compte Business.
//
// RELEVÉ LIVE DU FORMULAIRE DE DÉPÔT, compte particulier, 20/09/2026.
// Rien ici n'est déduit d'une documentation : tout a été lu sur la page.
//
// ── CE QUE LEBONCOIN OFFRE VRAIMENT ──────────────────────────────────────
// Un bloc « En livraison » avec une case « Activer la livraison », puis DEUX
// réglages, chacun derrière un crayon :
//   · « Vos moyens de livraison » — UNE CASE PAR TRANSPORTEUR, avec ses
//     bornes écrites à côté (ci-dessous, mot pour mot) ;
//   · « Choisissez un format » — TROIS choix, et trois seulement.
//
// 🚨 NOTRE LISTE EN AVAIT SIX. « Lettre », « Grand colis » et « Très grand
//    colis » N'EXISTENT PAS chez Leboncoin. Notre champ `format_colis` reste
//    inchangé — il sert AUSSI à Beebs (qui a ses propres paliers de poids) et
//    à la mémoire de poids du formulaire PRO. On ne le casse pas : on le
//    TRADUIT vers le vocabulaire de Leboncoin, ici et nulle part ailleurs.
//
// ⛔ ON NE DEMANDE PAS LE FORMAT À L'UTILISATEUR : on sait le déduire de ce
//    qu'il a déjà dit, et Leboncoin lui-même en propose une estimation juste
//    (mesuré : « Colis petit — de 250 g à 500 g estimés » sur une robe).
//    Le TRANSPORTEUR, lui, est un vrai choix de vendeur : on l'offre, sans
//    jamais l'exiger (règle G3 : on ne demande que l'obligatoire inconnu).
// ⛔ ON NE BLOQUE JAMAIS UN DÉPÔT LÀ-DESSUS. Un transporteur indisponible
//    pour cet article (poids ou dimensions hors bornes) n'est pas coché, et
//    c'est tout : Leboncoin garde son estimation.

/** Les TROIS formats de Leboncoin, avec le texte que la plateforme affiche. */
export const LBC_FORMATS = [
  { valeur: 'Petit', aide: 'Tient dans une enveloppe, jusqu’à 46 cm.' },
  { valeur: 'Moyen', aide: 'Tient dans un carton standard, jusqu’à 150 cm de développé.' },
  { valeur: 'Volumineux', aide: 'Tient dans une voiture ou une camionnette, plus de 150 cm de développé.' },
];

/**
 * Nos six formats → les trois de Leboncoin. « Non défini » ne traduit RIEN :
 * on laisse alors Leboncoin faire son estimation, qui est juste.
 */
const TRADUCTION = {
  'lettre': 'Petit',
  'petit colis': 'Petit',
  'moyen colis': 'Moyen',
  'grand colis': 'Volumineux',
  'très grand colis': 'Volumineux',
  'tres grand colis': 'Volumineux',
  // ── LES TROIS VALEURS DE LEBONCOIN SE TRADUISENT EN ELLES-MÊMES (21/09) ──
  // Depuis le 21/09, la carte Leboncoin ne propose plus que ces trois-là
  // (packageFormatLbc, ListingPreviewScreen) : `format_colis` peut donc
  // désormais les porter directement. Sans ces trois lignes, un « Petit »
  // choisi à l'écran ne se serait traduit en RIEN et la carte serait repassée
  // en « Leboncoin estimera lui-même le format » — le choix de la personne
  // perdu en silence, sur le geste même qu'on venait de lui donner.
  'petit': 'Petit',
  'moyen': 'Moyen',
  'volumineux': 'Volumineux',
};

/** Le format Leboncoin déduit de notre `format_colis`, ou null. */
export function formatLeboncoin(formatColis) {
  const k = String(formatColis ?? '').trim().toLowerCase();
  return TRADUCTION[k] ?? null;
}

/**
 * Les transporteurs, avec leurs BORNES RELEVÉES. `kgMax` et les contraintes de
 * taille viennent du texte affiché par Leboncoin à côté de chaque case.
 * `remise` dit où l'acheteur récupère — c'est ce qui fait la différence pour
 * un vendeur (domicile vs point relais).
 */
export const LBC_TRANSPORTEURS = [
  { cle: 'courrier_suivi', nom: 'Courrier suivi', kgMax: 2, remise: 'Domicile',
    contrainte: 'Limité à 3 cm d’épaisseur' },
  { cle: 'shop2shop', nom: 'Shop2Shop by Chronopost', kgMax: 20, remise: 'Magasin & Locker',
    contrainte: 'L + l + h ≤ 150 cm, ou le côté le plus long ≤ 100 cm' },
  { cle: 'mondial_relay', nom: 'Mondial Relay', kgMax: 30, remise: 'Magasin & Locker',
    contrainte: 'L + l + h ≤ 150 cm, et le côté le plus long ≤ 120 cm' },
  { cle: 'colissimo', nom: 'Colissimo', kgMax: 30, remise: 'Domicile',
    contrainte: 'L + l + h ≤ 150 cm, ou le côté le plus long ≤ 100 cm' },
];

// ── RELEVÉ LIVE DU 04/10/2026 (formulaire de dépôt, compte de Nico) ─────────
// Louis : 13 « Rangement » identiques publiés en lot, 7 en « Petit », 6 en
// « Moyen », aucun poids. Le format venait de la RÉDACTION (prompt Leboncoin :
// « Infère … le format colis »), tiré à chaque article — d'où l'écart. Relevé
// sur la page, ce jour :
//   · le format est une TAILLE, pas un poids : Petit (enveloppe, 46 cm) et
//     Moyen (carton, 150 cm de développé) proposent les MÊMES onze paliers de
//     poids (100 g … plus de 40 kg) ; Volumineux bascule en « Livraison colis
//     XL » (40 à 150 kg), SANS aucun transporteur partenaire — le vendeur
//     organise seul (« Autres moyens de livraison ») ;
//   · les transporteurs proposés suivent le POIDS, pas le format : Courrier
//     suivi ≤ 2 kg (et 3 cm d'épaisseur, à la charge du vendeur — il reste
//     proposé en Moyen), Shop2Shop ≤ 20 kg, Mondial Relay et Colissimo
//     ≤ 30 kg (relevé : Moyen 30 kg → Mondial Relay et Colissimo seuls) ;
//   · sans réglage, Leboncoin pré-coche SON estimation d'après le rayon
//     (« Colis moyen, de 2 kg à 5 kg » pour un rangement) — la même pour des
//     articles identiques.
// D'où la règle (Nico, 04/10) : AUCUN format deviné en silence. Le format part
// seulement quand la PERSONNE l'a choisi (`format_colis_source: 'manuel'`) ;
// sinon Leboncoin garde son estimation, et le POIDS de la fiche choisit le
// palier. get-pending-jobs écarte tout format non choisi (jobs déjà en file,
// copies enregistrées avant ce jour).
/** Les onze paliers de Petit/Moyen, en grammes (valeur des boutons radio). */
export const LBC_PALIERS_G = [100, 250, 500, 1000, 2000, 5000, 10000, 20000, 30000, 40000, 70000];
/** Le marqueur d'un format CHOISI par la personne (carte, lot). */
export const FORMAT_CHOISI = 'manuel';

/** Le format que la PERSONNE a choisi — jamais celui de la rédaction —, ou null. */
export function formatChoisiLbc(pf) {
  return pf?.format_colis_source === FORMAT_CHOISI ? formatLbcDuJob(pf) : null;
}

/** platform_fields avec le format posé (ou retiré) PAR LA PERSONNE. */
export function avecFormatChoisi(pf, valeur) {
  const suite = { ...(pf ?? {}) };
  delete suite.lbcFormatColis;
  if (valeur) { suite.format_colis = valeur; suite.format_colis_source = FORMAT_CHOISI; }
  else { delete suite.format_colis; delete suite.format_colis_source; }
  return suite;
}

/** Les transporteurs (noms Leboncoin) qui acceptent ce poids ; tous si poids inconnu. */
export function transporteursPourPoids(grammes) {
  const g = Number(grammes);
  if (!Number.isFinite(g) || g <= 0) return LBC_TRANSPORTEURS.map((t) => t.nom);
  return LBC_TRANSPORTEURS.filter((t) => t.kgMax * 1000 >= g).map((t) => t.nom);
}

/**
 * Les transporteurs PLAUSIBLES (clés) pour ce format et ce poids. Purement
 * indicatif — on ne retire jamais un choix de la personne, on éclaire la
 * liste. Rend `null` quand ni format ni poids ne sont connus.
 */
export function transporteursPlausibles(format, grammes = null) {
  // Volumineux : « Livraison colis XL », aucun partenaire (relevé 04/10).
  if (format === 'Volumineux') return [];
  const g = Number(grammes);
  const poidsConnu = Number.isFinite(g) && g > 0;
  if (!format && !poidsConnu) return null;
  return LBC_TRANSPORTEURS.filter((t) => !poidsConnu || t.kgMax * 1000 >= g).map((t) => t.cle);
}

// ── DEUX FONCTIONS SUPPRIMÉES LE 2026-09-21, AUCUN APPELANT ────────────────
// `champsColisLeboncoin(pf)` : elle construisait un sous-ensemble de
//   platform_fields pour le job. Inutile par construction — `platform_fields`
//   part EN ENTIER dans le job, donc `lbcFormatColis` et `lbcTransporteurs` y
//   sont déjà, posés par CarteLivraisonLeboncoin. Un filtre de plus n'aurait
//   ajouté qu'un endroit de plus où les oublier.
// `nomTransporteur(cle)` : elle rendait le nom Leboncoin d'un transporteur à
//   partir de notre clé. Personne n'en a jamais eu besoin — la carte affiche
//   `t.nom` directement depuis LBC_TRANSPORTEURS, et c'est le NOM (pas la clé)
//   que le job transporte et que l'extension coche.
//
// Vérifié avant chaque suppression, sur tout le dépôt et de trois façons : le
// nom complet, la chaîne partielle, et la forme d'appel `Transporteur(`. Les
// deux seuls importateurs du module (CarteLivraisonLeboncoin,
// ListingPreviewScreen) le font par imports NOMMÉS — aucun `import * as` qui
// aurait pu les atteindre sans les nommer.
//
// CE QUI RESTE, ET QUI SERT : LBC_FORMATS, LBC_TRANSPORTEURS, formatLeboncoin,
// transporteursPlausibles.

// ── UNE SEULE RÈGLE DE FORMAT (2026-09-24) ──────────────────────────────────
// Audit du 23/09 : deux contrôles sur la même copie Leboncoin — le sélecteur
// `format_colis` (liste des champs) et les puces `lbcFormatColis` (carte
// Livraison). 13 jobs de Louis portaient « Petit » d'un côté, « Moyen » de
// l'autre, et l'extension ne lisait QUE les puces.
// LA règle : `format_colis` fait foi (c'est le champ visible de la copie, et
// la clé de mémoire du poids PRO) ; `lbcFormatColis` n'est plus qu'un repli
// pour les jobs d'avant. Les puces de la carte écrivent désormais
// `format_colis` et effacent `lbcFormatColis` : les deux ne peuvent plus
// diverger. ⚠️ MIROIR dans chrome-extension/content-scripts/leboncoin.js
// (formatLbcDuJob) — même ordre, même traduction.
export function formatLbcDuJob(pf) {
  return formatLeboncoin(pf?.format_colis) ?? formatLeboncoin(pf?.lbcFormatColis);
}
