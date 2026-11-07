// ═══════════════════════════════════════════════════════════════════════════
// UNE REPUBLICATION VISE L'ANNONCE EN LIGNE ACTUELLE, JAMAIS UN NUMÉRO PÉRIMÉ (31/10, lot F — Johan)
// ═══════════════════════════════════════════════════════════════════════════
// tiblancdeshaut, 30/10 : 30 republications Leboncoin en file visent les numéros 3291…–3294… (étape « captured »).
// Ses annonces ont été recréées HORS de FillSell, deux fois (29/10 17:13 → 17:21, puis 30/10 15:10 → 15:28, une
// toutes les ~10 s, aucun job FillSell) : le relevé du 30/10 15:46 les voit sous 3298253160 → 3298271893, les
// anciens numéros ne sont plus vus depuis le 26/10 19:40. Servie telle quelle, la republication aurait cherché à
// retirer une annonce qui n'existe plus (« déjà absente » = retrait acté) puis recréé la copie capturée : une
// annonce EN DOUBLE sur Leboncoin.
//
// LA RÈGLE (get-pending-jobs, avant de servir une republication pas encore engagée — rien retiré, aucune
// suppression envoyée — sur Leboncoin, Depop, Beebs) : face au DERNIER relevé probant de la plateforme
// (releve_preuve_absence : complet, lu en entier) :
//   · la cible (platform_listing_id) y est vue → la republication part, comme avant ;
//   · la cible n'y est pas, alors qu'elle existait avant ce relevé (vue avant, ou publiée avant), ET la fiche a
//     une autre annonce de la plateforme vue dans ce relevé → « sans objet » : l'annonce est déjà remise en ligne.
//     Le job se clôt (cancelled + republication_sans_objet), RIEN n'est retiré ni recréé, jamais de doublon ;
//   · la cible n'y est pas, sans annonce plus récente sur la fiche → la republication est RETENUE avant tout
//     retrait (cible_absente_releve) : FillSell ne remet pas en ligne une annonce dont il ne sait pas si elle a été
//     vendue, retirée ou recréée ailleurs. Elle repart d'elle-même si un relevé revoit la cible. ⛔ Beebs : jamais
//     (sa modération peut cacher une annonce un temps — on ne conclut jamais « pas en ligne » sur Beebs) ;
//   · inconnu (aucun relevé probant, cible plus récente que le relevé, aucun numéro) → la republication part.
// Pur (Deno + Node) : aucune lecture ici, get-pending-jobs fournit les lignes.
import { retraitEngage } from "./retenue-creneau.js";

export const PLATEFORMES_CIBLE_REPUBLICATION = Object.freeze(["leboncoin", "depop", "beebs"]);
const SANS_RETENUE = new Set(["beebs"]);
const MARGE_MS = 5 * 60_000;
const ts = (v) => { const t = Date.parse(String(v ?? "")); return Number.isFinite(t) ? t : NaN; };

/** Une republication que la règle doit juger (pas encore engagée, avant tout retrait). */
export function republicationAJuger(job) {
  if (!job || String(job.action ?? "") !== "republish") return false;
  if (!PLATEFORMES_CIBLE_REPUBLICATION.includes(String(job.platform ?? ""))) return false;
  if (String(job.status ?? "pending") !== "pending") return false;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? job.platform_fields : {};
  const etape = String(pf.republish_step ?? "");
  if (etape && etape !== "a_capturer" && etape !== "captured") return false;
  if (retraitEngage(job)) return false;                      // retrait engagé : elle va au bout (jamais retenue)
  return Boolean(String(job.platform_listing_id ?? "").trim()) && job.inventaire_id != null;
}

/**
 * Le verdict d'une republication face au dernier relevé probant.
 * @param {object} p
 * @param {object} p.job        — { platform, platform_listing_id, inventaire_id, platform_fields, ... }
 * @param {object|null} p.releve — { id, started_at } : le dernier relevé probant de la plateforme (ce compte)
 * @param {object|null} p.cible — la ligne annonces_plateforme du numéro visé ({ listing_id, vu_le }) ou null
 * @param {Array} p.fiche       — les autres annonces de la fiche sur la plateforme ({ listing_id, vu_le, publiee_le, created_at })
 * @param {string|null} p.publieeLe — date de publication connue de la cible (job de dépôt), si aucune ligne relevée
 * @returns {{ verdict: 'servir'|'sans_objet'|'cible_absente', motif: string, successeur?: string, successeurs?: string[] }}
 */
export function jugerCibleRepublication({ job, releve = null, cible = null, fiche = [], publieeLe = null } = {}) {
  if (!republicationAJuger(job)) return { verdict: "servir", motif: "hors_regle" };
  const debut = ts(releve?.started_at);
  if (!releve?.id || !Number.isFinite(debut)) return { verdict: "servir", motif: "aucun_releve_probant" };
  const seuil = debut - MARGE_MS;
  const vueCible = ts(cible?.vu_le);
  if (Number.isFinite(vueCible) && vueCible >= seuil) return { verdict: "servir", motif: "cible_en_ligne" };
  // Absente du relevé : seulement si elle existait AVANT lui (sinon elle est peut-être plus récente que le relevé).
  const connueAvant = (Number.isFinite(vueCible) && vueCible < seuil) || (Number.isFinite(ts(publieeLe)) && ts(publieeLe) < seuil - MARGE_MS);
  if (!connueAvant) return { verdict: "servir", motif: "cible_plus_recente_que_le_releve" };
  const cibleId = String(job.platform_listing_id).trim();
  const vues = (Array.isArray(fiche) ? fiche : [])
    .filter((a) => String(a?.listing_id ?? "").trim() && String(a.listing_id).trim() !== cibleId && Number.isFinite(ts(a.vu_le)) && ts(a.vu_le) >= seuil)
    .sort((a, b) => (ts(b.publiee_le) || ts(b.created_at) || 0) - (ts(a.publiee_le) || ts(a.created_at) || 0));
  // UNE annonce plus récente en ligne : c'est la remise en ligne. Deux ou plus (deux exemplaires en ligne) : on ne sait
  // pas laquelle remplace la cible — jamais une clôture sur un doute, la republication attend (rien n'est retiré).
  if (vues.length === 1) {
    return { verdict: "sans_objet", motif: "deja_remise_en_ligne", successeur: String(vues[0].listing_id), successeurs: [String(vues[0].listing_id)] };
  }
  if (vues.length > 1) {
    if (SANS_RETENUE.has(String(job.platform))) return { verdict: "servir", motif: "beebs_jamais_retenue" };
    return { verdict: "cible_absente", motif: "plusieurs_annonces_en_ligne", successeurs: vues.map((a) => String(a.listing_id)).slice(0, 5) };
  }
  if (SANS_RETENUE.has(String(job.platform))) return { verdict: "servir", motif: "beebs_jamais_retenue" };
  return { verdict: "cible_absente", motif: "cible_absente_du_releve" };
}

const NOMS = { leboncoin: "Leboncoin", depop: "Depop", beebs: "Beebs" };
export const nomPlateformeCible = (p) => NOMS[String(p ?? "")] ?? String(p ?? "");

/** Le texte de la republication close : l'annonce est déjà en ligne sous un autre numéro. */
export function messageRepublicationSansObjet(platform, successeur) {
  return `Ton annonce ${nomPlateformeCible(platform)} était déjà remise en ligne (annonce n° ${successeur}) : cette republication n'a plus d'objet. Rien n'a été retiré ni recréé.`;
}

/** Le texte de la republication retenue : l'annonce visée n'est plus dans la liste au dernier relevé. */
export function messageCibleAbsente(platform, cible) {
  return `En pause, rien n'a été retiré : l'annonce ${nomPlateformeCible(platform)} n° ${cible} n'est plus dans ta liste au dernier relevé. ` +
    "FillSell ne remet pas en ligne une annonce sans savoir si elle a été vendue, retirée ou remise en ligne autrement.";
}

// (05/11, point 18) DEUX RELEVÉS PROBANTS sans la cible → la republication retenue se clôt (get-pending-jobs).
export const RELEVES_POUR_CLORE_CIBLE_ABSENTE = 2;
/**
 * Les relevés probants DISTINCTS qui n'ont pas vu la cible (marque cible_absente_releve), le dernier compris (5 au plus).
 * (07/11, famille 1 C3 — ayoubd72 84bd972d, Leboncoin 3296483096) AMORCÉS par le constat de deux relevés complets déjà
 * posé sur la tâche (platform_fields.absence_releves : premier, second — constater_absences_releve, deux relevés
 * probants distincts) quand il vise la MÊME annonce et qu'aucun relevé ne l'a revue depuis (vu_le de la cible antérieur
 * au constat, ou cible jamais relevée) : la republication créée APRÈS ce constat ne réattend plus deux relevés que le
 * poste, endormi, ne fait pas. Sans constat (ou un autre numéro, ou revue depuis) : la règle d'avant, à l'identique.
 * @param {any} marque          platform_fields.cible_absente_releve
 * @param {any} releveId        le dernier relevé probant (qui ne l'a pas vue)
 * @param {any} cible           le numéro visé
 * @param {{ absence?: any, cibleVuLe?: any }} [o]
 */
export function relevesCibleAbsente(marque, releveId, cible, { absence = null, cibleVuLe = null } = {}) {
  const m = marque && typeof marque === "object" ? marque : {};
  const memeCible = String(m.cible ?? cible ?? "") === String(cible ?? "");
  const avant = memeCible ? (Array.isArray(m.releves) ? m.releves : (m.releve ? [m.releve] : [])) : [];
  const ids = [...amorceAbsence(absence, cible, cibleVuLe), ...avant, releveId].map((x) => (x == null ? "" : String(x))).filter(Boolean);
  return [...new Set(ids)].slice(-5);
}
/** Les deux relevés du constat absence_releves, s'il vise CETTE annonce et n'a pas été démenti depuis ; sinon []. */
function amorceAbsence(absence, cible, cibleVuLe) {
  const a = absence && typeof absence === "object" ? absence : null;
  if (!a || !String(cible ?? "").trim() || String(a.listing_id ?? "").trim() !== String(cible).trim()) return [];
  const premier = String(a.premier ?? "").trim(), second = String(a.second ?? "").trim();
  if (!premier || !second || premier === second) return [];
  const le = ts(a.le), vu = ts(cibleVuLe);
  if (!Number.isFinite(le)) return [];
  if (Number.isFinite(vu) && vu >= le) return []; // revue en ligne depuis le constat : il ne prouve plus rien
  return [premier, second];
}
/** Le texte de la republication close : l'annonce n'est plus en ligne (deux relevés), rien n'a été touché. */
export function messageCibleAbsenteConfirmee(platform, cible) {
  return `Ton annonce ${nomPlateformeCible(platform)} n° ${cible} n'est plus en ligne : deux relevés complets de tes annonces ne l'ont pas vue. ` +
    "Cette republication est close, rien n'a été retiré ni recréé. Si l'article est toujours à vendre, publie-le de nouveau depuis le Stock.";
}
