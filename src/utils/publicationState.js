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

// ── « Encore en ligne » AVANT d'enregistrer une vente (2026-08-11) ───────────
// Enregistrer une vente ne retire RIEN : ni confirmSell (modale « Marquer comme
// vendu ») ni confirmSellDirect (intent vocal inventory_sell) n'arment de job
// delete — seul le flux serveur déclenché par la SONDE le fait
// (check-listing-status → orchestrateSale). L'annonce reste donc achetable
// après coup. Cette fonction dit où, pour un article donné ; le texte, lui, vit
// dans components/AvertissementAnnoncesEnLigne.jsx et nulle part ailleurs.
//
// Elle répond à « qu'est-ce qu'un acheteur voit encore ? », pas à « que
// peut-on retirer sans risque ? » — c'est pourquoi elle n'est PAS
// buildDeletePlan (App.jsx), qui écarte à raison les plateformes sans
// listing_url (aucun delete à l'aveugle) et celles dont le retrait est déjà
// armé. Ces deux-là restent visibles par un acheteur : les taire ici serait
// mentir. Le socle de calcul reste computeRemovalInfo, comme partout.
const ORDRE_PLATEFORMES = ["vinted", "leboncoin", "beebs", "ebay"];
const rangPlateforme = (p) => {
  const i = ORDRE_PLATEFORMES.indexOf(p);
  return i === -1 ? ORDRE_PLATEFORMES.length : i;
};

export function annoncesEncoreEnLigne(item, jobsAll) {
  const { publishedActive, latestPubByPlatform } = computeRemovalInfo(jobsAll ?? []);
  const enLigne = [];
  for (const p of publishedActive) {
    const pub = latestPubByPlatform[p];
    // La sonde a DÉJÀ constaté que l'annonce n'est plus atteignable
    // (platform_fields.unavailable_since) : ce cas appartient au bandeau
    // « Vendue ? », et dire « encore en ligne » ici serait faux.
    if (pub?.platform_fields?.unavailable_since) continue;
    // url absente = listing_url jamais capté par l'extension. La plateforme est
    // quand même nommée : le lien manque, pas l'annonce.
    enLigne.push({ platform: p, url: pub?.listing_url || null });
  }
  // Vinted importé du dressing : AUCUN job publish n'existe (l'annonce a été
  // créée sur Vinted, pas par nous) — computeRemovalInfo ne peut rien en dire.
  // La vérité est portée par l'article, avec la MÊME expression que le tri du
  // Stock et la carte : vinted_item_id posé, disparu_le vide.
  // SAUF hidden/draft (2026-08-28, décision Nico) : une annonce masquée ou à
  // l'état de brouillon sur Vinted n'est PAS visible d'un acheteur — la dire
  // « encore en ligne » ici serait faux. Le statut vient du dernier relevé de
  // sync (payload Vinted, vérifié fiable le 28/08) ; la carte porte la date.
  if (item?.vinted_item_id && !item?.disparu_le
    && item?.vinted_status !== "hidden" && item?.vinted_status !== "draft"
    && !enLigne.some(a => a.platform === "vinted")) {
    enLigne.push({ platform: "vinted", url: `https://www.vinted.fr/items/${item.vinted_item_id}` });
  }
  return enLigne.sort((a, b) => rangPlateforme(a.platform) - rangPlateforme(b.platform));
}
