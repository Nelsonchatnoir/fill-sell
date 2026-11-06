// ═══════════════════════════════════════════════════════════════════════════
// L'ORDRE DES PHOTOS DE L'ARTICLE FAIT FOI (06/11/2026, the_closet72 — règle de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Le cas : deux jeans publiés le 06/11 à 16:50 et 17:05 dans l'ordre de prise de vue (la fiche enregistrée au clic
// « Publier » porte photos ET processedPhotos 0, 1, 2…), puis réordonnés dans Stock › Modifier à 17:21 et 17:35
// (5, 0, 4, 8, 14… ; journaux PostgREST). FillSell gardait le nouvel ordre sur l'article, et RIEN ne le portait plus
// loin : les tâches pas encore parties, les republications (spend_coins_and_republish, republier-photos-lbc) et les
// remises en vente (remises_en_vente_tick) recopiaient l'ordre de l'ANCIEN job. Même défaut chez Alizee (Leboncoin
// republiée le 10/10 dans l'ordre d'avant, couverture comprise) et DeadRoz (Beebs, Leboncoin).
//
// La règle, pour tous :
//   · l'ordre de l'article (inventaire.photos) fait foi ;
//   · un ordre CHOISI pour une plateforme (photos_choisies, carte de publication) le remplace pour cette plateforme :
//     le job garde le sien, tel quel ;
//   · une plateforme à limite (dépôt plafonné : quota gratuit Leboncoin, lbcPhotosCapped) garde les N PREMIÈRES de
//     l'article, N = le nombre que le job portait ;
//   · sinon le job garde SES photos (rien d'ajouté, rien de retiré), remises dans l'ordre de l'article ;
//   · le moindre doute (une photo du job absente de l'article, une URL illisible, un doublon) : le job tel quel.
// Les entrées du job sont gardées telles quelles (type, champs de retouche) : seul leur ordre change.
//
// Pur (Deno + Node) : lu par republier-photos-lbc et par scripts/ordre-photos-selftest.mjs. Jumeau SQL, à l'identique :
// public.photos_ordre_article (migration 20261106230000_ordre_photos_article) — la même table de cas est rejouée des
// deux côtés par le selftest (Postgres jetable).

/** La clé d'une photo : son URL sans la requête (`?v=…`), ou null. */
export function clePhoto(p) {
  const u = typeof p === "string" ? p : (p && typeof p === "object" ? p.url : null);
  if (typeof u !== "string") return null;
  const base = u.trim().split("?")[0];
  return base || null;
}

const vrai = (v) => v === true || v === "true";

/**
 * Les photos d'un job remises dans l'ordre de l'article (ou le job tel quel).
 * @param {unknown[]} photosJob      les photos du job ({type,url} ou chaînes)
 * @param {unknown[]} photosArticle  inventaire.photos
 * @param {Record<string, unknown> | null} [pf]  platform_fields du job (photos_choisies, lbcPhotosCapped)
 * @returns le MÊME tableau quand rien ne change, sinon un nouveau
 */
export function photosDansLOrdreDeLArticle(photosJob, photosArticle, pf = null) {
  if (!Array.isArray(photosJob) || !photosJob.length) return photosJob;
  if (vrai(pf?.photos_choisies)) return photosJob;
  if (!Array.isArray(photosArticle) || !photosArticle.length) return photosJob;
  const cles = photosJob.map(clePhoto);
  if (cles.some((c) => !c) || new Set(cles).size !== cles.length) return photosJob;
  const article = [];
  const vues = new Set();
  for (const p of photosArticle) {
    const c = clePhoto(p);
    if (c && !vues.has(c)) { vues.add(c); article.push({ c, p }); }
  }
  if (!cles.every((c) => vues.has(c))) return photosJob;
  const duJob = new Map(cles.map((c, i) => [c, photosJob[i]]));
  const sortie = vrai(pf?.lbcPhotosCapped)
    ? article.slice(0, photosJob.length).map(({ c, p }, i) => duJob.get(c) ?? entreeDeLArticle(p, i))
    : article.filter(({ c }) => duJob.has(c)).map(({ c }) => duJob.get(c));
  return sortie.length === photosJob.length && sortie.every((p, i) => p === photosJob[i]) ? photosJob : sortie;
}

// Une photo de l'article qui n'était pas dans le job (dépôt plafonné seulement) : la forme des jobs, { type, url }
// (type positionnel, comme entreesPhotos) ; une entrée déjà objet part telle quelle.
function entreeDeLArticle(p, i) {
  if (typeof p === "string") return { url: p, type: i === 0 ? "original" : `photo_${i}` };
  return p;
}
