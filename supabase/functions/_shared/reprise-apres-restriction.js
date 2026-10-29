// ═══════════════════════════════════════════════════════════════════════════
// APRÈS UNE RESTRICTION VINTED : QUELLES TÂCHES REPARTENT PAR PALIERS (26/10, Johan DÉSIRÉ — Nico ; 29/10, lot B 4.10)
// ═══════════════════════════════════════════════════════════════════════════
// La règle de Nico du 26/10 : une tâche Vinted retenue par la restriction du compte ne repart qu'au rythme de
// coin_config.vinted_reprise_restriction_jour par jour de Paris, une à la fois, 45 min au moins entre deux
// (get-pending-jobs, « APRÈS UNE RESTRICTION VINTED, LA FILE REPART PAR PALIERS »). Le palier, le compteur et
// l'espacement vivent là-bas et ne changent pas ; ici, seulement QUI est une tâche « après restriction ».
//   · retenue par pas-de-rouge (motif compte_restreint / compte_restreint_echu, update-job-status) ;
//   · (29/10) OU retenue par la garde du serveur (« VINTED A RESTREINT LE COMPTE », get-pending-jobs) : elle porte
//     platform_fields.restriction_compte { jusquau, fin } et AUCUN pas_de_rouge — 12 tâches en base le 29/10 (11 de
//     02ca0f20 jusqu'au 05/11, 1 de 7b9d8a71 jusqu'au 09/11), qui seraient reparties à la suite, sans palier ;
//   · et seulement quand elle PEUT partir : la restriction est finie (restriction_compte.fin passée) et son échéance
//     (next_action_after) est venue. Avant, elle serait marquée « reprise du jour » puis écartée plus bas par la garde
//     de l'échéance : comptée dans le palier sans partir, et libre de tout palier ensuite.
//   · jamais deux fois : une tâche déjà marquée reprise_restriction_jour a eu son tour.
// Pur, sans import : get-pending-jobs (Deno), les selftests (Node).

export const MOTIFS_RESTRICTION_VINTED = ["compte_restreint", "compte_restreint_echu"];

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : {});
const instant = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : null; };

/** La tâche a-t-elle été retenue par une restriction du compte Vinted (quelle que soit la garde qui l'a retenue) ? */
export function retenueParRestrictionVinted(job) {
  if (!job || String(job.platform ?? "") !== "vinted") return false;
  const pf = objet(job.platform_fields);
  if (MOTIFS_RESTRICTION_VINTED.includes(String(objet(pf.pas_de_rouge).motif ?? ""))) return true;
  return instant(objet(pf.restriction_compte).fin) != null;
}

/** Une tâche « après restriction » qui attend son tour de reprise par paliers, et peut partir maintenant. */
export function estApresRestrictionVinted(job, maintenant = Date.now()) {
  if (!retenueParRestrictionVinted(job)) return false;
  const pf = objet(job.platform_fields);
  if (pf.reprise_restriction_jour) return false;
  const fin = instant(objet(pf.restriction_compte).fin);
  if (fin != null && fin > maintenant) return false;
  const echeance = instant(pf.next_action_after);
  if (echeance != null && echeance > maintenant) return false;
  return true;
}
