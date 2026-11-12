// ═══════════════════════════════════════════════════════════════════════════
// REMETTRE UNE TÂCHE EN FILE = REMETTRE À ZÉRO TOUS SES COMPTEURS D'ESSAIS (11/11 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur (compte 64eab2f9, cinq republications Vinted retirées le 10/11, recréation refusée sur l'état « Neuf
// sans étiquette ») — trois remises en file le 11/11, deux défaites dans la minute :
//   · 12:50:49 get-pending-jobs, correctif d'extension « vinted_etat_a_confirmer » : needs_user → pending, mais
//     recreation_tentee {n: 3} gardé → handler-watch 12:51:05 : « ratée 2 fois → sortie de la file » ;
//   · 18:57:10 relance à la main : recreation_bloquee retiré, recreation_tentee {n: 3} gardé → rebloquées à 19:00:19 ;
//   · 20:16:26 seconde relance à la main, compteurs retirés : elles repartent.
// Chaque chemin de relance retirait SA liste de clés (correctifs-extension.js : une liste par correctif ; la cause
// levée de handler-watch : une autre ; la RPC relancer_republish du bouton « Republier maintenant » : aucune).
//
// LA RÈGLE : une tâche remise en file repart avec un budget d'essais ENTIER. Une seule fonction le fait,
// remettreEnFile (ici, Deno + Node) et sa jumelle SQL public.republication_remise_en_file (migration 20261111210000,
// même liste de clés — verrou selftest:remise-en-file) ; tout chemin serveur de relance passe par elle.
//   · les COMPTEURS sont retirés (archivés dans recreation_essais_avant_relance, la clé déjà lue par
//     recreation-deja-partie.js pour les fenêtres Beebs) ;
//   · recreation_tentee est à la fois un compteur (n) et une GARDE (l'extension relit le dressing avant toute
//     recréation quand une tentative a déjà eu lieu, background.js « dejaTentee ») : son n repart de 0, l'objet
//     et son heure restent ;
//   · les TRACES anti-doublon ne sont JAMAIS retirées (TRACES_GARDEES) : la liste des envois, les marqueurs « dépôt
//     peut-être parti », les vérifications après envoi, l'heure du retrait. Les effacer ferait recréer sans relire.
// Module PUR, sans import (Deno + Node).

/** Les compteurs d'essais : retirés à chaque remise en file. Même liste que la jumelle SQL (verrou). */
export const COMPTEURS_D_ESSAIS = Object.freeze([
  "recreation_retries",     // extension : les 2 retentatives automatiques d'une recréation Vinted (background.js)
  "recreation_reprises",    // serveur : les paliers de reprise d'une remise en ligne (republication-hors-ligne.js)
  "recreation_reprise",     //   … et la dernière d'entre elles ({ at, n, brut }) — lue par essaisRates
  "recreation_bloquee",     // handler-watch : la sortie de file « remise en ligne ratée N fois »
  "needsUserAttempts",      // extension : le budget d'une tâche en attente de la personne
  "needsUserBoucle",
  "needs_user_tick_le",     // handler-watch : le budget « 72 h d'extension ouverte »
  "needs_user_actif_ms",
  "pas_de_rouge_reprises",  // update-job-status : les reprises « pas de rouge »
  "stale_recoveries",       // extension : les reprises d'une tâche restée « en cours »
  "deleted_hang_count",     // handler-watch : les gels à l'étape « deleted » (relégation en bout de file à 3)
]);

/** Compteur ET garde : son n repart de 0, l'objet (et son heure) reste. */
export const COMPTEUR_GARDE = "recreation_tentee";

/** Jamais retirées par une remise en file : ce sont les preuves qui évitent un doublon. */
export const TRACES_GARDEES = Object.freeze([
  "recreation_envois", "recreation_depot_parti", "recreation_verifiee", "recreation_attente_releve",
  "recreation_attente_depuis", "recreation_deja_partie", "recreation_doublon", "verifier_doublon_avant_publication",
  "deleted_at", "deleted_at_serveur", "deleted_at_client", "suppression_verdict", "republish_step",
  "republish_suppression_envoyee", "new_vinted_item_id", "recreation_relancee", "correctif_leve",
]);

/** La source d'attente que pose la sortie de file : levée avec elle. */
export const SOURCE_SORTIE_DE_FILE = "recreation_bloquee";

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/**
 * Le platform_fields d'une tâche remise en file (pur, ne modifie pas l'entrée).
 * @param {any} pf0
 * @param {{ par: string, motif?: string | null, maintenant?: string }} o
 */
export function remettreEnFile(pf0, { par, motif = null, maintenant = new Date().toISOString() } = /** @type {any} */ ({})) {
  const pf = { ...(objet(pf0) ?? {}) };
  const archive = {};
  for (const k of COMPTEURS_D_ESSAIS) if (k in pf) archive[k] = pf[k];
  const tentee = objet(pf[COMPTEUR_GARDE]);
  if (tentee) archive[COMPTEUR_GARDE] = tentee;
  if (Object.keys(archive).length) {
    pf.recreation_essais_avant_relance = { ...archive, le: maintenant, par: String(par ?? "?"), motif: motif ?? null };
  }
  for (const k of COMPTEURS_D_ESSAIS) delete pf[k];
  if (tentee) pf[COMPTEUR_GARDE] = { ...tentee, n: 0 };
  if (pf.needs_user_source === SOURCE_SORTIE_DE_FILE) delete pf.needs_user_source;
  delete pf.next_action_after;
  delete pf.processing_since;
  pf.remise_en_file = { le: maintenant, par: String(par ?? "?"), motif: motif ?? null };
  return pf;
}
