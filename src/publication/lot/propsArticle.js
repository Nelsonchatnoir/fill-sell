// ═══════════════════════════════════════════════════════════════════════════
// CE QUE LE STOCK DONNE AU MOTEUR DE PUBLICATION POUR UN ARTICLE
// ═══════════════════════════════════════════════════════════════════════════
// Extrait de StockTab (02/10, nuit) SANS RIEN CHANGER : le stepper ouvert à la
// main ET chaque article d'un lot reçoivent exactement les mêmes entrées — deux
// copies de cette liste blanche finiraient par diverger, et c'est précisément
// le genre d'écart qui a coûté le titre de Louis (21/09) et les attributs de la
// fiche (18/09). Les commentaires d'origine voyagent avec le code.
import { computeRemovalInfo, plateformesReserveesParRepublication } from "../../utils/publicationState.js";
import { urlsPhotos } from "../../utils/photos.js";
import { isRetouchedPhotoEntry } from "../../components/ListingPreviewScreen.jsx";

/**
 * Les entrées « article » du moteur, pour un article du Stock (forme mapItem).
 * `prixVinted` = le prix DEMANDÉ sur l'annonce Vinted (dernier relevé), ou null.
 */
export function propsStepperArticle(item, jobs, { prixVinted = null } = {}) {
  const liste = Array.isArray(jobs) ? jobs : [];
  return {
    // Plateformes où cet article est DÉJÀ en ligne, ou réservées par une
    // republication en vol (cf. ListingPreviewScreen, prop alreadyPublished).
    alreadyPublished: [...new Set([
      ...computeRemovalInfo(liste).publishedActive,
      ...plateformesReserveesParRepublication(liste),
    ])],
    // À l'inverse, `plateformesLiberees` RETIRE Vinted du verrou quand
    // l'article est disparu : l'annonce n'existe plus, publier n'est donc pas
    // un doublon mais son seul retour en ligne.
    plateformesLiberees: item?.disparu_le ? ["vinted"] : [],
    // Deux formats coexistent en base : objets {type,url} (flux photos
    // retouchées) et STRINGS nues (URLs CDN Vinted écrites par la sync du
    // dressing) — urlsPhotos lit les deux, le stepper reçoit des URLs.
    initialPhotos: urlsPhotos(item?.photos),
    initialListing: {
      // ⚠️ L'article vient de mapItem (App.jsx), qui RENOMME les colonnes :
      // `titre` → `title` et `prix_vente` → `sell`. Lire les noms de COLONNE
      // ici rendait undefined, en silence.
      //   · titre perdu → detectObjectIcon n'avait plus que la description et
      //     le type. Les articles manuels étaient rattrapés par leur type ; les
      //     importés du dressing, dont le type est NULL (donc "Autre" après
      //     mapItem, donc l'icône 📦 « non catégorisable »), tombaient à 0
      //     plateforme sur 4 : « catégorie non disponible » sur les quatre,
      //     alors que leur titre suffisait à les classer (mesuré : 27 titres
      //     sur 28) ;
      //   · prix_vente perdu → le prix suggéré retombait TOUJOURS sur le prix
      //     d'ACHAT, ce que le commentaire d'origine ne voulait pas.
      // Les deux noms sont acceptés : un futur appelant qui passerait une
      // ligne brute de la base marchera aussi.
      titre:       item?.title ?? item?.titre ?? null,
      description: item?.description ?? null,
      categorie:   item?.type ?? null,
      // (03/10) La famille de la fiche (attributs.famille.v) : sans elle, un livre
      // publié depuis le Stock n'armait pas la maison des livres (Blancheneige
      // de geronimo0550 rangé en modélisme ferroviaire sur eBay).
      famille:     item?.famille ?? item?.attributs?.famille?.v ?? null,
      // Catalogue Vinted d'origine (2026-09-07) : il FAIT AUTORITÉ sur la
      // famille de l'article — un vêtement selon Vinted ne peut pas partir en
      // Maison & Jardin chez Leboncoin (garde-fou categorieGardeFou.js, job
      // c324b5ee). Rempli au clic Publier depuis le détail Vinted ; absent, le
      // garde-fou retombe sur les signaux de la fiche, jamais sur un blocage.
      vinted_catalog_id: item?.vinted_catalog_id ?? null,
      marque:      item?.marque ?? null,
      // ── LES ATTRIBUTS DE LA FICHE ENTRENT DANS LE STEPPER (18/09) ──
      // Cet objet est une liste BLANCHE, et `attributs` n'y était pas : taille,
      // genre, matière et couleur mouraient ICI, à la porte.
      // ⛔ On passe l'OBJET tel qu'il est en base ({ v, at, source }) : c'est
      //    le lecteur partagé (mergeFieldsWithLens) qui sait le lire, et lui
      //    seul — on ne l'aplatit pas au passage, sinon on perdrait la source.
      // ⛔ Et la SOURCE NE FILTRE RIEN : releve_ebay, releve_leboncoin,
      //    releve_beebs, releve_opla, vinted_liste, vinted_detail, capture —
      //    toutes se valent. Une taille est une taille.
      attributs:   item?.attributs ?? null,
      // ── QUI A ÉCRIT LE TEXTE DE CET ARTICLE (2026-09-21) ───────────
      // `origine` est le SEUL marqueur que portent les articles rattachés : un
      // `releve_beebs` / `releve_leboncoin` a le texte de son annonce et AUCUN
      // `attributs.description_source`. Sans elle, l'écran ne pouvait pas
      // savoir que le titre et la description affichés sont ceux du vendeur.
      // MÊME LISTE que le serveur (generate-listing).
      origine:     item?.origine ?? null,
      // Sources du prix, de la plus vraie à la moins (2026-08-10, job
      // leboncoin 5229736d — un prix d'ACHAT parti en prix de vente) :
      //   1. le prix DEMANDÉ sur l'annonce Vinted (dernier relevé) ;
      //   2. le prix de vente déclaré sur la fiche ;
      //   3. RIEN. Champ vide plutôt que faux : la garde de publication
      //      (≥ 1 €) interdit toute annonce sans prix.
      // ⚠️ Jamais de repli sur prix_achat.
      prix_vente_suggere: prixVinted ?? item?.sell ?? item?.prix_vente ?? null,
      // ── LE POIDS DE LA FICHE (04/10, Louis) ──
      // inventaire.poids_g (grammes, NULL = inconnu). Le stepper en pré-remplit
      // le « Poids du colis » de la copie Leboncoin quand elle n'en a pas
      // (ListingPreviewScreen, comblerPoidsFiche) : sans cette ligne, il
      // mourrait ici, à la porte de la liste blanche — comme `attributs` le
      // 18/09. Il n'entre dans AUCUNE signature de génération (`src` y est
      // construit champ par champ) : aucune rédaction déjà payée n'est ratée.
      poids_g:     item?.poids_g ?? null,
    },
    // Photos déjà retouchées PAR NOUS (2026-08-05) : détection par la source
    // UNIQUE isRetouchedPhotoEntry, sur les photos BRUTES de la ligne — le
    // stepper ne reçoit que des URLs aplaties.
    alreadyRetouched: Array.isArray(item?.photos) && item.photos.some(isRetouchedPhotoEntry),
  };
}
