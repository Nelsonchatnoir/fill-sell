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
//   4 et 5 (20/11/2026 soir) : en fin de fichier — un résultat de scan désigne
//      son article par TOUTES les voies, et l'écran comme l'ajout au stock le
//      reprennent du résultat quand l'identifiant vivant manque.
//
// ⛔ CE FICHIER NE FAIT AUCUN EFFET DE BORD. Il dit quel identifiant vaut, et
//    ce qu'une transition en fait. Les appelants posent les états.

/** L'article que le parcours traite en ce moment, ou null s'il n'y en a pas.
 *  L'identifiant VIVANT (posé par le scan payé ou par l'ajout au stock) prime
 *  toujours sur celui qu'un remount a restauré : le second n'est qu'un filet. */
export function articleDuParcours({ lensInventaireId = null, restoredInvId = null, resultat = null } = {}) {
  // (20/11/2026 soir, bloc B1 — règle 5 plus bas) En dernier filet : l'article que le scan affiché a créé.
  return lensInventaireId ?? restoredInvId ?? articleDuScan(resultat) ?? null;
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

// ═══════════════════════════════════════════════════════════════════════════
// UN RÉSULTAT DE SCAN DÉSIGNE SON ARTICLE, PAR TOUTES LES VOIES (20/11/2026 soir, bloc B1 de Nico — ornellaracano)
// ═══════════════════════════════════════════════════════════════════════════
// Ornella (iPhone, app 2.9.222, 20/11) : scan 69792dbf lancé à 16:45:20, l'app passe en arrière-plan, iOS coupe la
// requête ; l'analyse finit côté serveur à 16:46:18 et CRÉE l'article 1795189583215 avec sa fiche. Le résultat revient
// par le SUIVI de la ligne (suivreScanLens), qui posait le résultat mais jamais l'identifiant de l'article : les trois
// ouvertures de l'écran de publication (16:48, 16:50, 16:53) se sont faites SANS article. Rien de ce qu'elle a tapé
// n'a été gardé (ni fiche, ni texte, ni la correction « taille »), et Publier a créé un doublon sans photo.
// LA RÈGLE :
//   4. UN RÉSULTAT DE SCAN SE POSE PAR UNE SEULE PORTE, quelle que soit la voie qui le rend (réponse directe,
//      reprise d'un scan terminé, suivi de la ligne après une requête coupée, historique) : le résultat ET l'article
//      que le serveur a créé pour lui. Seul l'historique vérifie que l'article est encore au Stock (supprimé ou
//      fusionné depuis : le résultat ne désigne plus rien, son identifiant est retiré).
//   5. FILET : l'article créé par le scan reste celui du parcours même si l'identifiant vivant manque — l'écran de
//      publication le reprend du résultat, et l'ajout au stock le rend AVANT de créer quoi que ce soit (jamais de
//      doublon sans photo).

export const VOIES_DU_SCAN = Object.freeze(["directe", "reprise", "suivi", "historique"]);

/** L'article qu'un résultat de scan a fait créer côté serveur (inventaire_id), ou null. */
export function articleDuScan(resultat) {
  if (!resultat || typeof resultat !== "object" || resultat.error) return null;
  const id = resultat.inventaire_id;
  return id == null || id === "" ? null : id;
}

/** Règle 4 — ce que la pose d'un résultat de scan fait des états du parcours.
 *  @param {object} resultat  le résultat rendu (lens-analysis, lens_scans.resultat)
 *  @param {{ voie: string, idAuStock?: string|number|null }} opts  `idAuStock` : historique seulement, l'identifiant
 *         de l'article tel que le Stock le connaît (null : plus au Stock)
 *  @returns {{ resultat: object, lensInventaireId: any, lensAdded: boolean, lireLaLigne: boolean }} */
export function poseDuResultatScan(resultat, { voie, idAuStock = null } = {}) {
  const id = articleDuScan(resultat);
  if (voie === "historique") {
    if (id != null && idAuStock == null) {
      // Plus au Stock : le résultat ne désigne plus d'article (le filet de l'écran ne doit pas le ressusciter).
      const { inventaire_id: _mort, ...sansArticle } = resultat;
      return { resultat: sansArticle, lensInventaireId: null, lensAdded: false, lireLaLigne: false };
    }
    return { resultat, lensInventaireId: id != null ? idAuStock : null, lensAdded: id != null, lireLaLigne: false };
  }
  // Réponse directe, reprise, suivi : l'article vient d'être créé côté serveur — la liste locale ne le connaît pas
  // forcément encore, sa ligne est lue (une seule).
  return { resultat, lensInventaireId: id, lensAdded: id != null, lireLaLigne: id != null };
}

/** Règle 5 — l'article de l'ÉCRAN de publication : celui que l'hôte donne, sinon celui que le scan a créé. */
export function articleDeLEcran({ inventaireId = null, initialListing = null } = {}) {
  if (inventaireId != null && inventaireId !== "") return inventaireId;
  // Une ligne du Stock porte la clé `origine` : elle n'est pas un résultat de scan (et l'hôte Stock donne toujours l'id).
  if (initialListing && typeof initialListing === "object" && Object.prototype.hasOwnProperty.call(initialListing, "origine")) return null;
  return articleDuScan(initialListing);
}

/** Règle 5 — avant de créer l'article au clic Publier : l'identifiant à reprendre, ou null (créer).
 *  `ligneDuScanExiste` : false seulement quand la base a dit que la ligne n'existe plus (lecture ratée = elle existe). */
export function articleAvantCreation({ lensInventaireId = null, resultat = null, ligneDuScanExiste = true } = {}) {
  if (lensInventaireId != null) return lensInventaireId;
  const id = articleDuScan(resultat);
  return id != null && ligneDuScanExiste !== false ? id : null;
}

/** Les photos du viseur, réduites à une signature (nombre, longueur et fin de chaque adresse) : « les mêmes photos =
 *  le même article » (règle 2), lisible après un remontage sans garder les images elles-mêmes. */
export function signaturePhotos(photos = []) {
  const liste = Array.isArray(photos) ? photos : [];
  return `${liste.length}:` + liste.map((p) => {
    const s = String((p && typeof p === "object" ? p.preview ?? p.url : p) ?? "");
    return `${s.length}.${s.slice(-32)}`;
  }).join("|");
}
