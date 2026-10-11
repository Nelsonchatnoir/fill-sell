// ═══════════════════════════════════════════════════════════════════════════
// DEPOP : JAMAIS DE FILE SILENCIEUSE (11/10/2026, mission de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : Simon BORGET (inscrit le 11/10 14:08, extension 0.6.106) —
// 4 publications Depop « pending » depuis 14:27, sans un mot. Son poste n'a
// pas la permission www.depop.com : get-pending-jobs ne lui sert pas le job
// (règle du 09/10, juste), et personne ne lui dit quoi faire. Jake Wright :
// 2 jobs depuis le 10/10 23:34, extension plus vue depuis 22:21. Opla, elle,
// avait sa demande « Autoriser Opla » (handler-watch, 24/09) ; Depop en avait
// le texte (textes-jobs.ts, autorisationDepopRequise) et la relance côté
// extension (rearmerJobsDepopEnAttente, 0.6.105) — mais RIEN ne posait le
// marqueur `needs_user_source = 'depop_acces'`. C'est ce module qui décide.
//
// LA TRACE : profiles.extension_postes[session].depop_acces, écrite par
// get-pending-jobs à CHAQUE poll (l'extension ≥ 0.6.105 déclare
// « depop_acces » ou « sans_depop »). Absente = inconnue (poste plus ancien,
// ou pas revu depuis le 11/10).
//
// LA RÈGLE (demanderAutorisationDepop) — un job Depop « pending » depuis
// 15 min au moins :
//   · un poste du compte a l'accès (vu dans les 48 h) → on ne demande RIEN :
//     il le fera à son retour (un ordinateur éteint n'est pas un refus) ;
//   · sinon, un poste SANS accès vu depuis 30 min → « Autoriser Depop » ;
//   · sinon, au-delà d'une heure (filet des anciennes extensions, du poste
//     éteint, de celui qui n'a jamais rien déclaré) → « Autoriser Depop »
//     aussi : c'est le seul geste qui fera partir le job.
// LA LEVÉE : un poste avec accès vu depuis 30 min → le job repart
// (get-pending-jobs à son poll, l'extension à l'octroi, handler-watch en filet).

export const DEPOP_DEMANDE_APRES_MS = 15 * 60_000;
export const DEPOP_FILET_MS = 60 * 60_000;
export const DEPOP_POSTE_FRAIS_MS = 30 * 60_000;
export const DEPOP_POSTE_TTL_MS = 48 * 3600_000;

function postes(brut, maintenant) {
  if (!brut || typeof brut !== "object" || Array.isArray(brut)) return [];
  return Object.values(brut)
    .map((p) => (p && typeof p === "object" ? p : {}))
    .map((p) => ({ le: Date.parse(String(p.le ?? "")), depop: p.depop_acces }))
    .filter((p) => Number.isFinite(p.le) && maintenant - p.le <= DEPOP_POSTE_TTL_MS);
}

/** Ce que les postes du compte disent de l'accès Depop. */
export function etatAccesDepop(postesBrut, maintenant = Date.now()) {
  const l = postes(postesBrut, maintenant);
  const frais = (p) => maintenant - p.le <= DEPOP_POSTE_FRAIS_MS;
  return {
    avecAcces: l.some((p) => p.depop === true),
    avecAccesFrais: l.some((p) => p.depop === true && frais(p)),
    sansAccesFrais: l.some((p) => p.depop === false && frais(p)),
    postes: l.length,
  };
}

/**
 * Faut-il demander « Autoriser Depop » pour ce job ?
 * @param {{ platform?: string, status?: string, created_at?: string, platform_fields?: Record<string, any>|null }} job
 * @returns {{ demander: boolean, pourquoi: string }}
 */
export function demanderAutorisationDepop(job, postesBrut, maintenant = Date.now()) {
  if (job?.platform !== "depop" || job?.status !== "pending") return { demander: false, pourquoi: "hors_champ" };
  const pf = (job.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  // Après une relance (octroi, reprise), on attend de nouveau : le poste
  // autorisé a le temps de prendre le job.
  const depuis = Math.max(
    ...[job.created_at, pf.depop_acces_accorde_le, pf.depop_acces_reprise_le].map((d) => Date.parse(String(d ?? ""))).filter(Number.isFinite),
  );
  if (!Number.isFinite(depuis)) return { demander: false, pourquoi: "date_illisible" };
  const age = maintenant - depuis;
  if (age < DEPOP_DEMANDE_APRES_MS) return { demander: false, pourquoi: "trop_tot" };
  const e = etatAccesDepop(postesBrut, maintenant);
  if (e.avecAcces) return { demander: false, pourquoi: "poste_autorise" };
  if (e.sansAccesFrais) return { demander: true, pourquoi: "poste_sans_acces" };
  if (age >= DEPOP_FILET_MS) return { demander: true, pourquoi: "aucun_poste_autorise" };
  return { demander: false, pourquoi: "attente" };
}

/** Un job « Autoriser Depop » peut-il repartir (un poste autorisé est là) ? */
export function repartirApresAutorisationDepop(postesBrut, maintenant = Date.now()) {
  return etatAccesDepop(postesBrut, maintenant).avecAccesFrais;
}

/** Les clés de platform_fields qu'une relance retire (même liste que la relance d'Opla). */
export const CLES_RELANCE_DEPOP = Object.freeze(["needs_user_source", "next_action_after", "processing_since",
  "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur"]);
