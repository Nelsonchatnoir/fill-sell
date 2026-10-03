// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT BEEBS « SUPPRIMÉ » PORTE LA LISTE DU PROPRIÉTAIRE (03/10)
// ═══════════════════════════════════════════════════════════════════════════
// Bouilloire de Nico (Beebs 34097677, retrait 451c9bc4, 03/10 10:12) : premier
// essai sur une page sans bouton propriétaire, second essai qui confirme, puis
// « supprimé » sans que rien n'ait été relu — et la fiche du job gardait le
// diagnostic du premier essai (« bouton ABSENT »). Beebs supprime de façon
// asynchrone, et sa page publique en 404 est AUSSI celle d'une annonce en
// vérification : depuis le 01/09, 83 retraits Beebs clos sur un clic et 5 sur
// la page publique, aucun relu.
// LA RÈGLE (« un retrait n'est jamais clos sans preuve ») :
//   · l'extension ≥ BUILD_BEEBS_PREUVE_RETRAIT relit « Mes annonces » (les deux
//     onglets, en entier) après la confirmation et rend preuve_retrait
//     { source: 'mes_annonces', absente: true, numero } — sans elle, le
//     « supprimé » est refusé et le job revient en vérification ;
//   · un poste plus ancien ne sait pas prouver : son « supprimé » est accepté
//     (le refuser bloquerait tout le parc) mais MARQUÉ
//     retrait_sans_preuve_proprietaire, et les relevés Beebs complets
//     tranchent ensuite (jugerRetraitBeebsParReleves) : revue en ligne après
//     le retrait → le retrait repart ; absente de deux relevés complets →
//     preuve écrite.
// Pur, sans import réseau (Deno + Node).

import { releveComplet } from "./retrait-introuvable.js";

// Horodatage du correctif de l'extension (0.6.90) : tout build postérieur le porte.
export const BUILD_BEEBS_PREUVE_RETRAIT = "2026-10-03T11:00:00Z";

const buildMs = (hb) => {
  const m = String(hb ?? "").match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z)/);
  return m ? Date.parse(m[1]) : NaN;
};
const ms = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** La preuve écrite par l'extension : la liste du propriétaire, relue, sans l'annonce. */
export function preuveRetraitBeebsValide(pf) {
  const p = pf && typeof pf === "object" ? pf.preuve_retrait : null;
  return !!p && typeof p === "object" && p.source === "mes_annonces" && p.absente === true && /^\d{6,}$/.test(String(p.numero ?? ""));
}

/**
 * Que faire d'un « supprimé » Beebs ?
 *   'ok'      — la preuve est là ;
 *   'refuser' — le poste sait prouver et n'a pas prouvé : le job revient en vérification ;
 *   'marquer' — poste ancien : accepté, marqué, vérifié ensuite par les relevés.
 */
export function verdictClotureRetraitBeebs(pf, handlerBuild) {
  if (preuveRetraitBeebsValide(pf)) return "ok";
  const b = buildMs(handlerBuild);
  if (Number.isFinite(b) && b >= Date.parse(BUILD_BEEBS_PREUVE_RETRAIT)) return "refuser";
  return "marquer";
}

export const MESSAGE_RETRAIT_BEEBS_EN_VERIFICATION =
  "Retrait Beebs envoyé, en vérification : FillSell relit « Mes annonces » sur ton ordinateur avant de le dire retiré. Rien à faire de ton côté.";

/** Le numéro Beebs d'un retrait (identifiant, ou lien /p/<n>). */
export function numeroRetraitBeebs(job) {
  const brut = String(job?.platform_listing_id ?? "").trim();
  if (/^\d{6,}$/.test(brut)) return brut;
  const m = String(job?.listing_url ?? "").match(/\/p\/(\d{6,})(?:[-/?#]|$)/);
  return m ? m[1] : null;
}

/**
 * Un retrait Beebs clos SANS preuve (poste ancien) face aux relevés complets.
 * @param {any} job  action='delete', status='deleted', platform_fields.retrait_sans_preuve_proprietaire.le
 * @param {{ releves?: Array<any>, annonces?: Array<any> }} ctx
 *   releves : relevés Beebs (kind 'annonces') — status, started_at, items_vus, total_entries, erreur ;
 *   annonces : lignes annonces_plateforme Beebs du compte pour ce numéro — listing_id, vu_le, disparu_le, retiree_le, statut_plateforme.
 * @returns {null | { verdict: 'rouvrir'|'prouve', numero: string, releves: string[] }}
 */
export function jugerRetraitBeebsParReleves(job, { releves = [], annonces = [] } = {}) {
  if (!job || job.platform !== "beebs" || job.action !== "delete") return null;
  const pf = job.platform_fields ?? {};
  const t0 = ms(pf.retrait_sans_preuve_proprietaire?.le);
  const numero = numeroRetraitBeebs(job);
  if (!numero || !Number.isFinite(t0) || preuveRetraitBeebsValide(pf)) return null;
  // Marge de 2 min : la propagation Beebs n'est pas instantanée.
  const complets = (Array.isArray(releves) ? releves : [])
    .filter((r) => releveComplet(r) && ms(r.started_at) > t0 + 2 * 60_000)
    .sort((a, b) => ms(b.started_at) - ms(a.started_at));
  if (!complets.length) return null;
  const plusAncien = ms(complets[Math.min(complets.length, 2) - 1].started_at);
  const dates = complets.slice(0, 2).map((r) => String(r.started_at));
  const revue = (Array.isArray(annonces) ? annonces : []).some((a) =>
    String(a?.listing_id ?? "").trim() === numero && ms(a.vu_le) >= plusAncien - 60_000
    && !a.disparu_le && !a.retiree_le && !/^(vendue|retiree|retirée)$/i.test(String(a.statut_plateforme ?? "")));
  if (revue) return { verdict: "rouvrir", numero, releves: dates };
  if (complets.length >= 2) return { verdict: "prouve", numero, releves: dates };
  return null;
}
