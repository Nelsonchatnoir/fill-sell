// ═══════════════════════════════════════════════════════════════════════════
// LA TÊTE DE FILE : LA SEULE TÂCHE QUE L'EXTENSION VA COMMENCER (15/10, P4)
// ═══════════════════════════════════════════════════════════════════════════
// Ciddjy (Mac) : un lot de 79 dépôts Beebs le 14/10 à 09:29. L'extension les
// prend UN PAR UN (un onglet à la fois, une pause entre deux). Mais
// get-pending-jobs servait TOUTE la file à chaque appel et la réservation
// comptait un « service sans démarrage » pour CHACUNE : à 16:04, 68 tâches qui
// attendaient simplement leur tour ont été « mises de côté » comme si elles ne
// démarraient jamais (règle du 03/10, _shared/tache-sans-demarrage.js).
// Règle : seule la TÊTE de file — la tâche que l'extension commencera en
// premier — compte un service sans démarrage ; les autres attendent leur tour
// et leur compteur repart (reserver_jobs_extension, p_tete, migration
// 20261015020000).
// L'ordre est CELUI DE L'EXTENSION (background.js, pollAndProcessJobsUnlocked,
// prioriteRepub) : republication à l'étape « deleted » d'abord (la plus ancienne
// suppression en tête), puis publications et retraits, puis les autres
// republications, puis les « deleted » reléguées (≥ 3 blocages) ; à égalité,
// l'ordre de la file servie. ES module sans import (Deno + node).

export const DELETED_HANG_DEMOTE = 3;

function priorite(j) {
  const pf = (j && typeof j.platform_fields === "object" && j.platform_fields) || {};
  if (j?.action === "republish" && pf.republish_step === "deleted") {
    const hang = Number(pf.deleted_hang_count) || 0;
    return hang >= DELETED_HANG_DEMOTE ? 3 : 0;
  }
  if (j?.action === "publish" || j?.action === "delete") return 1;
  return 2;
}

/** La file dans l'ordre où l'extension la traitera (copie). */
export function ordreExtension(jobs) {
  return (Array.isArray(jobs) ? jobs : [])
    .map((j, i) => [j, i])
    .sort((a, b) => {
      const pa = priorite(a[0]), pb = priorite(b[0]);
      if (pa !== pb) return pa - pb;
      if (pa === 0 || pa === 3) {
        const da = Date.parse(a[0]?.platform_fields?.deleted_at ?? "") || 0;
        const db = Date.parse(b[0]?.platform_fields?.deleted_at ?? "") || 0;
        if (da !== db) return da - db;
      }
      return a[1] - b[1];
    })
    .map(([j]) => j);
}

/** L'identifiant de la tâche que l'extension commencera en premier (ou null). */
export function teteDeFile(jobs) {
  const t = ordreExtension(jobs)[0];
  return t?.id != null ? String(t.id) : null;
}
