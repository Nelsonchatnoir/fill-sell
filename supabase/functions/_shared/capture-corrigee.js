// ═══════════════════════════════════════════════════════════════════════════
// VINTED : LA CAPTURE CORRIGÉE PAR LA FICHE AVANT LA RECRÉATION (22/10 nuit, décisions de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une republication Vinted recrée l'annonce depuis sa CAPTURE (l'annonce en ligne, relue juste avant le retrait) :
// « elle remet exactement ce qui était en ligne » (règle du 27/09). Deux exceptions, décidées par Nico le 22/10, pour
// une annonce que FillSell a lui-même déposée (jamais une annonce née sur Vinted, `vinted_sync`, dont le vendeur a
// choisi les champs) :
//   1. une ŒUVRE D'ART reconnue (src/utils/oeuvreDArt.js) rangée hors du rayon des œuvres (« Toiles et panneaux »,
//      « Encadrements »… — paugues) repart dans « Peintures » (3847) ou « Affiches et reproductions » (3849) —
//      jamais quand ce rayon n'offre pas le format de colis capturé, ou que sa grille est inconnue (A5, 24-25/10) ;
//   2. un ÉTAT plus bas que celui de la fiche (« Bon état » en ligne, « Très bon état » sur la fiche) repart avec
//      l'état de la fiche — l'état du vendeur n'est jamais dégradé (point 8).
// Rien d'autre n'est touché (titre, texte, prix, photos, taille, marque : ceux de l'annonce en ligne) — sauf (23/10,
// Thierry) les photos d'origine que le dépôt n'a pas eues : photosDeLaFicheALaRecreation, plus bas.
// Pur : lu par get-pending-jobs (Deno) et par les selftests (Node).
import { oeuvreDArt, rayonVintedOeuvre } from "../../../src/utils/oeuvreDArt.js";
import { tierEtat, RANG_ETAT, etatPourPlateforme } from "./etat-plateformes.js";
import { idEtatVinted } from "../../../src/utils/etatsVinted.js";
import { photosEnUrls, photoChezNous } from "./contenu-fiche.js";
import { grilleColisVinted } from "../../../src/utils/vintedColis.js";

const FEUILLES_OEUVRES = new Set([3847, 3849]);

/**
 * @param fiche     {origine, titre, description, attributs}
 * @param libelles  la capture : libelles (categoryPath, catalog_id_depot, etat)
 * @param natif     la capture : payload.natif (catalog_id, status_id)
 * @param {string | null} [etatAvantCapture]  l'état de la fiche relevé AVANT la capture (job.platform_fields.etat_fiche_avant_capture) :
 *                  la capture réécrit l'état de la fiche (capture_vers_inventaire_attributs) avec celui de l'annonce —
 *                  c'est celui d'avant qui fait foi
 * @param {{ grilleDuRayon?: (chemin: string[]) => Array<{id: number}> | null }} [o]  la grille de colis d'un rayon
 *                  (par défaut grilleColisVinted ; injectée par les selftests pour un rayon à grille inconnue)
 * @returns null (rien à corriger) | {libelles, natif, raisons: string[], avant: object}
 */
export function correctionCaptureVinted(fiche, libelles, natif, etatAvantCapture = null, { grilleDuRayon = grilleColisVinted } = {}) {
  if (!fiche || String(fiche.origine ?? "") === "vinted_sync") return null;   // annonce née sur Vinted : celle du vendeur
  const lib = { ...(libelles && typeof libelles === "object" ? libelles : {}) };
  const nat = { ...(natif && typeof natif === "object" ? natif : {}) };
  const avant = { categoryPath: lib.categoryPath ?? null, catalog_id_depot: lib.catalog_id_depot ?? null, etat: lib.etat ?? null, status_id: nat.status_id ?? null };
  const raisons = [];
  const ecartees = [];

  // 1. L'œuvre au rayon des œuvres.
  const oeuvre = oeuvreDArt(fiche.titre, fiche.description);
  if (oeuvre) {
    const cat = Number(lib.catalog_id_depot ?? nat.catalog_id);
    if (!FEUILLES_OEUVRES.has(cat)) {
      const f = rayonVintedOeuvre(oeuvre.famille);
      // (24/10, lot « zéro blocage », A5) Une correction de rayon ne change JAMAIS de famille de grille de
      // colis : paugues, 22/10 — deux tableaux en « Grand » (grille Petit/Moyen/Grand) déplacés en
      // « Peintures » (grille au poids) → pré-vol refusé « format non proposé ». Le format capturé absent de
      // la grille du rayon des œuvres : l'annonce garde son rayon (tracé, jamais un format choisi pour elle).
      // (25/10, A5 strict — paugues 110c27ae / 5ad5bbb1) La grille INCONNUE du rayon d'arrivée passait :
      // rien ne prouvait alors que le format capturé y était offert. Désormais la capture ne change de rayon
      // QUE si la grille du rayon d'arrivée est connue ET porte le format capturé (format inconnu de la
      // capture : rien à garder, la grille connue suffit). Sinon l'annonce garde son rayon, tracé.
      const colis = Number(nat.package_size_id);
      const grille = grilleDuRayon(f.chemin);
      const formatConnu = Number.isInteger(colis) && colis > 0;
      if (!Array.isArray(grille) || !grille.length) {
        ecartees.push({ raison: "colis_grille_inconnue", rayon: f.id, ...(formatConnu ? { colis } : {}) });
      } else if (formatConnu && !grille.some((g) => Number(g.id) === colis)) {
        ecartees.push({ raison: "colis_hors_grille", rayon: f.id, colis });
      } else {
        lib.categoryPath = [...f.chemin];
        lib.catalog_id_depot = f.id;
        raisons.push("categorie_oeuvre");
      }
    }
  }

  // 2. L'état du vendeur, jamais dégradé.
  const etatFiche = String(etatAvantCapture ?? fiche?.attributs?.etat?.v ?? "").trim();
  const tf = tierEtat(etatFiche);
  const tc = tierEtat(lib.etat);
  if (tf && tc && RANG_ETAT[tc] < RANG_ETAT[tf]) {
    const e = etatPourPlateforme(etatFiche, "vinted");
    const id = e?.valeur ? idEtatVinted(e.valeur) : null;
    if (e?.valeur && !e.meilleur && id) {
      lib.etat = e.valeur;
      nat.status_id = id;
      raisons.push("etat_de_la_fiche");
    }
  }
  return raisons.length ? { libelles: lib, natif: nat, raisons, avant, ...(ecartees.length ? { ecartees } : {}) } : null;
}

/**
 * (23/10, point 1 — Thierry, pièces de monnaie eBay) 3. LES PHOTOS D'ORIGINE QUE LE DÉPÔT N'A PAS EUES.
 * Une annonce Vinted partie AVANT que toutes les photos de son annonce d'origine soient lues (dépôt à la seule
 * vignette de 140 px, la fiche a reçu l'avers ET le revers ensuite) repart, à sa recréation, avec TOUTES les photos
 * de la fiche, dans l'ordre — hébergées chez nous (sinon on attend leur rapatriement : rien n'est retiré entre-temps).
 * ⛔ Seulement pour une fiche née d'un relevé (eBay, Leboncoin, Beebs, Depop) : jamais une annonce née sur Vinted.
 * ⛔ Jamais au-dessus d'un choix de la personne : copie retouchée (photo_option ≠ original), photos lues AVANT le
 *    dépôt (elle les avait sous les yeux), dépôt qui portait déjà autant de photos que la fiche.
 *
 * Aussi (feu vert de Nico, 23/10 12:05 : « en pleine taille ») quand la BASE a remis sur la fiche les photos de
 * l'annonce d'origine APRÈS le dépôt (`photosRemplaceesLe` : complétion, photos eBay reprises en pleine taille) et
 * qu'elles diffèrent de celles du dépôt (vignette de 140 px, version de 400 px) — jamais moins de photos.
 *
 * @param fiche         {origine, photos}
 * @param depot         le dépôt Vinted de l'annonce : {photos, photo_option, created_at}
 * @param {string | null} photosLuesLe  ISO — quand la fiche a reçu ses photos d'origine (fiches_contenu_vendeur.photos_lues_le)
 * @param {string | null} [photosRemplaceesLe] ISO — quand la base les a remises sur la fiche (journal, photos_origine_completees)
 * @returns null (rien à faire) | {photos: string[]} | {attendre: true} (photos pas encore chez nous)
 */
export function photosDeLaFicheALaRecreation(fiche, depot, photosLuesLe, photosRemplaceesLe = null) {
  if (!fiche || !depot) return null;
  if (!/^releve_[a-z]+$/.test(String(fiche.origine ?? ""))) return null;
  if (String(depot.photo_option ?? "original") !== "original") return null;
  const fp = photosEnUrls(fiche.photos);
  const dp = photosEnUrls(depot.photos);
  if (fp.length < 2 || fp.length < dp.length) return null;
  const t0 = Date.parse(String(depot.created_at ?? ""));
  const t1 = Date.parse(String(photosLuesLe ?? ""));
  const t2 = Date.parse(String(photosRemplaceesLe ?? ""));
  if (!Number.isFinite(t0)) return null;
  const plus = fp.length > dp.length && Number.isFinite(t1) && t1 > t0;
  const remplacees = Number.isFinite(t2) && t2 > t0 && fp.join("\n") !== dp.join("\n");
  if (!plus && !remplacees) return null;
  if (!fp.every(photoChezNous)) return { attendre: true };
  return { photos: fp };
}
