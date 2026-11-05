// (05/11, point 6 a — règle de Nico) UN DÉPÔT EN VÉRIFICATION N'EST JAMAIS « EN LIGNE ». Beebs / Leboncoin publiée mais pas
// encore achetable : sans lien, ou marquée pas_encore_visible (relevé, handler-watch). La plateforme reste OCCUPÉE — elle
// est dans publishedActive (computeRemovalInfo) : jamais un 2e dépôt, et un retrait après vente la vise toujours —, mais
// l'affichage et les comptes « en ligne » la retirent : « Beebs vérifie ton annonce ». Module de l'app seul (l'extension
// embarque publicationState.js : il ne bouge pas).

/** Un dépôt Beebs ou Leboncoin publié mais pas encore achetable (même règle que la ligne « Beebs vérifie ton annonce »). */
export function estEnVerification(job) {
  if (!job || !['beebs', 'leboncoin'].includes(job.platform)) return false;
  return !job.listing_url || Boolean(job.platform_fields?.pas_encore_visible);
}

/** Les plateformes publiées (publishedActive) dont la dernière publication est en vérification. */
export function plateformesEnVerification(publishedActive, latestPubByPlatform) {
  return (Array.isArray(publishedActive) ? publishedActive : []).filter((p) => estEnVerification(latestPubByPlatform?.[p]));
}
