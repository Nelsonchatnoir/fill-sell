// ═══════════════════════════════════════════════════════════════════════════
// GARDE-FOU DE CATÉGORIE — LES QUATRE PLATEFORMES (2026-09-07)
// ═══════════════════════════════════════════════════════════════════════════
// Première version (matin du 07/09, job c324b5ee) : « Ensemble thermique
// d'intérieur S », un VÊTEMENT, parti sur Leboncoin en Maison & Jardin >
// Électroménager. Elle ne protégeait QUE Leboncoin, et corrigeait le CHEMIN
// Leboncoin.
//
// Le soir même, ornellaracano : « Lot de 4 taies d'oreiller coton beige et
// rose ». Relevé en base sur les 4 jobs (16h34) :
//   · vinted    → Femmes > Beauté > Soins du visage            needs_user
//   · beebs     → Hygiène et beauté > Soins visage et corps     needs_user
//   · ebay      → Beauté > Soins de la peau > Hydratants (21205) needs_user
//   · leboncoin → Divers > Autres                               PUBLIÉ
// Une seule icône devinée par Haiku (🧴) pilotait les QUATRE arbres ; un seul
// avait un filet — et ce filet n'a même pas joué : Leboncoin est passé parce
// que 🧴 y tombe dans le fourre-tout « Divers > Autres », qui n'exige rien.
//
// ⚠️ ET L'ÉTAT NE MANQUAIT PAS : les 4 jobs portaient `etat = "Très bon état"`.
// Le needs_user « État exigé » était une CONSÉQUENCE du rayon : les rayons
// beauté de Vinted, Beebs et eBay n'acceptent qu'un état « neuf / non ouvert ».
// Une mauvaise catégorie se paie donc en publication BLOQUÉE, pas seulement en
// annonce mal rangée.
//
// D'OÙ LA RÈGLE : LE GARDE-FOU CORRIGE L'ICÔNE, PAS UN CHEMIN.
// L'icône est le pivot unique dont dérivent les quatre catégories
// (getLbcCategoryPath, getVintedCategoryPath, getEbayCategoryPath,
// getBeebsCategoryPath). La corriger une fois protège les quatre plateformes,
// et rend structurellement impossible qu'une plateforme reçoive un filet que
// les autres n'ont pas.
//
// TROIS AUTORITÉS, dans cet ordre :
//   1. Le catalog_id Vinted d'origine. Quand Vinted dit vêtement / chaussure /
//      accessoire, l'article ne peut sortir du textile sur AUCUNE plateforme —
//      l'icône de l'IA ne peut pas contredire le catalogue de la plateforme
//      qui héberge déjà l'annonce (table relevée en direct, vintedCatalogMode).
//   2. Les SIGNAUX DE LA FICHE (genre humain, taille de vêtement) : une icône
//      devinée par l'IA SEULE — sans mot-objet — ne peut pas envoyer dans un
//      rayon d'OBJETS un article qui porte un genre ou une taille de vêtement.
//   3. Le RAYON BEAUTÉ, ajouté le 07/09 au soir. Symétrique de la 2 : une icône
//      devinée par l'IA seule ne peut pas faire ENTRER dans le rayon beauté un
//      article dont notre propre fiche dit qu'il n'en est pas un. Mesuré le
//      11/08 sur 4 881 lignes d'inventaire : 205 tombent sur une icône
//      cosmétique et 166 (81 %) n'en sont pas — c'est, de loin, la famille la
//      plus sur-déclenchée du système, et celle dont l'erreur coûte le plus
//      cher (publication bloquée, cf. ci-dessus).
//
// Aucune de ces autorités ne DEVINE : chacune REFUSE une famille au nom d'une
// source certaine, elle n'en invente aucune. Un mot-objet audité
// (« bouilloire ») n'est JAMAIS écarté : la règle mot-clé fait foi.
// ═══════════════════════════════════════════════════════════════════════════

import { brancheModeDuCatalogue, ICONE_PAR_BRANCHE, LBC_FEUILLE_PAR_BRANCHE } from "./vintedCatalogMode";
import { getLbcCategoryPath } from "./lbcCategories";

// L'arbre Leboncoin sert ici de TAXONOMIE DE L'ICÔNE — pas de catégorie de
// publication. C'est le seul relevé complet qui range chaque icône du système
// dans une famille ; la question posée est « cette icône désigne-t-elle un
// objet ou un vêtement ? », et sa réponse ne dépend pas de la plateforme visée.
// « Famille » est ABSENTE de la liste : c'est là que vivent les vêtements bébé.
// « Loisirs » aussi : c'est le rayon Sport (un maillot de foot y a sa place).
const RACINES_OBJET_LBC = new Set([
  "Maison & Jardin", "Électronique", "Multimédia", "Divers", "Matériel professionnel",
  "Véhicules", "Immobilier", "Emploi", "Services", "Animaux", "Locations de vacances",
]);

// Les quatre icônes du rayon beauté (cf. ICON_LEGEND de shared.js). 🪒 en est
// EXCLU : un rasoir électrique est un APPAREIL, rangé en électroménager par
// l'arbre Leboncoin, et sa catégorie n'a jamais bloqué personne.
const ICONES_COSMETIQUES = new Set(["🌸", "💄", "💅", "🧴"]);

// Ce que la FICHE dit d'elle-même quand elle parle de beauté : le type produit
// (detectType / stepper, colonne inventaire.type) et la famille fermée du
// schéma Lens. Une fiche qui dit « Beauté » garde évidemment son rayon beauté.
const TYPE_BEAUTE = /beaut|cosm[ée]t|parfum|maquillage|hygi[èe]ne/i;

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

/** La racine Leboncoin d'une icône — sa FAMILLE, indépendamment de la plateforme visée. */
function racineDeLIcone(icone) {
  return getLbcCategoryPath(icone)?.[0] ?? null;
}

/**
 * Le garde-fou, appliqué à l'ICÔNE — donc aux quatre plateformes à la fois.
 *
 * @param {object} p
 * @param {string|null} p.icone       icône résolue (resolveArticleIconDetail)
 * @param {string} p.sourceIcone      "mot_cle" | "ia" | "famille_livres" | "detection" | "pointure" | "defaut"
 * @param {number|string|null} p.catalogId  inventaire.vinted_catalog_id
 * @param {string} p.genre            genre de la fiche (genre / univers)
 * @param {string} p.taille           taille de la fiche
 * @param {string} p.typeFiche        type produit de la fiche (inventaire.type : Maison, Beauté…)
 * @param {string} p.familleFiche     famille fermée du schéma Lens, si présente
 * @param {string|null} p.iconeSansIa ce que la détection rendrait SANS l'icône
 *                                    de l'IA (défaut de type) — seule valeur de
 *                                    repli acceptée par l'autorité 3
 * @returns {{icone: string|null, source: string, corrige: boolean, motif: string|null, iconeEcartee: string|null}}
 */
export function gardeFouCategorie({
  icone, sourceIcone, catalogId, genre, taille,
  typeFiche = "", familleFiche = "", iconeSansIa = null,
}) {
  const racine = racineDeLIcone(icone);

  // ── AUTORITÉ 1 : le catalogue Vinted d'origine ──────────────────────────
  const branche = brancheModeDuCatalogue(catalogId);
  if (branche) {
    if (racine === "Mode") {
      return { icone, source: "catalog_vinted", corrige: false, motif: null, iconeEcartee: null };
    }
    return {
      icone: ICONE_PAR_BRANCHE[branche] ?? icone,
      source: "catalog_vinted",
      corrige: true,
      motif: `Vinted range cet article en ${branche.replace("_", " / ")} (catalog_id ${catalogId})`
        + (icone ? ` — l'icône « ${icone} » est écartée` : ""),
      iconeEcartee: icone ?? null,
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
        icone: ICONE_PAR_BRANCHE.vetements,
        source: "signaux_fiche",
        corrige: true,
        motif: `aucun mot-objet dans le titre : l'icône venait de l'IA seule, et l'article porte ${signaux}`
          + ` — l'icône « ${icone} » est écartée`,
        iconeEcartee: icone ?? null,
      };
    }
  }

  // ── AUTORITÉ 3 : on n'ENTRE pas dans le rayon beauté sur une supposition ──
  // Symétrique de l'autorité 2. Ne se déclenche que si TOUT est réuni :
  // l'icône vient de l'IA SEULE, elle est cosmétique, la fiche dit
  // explicitement autre chose, et il existe un repli qui n'est pas de l'IA.
  // Sans ce repli, on ne corrige PAS : refuser sans savoir quoi mettre à la
  // place serait deviner, et un article sans catégorie ne part nulle part.
  if (sourceIcone === "ia" && ICONES_COSMETIQUES.has(icone)) {
    const type = String(typeFiche ?? "").trim();
    const famille = String(familleFiche ?? "").trim();
    const ficheParle = Boolean(type || famille);
    const ficheDitBeaute = TYPE_BEAUTE.test(type) || TYPE_BEAUTE.test(famille);
    const repli = iconeSansIa && iconeSansIa !== icone && !ICONES_COSMETIQUES.has(iconeSansIa)
      ? iconeSansIa : null;
    if (ficheParle && !ficheDitBeaute && repli) {
      return {
        icone: repli,
        source: "signaux_fiche",
        corrige: true,
        motif: "aucun mot-objet dans le titre : le rayon beauté venait de l'IA seule, et la fiche dit "
          + (type ? `« ${type} »` : `famille « ${famille} »`)
          + ` — l'icône « ${icone} » est écartée (les rayons beauté de Vinted, Beebs et eBay`
          + " n'acceptent qu'un état neuf : l'article y serait bloqué)",
        iconeEcartee: icone,
      };
    }
  }

  return { icone, source: sourceIcone, corrige: false, motif: null, iconeEcartee: null };
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

export const _internes = {
  estTailleMode, racineDeLIcone,
  RACINES_OBJET_LBC, ICONES_COSMETIQUES, LBC_FEUILLE_PAR_BRANCHE,
};
