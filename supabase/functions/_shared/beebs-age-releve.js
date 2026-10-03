// ═══════════════════════════════════════════════════════════════════════════
// L'ÂGE D'UNE ANNONCE BEEBS, TEL QUE BEEBS L'AFFICHE (03/10/2026, cas Louis)
// ═══════════════════════════════════════════════════════════════════════════
// Cinq inserts Zombicide de Louis, rayon « Jeux de société » : la
// republication automatique demandait l'âge (« Beebs exige l'âge de
// l'enfant… ») alors que chaque annonce en ligne l'affiche — « 16 ans et + »,
// lu le 03/10 sur la ligne « Âge » de la page et dans son ld+json (`size`).
// Une republication remet l'annonce TELLE QU'ELLE EST : l'âge se reprend, il
// ne se redemande pas.
//
// Rend la valeur EXACTE que Beebs affiche (donc valide chez Beebs par
// construction), ou null. Sources, dans l'ordre :
//   · `age` du relevé (posé par l'extension depuis la 0.6.92, ligne « Âge ») ;
//   · la ligne « Âge » des attributs bruts, quand un relevé les porte.
// ⛔ Jamais déduit d'un titre, d'une taille ou d'une description.

const sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase();

/** @param {Record<string, unknown> | null | undefined} capture */
export function ageBeebsDuReleve(capture) {
  if (!capture || typeof capture !== "object") return null;
  const direct = String(capture.age ?? "").trim();
  if (direct) return direct;
  const bruts = Array.isArray(capture.attributs_bruts) ? capture.attributs_bruts : [];
  for (const a of bruts) {
    if (!a || typeof a !== "object") continue;
    if (sansAccents(a.key_label ?? a.key) !== "age") continue;
    const v = String(a.value_label ?? a.value ?? "").trim();
    if (v) return v;
  }
  return null;
}
