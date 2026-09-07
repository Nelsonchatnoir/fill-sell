// ═══════════════════════════════════════════════════════════════════════════
// AUTORITÉ DE FAMILLE : le catalog_id Vinted d'origine (2026-09-07)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur (job c324b5ee, josephinecerni, 07/09) : « Ensemble thermique
// d'intérieur S » — un VÊTEMENT — est parti en Maison & Jardin >
// Électroménager. Chaîne du bug : detectObjectIcon ne trouve aucun mot-objet
// dans le titre → resolveArticleIcon fait confiance au category_icon rendu par
// Haiku (une icône de chauffage) → lbcCategories suit. Leboncoin, lui,
// suggérait « Mode > Vêtements ».
//
// RÈGLE POSÉE PAR NICO : quand Vinted dit vêtement / chaussure / accessoire,
// la catégorie Leboncoin ne peut JAMAIS sortir de Mode. L'icône de l'IA ne
// peut pas contredire le catalogue de la plateforme d'origine.
//
// Données RELEVÉES EN DIRECT le 07/09/2026 sur l'API du formulaire Vinted
// (GET /api/v2/item_upload/catalogs, session de Nico, un seul appel) — jamais
// devinées. 8 racines : Femmes 1904, Hommes 5, Enfants 1193, Maison 1918,
// Électronique 2994, Livres et médias 2309, Loisirs et collections 4824,
// Sport 4332.
// Branches retenues comme MODE (668 identifiants, sous-arbres complets) :
//   Femmes > Vêtements (4) · Chaussures (16) · Sacs (19) · Accessoires (1187)
//   Hommes > Vêtements (2050) · Chaussures (1231) · Accessoires (82)
//   Enfants > Vêtements pour filles (1195) · Vêtements pour garçons (1194)
//
// ⛔ EXCLUES VOLONTAIREMENT : « Femmes > Beauté » et « Hommes > Soins »
// (cosmétiques — Leboncoin les INTERDIT, cf. estCosmetiqueInterditeLbc), et
// la racine Sport (un maillot de foot a sa place dans Loisirs > Sport & Plein
// air chez Leboncoin : forcer Mode y serait une régression).
//
// Encodage : identifiants triés, écrits en DELTAS base 36 séparés par « . »
// (668 identifiants en ~1,4 Ko au lieu de ~5 Ko). Décodés une seule fois, à la
// première question posée.
// ═══════════════════════════════════════════════════════════════════════════

const DELTAS_VETEMENTS =
  "4.4.1.1.1.1.1.1.1.3.a.1.1.2.2.13.3.1.2.1.3.1.1.7.r.1.3.1.1g.2.1.4.1.1.2.2.1.1.1.1.1.1.1.1.1.1.1.3.1.1.d.1.1.1.1.1.1.1.2.1.1.s.2.1.1.2.1.1.1.1.1.3.1.71.1.3.3.2.2.2.m.b.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.ca.5.2.4.1.1.1.1.a.1.1.1.1.1.1.4.1.1.3.1.5.2.1.1.6.1.3.9.1.1.2.m.1.2.1.2.1.2.16.1.1.1.2.1.1.1.1.1.8.1.1.1.1.1.1.1.1.1.1.1.1.h.1.1.1.1.3.d.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.4.1.4w.1.1.2.1.q.1.2.1.10.4.1.1.1.1.1.2.4.1.2.2.3.1.1.1.1.1.1.1.1.1.1.1.4.1.1.1.2.1.5.1.2.3.3.6.3.1.2.1.1.2.2.4.2.1.1.2.1.1.2.1.1.2.2.8.1.1.2.o.1.1.1.1" +
  ".1.2.4.2.2.3.1.1.1.1.1.1.1.1.1.1.1.1.1.n.1.1.3.1.c.q.1.2.2.1.2.1.1.1.1.2.1.2.1.1.1.1.1.b.1.1.1.1.1.1.1.1.1.4.1.1.1.1.b.1.1.1.1.1.1.1.2.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.3.1.1.4.1.2.1.1.1.1.1.1.1.1.1.1.b.1.2.3.1.1.1.1.2.1.1.2.1.2.1.2.1.2.3.1.k.1.9.3p.1.1.r.1.2.1.1.c8.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.6.2.1.1.1.1.5.1.7.6.6.2.2.3.1.2.1.1.24.1.1.1.2.1.1.1.3.1.2.1.2.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.2.1.1.1.1.2.1.1.1.2.1.4.1.1.1.1.2.1.1.1.1.1.4d.1.1.1.1.d.1.3d.1.61.1.1pr.1";

const DELTAS_CHAUSSURES =
  "g.5f.2.2.94.e2.52.2.5.4.5u.1.e.94.mv.1.1.1.1.1.7.2.7.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.1.2.2.1.1.1.8.1.1.1.1.1.1.1.1.1.1.1.1.1.1.7b.1.1.1.1.1.1.d.1.1";

const DELTAS_SACS_ACCESSOIRES =
  "j.1.1.1.4.1k.4.1.1.1.1.1.3.1.1.1.1.1.1l.1.1.1.1.1.1.1.1.1.1.1.1r.1.3.7.1.1.1.2.1.1.13.1.7c.1.fu.h.1b.gl.1.c.1.1.1.1c.1.1.1.1.a.tp.1.1.1.1.1.1.1.1.1.1.1.1.1.1.b.1.1.1.1.1.1.1.1.1.1.1";

function decoder(deltas) {
  const out = new Set();
  let courant = 0;
  for (const d of deltas.split(".")) {
    courant += parseInt(d, 36);
    out.add(courant);
  }
  return out;
}

let _tables = null;
function tables() {
  if (!_tables) {
    _tables = {
      vetements: decoder(DELTAS_VETEMENTS),
      chaussures: decoder(DELTAS_CHAUSSURES),
      sacs_access: decoder(DELTAS_SACS_ACCESSOIRES),
    };
  }
  return _tables;
}

/** Nombre d'identifiants par branche — sert au contrôle d'intégrité du relevé. */
export function tailleTablesMode() {
  const t = tables();
  return { vetements: t.vetements.size, chaussures: t.chaussures.size, sacs_access: t.sacs_access.size };
}

/**
 * La branche MODE d'un catalog_id Vinted, ou null si l'identifiant n'est pas
 * dans une branche mode (Maison, Électronique, Livres, Sport, jouets, beauté…)
 * ou n'est pas exploitable. Un `null` ne veut JAMAIS dire « pas un vêtement » :
 * il veut dire « le catalogue Vinted ne tranche pas » — l'appelant garde alors
 * son comportement d'avant.
 * @returns {"vetements"|"chaussures"|"sacs_access"|null}
 */
export function brancheModeDuCatalogue(catalogId) {
  const id = Number(catalogId);
  if (!Number.isFinite(id) || id <= 0) return null;
  const t = tables();
  if (t.vetements.has(id)) return "vetements";
  if (t.chaussures.has(id)) return "chaussures";
  if (t.sacs_access.has(id)) return "sacs_access";
  return null;
}

/**
 * La feuille Leboncoin imposée par la branche Vinted — les trois feuilles du
 * rayon Mode de l'arbre LBC (cf. lbcCategories.js, relevé du formulaire).
 */
export const LBC_FEUILLE_PAR_BRANCHE = {
  vetements: ["Mode", "Vêtements"],
  chaussures: ["Mode", "Chaussures"],
  sacs_access: ["Mode", "Accessoires & Bagagerie"],
};

/** Icône d'objet représentative d'une branche — pour les mappings des autres plateformes. */
export const ICONE_PAR_BRANCHE = {
  vetements: "👕",
  chaussures: "👟",
  sacs_access: "👜",
};
