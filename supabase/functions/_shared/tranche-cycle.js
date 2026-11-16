// ═══════════════════════════════════════════════════════════════════════════
// LA TRANCHE DU CYCLE : UNE FILE DE RETRAITS SERVIE PAR TRANCHES D'ENVIRON 15 MIN (16/11, F1 — feu vert de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Marc (thecloset72000), suppression groupée du 16/11 à 11:42 (754 articles) : get-pending-jobs servait 100 tâches
// d'un coup (`out.slice(0, 100)`), l'extension les faisait toutes avant de relire la file, et un retrait Beebs se fait
// en DEUX passages (envoi, puis vérification au passage SUIVANT, 5 min au moins après). Cycle 1 : 11:44:09 → 13:28:31,
// 104 min ; les 25 suppressions Beebs envoyées pendant ce cycle sont restées « en attente » jusqu'à 13:30 (1 h 45).
// Diagnostic : docs/enquetes/lot-1611-3-apres-midi/annexe-p5.md (§ 2.2, § 3 F1).
// LA RÈGLE (pure, appliquée juste avant la réservation, file d'exécution seulement) :
//   · aucun retrait dans la file servie, ou des retraits estimés à BUDGET_TRANCHE_S au plus : `out.slice(0, 100)` À
//     L'IDENTIQUE — publications et republications intouchées (créneaux, plafonds, paliers, quotas : rien ne change,
//     la file servie a déjà passé toutes ces règles) ;
//   · sinon, le cycle ne porte QUE les premiers retraits qui tiennent dans le budget (au moins un) : les vérifications
//     Beebs dues d'abord (une suppression déjà envoyée qui attend sa preuve), puis les autres dans l'ordre de la file
//     (created_at). Les retraits restants partent au poll suivant, toujours devant les publications (même ordre que
//     l'extension : _shared/tete-de-file.js) ;
//   · ⛔ une republication dont le retrait est ENGAGÉ (annonce retirée, ou suppression envoyée : retraitEngage) et qui
//     serait servie aujourd'hui l'est toujours : c'est elle qui remet l'annonce en ligne, jamais elle qu'on retient
//     (même exception que la pause de la file et la mise à jour de l'extension) ;
//   · estimations, mesurées le 16/11 (journaux update-job-status, cycle 1 de Marc) : retrait Beebs premier passage
//     154-157 s → 170 s ; vérification Beebs 24-35 s → 40 s ; autre retrait 9-16 s + pause 8-20 s → 25 s.
// ES module sans dépendance externe (Deno + node) ; seuls imports : deux règles pures du même dossier.
import { ordreExtension } from "./tete-de-file.js";
import { retraitEngage } from "./retenue-creneau.js";

export const PLAFOND_CYCLE = 100;
export const BUDGET_TRANCHE_S = 15 * 60;
export const COUT_RETRAIT_S = Object.freeze({ beebs_envoi: 170, beebs_verification: 40, autre: 25 });

const pfDe = (j) => (j && typeof j.platform_fields === "object" && j.platform_fields) || {};

/** Un retrait (action « delete »). */
export function estRetrait(j) {
  return j?.action === "delete";
}

/** Un retrait Beebs dont la suppression est déjà envoyée : ce passage ne fait que la vérifier. */
export function estVerificationBeebs(j) {
  if (!estRetrait(j) || j?.platform !== "beebs") return false;
  const s = pfDe(j).beebs_suppression_envoyee;
  return !!(s && typeof s === "object" && Number.isFinite(Date.parse(String(s.le ?? ""))));
}

/** La durée estimée d'un retrait, en secondes (pause entre deux tâches comprise). */
export function coutRetraitS(j) {
  if (j?.platform === "beebs") return estVerificationBeebs(j) ? COUT_RETRAIT_S.beebs_verification : COUT_RETRAIT_S.beebs_envoi;
  return COUT_RETRAIT_S.autre;
}

/**
 * La tranche détaillée : { servis, bornee, retraitsEnFile, retraitsServis, estimeS, autresAttendent, engageesServies }.
 * `bornee` = false ⇔ servis est exactement `out.slice(0, plafond)`.
 */
export function trancheDuCycleDetaillee(out, { budgetS = BUDGET_TRANCHE_S, plafond = PLAFOND_CYCLE } = {}) {
  const file = Array.isArray(out) ? out : [];
  const base = file.slice(0, plafond);
  const retraits = ordreExtension(file).filter(estRetrait);   // rang -1 : ordre de la file, comme l'extension
  const total = retraits.reduce((s, j) => s + coutRetraitS(j), 0);
  if (!retraits.length || total <= budgetS) {
    return { servis: base, bornee: false, retraitsEnFile: retraits.length, retraitsServis: base.filter(estRetrait).length, estimeS: total, autresAttendent: 0, engageesServies: 0 };
  }
  // ⛔ Jamais retenues : les republications engagées que le cycle d'aujourd'hui servirait.
  const engagees = base.filter((j) => j?.action === "republish" && retraitEngage(j));
  const ordonnes = [...retraits.filter(estVerificationBeebs), ...retraits.filter((j) => !estVerificationBeebs(j))];
  const tranche = [];
  let cumul = 0;
  for (const j of ordonnes) {
    const c = coutRetraitS(j);
    if (tranche.length && (cumul + c > budgetS || tranche.length + engagees.length >= plafond)) break;
    tranche.push(j);
    cumul += c;
  }
  // Jamais plus de 100 tâches (seul cas coupé : 100 republications engagées ET des retraits au-delà du budget).
  const servis = [...tranche, ...engagees].slice(0, plafond);
  const ids = new Set(servis.map((j) => String(j?.id)));
  return {
    servis, bornee: true, retraitsEnFile: retraits.length, retraitsServis: tranche.length, estimeS: cumul,
    autresAttendent: file.filter((j) => !estRetrait(j) && !ids.has(String(j?.id))).length,
    engageesServies: servis.length - tranche.length,
  };
}

/** Les tâches que ce passage sert (et réserve) : `out.slice(0, 100)`, ou la tranche de retraits bornée. */
export function trancheDuCycle(out, options) {
  return trancheDuCycleDetaillee(out, options).servis;
}

/** La phrase du journal quand la tranche est bornée (null sinon) : combien de retraits restent pour la suivante. */
export function resumeTranche(out, options) {
  const t = trancheDuCycleDetaillee(out, options);
  if (!t.bornee) return null;
  const budget = Math.round((options?.budgetS ?? BUDGET_TRANCHE_S) / 60);
  return `tranche de retraits bornée (F1, 16/11) : ${t.retraitsServis} retrait(s) servi(s) sur ${t.retraitsEnFile} en file`
    + ` (≈ ${Math.round(t.estimeS / 60)} min estimées, budget ${budget} min), ${t.retraitsEnFile - t.retraitsServis} pour la tranche suivante`
    + `${t.engageesServies ? ` ; ${t.engageesServies} republication(s) engagée(s) servie(s) quand même` : ""}`
    + `${t.autresAttendent ? ` ; ${t.autresAttendent} autre(s) tâche(s) attendent la fin des retraits` : ""}`;
}
