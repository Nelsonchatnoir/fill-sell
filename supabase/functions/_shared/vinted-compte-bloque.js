// ═══════════════════════════════════════════════════════════════════════════
// LE COMPTE VINTED BLOQUÉ PAR VINTED N'EST PAS « NOTRE ONGLET » (02/10)
// ═══════════════════════════════════════════════════════════════════════════
// recrutementgroupezk704 (Business), retrait Vinted a7dd76cd « Jeans Levi's
// 511 » (vente faite sur Leboncoin) : les cinq essais du 01/10 ont fini sur
// https://www.vinted.fr/main/banned — Vinted a bloqué le compte. Le retrait
// n'a jamais pu être tenté ; le message disait « notre onglet n'était pas
// encore sur la page », puis « relance-le d'un clic » : une relance refrappe
// le même mur, et l'annonce reste achetable (risque de double vente).
// LA RÈGLE : la page d'arrivée /main/banned (lue par la fenêtre de travail,
// work_window_state) est un MUR de Vinted, jamais une page de notre fait :
// motif vrai, et le geste réel nommé — retirer l'annonce depuis l'appli
// Vinted si elle est encore en ligne.
// Pur, sans import réseau (Deno + Node).
//
// (03/10) LA REQUALIFICATION NE DÉPEND PLUS DU POSTE DE LA PERSONNE. Elle ne
// tournait que dans get-pending-jobs, au poll du compte : le poste de Dayane
// s'est tu le 01/10 à 23:43, et son retrait a gardé le faux « relance-le d'un
// clic » — annonce toujours achetable. handler-watch (toutes les 3 min, tout
// le parc) appelle maintenant la MÊME fonction (requalificationCompteVintedBloque).
// (03/10) Le message dit « tant que Vinted affiche cette page » : chez
// duport.leo3, Vinted montre /main/banned sur le formulaire alors que son
// compte répond encore — c'est une restriction de Vinted, pas forcément un
// compte fermé ; seule l'appli Vinted dit ce qu'elle attend.
//
// (04/10, Nico) DEUX RÈGLES DE PLUS :
//   · SEULE LA PAGE OÙ NOTRE ESSAI A FINI COMPTE. `at_start` et les `fins`
//     plus anciennes décrivent l'onglet de travail PARTAGÉ avant notre
//     navigation (une page laissée là par un autre geste) : un échec de
//     navigation de notre onglet n'est jamais « compte bloqué ». Seuls
//     `at_end` (la fin de CET essai) ou le verdict explicite du content script
//     (« COMPTE VINTED BLOQUÉ », lu sur la page au moment du retrait) le disent.
//   · UN RETRAIT N'EST JAMAIS ARRÊTÉ PAR CE MUR. Mesuré le 04/10 : les deux
//     comptes concernés (recrutementgroupezk704, van-breugel.sandra) ont TOUTES
//     leurs annonces en « Page not found » pour un visiteur — Vinted les a
//     bloqués, l'annonce n'est pas achetable aujourd'hui. Mais si Vinted lève
//     le blocage, elle redevient achetable alors qu'elle est vendue ailleurs :
//     le retrait reste donc en reprise espacée (1 h, 3 h, puis toutes les
//     6 h), avec le motif vrai à l'écran, jusqu'à ce qu'il soit fait — jamais
//     en attente d'un clic, jamais clos sans preuve.
//     Publication et republication : inchangées (needs_user, motif vrai).

import { archiverErreur } from "./erreurs-archivees.js";

export const SOURCE_COMPTE_VINTED_BLOQUE = "compte_vinted_bloque";
const BANNI_RE = /^https?:\/\/(?:www\.)?vinted\.[a-z.]+\/main\/banned(?:[/?#]|$)/i;

/** L'essai a-t-il FINI sur la page « compte bloqué » de Vinted ? (at_end seul) */
export function pageCompteVintedBloque(pf) {
  const w = pf && typeof pf === "object" ? pf.work_window_state : null;
  if (!w || typeof w !== "object") return false;
  return BANNI_RE.test(String(w.at_end?.tab_url ?? ""));
}

export function messageCompteVintedBloque(action, titre) {
  const quoi = titre ? ` « ${String(titre).slice(0, 80)} »` : "";
  if (action === "delete") {
    return `Vinted affiche « compte bloqué » sur ton ordinateur : tant que Vinted affiche cette page, FillSell ne peut rien faire sur ton compte Vinted, ` +
      `donc l'annonce${quoi} n'a PAS été retirée. Si elle est encore en ligne, retire-la toi-même depuis l'appli Vinted ` +
      "pour éviter une double vente ; l'appli te dit aussi ce que Vinted attend de toi.";
  }
  return "Vinted affiche « compte bloqué » sur ton ordinateur : tant que Vinted affiche cette page, FillSell ne peut rien faire sur ton compte Vinted, " +
    "et rien n'a été touché. Ouvre l'appli Vinted : elle te dit ce que Vinted attend de toi. Tes autres plateformes ne sont pas concernées.";
}

// ── LE RETRAIT SOUS LE MUR : REPRISE ESPACÉE, JAMAIS ARRÊTÉE (04/10) ───────
export const DELAIS_RETRAIT_COMPTE_BLOQUE_MIN = [60, 180, 360];

/** Délai (minutes) avant le n-ième nouvel essai (n ≥ 1). */
export function delaiRetraitCompteBloque(n) {
  const i = Math.max(0, Math.min(DELAIS_RETRAIT_COMPTE_BLOQUE_MIN.length - 1, (Number(n) || 1) - 1));
  return DELAIS_RETRAIT_COMPTE_BLOQUE_MIN[i];
}

/** Heure de Paris « 14 h 05 » d'un instant ISO, pour le message. */
function heureParis(iso) {
  try {
    return new Date(iso).toLocaleTimeString("fr-FR", { timeZone: "Europe/Paris", hour: "2-digit", minute: "2-digit" }).replace(":", " h ");
  } catch {
    return null;
  }
}

export function messageRetraitCompteBloque(titre, prochainIso) {
  const quoi = titre ? ` « ${String(titre).slice(0, 80)} »` : "";
  const h = prochainIso ? heureParis(prochainIso) : null;
  return `Vinted affiche « compte bloqué » sur ton ordinateur : l'annonce${quoi} n'a PAS encore été retirée. ` +
    "Tant que Vinted affiche cette page, rien ne peut être fait sur ton compte Vinted ; FillSell réessaie tout seul" +
    (h ? ` (prochain essai vers ${h})` : "") + " et la retirera dès que Vinted te rend l'accès. " +
    "Si elle est encore visible dans l'appli Vinted, retire-la toi-même pour éviter une double vente ; l'appli te dit aussi ce que Vinted attend de toi.";
}

const CLES_ATTENTE_A_VIDER = [
  "needs_user_source", "needsUserAttempts", "needsUserBoucle", "needsUserResolved", "needs_user_vu_le", "needs_user_vu_erreur",
  "needs_user_tick_le", "needs_user_actif_ms", "needs_user_sans_motif", "processing_since", "next_action_after",
];

/**
 * Le retrait (action 'delete') qui a fini sur /main/banned : reprise espacée.
 * Rend { status: 'pending', error, platform_fields } — pf est une COPIE.
 * @param {{title?: string|null, error?: string|null, platform_fields?: object|null}} job
 * @param {string} quand ISO
 * @param {string} posePar
 * @param {string|null} verdictExtension texte brut du content script, s'il y en a un
 */
export function retraitCompteBloqueEnReprise(job, quand, posePar, verdictExtension = null) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? { ...job.platform_fields } : {};
  const avant = pf.compte_vinted_bloque && typeof pf.compte_vinted_bloque === "object" ? pf.compte_vinted_bloque : {};
  const n = (Number(avant.essais) || 0) + 1;
  const base = Number.isFinite(Date.parse(quand)) ? Date.parse(quand) : Date.now();
  const prochain = new Date(base + delaiRetraitCompteBloque(n) * 60_000).toISOString();
  pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job?.error, "needs_user", `${posePar} (compte Vinted bloqué, retrait en reprise)`);
  for (const k of CLES_ATTENTE_A_VIDER) delete pf[k];
  pf.compte_vinted_bloque = {
    ...avant, le: quand, pose_par: posePar, essais: n, depuis: avant.depuis ?? avant.le ?? quand,
    ...(verdictExtension ? { verdict_extension: String(verdictExtension).slice(0, 300) } : {}),
  };
  pf.next_action_after = prochain;
  return { status: "pending", error: messageRetraitCompteBloque(job?.title ?? null, prochain), platform_fields: pf };
}

/** Un retrait arrêté sur un raté de NOTRE onglet : reprise dans 10 min, message vrai. */
export function retraitTechniqueEnReprise(job, quand, posePar) {
  const pf = job?.platform_fields && typeof job.platform_fields === "object" ? { ...job.platform_fields } : {};
  pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job?.error, "needs_user", `${posePar} (raté de notre onglet, retrait en reprise)`);
  for (const k of CLES_ATTENTE_A_VIDER) delete pf[k];
  delete pf.compte_vinted_bloque;
  const base = Number.isFinite(Date.parse(quand)) ? Date.parse(quand) : Date.now();
  pf.next_action_after = new Date(base + 10 * 60_000).toISOString();
  const quoi = job?.title ? ` « ${String(job.title).slice(0, 80)} »` : "";
  return {
    status: "pending",
    error: `Le retrait de l'annonce${quoi} n'est pas encore fait : notre onglet de travail n'a pas pu ouvrir la page de l'annonce. ` +
      "Rien n'a été touché ; FillSell réessaie tout seul jusqu'à ce que le retrait soit fait. " +
      "Tant que ce n'est pas fait, l'annonce reste en vente : retire-la toi-même depuis l'appli Vinted si tu veux être sûr d'éviter une double vente.",
    platform_fields: pf,
  };
}

/**
 * Requalification d'un job ARRÊTÉ (needs_user ou failed) dont l'essai a fini
 * sur /main/banned : le vrai motif, le vrai geste. Pure.
 * Appelée par get-pending-jobs (au poll du compte) ET par handler-watch (tout
 * le parc, poste muet compris). Rend null si rien à changer (autre plateforme,
 * autre page, motif déjà posé), sinon { status, error, platform_fields }.
 * (04/10) Un RETRAIT n'est jamais laissé arrêté : il repart en reprise
 * espacée (retraitCompteBloqueEnReprise), même s'il portait déjà ce motif.
 * @param {{platform?: string, action?: string, title?: string|null, error?: string|null, platform_fields?: object|null}} job
 * @param {string} quand — horodatage ISO de la requalification
 * @param {string} posePar — qui requalifie (trace)
 */
export function requalificationCompteVintedBloque(job, quand, posePar) {
  if (!job || job.platform !== "vinted") return null;
  const pf = job.platform_fields && typeof job.platform_fields === "object" ? { ...job.platform_fields } : {};
  if (job.action === "delete") {
    if (pageCompteVintedBloque(pf)) return retraitCompteBloqueEnReprise(job, quand, posePar);
    // Étiqueté « compte bloqué » par l'ancienne lecture (page du DÉBUT de
    // l'essai, onglet partagé) alors que l'essai n'a pas fini sur le mur :
    // c'est un raté de notre onglet — reprise, message neutre.
    if (pf.needs_user_source === SOURCE_COMPTE_VINTED_BLOQUE) return retraitTechniqueEnReprise(job, quand, posePar);
    return null;
  }
  if (!pageCompteVintedBloque(pf)) return null;
  if (pf.needs_user_source === SOURCE_COMPTE_VINTED_BLOQUE) return null;
  pf.needs_user_source = SOURCE_COMPTE_VINTED_BLOQUE;
  pf.compte_vinted_bloque = { le: quand, pose_par: posePar };
  pf.erreurs_archivees = archiverErreur(pf.erreurs_archivees, job.error, "needs_user", `${posePar} (compte Vinted bloqué)`);
  return { status: "needs_user", error: messageCompteVintedBloque(job.action ?? "publish", job.title ?? null), platform_fields: pf };
}
