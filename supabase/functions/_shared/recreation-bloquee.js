// ═══════════════════════════════════════════════════════════════════════════
// UNE ANNONCE RETIRÉE QUI NE REVIENT PAS NE GÈLE PLUS LES AUTRES (12/10, A5)
// ═══════════════════════════════════════════════════════════════════════════
// L'invariant « une seule annonce hors ligne à la fois, par plateforme » (une
// republication ne retire rien tant qu'une AUTRE est à l'étape 'deleted', en
// pending/processing) vit dans l'extension (toutes versions), dans
// get-pending-jobs (retenue_hors_ligne) et dans le balayage de la
// republication automatique (republish_planifiee_sweep, étape 4). Il est juste
// tant que la remise en ligne est EN COURS. Il retenait SANS LIMITE : le
// Cendrier de jonathanrabany, retiré le 07/10 22:08, 28 remises en ligne
// ratées, gelait ses 8 autres republications Vinted depuis 4 jours ; 7 jobs à
// 'deleted' d'août en gelaient d'autres sur 4 comptes.
//
// LA RÈGLE :
//   · une remise en ligne qui a échoué au moins REPRISES_AVANT_SIGNAL fois et
//     dont l'annonce est retirée depuis plus de DELAI_AVANT_SIGNAL_MS sort de
//     la file : needs_user « recreation_bloquee », message clair (l'annonce
//     est hors ligne, rien n'est perdu, « Republier maintenant » la relance) —
//     les autres republications repartent, partout, sans nouvelle extension ;
//   · SAUF quand la cause est le COMPTE (Vinted restreint les mises en vente,
//     session fermée, compte bloqué) : retirer d'autres annonces les mettrait
//     hors ligne à leur tour, sans aucune chance de revenir — la retenue est
//     alors la protection, et le message le dit (même règle que le
//     disjoncteur, A4 : seul un échec du compte arrête le compte).
// Module PUR, importé par handler-watch.

export const SOURCE_RECREATION_BLOQUEE = "recreation_bloquee";
export const REPRISES_AVANT_SIGNAL = 2;
export const DELAI_AVANT_SIGNAL_MS = 2 * 3600_000;

const NOM = { vinted: "Vinted", leboncoin: "Leboncoin", beebs: "Beebs", depop: "Depop", ebay: "eBay", opla: "Opla" };

/** La cause DU COMPTE qui retient la remise en ligne, ou null (cause de l'article ou inconnue). */
export function causeCompte(pf = {}) {
  const texte = JSON.stringify([pf.error_technique ?? null, pf.last_diagnostic ?? null, pf.recreation_reprise?.brut ?? null]);
  if (pf.selling_restriction || /selling-restriction/.test(texte)) return "restriction";
  if (pf.attente_session || pf.attente_connexion || pf.verification_boutique_vinted?.motif === "session_inconnue") return "session";
  if (pf.compte_vinted_bloque || pf.needs_user_source === "compte_vinted_bloque") return "compte_bloque";
  if (pf.attente_antirobot_compte) return "anti_robot";
  return null;
}

/** Quand l'annonce a été retirée (preuve serveur d'abord), en ms, ou null. */
function retireeLe(pf) {
  for (const k of ["deleted_at_serveur", "deleted_at", "deleted_at_client"]) {
    const t = Date.parse(String(pf?.[k] ?? ""));
    if (Number.isFinite(t)) return t;
  }
  return null;
}

/** Le nombre d'essais de remise en ligne ratés, tel que les écrivains l'ont compté. */
export function essaisRates(pf = {}) {
  return Math.max(
    Number(pf.recreation_reprises) || 0,
    Number(pf.recreation_reprise?.n) || 0,
    Number(pf.recreation_tentee?.n) - 1 || 0,
  );
}

/**
 * La décision pour UN job de republication :
 *   « signaler »  → sortir de la file (needs_user), les autres repartent ;
 *   « proteger »  → cause du compte : il reste en file et retient (voulu) ;
 *   null          → rien à faire (en cours normal, ou pas son cas).
 */
export function decisionRecreationBloquee(job, maintenant = Date.now()) {
  const pf = (job?.platform_fields && typeof job.platform_fields === "object") ? job.platform_fields : {};
  if (job?.action !== "republish" || pf.republish_step !== "deleted") return null;
  if (!["pending", "processing"].includes(job.status)) return null;
  const le = retireeLe(pf) ?? Date.parse(String(job.created_at ?? ""));
  if (!Number.isFinite(le) || maintenant - le < DELAI_AVANT_SIGNAL_MS) return null;
  if (essaisRates(pf) < REPRISES_AVANT_SIGNAL) return null;
  // Un job en cours d'exécution (processing frais) n'est jamais arraché à son poste.
  if (job.status === "processing") {
    const depuis = Date.parse(String(pf.processing_since ?? ""));
    if (!Number.isFinite(depuis) || maintenant - depuis < 30 * 60_000) return null;
  }
  return causeCompte(pf) ? "proteger" : "signaler";
}

/** Le message du job sorti de la file. */
export function messageRecreationBloquee(job) {
  const pf = job?.platform_fields ?? {};
  const nom = NOM[job?.platform] ?? job?.platform ?? "la plateforme";
  const titre = String(job?.title ?? "").split("\n")[0].replace(/\s+/g, " ").trim().slice(0, 80);
  const le = retireeLe(pf);
  const date = le ? new Date(le).toLocaleDateString("fr-FR", { day: "2-digit", month: "2-digit", timeZone: "Europe/Paris" }) : null;
  return `Ton annonce${titre ? ` « ${titre} »` : ""} a été retirée de ${nom}${date ? ` le ${date}` : ""} et FillSell n'a pas réussi à la remettre en ligne `
    + `(${essaisRates(pf)} essais). Rien n'est perdu : titre, description, photos et champs sont gardés. Ouvre ${nom} sur ton ordinateur pour vérifier ton compte, `
    + `puis appuie sur « Republier maintenant » : elle repartira. Tes autres republications, elles, continuent.`;
}
