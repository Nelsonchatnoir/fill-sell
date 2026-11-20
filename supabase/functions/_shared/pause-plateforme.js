// ═══════════════════════════════════════════════════════════════════════════
// UNE PAUSE N'EST PAS UNE DÉCONNEXION ; UN COMPTE REFUSÉ DIT POURQUOI (20/11/2026 soir, blocs B3 et B4 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// B3 — bertaberry41 (FillSell Cloud), 20/11 18:33 → 18:50 : Leboncoin a répondu 403 ; update-job-status a posé le message
// neutre du refus passager (« nouvel essai automatique ») et le Cloud a fermé Leboncoin le temps de confirmer une
// vérification (coffre « non connecté », platform_settings.leboncoin.cloud_verification / blocage_acces). get-pending-jobs
// a lu ce coffre comme une DÉCONNEXION et réécrit les 5 publications : « En attente de ta connexion à Leboncoin dans
// FillSell Cloud : Leboncoin est à reconnecter » ; la carte de connexion a montré Leboncoin déconnecté.
// LA RÈGLE (toutes les plateformes, extension et Cloud) : une plateforme en vérification du Cloud ou en pause d'accès est
// EN PAUSE, jamais « à reconnecter » — ses tâches disent « courte pause, ça repart tout seul, rien à faire » (sauf la
// vérification à résoudre à la main, que le Cloud annonce lui-même avec son geste), et la carte ne la montre pas
// déconnectée. « Reconnecte » n'est dit que pour une déconnexion réelle et confirmée.
// B4 — linda.yoann35 (essai Cloud), 20/11 : Beebs ne connaît pas son compte (404 / « Vous devez être connecté pour
// ajouter un produit ») ; aucune annonce Beebs relevée, aucune publiée, Beebs jamais choisie à l'inscription ; 194
// publications Beebs en attente disaient « Beebs est à reconnecter ». LA RÈGLE : un compte refusé par la plateforme se dit
// selon la preuve d'une boutique — aucune preuve : « tu n'as pas encore de compte X : crée-le sur X, puis reconnecte-le
// ici » ; une preuve (annonce relevée, publication faite, relevé avec des annonces) : « le compte connecté n'est pas celui
// de ta boutique ». Les tâches restent en pause (aucune tentative consommée) et repartent seules sur preuve.
// Pur (Deno + Node) : lu par get-pending-jobs, handler-watch et l'app (src/cloud).

const NOMS = { vinted: "Vinted", leboncoin: "Leboncoin", ebay: "eBay", beebs: "Beebs", depop: "Depop", opla: "Opla" };
const ETATS_VERIFICATION = new Set(["a_resoudre", "restreint", "revenue", "verification_en_cours"]);
/** Les vérifications que le Cloud annonce lui-même sur les tâches, avec le geste (« Résoudre ») ou l'attente de 24 h. */
const ANNONCEES_PAR_LE_CLOUD = new Set(["a_resoudre", "restreint", "revenue"]);

/**
 * La plateforme est-elle EN PAUSE (et non déconnectée) ? (pur)
 * @param {Record<string, any>|null} platformSettings  profiles.platform_settings
 * @returns {null | { cause: 'verification', etat: string, annonceeParLeCloud: boolean } | { cause: 'blocage_acces', annonceeParLeCloud: false }}
 */
export function pauseDeLaPlateforme(platformSettings, pf) {
  const ps = platformSettings && typeof platformSettings === "object" ? platformSettings[pf] : null;
  if (!ps || typeof ps !== "object") return null;
  const v = ps.cloud_verification;
  if (v && typeof v === "object" && ETATS_VERIFICATION.has(String(v.etat))) {
    return { cause: "verification", etat: String(v.etat), annonceeParLeCloud: ANNONCEES_PAR_LE_CLOUD.has(String(v.etat)) };
  }
  const b = ps.blocage_acces;
  if (b && typeof b === "object" && !b.leve_le) return { cause: "blocage_acces", annonceeParLeCloud: false };
  return null;
}

/** Le marqueur posé sur une tâche retenue par une pause (jamais l'ancre « En attente de ta connexion à »). */
export const PAUSE_PLATEFORME_POSE_PAR = "get-pending-jobs (pause de la plateforme)";

/** Le texte neutre d'une tâche retenue par une pause de la plateforme (pur). */
export function textePausePlateforme(job, { cloud = false } = {}) {
  const pfm = String(job?.platform ?? "");
  const nom = NOMS[pfm] ?? pfm;
  const ou = cloud ? " sur FillSell Cloud" : "";
  const quoi = job?.action === "delete" ? "le retrait" : job?.action === "republish" ? "la republication" : "la publication";
  return `Courte pause de ${nom}${ou} : ça repart tout seul, rien à faire de ton côté — ${quoi} partira dès la fin de la pause. ` +
    "Aucune tentative consommée.";
}

/**
 * Le message et les champs d'une tâche retenue par une pause, ou null (rien à écrire : déjà posé, ou un message de la même
 * famille qu'il ne faut pas écraser — refus passager en cours, vérification annoncée par le Cloud). Pur.
 */
export function pausePlateformeServeur(job, { cloud = false, maintenantIso = new Date().toISOString() } = {}) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  if (pf.attente_verification_cloud) return null;                       // le Cloud a dit la vraie cause et le geste
  const rp = pf.refus_passager;
  const finRp = Date.parse(String(pf.next_action_after ?? ""));
  if (rp && typeof rp === "object" && Number.isFinite(finRp) && finRp > Date.parse(maintenantIso)) return null;   // « nouvel essai automatique »
  const error = textePausePlateforme(job, { cloud });
  if (String(job?.error ?? "") === error && pf.pause_plateforme) return null;
  // Le marqueur d'attente de connexion posé avant cette règle part avec son texte (ce n'était pas une déconnexion).
  const { attente_session: att, ...reste } = pf;
  const garderAttente = att && typeof att === "object" && att.pose_par !== "get-pending-jobs (session connue morte)";
  return {
    error,
    platform_fields: {
      ...reste,
      ...(garderAttente ? { attente_session: att } : {}),
      pause_plateforme: { platform: String(job?.platform ?? ""), depuis: pf.pause_plateforme?.depuis ?? maintenantIso, pose_par: PAUSE_PLATEFORME_POSE_PAR, message: error },
    },
  };
}

/** La pause finie : le message et le marqueur partent (une tâche servie de nouveau). null : rien à écrire. Pur. */
export function sansPausePlateforme(job) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const p = pf.pause_plateforme;
  if (!p || typeof p !== "object") return null;
  const { pause_plateforme: _p, ...reste } = pf;
  return { error: String(job?.error ?? "") === String(p.message ?? "") ? null : (job?.error ?? null), platform_fields: reste };
}

// ── B4 : LE COMPTE REFUSÉ PAR LA PLATEFORME ─────────────────────────────────────────────────────────────────────────
/**
 * Une boutique existe-t-elle sur cette plateforme pour ce compte ? (pur) — preuve PROPRE à la plateforme : une annonce
 * relevée, une publication faite (published / sold), un relevé terminé qui a vu des annonces. Jamais ses propres tâches
 * en file (elles ne prouvent rien), jamais le seul choix de l'inscription.
 */
export function boutiqueProuvee({ annonces = 0, publiees = 0, relevesAvecAnnonces = 0 } = {}) {
  return (Number(annonces) || 0) > 0 || (Number(publiees) || 0) > 0 || (Number(relevesAvecAnnonces) || 0) > 0;
}

/** 'sans_boutique' (aucune preuve) | 'autre_compte' (une boutique existe, ce n'est pas elle qui est connectée). Pur. */
export function causeRefusCompte(preuves) {
  return boutiqueProuvee(preuves) ? "autre_compte" : "sans_boutique";
}

/**
 * Le texte d'une tâche retenue parce que la plateforme refuse le compte (pur). Même ancre que l'attente de connexion
 * (« En attente de ta connexion à ») : l'app, handler-watch et relancer_jobs_connexion la lisent de même.
 */
export function texteRefusCompte(job, { cause = "sans_boutique", cloud = false } = {}) {
  const pfm = String(job?.platform ?? "");
  const nom = NOMS[pfm] ?? pfm;
  const ou = cloud ? " dans FillSell Cloud" : "";
  const ici = cloud ? "ici (Réglages › Mes plateformes › « Me connecter »)" : "dans l'app (Réglages › Mes plateformes)";
  const quoi = job?.action === "delete" ? "le retrait" : job?.action === "republish" ? "tes republications" : "tes publications";
  const suite = job?.action === "delete"
    ? `le retrait partira tout seul. Aucune tentative consommée.`
    : `${quoi} ${nom} sont en pause et partiront toutes seules. Aucune tentative consommée.`;
  if (cause === "autre_compte") {
    return `En attente de ta connexion à ${nom}${ou} : le compte connecté n'est pas celui de ta boutique ${nom}. ` +
      `Reconnecte ${nom} avec le compte de ta boutique, ${ici} : ${suite}`;
  }
  return `En attente de ta connexion à ${nom}${ou} : tu n'as pas encore de compte ${nom} (${nom} ne connaît pas ce compte). ` +
    `Crée ton compte sur ${nom}, puis reconnecte-le ${ici} : ${suite}`;
}
