// ═══════════════════════════════════════════════════════════════════════════
// LES ANNONCES LEBONCOIN PARTIES AVEC MOINS DE PHOTOS : UN GESTE POUR LES REPUBLIER (30/10, lot E — décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Du 20/10 au 30/10, la nouvelle page de dépôt Leboncoin n'était pas lue : « nombre de photos gratuites illisible »,
// repli silencieux sur 3 photos (thecloset72000 : 3 sur 15). 0.6.160/0.6.161 lisent la page ; les annonces déjà
// parties restent amputées (192 au 30/10 17:05, 216 au soir). Décision de Nico (30/10) : sur chaque annonce
// concernée, une ligne « Cette annonce est partie avec moins de photos que prévu. Republier avec toutes tes photos ? »
//   · UN geste de la personne, une annonce à la fois — jamais une rafale (une seule de ces republications en cours par
//     compte), à la cadence ordinaire de la file ;
//   · aucune pièce, aucun quota (pepites_debitees 0, marqueur hors_quota lu par quota_republication_free_etat) ;
//   · rien d'automatique ;
//   · visible seulement si l'extension du compte lit les photos de la nouvelle page (build ≥ BUILD_PHOTOS_LBC) ;
//   · jamais sur un compte dont Leboncoin restreint l'accès (_shared/blocage-leboncoin.js).
// Pur (Deno + Node) — lu par la fonction republier-photos-lbc et par l'app (StockTab).

// Le commit de l'extension qui lit le gratuit sur la nouvelle page (66352f9, lot E, EXTENSION_LAST_COMMIT) : tout build
// construit depuis le porte (0.6.160 jamais téléversée, 0.6.161, copie Cloud 0.6.160-cloud).
export const BUILD_PHOTOS_LBC = "2026-10-30T16:30:40Z";

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);


/** Le build du poste lit-il les photos gratuites de la nouvelle page Leboncoin ? */
export function extensionLitLesPhotosLbc(extensionBuild) {
  const m = String(extensionBuild ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
  return Boolean(m) && Date.parse(m[1]) >= Date.parse(BUILD_PHOTOS_LBC);
}

/** L'annonce Leboncoin publiée est-elle partie amputée (repli silencieux sur l'illisible) ? → { fiche, envoyees } | null */
export function annonceLbcAmputee(job) {
  if (!job || job.platform !== "leboncoin" || job.status !== "published") return null;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return null;
  const pf = objet(job.platform_fields) ?? {};
  const p = objet(pf.photos_lbc);
  if (!p || p.source !== "illisible") return null;
  const fiche = Number(p.fiche), envoyees = Number(p.envoyees);
  if (!Number.isFinite(fiche) || !Number.isFinite(envoyees) || fiche <= envoyees) return null;
  return { fiche, envoyees };
}

/** La ligne s'affiche-t-elle (annonce amputée, pas déjà relancée, extension à jour, Leboncoin libre) ?
 * @param {any} job @param {{ extensionBuild?: string | null, blocageEtat?: string }} [o] */
export function republicationPhotosOfferte(job, { extensionBuild = null, blocageEtat = "libre" } = {}) {
  if (!annonceLbcAmputee(job)) return false;
  const pf = objet(job.platform_fields) ?? {};
  if (pf.republication_photos_lbc) return false;
  if (!extensionLitLesPhotosLbc(extensionBuild)) return false;
  return blocageEtat === "libre";
}

/** Le refus de la fonction, ou null (tout est bon).
 * @param {{ job: any, extensionBuild?: string | null, blocageEtat?: string, ficheStatut?: string | null, enCours?: number, dejaRepublieeFiche?: boolean }} o
 * @returns {string | null} */
export function refusRepublicationPhotos({ job, extensionBuild = null, blocageEtat = "libre", ficheStatut = null, enCours = 0, dejaRepublieeFiche = false }) {
  if (!annonceLbcAmputee(job)) return "pas_amputee";
  if (objet(job.platform_fields)?.republication_photos_lbc) return "deja_demandee";
  if (!extensionLitLesPhotosLbc(extensionBuild)) return "extension_a_mettre_a_jour";
  if (blocageEtat !== "libre") return "leboncoin_restreint";
  if (ficheStatut && String(ficheStatut) !== "stock") return "fiche_plus_en_vente";
  if (dejaRepublieeFiche) return "republication_deja_en_file";
  if (enCours > 0) return "une_a_la_fois";
  return null;
}

/** Le texte d'un refus (la personne le lit). */
export function messageRefusRepublicationPhotos(motif) {
  return {
    pas_amputee: "Cette annonce porte déjà toutes ses photos.",
    deja_demandee: "La republication de cette annonce avec toutes ses photos est déjà demandée.",
    extension_a_mettre_a_jour: "Ton extension FillSell doit d'abord se mettre à jour (c'est automatique) : rien n'est parti.",
    leboncoin_restreint: "Leboncoin restreint en ce moment l'accès depuis ta connexion : rien n'est parti, réessaie quand Leboncoin remarche.",
    fiche_plus_en_vente: "Cet article n'est plus en vente : rien n'est parti.",
    republication_deja_en_file: "Une republication Leboncoin de cet article est déjà en cours.",
    une_a_la_fois: "Une autre annonce repart déjà avec toutes ses photos : une à la fois, pour ne pas brusquer Leboncoin. Réessaie quand elle est en ligne.",
  }[motif] ?? "Republication impossible pour l'instant : rien n'est parti.";
}

// Les clés transitoires retirées de la copie (même liste que spend_coins_and_republish, branche multiplateforme).
const CLES_TRANSITOIRES = ["needsUserField", "needsUserFields", "needsUserResolved", "needsUserAttempts", "needsUserBoucle",
  "boucle_needs_user", "needs_user_tick_le", "needs_user_source", "processing_since", "next_action_after",
  "stale_recoveries", "attente_session", "blocage_antirobot", "porte_pro_lbc", "erreurs_archivees",
  "work_window_state", "last_diagnostic", "lbc_depot", "lbc_depot_non_finalise", "depot_non_confirme_requalifie",
  "verifier_doublon_avant_publication", "unavailable_since", "unavailable_pending_since", "sale_signal",
  "detected_price", "removed_by_user", "republished_pending", "delete_trace", "delete_confirmed_by",
  "delete_dry_run_trace", "listing_url_abandon", "retrait_attend_lien", "removal_url_missing",
  "republish_step", "republish_source", "republish_snapshot", "republish_platform", "republish_source_job_id",
  "republish_recreation", "recreated_at", "deleted_at", "deleted_at_client", "deleted_at_serveur",
  "horloge_client_ecart_s", "suppression_verdict", "old_listing_url", "old_platform_listing_id",
  "recreation_retries", "pepites_debitees", "pepite_remboursee", "prix_republication", "orphan_alerted_at",
  "deleted_hang_count", "introuvable_indetermine", "attente_boutique", "republish_creneau_id",
  "republish_sweep_at", "republish_moteur", "republish_planifie", "republish_prevol", "republish_etat_reel",
  // propres au dépôt amputé : la nouvelle page relira le gratuit
  "photos_lbc", "lbcPhotosCapped", "republication_photos_lbc", "attente_blocage_lbc"];

/**
 * La ligne de republication à insérer (même forme que spend_coins_and_republish, branche multiplateforme), sans pièce
 * ni quota. `photosFiche` : les photos de la fiche (repli quand le job en a moins que la fiche).
 * @param {any} src @param {{ photosFiche?: unknown[] | null, maintenant?: string }} [o]
 */
export function ligneRepublicationPhotos(src, { photosFiche = null, maintenant = new Date().toISOString() } = {}) {
  const am = annonceLbcAmputee(src);
  const photosJob = Array.isArray(src.photos) ? src.photos : [];
  const photosF = Array.isArray(photosFiche) ? photosFiche : [];
  const photos = photosJob.length >= (am?.fiche ?? 0) || photosJob.length >= photosF.length ? photosJob : photosF;
  const pf0 = { ...(objet(src.platform_fields) ?? {}) };
  for (const k of CLES_TRANSITOIRES) delete pf0[k];
  return {
    user_id: src.user_id, inventaire_id: src.inventaire_id, platform: "leboncoin", action: "republish", status: "pending",
    photo_option: src.photo_option ?? "original", title: src.title, description: src.description, price: src.price,
    photos, listing_url: src.listing_url ?? null, platform_listing_id: src.platform_listing_id ?? null,
    platform_fields: {
      ...pf0,
      republish_step: "a_capturer",
      republish_source: "manuel",
      republish_platform: "leboncoin",
      republish_source_job_id: src.id,
      pepites_debitees: 0,
      hors_quota: { motif: "republication_photos_lbc", le: maintenant },
      republication_photos_lbc: { source_job_id: src.id, photos_avant: am?.envoyees ?? null, photos_fiche: am?.fiche ?? null, le: maintenant },
      republish_snapshot: { version: 2, plateforme: "leboncoin", source_job_id: src.id, titre: src.title, prix: src.price,
        listing_url: src.listing_url ?? null, platform_listing_id: src.platform_listing_id ?? null, photos: photos.length, captured_at: maintenant },
    },
  };
}

/** Le marqueur posé sur l'annonce d'origine (la ligne disparaît). */
export function marqueurSourcePhotos(jobId, maintenant = new Date().toISOString()) {
  return { job_id: String(jobId), le: maintenant };
}

/** Le job est-il une republication « toutes les photos » encore en cours ? */
export function republicationPhotosEnCours(job) {
  const pf = objet(job?.platform_fields) ?? {};
  return Boolean(pf.republication_photos_lbc) && job?.action === "republish" && ["pending", "processing", "needs_user"].includes(String(job?.status ?? ""));
}
