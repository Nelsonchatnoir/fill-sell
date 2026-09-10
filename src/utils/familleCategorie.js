// ═══════════════════════════════════════════════════════════════════════════
// LA FAMILLE D'UN CHEMIN — CONTRÔLE DE PLAUSIBILITÉ (2026-09-10)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : « Salopette Le Mont Saint Michel » (Victor, job dddc7f2a),
// genre Homme, catalogue Vinted 83 = Hommes > Vêtements. Le mot « salopette »
// n'a qu'UNE feuille dans l'arbre eBay relevé : « Auto, moto - pièces,
// accessoires > Casques, vêtements > Vêtements mécanicien > Combinaisons,
// salopettes » (177096). Elle passait le filtre de GENRE (aucune branche
// genrée sur ce chemin) et l'IA la retenait — c'était la seule candidate.
// Même famille de dérapages, jamais contrôlée : « miniature Renault » →
// Maison > Outils > Pinceaux, « robot cuiseur » → Électronique > Ordinateurs.
// Chaque fois le CHEMIN sortait de la FAMILLE de l'objet.
//
// LA RÈGLE : une feuille candidate, ou un chemin final, dont la famille est
// CONNUE et INCOMPATIBLE avec la famille de l'objet ne part jamais.
//
// La famille de l'OBJET ne vient que de sources CERTAINES — jamais d'un mot
// ou d'une icône devinés, qui sont précisément ce qu'on contrôle :
//   1. le catalog_id Vinted d'origine (branche mode relevée en direct) → mode ;
//   2. une icône dont la source est une AUTORITÉ (catalogue Vinted, famille
//      livres, pointure, signaux de la fiche) → la famille de sa racine
//      Leboncoin, la taxonomie que le garde-fou utilise déjà ;
//   3. une taille de vêtement / pointure / âge sur la fiche → mode.
//   ⛔ Le mot-clé du titre (source « mot_cle ») n'en fait PAS partie : il
//      vient du même titre que le mot-objet et peut le contredire (« chaussures
//      de basketball » : 🏀 contre « chaussures ») — un signal ne peut pas
//      arbitrer un autre signal de même rang.
// Famille inconnue → AUCUNE contrainte : comportement d'avant, à l'identique.
//
// Les familles sont un jeu FERMÉ et grossier, volontairement : on refuse un
// blazer en pièce de moto, pas un blazer en veste. Tout ce qui est ambigu
// rend null et ne refuse rien. « bebe » est compatible avec presque tout : les
// vêtements, jouets, meubles et soins de bébé vivent dans des rayons dédiés
// sur eBay (Bébé, puériculture), Leboncoin (Famille) et Beebs (Puériculture).
// ═══════════════════════════════════════════════════════════════════════════

import { brancheModeDuCatalogue } from "./vintedCatalogMode";
import { getLbcCategoryPath } from "./lbcCategories";
import { _internes as gardeFouInternes } from "./categorieGardeFou";

export const FAMILLES = Object.freeze([
  "mode", "bebe", "maison", "electronique", "loisirs", "beaute", "animaux", "vehicules",
]);

// Sources d'icône qui sont des AUTORITÉS (cf. categorieGardeFou.js) — jamais
// « ia » (supposition), jamais « mot_cle » (même rang que le mot-objet).
const SOURCES_ICONE_AUTORITE = new Set(["catalog_vinted", "famille_livres", "pointure", "signaux_fiche"]);

// Racine de chaque arbre relevé → famille. Absente de la table = inconnue.
const RACINES = {
  leboncoin: {
    "Mode": "mode", "Famille": "bebe", "Maison & Jardin": "maison", "Électronique": "electronique",
    "Loisirs": "loisirs", "Animaux": "animaux", "Véhicules": "vehicules",
  },
  ebay: {
    "Vêtements, accessoires": "mode", "Bijoux, montres": "mode",
    "Bébé, puériculture": "bebe",
    "Maison": "maison", "Bricolage": "maison", "Jardin, terrasse": "maison", "Électroménager": "maison",
    "Téléphonie, mobilité": "electronique", "Informatique, réseaux": "electronique",
    "Image, son": "electronique", "Photo, caméscopes": "electronique",
    "Jeux vidéo, consoles": "loisirs", "Livres, BD, revues": "loisirs", "Musique, CD, vinyles": "loisirs",
    "DVD, cinéma": "loisirs", "Instruments de musique": "loisirs", "Jouets et jeux": "loisirs",
    "Sports, vacances": "loisirs", "Collections": "loisirs", "Timbres": "loisirs", "Monnaies": "loisirs",
    "Loisirs créatifs": "loisirs", "Art, antiquités": "loisirs",
    "Beauté, bien-être, parfums": "beaute",
    "Auto, moto - pièces, accessoires": "vehicules",
    "Animalerie": "animaux",
  },
  beebs: {
    "Mode": "mode", "Jeux, jouets et loisirs": "loisirs", "Hygiène et beauté": "beaute",
    "Puériculture": "bebe", "Maison": "maison",
  },
  vinted: {
    "Maison": "maison", "Électronique": "electronique", "Livres et médias": "loisirs",
    "Loisirs et collections": "loisirs", "Sport": "loisirs",
  },
};

// Ce que chaque famille TOLÈRE en face (en plus d'elle-même).
const COMPATIBLES = {
  mode: new Set(["bebe"]),
  loisirs: new Set(["bebe"]),
  maison: new Set(["bebe"]),
  beaute: new Set(["bebe"]),
  bebe: new Set(["mode", "loisirs", "maison", "beaute"]),
  electronique: new Set([]),
  animaux: new Set([]),
  vehicules: new Set([]),
};

/**
 * La famille d'un chemin de catégorie d'une plateforme, ou null si elle est
 * inconnue / ambiguë. Ne regarde que la racine (et le 2e niveau quand la
 * racine mélange — Vinted Femmes/Hommes/Enfants, consoles sous Électronique).
 * @param {"vinted"|"ebay"|"beebs"|"leboncoin"} plateforme
 * @param {string[]} chemin
 * @returns {string|null}
 */
export function familleDeChemin(plateforme, chemin) {
  const c = Array.isArray(chemin) ? chemin.map((s) => String(s ?? "").trim()) : [];
  if (!c.length) return null;
  const [racine, niveau2 = ""] = c;
  if (plateforme === "vinted") {
    if (/^(femmes|hommes|enfants)$/i.test(racine)) {
      if (/v[êe]tements|chaussures|^sacs?$|accessoires|bijoux/i.test(niveau2)) return "mode";
      if (/beaut|soins/i.test(niveau2)) return "beaute";
      return null;
    }
    if (/^électronique$/i.test(racine) && /jeux vid[ée]o|consoles/i.test(niveau2)) return "loisirs";
  }
  if (plateforme === "leboncoin" && racine === "Électronique" && /consoles|jeux vid[ée]o/i.test(niveau2)) return "loisirs";
  return RACINES[plateforme]?.[racine] ?? null;
}

/** Deux familles peuvent-elles coexister ? Une famille inconnue tolère tout. */
export function famillesCompatibles(a, b) {
  if (!a || !b || a === b) return true;
  return Boolean(COMPATIBLES[a]?.has(b)) || Boolean(COMPATIBLES[b]?.has(a));
}

/**
 * La famille de l'OBJET, depuis les seules sources certaines de la fiche.
 * @param {object} p
 * @param {number|string|null} p.catalogId  inventaire.vinted_catalog_id
 * @param {string|null} p.icone             icône résolue (resolveArticleIconDetail)
 * @param {string} p.sourceIcone            sa source ("mot_cle" | "ia" | "catalog_vinted" | …)
 * @param {string} p.taille                 taille de la fiche
 * @returns {{famille: string|null, source: string|null}}
 */
export function familleDeLObjet({ catalogId = null, icone = null, sourceIcone = "", taille = "" } = {}) {
  if (brancheModeDuCatalogue(catalogId)) return { famille: "mode", source: "catalog_vinted" };
  if (icone && SOURCES_ICONE_AUTORITE.has(String(sourceIcone))) {
    const f = familleDeChemin("leboncoin", getLbcCategoryPath(icone) ?? []);
    if (f) return { famille: f, source: `icone_${sourceIcone}` };
  }
  if (gardeFouInternes.estTailleMode(taille)) return { famille: "mode", source: "taille" };
  return { famille: null, source: null };
}

/**
 * Le chemin est-il plausible pour un objet de cette famille ?
 * Rend le verdict ET les deux familles, pour la trace du job.
 */
export function plausibiliteDuChemin(plateforme, chemin, familleObjet) {
  const familleChemin = familleDeChemin(plateforme, chemin);
  const ok = famillesCompatibles(familleObjet, familleChemin);
  return { ok, familleObjet: familleObjet ?? null, familleChemin };
}

export const _internes = { RACINES, COMPATIBLES, SOURCES_ICONE_AUTORITE };
