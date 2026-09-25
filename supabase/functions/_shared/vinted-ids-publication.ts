// ============================================================================
// LES IDENTIFIANTS VINTED D'UNE PUBLICATION (zone euro, 25/09/2026)
//
// L'app écrit une publication Vinted en LIBELLÉS FRANÇAIS : categoryPath
// (« Hommes > Vêtements > … »), etat (« Très bon état »), colors (« Rouge »).
// Sur un compte Vinted qui n'est pas en français (Alberto : vinted.fr servi en
// italien), aucun de ces libellés n'existe sur le formulaire. La 0.6.69 sait
// poser la catégorie, l'état et les couleurs par IDENTIFIANT — elle les lit
// dans platform_fields.vinted_ids, et SEULEMENT sur une page non française.
// Ce module traduit les libellés français en identifiants, par des tables
// RELEVÉES (jamais devinées) :
//   · catégories : arbre de vinted.fr (vinted-catalogue-fr.js, généré) ;
//   · états : table historique vinted-etat.ts (3 116 captures) ;
//   · couleurs : GET https://www.vinted.fr/api/v2/colors, relevé du 25/09
//     (29 couleurs, mêmes identifiants sur vinted.it et vinted.de).
// Un libellé qui ne se traduit pas → pas d'identifiant (la 0.6.69 retombe sur
// le libellé, comme avant). Jamais d'approximation.
// ============================================================================

import { CATALOGUE_VINTED_FR } from "./vinted-catalogue-fr.js";
import { VINTED_CONDITION_LIBELLES } from "./vinted-etat.ts";

/** GET https://www.vinted.fr/api/v2/colors, 25/09/2026 — id → libellé français. */
export const COULEURS_VINTED_FR: Readonly<Record<number, string>> = {
  1: "Noir", 3: "Gris", 12: "Blanc", 20: "Crème", 4: "Beige", 21: "Abricot", 11: "Orange",
  22: "Corail", 7: "Rouge", 23: "Bordeaux", 5: "Fuchsia", 24: "Rose", 6: "Violet", 25: "Lila",
  26: "Bleu clair", 9: "Bleu", 27: "Marine", 17: "Turquoise", 30: "Menthe", 10: "Vert",
  28: "Vert foncé", 16: "Kaki", 2: "Marron", 29: "Moutarde", 8: "Jaune", 13: "Argenté",
  14: "Doré", 15: "Multicolore", 32: "Transparence",
};

/** Racines renommées par Vinted — même table que vinted.js (RENOMMAGES_RACINE_VINTED). */
const RENOMMAGES_RACINE: Readonly<Record<string, string>> = { "Divertissement": "Livres et médias" };

const norm = (s: unknown) => String(s ?? "").normalize("NFC").replace(/\s+/g, " ").trim().toLowerCase();

type Ligne = [number, number, string];
const ENFANTS = new Map<number, Array<{ id: number; titre: string }>>();
for (const [id, parent, titre] of CATALOGUE_VINTED_FR as unknown as Ligne[]) {
  if (!ENFANTS.has(parent)) ENFANTS.set(parent, []);
  ENFANTS.get(parent)!.push({ id, titre: norm(titre) });
}

/** Chemin français → identifiant de la feuille. Ambigu ou absent → null. */
export function idCatalogueDuCheminFr(chemin: unknown): number | null {
  if (!Array.isArray(chemin) || !chemin.length) return null;
  let parent = 0;
  for (let i = 0; i < chemin.length; i++) {
    const brut = i === 0 ? (RENOMMAGES_RACINE[String(chemin[0])] ?? chemin[0]) : chemin[i];
    const cands = (ENFANTS.get(parent) ?? []).filter((e) => e.titre === norm(brut));
    if (cands.length !== 1) return null;
    parent = cands[0].id;
  }
  return parent || null;
}

/** « Très bon état » → 2. Inconnu → null. */
export function idEtatDuLibelleFr(libelle: unknown): number | null {
  const l = norm(libelle);
  if (!l) return null;
  const hit = Object.entries(VINTED_CONDITION_LIBELLES).find(([, t]) => norm(t) === l);
  return hit ? Number(hit[0]) : null;
}

/** [« Rouge », « Bordeaux »] → [7, 23]. Un libellé inconnu est ignoré. */
export function idsCouleursDesLibellesFr(libelles: unknown): number[] {
  const liste = Array.isArray(libelles) ? libelles : (libelles == null ? [] : [libelles]);
  const out: number[] = [];
  for (const l of liste) {
    const hit = Object.entries(COULEURS_VINTED_FR).find(([, t]) => norm(t) === norm(l));
    if (hit && !out.includes(Number(hit[0]))) out.push(Number(hit[0]));
  }
  return out.slice(0, 2);
}

/**
 * Les identifiants d'une publication Vinted, à partir de ses libellés
 * français. Une réponse de l'utilisateur dans vintedAspects (condition, color)
 * est un libellé DE SA PAGE : elle n'est jamais traduite ici — la 0.6.69 la
 * pose telle quelle et ignore l'identifiant correspondant.
 */
export function vintedIdsPourPublication(pf: Record<string, unknown>): Record<string, unknown> | null {
  const ids: Record<string, unknown> = {};
  const cat = idCatalogueDuCheminFr(pf.categoryPath);
  if (cat) ids.catalog_id = cat;
  const etat = idEtatDuLibelleFr(pf.etat);
  if (etat) ids.status_id = etat;
  const couleurs = idsCouleursDesLibellesFr(pf.colors);
  if (couleurs.length) ids.color_ids = couleurs;
  return Object.keys(ids).length ? ids : null;
}
