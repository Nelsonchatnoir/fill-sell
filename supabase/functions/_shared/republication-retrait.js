// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT FERME LES REPUBLICATIONS EN ATTENTE DE LA MÊME ANNONCE (31/10, finition du lot F)
// ═══════════════════════════════════════════════════════════════════════════
// Vu sur le compte de Nico (31/10 11:09) : retrait ciblé de l'annonce Beebs 34269931 depuis l'app ; la
// republication de cette annonce, en attente (needs_user, étape a_capturer, rien retiré par elle), est restée
// ouverte — l'extension (cancelPublishAfterDelete) ne clôt que les jobs « published ». Servie plus tard, elle
// aurait cherché une annonce retirée (« plus en ligne » au mieux, une recréation que personne n'a demandée au pire),
// et elle restait dans « À régler » sans objet.
//
// LA RÈGLE (serveur : toutes les versions d'extension, tous les chemins de retrait — logo du Stock, bandeau, vente) :
// un retrait (action 'delete') en attente, en cours ou fait sur l'annonce X — même compte, même plateforme, même
// numéro (numeroAnnonceDuJob : la colonne, sinon le lien) — clôt toute republication NON ENGAGÉE de X :
//   · statut en attente (pending) ou en attente d'un geste (needs_user) — jamais un job en cours ;
//   · étape absente, a_capturer ou captured, et aucun retrait engagé (retraitEngage : ni étape 'deleted', ni
//     deleted_at, ni suppression envoyée).
// La clôture : cancelled + arret_utilisateur (controler_job_extension refuse ensuite toute écriture d'un poste qui
// tiendrait le job en mémoire) + hors_quota (la republication n'a pas eu lieu), rien n'est recréé.
// ⛔ Une republication ENGAGÉE (son ancienne annonce est retirée ou a pu l'être) n'est jamais touchée ici : elle
//    garde son circuit.
// La porte : get-pending-jobs, à chaque poll normal, AVANT la pause (une file en pause, une republication en attente
// d'un geste se clôt aussi), que le retrait attende encore ou soit fait. (update-job-status, porte prévue au retrait
// fait : déploiement refusé le 31/10, non modifié.) Pur (Deno + Node) : aucune lecture ici.
import { retraitEngage } from "./retenue-creneau.js";
import { numeroAnnonceDuJob } from "./retrait-deja-absent.js";

export const STATUTS_RETRAIT_VIVANT = Object.freeze(["pending", "processing", "needs_user", "deleted"]);
export const MESSAGE_REPUBLICATION_RETRAIT = "Annonce retirée à ta demande : cette republication n'a plus d'objet. Rien n'a été retiré par elle, rien n'a été recréé.";

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);

/** Une republication qu'un retrait de la même annonce peut clore (en attente, non engagée). */
export function republicationFermableParRetrait(job) {
  if (!job || String(job.action ?? "") !== "republish") return false;
  if (!["pending", "needs_user"].includes(String(job.status ?? ""))) return false;
  const pf = objet(job.platform_fields) ?? {};
  const etape = String(pf.republish_step ?? "");
  if (etape && etape !== "a_capturer" && etape !== "captured") return false;
  return !retraitEngage(job);
}

/** Un retrait qui vise une annonce précise et n'a pas échoué ni été annulé. */
export function retraitVivant(job) {
  return Boolean(job) && String(job.action ?? "") === "delete"
    && STATUTS_RETRAIT_VIVANT.includes(String(job.status ?? ""))
    && Boolean(numeroAnnonceDuJob(job));
}

/** Les republications à clore après (ou pendant) ce retrait : la même annonce, exactement. */
export function republicationsAClore(republications, retrait) {
  if (!retraitVivant(retrait) || !retrait.user_id) return [];
  const numero = numeroAnnonceDuJob(retrait);
  return (Array.isArray(republications) ? republications : []).filter((r) => r
    && String(r.id) !== String(retrait.id)
    && String(r.user_id) === String(retrait.user_id)
    && String(r.platform ?? "") === String(retrait.platform ?? "")
    && republicationFermableParRetrait(r)
    && numeroAnnonceDuJob(r) === numero);
}

/** Le retrait vivant qui vise la même annonce que cette republication (le plus récent), ou null. */
export function retraitDeLaRepublication(republication, retraits) {
  if (!republicationFermableParRetrait(republication)) return null;
  const numero = numeroAnnonceDuJob(republication);
  if (!numero) return null;
  const vises = (Array.isArray(retraits) ? retraits : []).filter((d) => retraitVivant(d)
    && String(d.user_id) === String(republication.user_id)
    && String(d.platform ?? "") === String(republication.platform ?? "")
    && numeroAnnonceDuJob(d) === numero);
  vises.sort((a, b) => String(b.created_at ?? "").localeCompare(String(a.created_at ?? "")));
  return vises[0] ?? null;
}

/** L'écriture de la clôture (un seul patch : statut, message, marqueurs). */
export function clotureRepublicationParRetrait(platformFields, { le, retraitId, numero, par }) {
  const pf = { ...(objet(platformFields) ?? {}) };
  pf.arret_utilisateur = le;
  pf.hors_quota = true;
  pf.republication_retrait_demande = { le, retrait: String(retraitId ?? ""), annonce: String(numero ?? ""), par: String(par ?? "") };
  pf.needsUserAttempts = Math.max(99, Number(pf.needsUserAttempts ?? 0) || 0);
  return { status: "cancelled", error: MESSAGE_REPUBLICATION_RETRAIT, platform_fields: pf };
}
