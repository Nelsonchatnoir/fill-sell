// ═══════════════════════════════════════════════════════════════════════════
// L'IDENTITÉ DE L'ARTICLE DANS LE PARCOURS LENS (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// QUEL ARTICLE le viseur est-il en train de traiter ? La réponse tenait dans
// deux états posés à des endroits différents et effacés à des moments
// différents — et un de ces endroits avait été oublié. Deux défauts qu'on
// prenait pour deux bugs en sortaient :
//
//   · « Publier ouvre un AUTRE article » : le stepper s'ouvrait sur l'article
//     PRÉCÉDENT, avec sa fiche, ses annonces, son titre ;
//   · « ces photos ne correspondent plus à l'article analysé » : le stepper,
//     ouvert sur l'article précédent, comparait l'analyse de CELUI-LÀ aux
//     photos de CELUI-CI, et accusait la personne d'avoir changé d'article.
//
// Et, silencieusement, une CORRUPTION : rattacherPhotosDurables écrit
// `inventaire.photos` sur cet identifiant. Mauvais identifiant = les photos du
// nouvel article écrasent celles de l'ancien. Relevé le 20/09 : 28 lots de
// photos portés par 121 articles sur 7 comptes.
//
// LA RÈGLE, ÉNONCÉE UNE FOIS ET UNE SEULE ICI :
//   1. DE NOUVELLES PHOTOS AU VISEUR = UN NOUVEL ARTICLE. L'identifiant
//      tombe. Le code le faisait déjà pour le résultat d'analyse et pour le
//      drapeau « ajouté au stock » (setLensResult(null), setLensAdded(false))
//      aux trois points d'entrée de photos — il oubliait l'identifiant, le
//      seul des trois qui écrit en base.
//   2. LES MÊMES PHOTOS = LE MÊME ARTICLE. Abandonner le stepper et revenir
//      NE doit PAS faire tomber l'identifiant : sinon « Créer l'annonce » une
//      seconde fois poserait une DEUXIÈME ligne d'inventaire — le doublon du
//      15/09 (compte Akld, 2 scans, 2 lignes vides, 2 annonces débitées).
//   3. L'IDENTIFIANT RESTAURÉ NE SURVIT PAS À LA FERMETURE. Il n'existe que
//      pour remonter le stepper après un rechargement d'onglet, et il vient du
//      blob hôte — que la fermeture efface. Le garder au-delà, c'est garder un
//      pointeur vers un article que plus rien ne désigne.
//
// ⛔ CE FICHIER NE FAIT AUCUN EFFET DE BORD. Il dit quel identifiant vaut, et
//    ce qu'une transition en fait. Les appelants posent les états.

/** L'article que le parcours traite en ce moment, ou null s'il n'y en a pas.
 *  L'identifiant VIVANT (posé par le scan payé ou par l'ajout au stock) prime
 *  toujours sur celui qu'un remount a restauré : le second n'est qu'un filet. */
export function articleDuParcours({ lensInventaireId = null, restoredInvId = null } = {}) {
  return lensInventaireId ?? restoredInvId ?? null;
}

/** Règle 1 — de nouvelles photos entrent au viseur. */
export function apresNouvellesPhotos(etat = {}) {
  return { ...etat, lensInventaireId: null, restoredInvId: null };
}

/** Règle 2 + 3 — le stepper se ferme.
 *  `publiee` : l'annonce est partie → le parcours entier est purgé (ce que
 *  resetLensParcours fait déjà côté App). Sinon c'est un ABANDON : on garde
 *  l'identifiant vivant pour que « Créer l'annonce » retombe sur la MÊME
 *  ligne, et on lâche celui du remount, qui ne désigne plus rien. */
export function apresFermetureStepper(etat = {}, publiee = false) {
  if (publiee) return { ...etat, lensInventaireId: null, restoredInvId: null };
  return { ...etat, restoredInvId: null };
}
