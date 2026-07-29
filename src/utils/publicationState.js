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
