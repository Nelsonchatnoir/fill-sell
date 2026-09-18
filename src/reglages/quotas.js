// ═══════════════════════════════════════════════════════════════════════════
// RÉGLAGES — CE QUE `quotas_etat()` PERMET D'AFFICHER (2026-09-18)
// ═══════════════════════════════════════════════════════════════════════════
// Deux questions, deux réponses, un seul endroit — le hub et la sous-page
// Abonnement doivent dire LA MÊME CHOSE. Aucune règle métier ici : on ne fait
// que lire la forme rendue par la RPC.

// Y a-t-il seulement quelque chose à montrer ? Un geste sans plafond configuré
// ne s'affiche pas (doctrine de la bascule quotas du 02/09 : jamais un faux
// zéro), et un compteur vide ne doit pas produire une carte vide coiffée
// d'une date de remise à zéro.
export function consommationVisible(q) {
  if (!q || q.error) return false;
  if (q.annonces?.plafond != null) return true;
  if (q.retouches?.plafond != null && q.retouches.plafond > 0) return true;
  const r = q.republication;
  return Boolean(r && (r.mode === 'illimite' || r.plafond != null));
}

// La date de remise à zéro des compteurs. `cycle_debut` est la dernière
// dotation mensuelle (debut_cycle_quotas) ; la suivante tombe le 1er du mois,
// parce que grant_monthly_coins est idempotente PAR MOIS CALENDAIRE et que le
// balayage passe tous les jours à 04:15. On rend donc le 1er du mois qui suit.
// ⛔ Date illisible → null, et la page n'affiche rien : jamais une date
//    inventée sur un écran qui parle d'argent.
export function dateRemiseAZero(cycleDebut, lang) {
  const t = Date.parse(cycleDebut ?? '');
  if (!Number.isFinite(t)) return null;
  const base = new Date(t);
  const suivant = new Date(base.getFullYear(), base.getMonth() + 1, 1);
  const maintenant = new Date();
  // Dotation manquée (le balayage n'a pas tourné) : la prochaine est celle du
  // mois qui suit aujourd'hui, jamais une date déjà passée.
  const cible = suivant.getTime() > maintenant.getTime()
    ? suivant
    : new Date(maintenant.getFullYear(), maintenant.getMonth() + 1, 1);
  return cible.toLocaleDateString(lang === 'en' ? 'en-GB' : 'fr-FR', { day: '2-digit', month: '2-digit' });
}
