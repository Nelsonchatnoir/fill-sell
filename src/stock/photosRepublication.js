// ═══════════════════════════════════════════════════════════════════════════
// LES PHOTOS DE CHAQUE PLATEFORME, EN REPUBLICATION (16/11/2026, point 7 — Marc, thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// « Quand je republie une annonce individuellement, je peux organiser, ajouter ou supprimer des photos selon chaque
// plateforme. Par contre, cette option n'est pas disponible quand je republie plusieurs annonces en même temps. »
// Vérifié le 16/11 : ce choix existait sur la carte de chaque plateforme de la PUBLICATION d'un article (30/10, lot E,
// publication/photosParPlateforme.js, PhotosPlateforme) — pas dans la feuille de republication, ni à l'unité ni en lot.
// Désormais la feuille de republication (une annonce ou plusieurs dizaines) donne, par article et par plateforme, le
// MÊME choix, avec le MÊME composant (PhotosPlateforme) : choisir parmi les photos de la fiche, en retirer, en ajouter,
// réordonner (la 1ʳᵉ est la couverture), dans la limite de la plateforme.
// ⛔ Par défaut, RIEN ne change : sans choix, aucune écriture, chaque republication part avec ses photos d'avant.
// ⛔ Jamais une photo d'un article sur un autre, jamais le choix d'une plateforme sur une autre : un choix est rangé
//    sous (article, plateforme) et validé contre les photos de CET article (choixValide).
// Où le choix s'applique (tâche créée par spend_coins_and_republish, puis cette écriture, gardée sur « pending » et
// sur l'étape d'avant la capture) :
//   · Leboncoin, Beebs, Depop : la recréation part des photos de la TÂCHE → job.photos = le choix, dans l'ordre ;
//   · Vinted : la recréation part de la CAPTURE → le choix est porté par la tâche
//     (platform_fields.photos_republication_choisies) et get-pending-jobs le pose sur la capture avant le retrait
//     (_shared/photos-republication.js) — PC comme Cloud ;
//   · partout : platform_fields.photos_choisies = true (jamais « complété » par les photos de la fiche :
//     contenuAImposer ; jamais réordonné par la fiche : public.photos_ordre_article).
// Pur (Node + navigateur) : scripts/photos-republication-lot-selftest.mjs.
import { choixValide, choixDifferent, photosMaxPlateforme } from "../publication/photosParPlateforme.js";

/** Les URLs des photos d'une fiche (chaînes ou {url}), sans doublon, dans l'ordre. */
export function urlsDeLaFiche(photos) {
  const vus = new Set();
  const out = [];
  for (const p of Array.isArray(photos) ? photos : []) {
    const u = typeof p === "string" ? p : p?.url;
    if (typeof u === "string" && u.trim() && !vus.has(u)) { vus.add(u); out.push(u); }
  }
  return out;
}

const cle = (id) => String(id ?? "");

/** Pose (ou retire, urls null) le choix d'UN article sur UNE plateforme — les autres choix ne bougent pas. */
export function poserChoix(etat, itemId, platform, urls) {
  const base = etat && typeof etat === "object" ? etat : {};
  const k = cle(itemId);
  const avant = base[k] && typeof base[k] === "object" ? base[k] : {};
  const art = { ...avant };
  if (Array.isArray(urls) && urls.length) art[platform] = [...urls];
  else delete art[platform];
  const out = { ...base };
  if (Object.keys(art).length) out[k] = art;
  else delete out[k];
  return out;
}

/** Le choix VALABLE d'un article sur une plateforme (photos de CET article, sans doublon, dans la limite), sinon null. */
export function choixPour(etat, item, platform) {
  const brut = etat?.[cle(item?.id)]?.[platform];
  const toutes = urlsDeLaFiche(item?.photos);
  const c = choixValide(platform, brut, toutes);
  return c && choixDifferent(platform, c, toutes) ? c : null;
}

/** Les articles dont au moins une plateforme (parmi `plateformesDe(item)`) a un choix valable — le repère de la liste. */
export function articlesModifies(etat, items, plateformesDe = () => []) {
  const s = new Set();
  for (const it of items ?? []) {
    if ((plateformesDe(it) ?? []).some((p) => choixPour(etat, it, p))) s.add(cle(it.id));
  }
  return s;
}

/** Ce qui part avec la republication d'un article : { plateforme: urls } pour les SEULES plateformes envoyées. */
export function photosDeLaCible(etat, item, plateformesEnvoyees) {
  const out = {};
  for (const p of plateformesEnvoyees ?? []) {
    const c = choixPour(etat, item, p);
    if (c) out[p] = c;
  }
  return Object.keys(out).length ? out : null;
}

/** La marque de la tâche : ce que la personne a choisi, pour CETTE plateforme. */
export const CLE_PHOTOS_CHOISIES = "photos_republication_choisies";

/**
 * L'écriture sur la tâche de republication fraîchement créée : { photos?, platform_fields } — ou null quand rien ne
 * doit être écrit (aucun choix, tâche déjà engagée). Les autres clés de platform_fields sont gardées telles quelles.
 * @param {{platform:string, pf:object|null, statut:string, urls:string[]|null, photosFiche:unknown[], le?:string}} p
 */
export function ecritureTachePhotos({ platform, pf, statut, urls, photosFiche, le = new Date().toISOString() }) {
  if (statut !== "pending") return null;
  const p = pf && typeof pf === "object" ? pf : {};
  // L'étape d'avant toute capture seulement : une tâche déjà capturée (ou retirée) garde ce qu'elle a.
  const etape = p.republish_step == null ? null : String(p.republish_step);
  if (etape != null && etape !== "a_capturer") return null;
  if (p.capture_id != null || p.deleted_at != null) return null;
  const toutes = urlsDeLaFiche(photosFiche);
  const c = choixValide(platform, urls, toutes);
  if (!c) return null;
  const max = photosMaxPlateforme(platform);
  const liste = c.slice(0, max);
  const platform_fields = { ...p, photos_choisies: true, [CLE_PHOTOS_CHOISIES]: { urls: liste, le, par: "feuille_republication" } };
  if (platform === "vinted") return { platform_fields };
  const parUrl = new Map((Array.isArray(photosFiche) ? photosFiche : []).map((x) => [typeof x === "string" ? x : x?.url, x]));
  const photos = liste.map((u, i) => {
    const e = parUrl.get(u);
    const base = e && typeof e === "object" ? { ...e } : { url: u };
    return { ...base, url: u, type: i === 0 ? "original" : `photo_${i}` };
  });
  return { photos, platform_fields };
}

/**
 * Écrit le choix sur la tâche de republication que spend_coins_and_republish vient de créer : relue, puis écrite
 * SEULEMENT si elle est encore « pending » à la même étape (jamais par-dessus une capture ou un retrait engagés).
 * @returns {Promise<{ok:boolean, motif?:string}>} — ok:false = la republication part avec ses photos d'avant.
 */
export async function appliquerPhotosChoisies(supabase, { jobId, platform, urls, photosFiche }) {
  if (!jobId || !Array.isArray(urls) || !urls.length) return { ok: false, motif: "aucun_choix" };
  const { data: j, error } = await supabase.from("cross_post_jobs").select("id, status, platform, platform_fields").eq("id", jobId).maybeSingle();
  if (error || !j) return { ok: false, motif: error?.message ?? "tache_introuvable" };
  if (j.platform !== platform) return { ok: false, motif: "autre_plateforme" };
  const ecr = ecritureTachePhotos({ platform, pf: j.platform_fields, statut: j.status, urls, photosFiche });
  if (!ecr) return { ok: false, motif: "tache_deja_engagee" };
  const etape = j.platform_fields?.republish_step;
  let q = supabase.from("cross_post_jobs").update(ecr).eq("id", jobId).eq("status", "pending");
  q = etape == null ? q.is("platform_fields->>republish_step", null) : q.eq("platform_fields->>republish_step", String(etape));
  const { data: maj, error: e2 } = await q.select("id");
  if (e2 || !maj?.length) return { ok: false, motif: e2?.message ?? "tache_deja_engagee" };
  return { ok: true };
}
