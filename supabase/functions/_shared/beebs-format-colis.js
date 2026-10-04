// ═══════════════════════════════════════════════════════════════════════════
// BEEBS : LE FORMAT DE COLIS À POSER, EXPLICITE (04/10, Louis — point 2)
// ═══════════════════════════════════════════════════════════════════════════
// Rangements de Louis : « Poids jusqu'à 200g max » sur l'annonce, « 1 kg » à
// la recréation (le remplisseur gardait le pré-remplissage de Beebs). Le
// serveur dit à l'extension (0.6.95+, beebs.js formatColisExplicite) quel
// palier poser, dans cet ordre :
//   1. le format relu sur L'ANNONCE (weight_id de sa page, capture du relevé),
//      traduit par les formats appris du formulaire (beebs_formats_colis) ;
//   2. le POIDS DE LA FICHE (inventaire.poids_g), au palier qui le contient.
// Rien de connu → null : rien ne change.
// ES module sans import (Deno + node).

export const PALIERS_BEEBS_G = [200, 500, 1000, 2000, 5000, 10000, 15000];

/** « Poids jusqu'à 500g max », « Poids jusqu'à 1 kg max » — la forme des options du formulaire. */
export function libellePalierBeebs(g) {
  return g < 1000 ? `Poids jusqu'à ${g}g max` : `Poids jusqu'à ${g / 1000} kg max`;
}

// Le format canonique choisi dans l'app (format_colis, partagé avec
// Leboncoin) → le palier Beebs, même table que beebs.js
// (BEEBS_PACKAGE_BY_FORMAT). Un libellé « Poids jusqu'à … » passe tel quel.
const PAR_FORMAT = {
  "Lettre": 500, "Petit colis": 1000, "Moyen colis": 2000, "Grand colis": 5000, "Très grand colis": 10000,
};
export function formatBeebsDuChoix(formatColis) {
  const f = String(formatColis ?? "").trim();
  if (!f) return null;
  if (/^poids jusqu/i.test(f)) return { titre: f, source: "choix", poids_g: null };
  const g = PAR_FORMAT[f];
  return g ? { titre: libellePalierBeebs(g), source: "choix", poids_g: g } : null;
}

/**
 * @param {{ poidsFiche?: unknown, formatIdAnnonce?: unknown, appris?: Array<{id: string, titre: string, poids_g: number}> }} e
 * @returns {{ titre: string, source: "annonce" | "fiche", poids_g: number } | null}
 */
export function formatBeebsExplicite({ poidsFiche = null, formatIdAnnonce = null, appris = [] } = {}) {
  const liste = Array.isArray(appris) ? appris : [];
  const id = String(formatIdAnnonce ?? "").trim();
  if (id) {
    const a = liste.find((x) => String(x?.id ?? "") === id);
    if (a && String(a.titre ?? "").trim()) return { titre: String(a.titre).trim(), source: "annonce", poids_g: Number(a.poids_g) };
  }
  const g = Number(poidsFiche);
  if (!Number.isFinite(g) || g < 1) return null;
  const palier = PALIERS_BEEBS_G.find((p) => p >= g);
  if (!palier) return null; // au-delà de 15 kg : Beebs n'a pas de palier, rien d'inventé
  const appris_ = liste.find((x) => Number(x?.poids_g) === palier && String(x?.titre ?? "").trim());
  return { titre: appris_ ? String(appris_.titre).trim() : libellePalierBeebs(palier), source: "fiche", poids_g: palier };
}
