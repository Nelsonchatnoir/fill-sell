// ═══════════════════════════════════════════════════════════════════════════
// UN ACCIDENT AVANT TOUT RETRAIT N'EST JAMAIS UN GESTE — AUSSI CÔTÉ SERVEUR (25/10 nuit)
// ═══════════════════════════════════════════════════════════════════════════
// Règle B6 du 24/10 (Nico, « zéro blocage ») : une republication Vinted arrêtée AVANT
// tout retrait par un accident de parcours (onglet de dépôt qui ne répond pas, canal
// coupé, page de dépôt rechargée pendant le remplissage) repart SEULE, espacée — 5, 20,
// 60 min, puis toutes les 3 h — et la sentinelle (cause-blocage.js : reprise_avant_retrait.n
// > 3 → « accidents_repetes_avant_retrait ») signale la série.
// L'extension ≥ 0.6.134 le fait dans SON chemin « résultat transitoire » ; le parc
// (0.6.131) non, et deux chemins y échappent même en 0.6.141 :
//   · le catch final de l'étape captured (« Republication interrompue pendant la
//     suppression (onglet de travail vinted : le content script ne répond pas…) ») —
//     levé par ouvrirOngletTravailJob AVANT tout envoi à la page : rien n'a été retiré ;
//     update-job-status l'affichait « Relance-la depuis la fiche », handler-watch le
//     reprenait 3 fois au plus (REPRISES_CONNEXION_MAX), puis plus rien alors que
//     etatJob le disait « En pause » (Deborah 83206086, 24/10 : 5 essais en 43 min,
//     3 reprises brûlées pendant que son poste décrochait, bloquée à vie) ;
//   · la sortie de boucle « canal coupé 4 fois » (update-job-status, 04/10) : needs_user
//     « ferme Chrome et appuie sur Relancer » (jocabroc bfe46249, 21/10 : quatre jours,
//     alors que six autres annonces passaient sur le même Chrome).
// Pur : décide, n'écrit rien. Appelé par update-job-status (à l'écriture) et
// handler-watch (arrêts déjà en base).
import { brutTechnique, CANAL_RE, MOTIF_TECHNIQUE_RE, MOTIF_PERSONNE_RE } from "./etat-job.js";

// Une COUPURE seule (onglet, canal, réseau — la signature unique CANAL_RE d'etat-job.js),
// jamais un mur qui a sa règle (anti-robot : pause dédiée ; connexion : geste de la
// personne — MOTIF_TECHNIQUE_RE) ni un motif de la personne (champ, marque, rayon…).
export function coupureSeule(texte) {
  const t = String(texte ?? "");
  if (!t || !CANAL_RE.test(t) || MOTIF_TECHNIQUE_RE.test(t)) return false;
  return !MOTIF_PERSONNE_RE.test(t.replace(CANAL_RE, ""));
}

export const DELAIS_ACCIDENT_AVANT_RETRAIT_MIN = Object.freeze([5, 20, 60]);
export const DELAI_ACCIDENT_PALIER_MIN = 180;

// Toute trace d'un retrait engagé ou d'une remise en ligne tentée : ce n'est plus
// « avant tout retrait », d'autres règles ont la main (recreation-vinted-verifiee…).
export const MARQUES_RETRAIT_OU_DEPOT = Object.freeze([
  "deleted_at", "deleted_at_serveur", "deleted_at_client", "suppression_verdict",
  "republish_suppression_envoyee", "recreation_tentee", "recreation_envois",
  "recreation_depot_parti", "depot_parti_vers_profil", "new_vinted_item_id",
]);

export const MESSAGE_ACCIDENT_AVANT_RETRAIT =
  "Republication en pause avant toute suppression : ton annonce est toujours en ligne sur Vinted. " +
  "Le remplissage a été interrompu sur l'ordinateur, de notre côté : nouvel essai tout seul, rien à faire.";

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/**
 * L'arrêt d'une republication Vinted AVANT tout retrait, de cause purement technique
 * (aucune question, aucune garde, aucune trace de retrait) → { signature }, sinon null.
 * @param {any} job  { platform, action, status, error, platform_fields }
 * @returns {{ signature: string } | null}
 */
export function accidentAvantRetrait(job) {
  if (!objet(job)) return null;
  if (job.platform !== "vinted" || job.action !== "republish" || job.status !== "needs_user") return null;
  const pf = objet(job.platform_fields) ?? {};
  if (!["a_capturer", "captured"].includes(String(pf.republish_step ?? ""))) return null;
  if (MARQUES_RETRAIT_OU_DEPOT.some((k) => pf[k] != null && pf[k] !== false)) return null;
  // Une question, une garde, une attente qui a sa règle : jamais ici.
  const src = String(pf.needs_user_source ?? "");
  if (src && src !== "relancer") return null;
  if (pf.needsUserField || pf.needsUserFields) return null;
  if (Array.isArray(pf.champs_a_completer) && pf.champs_a_completer.length) return null;
  if (pf.mur_vinted_verification) return null;   // vérification du compte demandée par Vinted : un vrai geste
  const boucle = objet(pf.boucle_technique);
  const repete = Boolean(boucle) && /^(canal_coupe|onglet_muet)$/.test(String(boucle.signature ?? ""));
  if (!(repete || coupureSeule(job.error) || coupureSeule(brutTechnique(pf)))) return null;
  return { signature: repete ? `boucle_${boucle.signature}` : "technique" };
}

/**
 * La reprise suivante (B6) : compteur reprise_avant_retrait (le même que l'extension
 * 0.6.134 — la sentinelle le lit), échéance next_action_after.
 * @param {Record<string, unknown>|null|undefined} pf
 * @param {{ maintenant?: number, motif?: string|null, url?: string|null, posePar?: string }} [options]
 */
export function prochaineRepriseAvantRetrait(pf, options = {}) {
  const { maintenant = Date.now(), motif = null, url = null, posePar = "serveur" } = options;
  const n = (Number(objet(pf)?.reprise_avant_retrait?.n) || 0) + 1;
  const delaiMin = DELAIS_ACCIDENT_AVANT_RETRAIT_MIN[n - 1] ?? DELAI_ACCIDENT_PALIER_MIN;
  return {
    delaiMin,
    reprise_avant_retrait: {
      n,
      le: new Date(maintenant).toISOString(),
      motif: String(motif ?? "").slice(0, 200) || null,
      url: String(url ?? "").slice(0, 200) || null,
      pose_par: posePar,
    },
    next_action_after: new Date(maintenant + delaiMin * 60_000).toISOString(),
  };
}

// Les marqueurs d'une attente « à toi » qui ne survivent pas à la remise en file.
export const CLES_ATTENTE_A_RETIRER = Object.freeze([
  "needs_user_source", "needs_user_actif_ms", "needs_user_tick_le", "needs_user_vu_le", "needs_user_vu_erreur",
  "needs_user_sans_motif", "needsUserAttempts", "needsUserBoucle", "needsUserResolved", "processing_since",
  "pas_de_rouge", "pas_de_rouge_reprises",
]);
