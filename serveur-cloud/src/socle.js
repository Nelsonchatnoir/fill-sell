// Le socle en base (migration 20261005120000) est-il là ? — 05/10/2026.
//
// Le serveur peut être créé et déployé AVANT le GO de Nico sur la migration
// (test complet, étape 1 puis 2). Sans socle, cloud_comptes_a_servir n'existe
// pas : le planificateur (toutes les minutes) et l'entretien (toutes les heures)
// échoueraient en boucle contre la base. Règle « tâche automatique mesurée,
// bornée » (04/10) : on le DIT une fois, puis on ne réessaie que toutes les
// 10 minutes, jusqu'à ce que la migration soit appliquée.

/** L'erreur dit-elle « fonction inconnue » (PostgREST PGRST202 ou Postgres 42883) ? */
export function socleAbsent(erreur) {
  const t = String(erreur?.message ?? erreur ?? '');
  return /PGRST202|Could not find the function|function [^ ]+ does not exist|42883/i.test(t);
}

export const ATTENTE_SOCLE_MS = 10 * 60_000;

/** Un garde par boucle : `passer()` dit s'il faut sauter ce tour ; `noter(e)` rend vrai si c'est le socle absent. */
export function creerGardeSocle({ journal, maintenant = () => Date.now(), attenteMs = ATTENTE_SOCLE_MS, nom = 'boucle' } = {}) {
  let jusqua = 0;
  let dit = false;
  return {
    passer: () => maintenant() < jusqua,
    noter(erreur) {
      if (!socleAbsent(erreur)) return false;
      jusqua = maintenant() + attenteMs;
      if (!dit) { journal?.info?.('socle_absent', { boucle: nom, reprise_min: Math.round(attenteMs / 60_000) }); dit = true; }
      return true;
    },
    present() { if (dit) journal?.info?.('socle_present', { boucle: nom }); jusqua = 0; dit = false; },
  };
}
