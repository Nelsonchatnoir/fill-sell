// ═══════════════════════════════════════════════════════════════════════════
// GARDE-FOU DE CATÉGORIE (2026-09-07, demande Nico après le job c324b5ee)
// ═══════════════════════════════════════════════════════════════════════════
// « Ensemble thermique d'intérieur S » — un vêtement de josephinecerni — est
// parti sur Leboncoin en Maison & Jardin > Électroménager. Chaîne complète :
// detectObjectIcon ne trouve AUCUN mot-objet dans le titre (« ensemble » ne
// compte que sur un article bébé, « thermique » n'est dans aucune règle) →
// resolveArticleIcon fait confiance au category_icon rendu par Haiku (une
// icône de chauffage) → lbcCategories suit → deux critères d'électroménager à
// remplir sur un vêtement. Leboncoin, lui, suggérait « Mode > Vêtements ».
//
// DEUX AUTORITÉS, dans cet ordre :
//   1. Le catalog_id Vinted d'origine. Quand Vinted dit vêtement / chaussure /
//      accessoire, la catégorie Leboncoin ne peut JAMAIS sortir de Mode —
//      l'icône de l'IA ne peut pas contredire le catalogue de la plateforme
//      qui héberge déjà l'annonce (table relevée en direct, cf.
//      vintedCatalogMode.js).
//   2. À défaut de catalog_id : les SIGNAUX DE LA FICHE (genre humain, taille
//      de vêtement). Une icône devinée par l'IA SEULE — sans mot-objet — ne
//      peut pas envoyer dans un rayon d'OBJETS un article qui porte un genre
//      ou une taille de vêtement. Ce garde-fou ne se déclenche jamais quand un
//      mot-objet a parlé (« bouilloire », « aspirateur » : la règle mot-clé est
//      auditée, elle fait foi) ni sur le rayon Sport (un maillot de foot a sa
//      place dans Loisirs > Sport & Plein air).
//
// Ce module ne DEVINE rien : il refuse une famille, il n'en invente pas.
// ═══════════════════════════════════════════════════════════════════════════

import { brancheModeDuCatalogue, LBC_FEUILLE_PAR_BRANCHE, ICONE_PAR_BRANCHE } from "./vintedCatalogMode";

// Racines Leboncoin qui ne peuvent pas contenir un vêtement porté (relevé de
// l'arbre LBC, cf. lbcCategories.js). « Famille » en est ABSENTE : c'est là que
// vivent les vêtements bébé. « Loisirs » aussi : c'est le rayon Sport.
const RACINES_OBJET_LBC = new Set([
  "Maison & Jardin", "Électronique", "Multimédia", "Divers", "Matériel professionnel",
  "Véhicules", "Immobilier", "Emploi", "Services", "Animaux", "Locations de vacances",
]);

const GENRES_MODE = /^(femme|homme|fille|gar[çc]on|b[ée]b[ée]|enfant|mixte|unisexe)$/i;

// Taille de VÊTEMENT ou de chaussure — les formes réellement écrites par nos
// copies et par Vinted : lettres (XS…5XL, « Taille unique »), tailles FR
// adultes (32-58), pointures (16-50), âges (« 3 ans », « 24 mois »), et les
// composées (« 38 - M », « M / 38 »). Un nombre nu hors de ces plages ne
// compte pas : « 500 » (watts) ne doit pas passer pour une taille.
const TAILLE_MODE_RE = new RegExp(
  "^(" +
  "(x{0,4}s|x{0,4}l|m|xxs|xxl|xxxl|[2-9]xl|taille unique|unique|universel)" +
  "|(\\d{1,2}\\s*(ans?|mois))" +
  "|(\\d{2,3}\\s*cm)" +
  "|((eu|uk|us|fr)\\s*)?\\d{2}(\\s*[-/]\\s*[a-z0-9]{1,4})?" +
  ")$", "i"
);

function estTailleMode(taille) {
  const t = String(taille ?? "").trim();
  if (!t) return false;
  if (!TAILLE_MODE_RE.test(t)) return false;
  // Plage de sécurité pour les nombres nus : tailles FR 30-58, pointures 16-50.
  const nu = t.match(/^(?:(?:eu|uk|us|fr)\s*)?(\d{2,3})/i);
  if (nu) {
    const n = Number(nu[1]);
    if (!(n >= 16 && n <= 58) && !/cm|ans?|mois/i.test(t)) return false;
  }
  return true;
}

/**
 * Applique les deux autorités au chemin Leboncoin calculé par l'icône.
 *
 * @param {object} p
 * @param {string[]|null} p.cheminCalcule  [racine, feuille] issu de l'icône, ou null
 * @param {number|string|null} p.catalogId  inventaire.vinted_catalog_id
 * @param {string} p.genre                  genre de la copie (univers/genre)
 * @param {string} p.taille                 taille de la copie
 * @param {string} p.sourceIcone            "mot_cle" | "ia" | "famille_livres" | "type" | "defaut"
 * @returns {{chemin: string[]|null, source: string, corrige: boolean, motif: string|null, icone: string|null}}
 *   `source` : d'où vient la catégorie FINALE (catalog_vinted | signaux_fiche |
 *   la sourceIcone d'origine). `icone` : icône imposée par la correction, sinon null.
 */
export function gardeFouCategorieLbc({ cheminCalcule, catalogId, genre, taille, sourceIcone }) {
  const chemin = Array.isArray(cheminCalcule) && cheminCalcule.length ? cheminCalcule : null;
  const racine = chemin?.[0] ?? null;

  // ── AUTORITÉ 1 : le catalogue Vinted d'origine ──────────────────────────
  const branche = brancheModeDuCatalogue(catalogId);
  if (branche) {
    if (racine === "Mode") {
      return { chemin, source: "catalog_vinted", corrige: false, motif: null, icone: null };
    }
    return {
      chemin: LBC_FEUILLE_PAR_BRANCHE[branche],
      source: "catalog_vinted",
      corrige: true,
      motif: `Vinted range cet article en ${branche.replace("_", " / ")} (catalog_id ${catalogId})`
        + (chemin ? ` — « ${chemin.join(" > ")} » écarté` : ""),
      icone: ICONE_PAR_BRANCHE[branche] ?? null,
    };
  }

  // ── AUTORITÉ 2 : les signaux de la fiche, contre l'IA SEULE ──────────────
  if (sourceIcone === "ia" && racine && RACINES_OBJET_LBC.has(racine)) {
    const genreMode = GENRES_MODE.test(String(genre ?? "").trim());
    const tailleMode = estTailleMode(taille);
    if (genreMode || tailleMode) {
      const signaux = [genreMode ? `genre « ${String(genre).trim()} »` : null,
                       tailleMode ? `taille « ${String(taille).trim()} »` : null].filter(Boolean).join(" et ");
      return {
        chemin: LBC_FEUILLE_PAR_BRANCHE.vetements,
        source: "signaux_fiche",
        corrige: true,
        motif: `aucun mot-objet dans le titre : l'icône venait de l'IA seule, et l'article porte ${signaux}`
          + ` — « ${chemin.join(" > ")} » écarté`,
        icone: ICONE_PAR_BRANCHE.vetements,
      };
    }
  }

  return { chemin, source: sourceIcone, corrige: false, motif: null, icone: null };
}

/**
 * La catégorie est-elle une simple SUPPOSITION de l'IA, qu'aucune source
 * fiable ne confirme ? L'extension (0.6.21) préfère alors la suggestion que
 * Leboncoin affiche lui-même à partir du titre ; les versions antérieures
 * ignorent le drapeau et utilisent le chemin, qui reste posé.
 */
export function categorieIncertaine({ sourceFinale, catalogId }) {
  return sourceFinale === "ia" && !brancheModeDuCatalogue(catalogId);
}

export const _internes = { estTailleMode, RACINES_OBJET_LBC };
