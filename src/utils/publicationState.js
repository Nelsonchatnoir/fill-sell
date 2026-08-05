// ── Retrait ciblé (2026-07-19) : état de retrait par plateforme ──────────────
// Extrait de StockTab.jsx le 2026-07-25 (S7) : le stepper relit désormais
// lui-même l'état publié de l'article (le chemin Lens ne reçoit pas
// alreadyPublished du Stock) — importer StockTab depuis ListingPreviewScreen
// aurait créé un cycle, la fonction vit donc ici. Logique inchangée.
//
// Le job publish reste 'published' en base même après une suppression réussie
// (l'extension le passe ensuite en 'cancelled', mais pas instantanément) :
// c'est le delete LE PLUS RÉCENT de la plateforme qui dit la vérité — à
// condition d'être POSTÉRIEUR au dernier publish 'published' (une
// republication après retrait rallume le logo, l'ancien delete ne compte plus).
//   'removing' → delete pending/processing : retrait en cours, action désarmée ;
//   'removed'  → delete 'deleted' : la plateforme n'est plus active ;
//   failed/needs_user/dry_run_completed → rien : l'annonce est toujours en
//                ligne, le retrait reste proposable.
// ⚠️ dédoublonnage published (2026-07-13) : un article REPUBLIÉ crée un NOUVEAU
// job pour la même plateforme sans clore l'ancien — deux jobs "published"
// leboncoin coexistent en base pour la même annonce (même listing_url,
// vérifié). Sans le Set, la pastille s'affichait deux fois.
// Partagé carte Stock (logos) + RemovePlatformsModal + stepper (publishedSet) :
// un seul calcul, jamais deux vérités. La garde serveur de
// spend_coins_and_publish (already_published) réplique la même sémantique.
export function computeRemovalInfo(jobsAll) {
  const jobs = jobsAll.filter(j => j.action !== "delete");
  const deleteJobs = jobsAll.filter(j => j.action === "delete");
  const published = [...new Set(jobs.filter(j => j.status === "published").map(j => j.platform))];
  const latestPubByPlatform = {};
  for (const j of jobs) {
    if (j.status !== "published") continue;
    const cur = latestPubByPlatform[j.platform];
    if (!cur || Date.parse(j.created_at || 0) > Date.parse(cur.created_at || 0)) latestPubByPlatform[j.platform] = j;
  }
  const latestDelByPlatform = {};
  for (const j of deleteJobs) {
    const cur = latestDelByPlatform[j.platform];
    if (!cur || Date.parse(j.created_at || 0) > Date.parse(cur.created_at || 0)) latestDelByPlatform[j.platform] = j;
  }
  const removalState = {};
  for (const p of published) {
    const pub = latestPubByPlatform[p], del = latestDelByPlatform[p];
    if (!pub || !del || Date.parse(del.created_at || 0) <= Date.parse(pub.created_at || 0)) continue;
    if (del.status === "deleted") removalState[p] = "removed";
    else if (del.status === "pending" || del.status === "processing") removalState[p] = "removing";
  }
  const publishedActive = published.filter(p => removalState[p] !== "removed");
  // Jobs publish encore en file (pending/processing) : la plateforme est en
  // COURS de publication. La garde serveur already_published refuse déjà un
  // nouveau job dans cet état — ce champ permet au stepper de le dire AVANT le
  // tunnel. Champ séparé de publishedActive : les pastilles du Stock, elles,
  // ne montrent que le réellement en ligne.
  const queued = [...new Set(jobs.filter(j => j.status === "pending" || j.status === "processing").map(j => j.platform))];
  return { published, removalState, publishedActive, queued, latestPubByPlatform };
}

// ── Plateformes RÉSERVÉES par une republication en vol (2026-08-05) ──────────
// Trou ouvert par la bascule REPUBLISH_DRY_RUN=false, et invisible tant que le
// dry run ne supprimait rien : à la suppression, le job publish d'origine est
// passé 'cancelled' par cancelPublishAfterDelete. Or la carte ne lit pas les
// 'cancelled' — donc, entre la suppression et la recréation, plus AUCUN job
// vinted n'est 'published' et computeRemovalInfo rend publishedActive = []
// (vérifié sur les 5 phases). Vinted redevenait donc une plateforme « libre » :
// le stepper la proposait, et la garde serveur already_published ne pouvait pas
// rattraper (elle cherche un job 'published', il n'y en a plus). On publiait
// une 2e annonce que la recréation venait doubler quelques minutes plus tard.
//
// On ne « rallume » PAS l'affichage « En ligne » pour autant : pendant cette
// fenêtre l'annonce est réellement hors ligne, et le dire serait faux. C'est
// l'OFFRE de publication qu'on ferme, pas l'état qu'on maquille.
//
// Fenêtre retenue = tant qu'une (re)création reste à venir :
//   · pending / processing, quelle que soit l'étape ;
//   · needs_user à l'étape 'deleted' — l'annonce est retirée et la relance
//     repart à la recréation, donc publier maintenant ferait bien doublon.
// Un needs_user AVANT la suppression ne réserve rien : l'annonce est toujours
// en ligne, donc son job publish est toujours 'published' et la couvre déjà.
export function plateformesReserveesParRepublication(jobsAll) {
  const reservees = new Set();
  for (const j of jobsAll ?? []) {
    if (j.action !== "republish") continue;
    const step = j.platform_fields?.republish_step ?? "a_capturer";
    const enVol = j.status === "pending" || j.status === "processing"
      || (j.status === "needs_user" && step === "deleted");
    if (enVol && j.platform) reservees.add(j.platform);
  }
  return [...reservees];
}
