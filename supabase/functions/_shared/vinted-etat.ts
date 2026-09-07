// ══════════════════════════════════════════════════════════════════════════
// L'ÉTAT D'UNE ANNONCE VINTED, LU À SA NOUVELLE PLACE (incident du 07/09)
// ══════════════════════════════════════════════════════════════════════════
// Le 07/09 vers 13h25 (Paris), Vinted a retiré le champ racine `status` du
// payload de `/api/v2/item_upload/items/{id}`. Mesuré, pas supposé : 1 637
// captures du 28/08 au 06/09 le portent à 100 % ; ensuite plus aucune, sur
// tous les comptes, avec 37 clés identiques par ailleurs — rien de renommé.
// L'état vit désormais dans `item_attributes`, code `condition` — exactement
// le chemin qu'avait pris la taille le 12/08.
//
// ⛔ TABLE RELEVÉE, JAMAIS DEVINÉE : reconstruite sur 3 116 de NOS captures
// qui portaient ENCORE `status` et DÉJÀ `item_attributes` — chaque ligne est
// donc un couple observé (id, libellé) sur une annonce réelle. Les endpoints
// de référentiel ont tous répondu 404 le 07/09 (`/api/v2/item_upload/conditions`,
// `/api/v2/statuses`, `/api/v2/item_upload/attributes`) : aucune URL ne doit
// être devinée au-delà.
// Un id ABSENT de cette table ne rend RIEN : mieux vaut une file à l'arrêt
// qu'une annonce recréée avec un état faux (garde-fou absolu, Nico 07/09).
export const VINTED_CONDITION_LIBELLES: Record<number, string> = {
  1: "Neuf sans étiquette",
  2: "Très bon état",
  3: "Bon état",
  4: "Satisfaisant",
  6: "Neuf avec étiquette",
};

/**
 * Rend le libellé d'état d'une capture, ou null.
 *
 * Deux sources, dans cet ordre, TOUTES DEUX relevées sur Vinted pour CET
 * article — jamais un article voisin, jamais une valeur d'IA :
 *   1. `libelles.etat` — ce que la capture avait déjà résolu (avant l'incident,
 *      ou après la 0.6.21 qui lit la nouvelle place elle-même) ;
 *   2. `payload.natif.item_attributes[code=condition].ids[0]` — la nouvelle
 *      place, résolue par la table relevée ci-dessus.
 * @param capture une ligne de vinted_republish_captures (libelles + payload)
 */
export function etatDepuisCapture(
  capture: { libelles?: unknown; payload?: unknown } | null | undefined,
): { etat: string; source: "libelles" | "item_attributes" } | null {
  if (!capture) return null;
  const direct = String(
    ((capture.libelles ?? {}) as Record<string, unknown>)["etat"] ?? "",
  ).trim();
  if (direct) return { etat: direct, source: "libelles" };
  const id = conditionIdDuPayload(capture.payload);
  if (id == null) return null;
  const libelle = VINTED_CONDITION_LIBELLES[id];
  return libelle ? { etat: libelle, source: "item_attributes" } : null;
}

/** L'identifiant `condition` du payload natif, ou null s'il n'y est pas. */
export function conditionIdDuPayload(payload: unknown): number | null {
  const natif = ((payload ?? {}) as Record<string, unknown>)["natif"];
  const attrs = ((natif ?? {}) as Record<string, unknown>)["item_attributes"];
  if (!Array.isArray(attrs)) return null;
  for (const a of attrs) {
    const o = (a ?? {}) as Record<string, unknown>;
    if (String(o["code"] ?? "") !== "condition") continue;
    const ids = o["ids"];
    if (!Array.isArray(ids) || !ids.length) return null;
    const n = Number(ids[0]);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}
