// Le nombre de photos qu'une plateforme accepte, appliqué AVANT l'envoi à l'extension (01/11, Jocabroc).
//
// Le cas : une fiche de 24 photos publiée sur Vinted (01/11 07:56 et 08:08). Vinted n'en garde que 20 ; l'extension
// les envoyait toutes, attendait 24 confirmations (ensurePhotosLanded) et annulait la publication AVANT le dépôt :
// « 20/24 confirmée(s) après 97 s ». Une fiche importée peut porter plus de 20 photos (lecture de page : 30 au plus,
// eBay : 24), et le job sans choix de photos part avec toutes celles de la fiche (photosDuJob, côté app).
//
// La règle : Vinted reçoit les 20 PREMIÈRES photos dans l'ordre du job (l'ordre choisi pour Vinted, sinon celui de la
// fiche) ; la publication suit son cours normal (la garde compte ce qui est envoyé). Le job en base garde toutes ses
// photos. Limite vérifiée le 01/11 : la grille et l'API de Vinted se sont arrêtées à 20 sur 24 (deux essais de
// Jocabroc), « 20 photos au plus » côté app (photosParPlateforme.js) et republish-capture-photos (MAX_PHOTOS = 20).
// Les autres plateformes gardent TOUTES leurs photos : Depop coupe déjà à 8 dans l'extension (DEPOP_PHOTOS_MAX),
// Leboncoin envoie selon le quota gratuit lu sur la page, Beebs et eBay ne bloquent jamais sur un manque (note
// seulement) — aucune n'annule une publication pour trop de photos.

export const PHOTOS_MAX_VINTED = 20;

/** Les photos d'un job telles qu'envoyées à l'extension : Vinted coupé à 20, toute autre plateforme intacte. */
export function photosDansLaLimite(platform, photos) {
  if (String(platform ?? "") !== "vinted" || !Array.isArray(photos) || photos.length <= PHOTOS_MAX_VINTED) return photos;
  return photos.slice(0, PHOTOS_MAX_VINTED);
}

/** Le job servi à l'extension : même objet si rien ne change, sinon une copie aux photos coupées. */
export function jobDansLaLimitePhotos(job) {
  if (!job || typeof job !== "object") return job;
  const photos = photosDansLaLimite(job.platform, job.photos);
  return photos === job.photos ? job : { ...job, photos };
}
