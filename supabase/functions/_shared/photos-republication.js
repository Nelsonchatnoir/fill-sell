// ═══════════════════════════════════════════════════════════════════════════
// VINTED : LES PHOTOS CHOISIES DANS LA FEUILLE DE REPUBLICATION PASSENT SUR LA CAPTURE (16/11/2026, point 7 — Marc)
// ═══════════════════════════════════════════════════════════════════════════
// Une republication Vinted recrée l'annonce depuis sa CAPTURE (vinted_republish_captures.photos_urls). Le choix de la
// personne (src/stock/photosRepublication.js) est porté par la tâche (platform_fields.photos_republication_choisies) :
// get-pending-jobs le pose sur la capture, une fois par capture, à l'étape « captured » — AVANT le retrait, donc
// avant toute recréation, PC comme Cloud. Les autres plateformes recréent depuis job.photos (écrit à la création).
// Pur (Deno + Node), sans import.

export const CLE_PHOTOS_CHOISIES = "photos_republication_choisies";
const PHOTOS_MAX_VINTED = 20;

/** Les URLs choisies portées par la tâche (https, sans doublon, 20 au plus), ou null. */
export function photosChoisiesRepublication(pf) {
  const c = pf && typeof pf === "object" ? pf[CLE_PHOTOS_CHOISIES] : null;
  const urls = Array.isArray(c?.urls) ? c.urls : null;
  if (!urls) return null;
  const vus = new Set();
  const out = urls.filter((u) => typeof u === "string" && /^https:\/\//.test(u) && !vus.has(u) && vus.add(u));
  return out.length ? out.slice(0, PHOTOS_MAX_VINTED) : null;
}

/** Cette tâche Vinted doit-elle recevoir son choix sur sa capture maintenant ? */
export function captureAReecrire(job) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (job?.platform !== "vinted" || String(job?.action) !== "republish" || job?.status !== "pending") return false;
  if (String(pf.republish_step ?? "") !== "captured" || !/^\d+$/.test(String(pf.capture_id ?? ""))) return false;
  if (pf.deleted_at != null) return false; // retrait engagé : la capture a déjà servi telle qu'elle était
  if (!photosChoisiesRepublication(pf)) return false;
  return String(pf[CLE_PHOTOS_CHOISIES]?.capture_appliquee ?? "") !== String(pf.capture_id);
}

/** La marque posée une fois la capture réécrite (même capture : plus jamais). */
export function marqueAppliquee(pf, captureId, le = new Date().toISOString()) {
  return { ...pf, [CLE_PHOTOS_CHOISIES]: { ...(pf?.[CLE_PHOTOS_CHOISIES] ?? {}), capture_appliquee: String(captureId), appliquee_le: le } };
}
