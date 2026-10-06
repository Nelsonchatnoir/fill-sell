// ══════════════════════════════════════════════════════════════════════════
// LEBONCOIN DEMANDE NOM ET PRÉNOM : UNE CARTE PAR COMPTE, UNE REPRISE SEULE
// (06/10 soir, feu vert de Nico)
// ══════════════════════════════════════════════════════════════════════════
// patrick giry : 35 dépôts Leboncoin arrêtés au même mur — l'aperçu de
// Leboncoin laisse vides escrow_lastname / escrow_firstname (compte vendeur
// sans nom ni prénom, obligatoires pour la Transaction sécurisée). L'app
// montrait 35 lignes identiques ; chacune demandait « relance la publication
// depuis la fiche ». C'est UN geste sur le COMPTE, pas 35 sur des articles.
//
// LA RÈGLE (une seule source, lue par l'app ET le serveur) :
//   · une tâche attend ce geste ⇔ Leboncoin, needs_user, et le motif posé par
//     l'extension est EXACTEMENT `lbc_escrow_identite` (leboncoin.js,
//     attenteMotif → platform_fields.last_diagnostic.quoi) — jamais un mot pris
//     dans le message : aucune autre cause Leboncoin (adresse, connexion,
//     refus de l'aperçu, dépôt incertain, champ à choisir) n'entre ici ;
//   · l'app les rassemble en UNE carte par compte (« À régler ») ;
//   · reprise SANS geste par article : UNE tâche « éclaireur » (la plus
//     ancienne) repart — sur le « C'est fait » de la carte, ou toute seule au
//     plus une fois toutes les 12 h (handler-watch, poste vu < 24 h) ; si
//     Leboncoin l'accepte, toutes les autres repartent (espacées de 45 s) ;
//     sinon elle revient au même mur et rien d'autre ne part.
// Pur (Deno + Node + Vite), sans import.

export const MOTIF_LBC_IDENTITE = "lbc_escrow_identite";
export const ECLAIREUR_INTERVALLE_MS = 12 * 3_600_000;
export const ESPACEMENT_REPRISE_MS = 45_000;
export const FENETRE_IDENTITE_MS = 30 * 86_400_000;
export const URL_INFOS_LBC = "https://www.leboncoin.fr/account/private-details";

const pfDe = (job) => (job && job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {});

/** Le motif posé par l'extension sur cette tâche (last_diagnostic.quoi), ou null. */
export function motifDiagnostic(job) {
  const d = pfDe(job).last_diagnostic;
  return d && typeof d === "object" ? String(d.quoi ?? "") || null : null;
}

/** Cette tâche attend-elle que la personne complète nom et prénom sur Leboncoin ? */
export function attendIdentiteLbc(job) {
  if (!job || job.platform !== "leboncoin" || job.status !== "needs_user") return false;
  if (!["publish", "republish"].includes(String(job.action ?? "publish"))) return false;
  const pf = pfDe(job);
  if (pf.needsUserField || pf.needsUserFields) return false; // une vraie question de champ garde sa ligne
  return motifDiagnostic(job) === MOTIF_LBC_IDENTITE;
}

/** Les tâches d'un compte qui attendent ce geste, la plus ancienne d'abord. */
export function attentesIdentiteLbc(jobs) {
  return (Array.isArray(jobs) ? jobs : []).filter(attendIdentiteLbc)
    .sort((a, b) => (Date.parse(a.created_at ?? 0) || 0) - (Date.parse(b.created_at ?? 0) || 0));
}

/** L'éclaireur à relancer : la plus ancienne, sauf si un essai a eu lieu il y a moins de `intervalle`. */
export function eclaireurIdentiteLbc(jobs, maintenant = Date.now(), intervalle = ECLAIREUR_INTERVALLE_MS) {
  const l = attentesIdentiteLbc(jobs);
  if (!l.length) return null;
  const dernier = Math.max(0, ...l.map((j) => Date.parse(pfDe(j).identite_lbc?.eclaireur_le ?? "") || 0));
  if (dernier && maintenant - dernier < intervalle) return null;
  return l[0];
}

/** Les platform_fields de l'éclaireur relancé (geste de la carte ou passage serveur). */
export function champsEclaireur(pf, par, maintenantIso) {
  const out = { ...(pf ?? {}) };
  for (const k of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
    "next_action_after", "processing_since"]) delete out[k];
  out.needsUserAttempts = 0;
  out.identite_lbc = { ...(out.identite_lbc ?? {}), eclaireur_le: maintenantIso, par, n: (Number(out.identite_lbc?.n) || 0) + 1 };
  return out;
}

/** Les platform_fields d'une tâche relâchée après le succès de l'éclaireur (rang k : 45 s × k). */
export function champsReprise(pf, k, maintenantMs) {
  const out = { ...(pf ?? {}) };
  for (const c of ["needs_user_source", "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur", "processing_since"]) delete out[c];
  out.needsUserAttempts = 0;
  out.next_action_after = new Date(maintenantMs + k * ESPACEMENT_REPRISE_MS).toISOString();
  out.identite_lbc = { ...(out.identite_lbc ?? {}), reprise_le: new Date(maintenantMs).toISOString(), par: "eclaireur_publie" };
  return out;
}
