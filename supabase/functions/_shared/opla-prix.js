// ═══════════════════════════════════════════════════════════════════════════
// OPLA : UN PRIX AU-DESSUS DE SON PLAFOND (04/10, Lebonzeze)
// ═══════════════════════════════════════════════════════════════════════════
// f2rhrt5zc6 : sac à 1 100 €, cinq essais brûlés, puis « la publication n'a
// pas abouti après plusieurs essais » — alors que le plafond d'Opla (1 000 €,
// refus serveur price_too_high) se juge sans rien envoyer. Le même texte sert
// à la garde de get-pending-jobs (avant tout envoi) et au veilleur
// (handler-watch : les tâches déjà arrêtées sous un autre texte).
// ES module sans import (Deno + node).

export const OPLA_PRIX_MAX = 1000;

/** Le prix d'une tâche Opla dépasse-t-il le plafond ? (publication, republication) */
export function prixOplaTropHaut(job) {
  if (!job || job.platform !== "opla") return false;
  if (job.action !== "publish" && job.action !== "republish") return false;
  const p = Number(job.price);
  return Number.isFinite(p) && p > OPLA_PRIX_MAX;
}

/** Le texte montré : la cause, ce qui n'a pas été fait, les deux issues. */
export function messagePrixOplaTropHaut(prix) {
  const p = Number(prix);
  const lePrix = Number.isFinite(p) ? ` (celle-ci est à ${p} €)` : "";
  return `Opla n'accepte pas d'annonce au-dessus de ${OPLA_PRIX_MAX} €${lePrix} : rien n'a été envoyé. ` +
    `Baisse le prix de la fiche sous ${OPLA_PRIX_MAX} € puis relance, ou ne publie pas cet article sur Opla.`;
}
