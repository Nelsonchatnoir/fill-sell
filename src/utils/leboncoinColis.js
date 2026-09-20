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

/** Le nom Leboncoin d'un transporteur, à partir de notre clé. */
export function nomTransporteur(cle) {
  return LBC_TRANSPORTEURS.find((t) => t.cle === cle)?.nom ?? null;
}

/**
 * Les transporteurs PLAUSIBLES pour ce format. Purement indicatif — on ne
 * retire jamais un choix de la personne, on éclaire seulement la liste :
 * un « Volumineux » ne rentre pas dans une enveloppe de 3 cm.
 * Rend `null` quand le format est inconnu : dans ce doute on ne dit rien.
 */
export function transporteursPlausibles(format) {
  if (!format) return null;
  if (format === 'Petit') return LBC_TRANSPORTEURS.map((t) => t.cle);
  if (format === 'Moyen') return LBC_TRANSPORTEURS.filter((t) => t.kgMax >= 20).map((t) => t.cle);
  // Volumineux : plus de 150 cm de développé — aucun des quatre ne l'accepte,
  // et Leboncoin propose alors « Autres moyens de livraison » (frais avancés
  // par le vendeur). On ne coche rien et on ne prétend rien.
  return [];
}

/** Ce que le job doit porter, à partir de la copie Leboncoin. Rien si on ne
 *  sait rien : un job sans ces clés se comporte exactement comme avant. */
export function champsColisLeboncoin(pf) {
  const sortie = {};
  const format = String(pf?.lbcFormatColis ?? '').trim() || formatLeboncoin(pf?.format_colis);
  if (format) sortie.lbcFormatColis = format;
  const choisis = Array.isArray(pf?.lbcTransporteurs) ? pf.lbcTransporteurs.filter(Boolean) : null;
  if (choisis?.length) sortie.lbcTransporteurs = choisis;
  return sortie;
}
