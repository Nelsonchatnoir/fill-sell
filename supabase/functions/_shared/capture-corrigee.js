// ═══════════════════════════════════════════════════════════════════════════
// VINTED : LA CAPTURE CORRIGÉE PAR LA FICHE AVANT LA RECRÉATION (22/10 nuit, décisions de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une republication Vinted recrée l'annonce depuis sa CAPTURE (l'annonce en ligne, relue juste avant le retrait) :
// « elle remet exactement ce qui était en ligne » (règle du 27/09). Deux exceptions, décidées par Nico le 22/10, pour
// une annonce que FillSell a lui-même déposée (jamais une annonce née sur Vinted, `vinted_sync`, dont le vendeur a
// choisi les champs) :
//   1. une ŒUVRE D'ART reconnue (src/utils/oeuvreDArt.js) rangée hors du rayon des œuvres (« Toiles et panneaux »,
//      « Encadrements »… — paugues) repart dans « Peintures » (3847) ou « Affiches et reproductions » (3849) ;
//   2. un ÉTAT plus bas que celui de la fiche (« Bon état » en ligne, « Très bon état » sur la fiche) repart avec
//      l'état de la fiche — l'état du vendeur n'est jamais dégradé (point 8).
// Rien d'autre n'est touché (titre, texte, prix, photos, taille, marque : ceux de l'annonce en ligne).
// Pur : lu par get-pending-jobs (Deno) et par les selftests (Node).
import { oeuvreDArt, rayonVintedOeuvre } from "../../../src/utils/oeuvreDArt.js";
import { tierEtat, RANG_ETAT, etatPourPlateforme } from "./etat-plateformes.js";
import { idEtatVinted } from "../../../src/utils/etatsVinted.js";

const FEUILLES_OEUVRES = new Set([3847, 3849]);

/**
 * @param fiche     {origine, titre, description, attributs}
 * @param libelles  la capture : libelles (categoryPath, catalog_id_depot, etat)
 * @param natif     la capture : payload.natif (catalog_id, status_id)
 * @param {string | null} [etatAvantCapture]  l'état de la fiche relevé AVANT la capture (job.platform_fields.etat_fiche_avant_capture) :
 *                  la capture réécrit l'état de la fiche (capture_vers_inventaire_attributs) avec celui de l'annonce —
 *                  c'est celui d'avant qui fait foi
 * @returns null (rien à corriger) | {libelles, natif, raisons: string[], avant: object}
 */
export function correctionCaptureVinted(fiche, libelles, natif, etatAvantCapture = null) {
  if (!fiche || String(fiche.origine ?? "") === "vinted_sync") return null;   // annonce née sur Vinted : celle du vendeur
  const lib = { ...(libelles && typeof libelles === "object" ? libelles : {}) };
  const nat = { ...(natif && typeof natif === "object" ? natif : {}) };
  const avant = { categoryPath: lib.categoryPath ?? null, catalog_id_depot: lib.catalog_id_depot ?? null, etat: lib.etat ?? null, status_id: nat.status_id ?? null };
  const raisons = [];

  // 1. L'œuvre au rayon des œuvres.
  const oeuvre = oeuvreDArt(fiche.titre, fiche.description);
  if (oeuvre) {
    const cat = Number(lib.catalog_id_depot ?? nat.catalog_id);
    if (!FEUILLES_OEUVRES.has(cat)) {
      const f = rayonVintedOeuvre(oeuvre.famille);
      lib.categoryPath = [...f.chemin];
      lib.catalog_id_depot = f.id;
      raisons.push("categorie_oeuvre");
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
  return raisons.length ? { libelles: lib, natif: nat, raisons, avant } : null;
}
