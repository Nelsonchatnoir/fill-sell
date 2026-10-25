// ═══════════════════════════════════════════════════════════════════════════
// UNE ATTENTE CLOSE NE LAISSE AUCUN MARQUEUR (25/10, Thibault — republication Vinted 44d125ac)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qui s'est passé : republication « Short » mise en pause le 24/10 à 12:17 (capture de plus de 24 h, recapture
// en échec) — needs_user, motif « relancer » posé par défaut, brut dans error_technique. 35 s plus tard, le réveil
// par capture de handler-watch la remet en file sans retirer les marqueurs ; le 25/10 à 11:03 elle aboutit
// (« published », ancienne annonce supprimée, nouvelle annonce 10522043426 en ligne) — et la tâche finie porte
// encore needs_user_source, needs_user_sans_motif, error_technique et les compteurs : un état contradictoire.
// Mesuré sur 7 jours : 342 tâches « published » avec au moins un de ces marqueurs, 0 écrit après la publication.
// LA RÈGLE FAUTIVE : chaque écrivain (update-job-status, handler-watch, get-pending-jobs, l'extension, le SQL)
// avait SA liste partielle de clés à retirer, et le chemin le plus fréquent (update-job-status → published) n'en
// avait aucune.
// LA RÈGLE : UNE liste, ici. Dès qu'une attente est close — entrée en published / deleted / sold, ou remise en file
// par un réveil qui lève la cause — ses marqueurs tombent, et rien n'est perdu : le brut technique
// (error_technique) et le message montré pendant l'attente (needs_user_vu_erreur) partent dans erreurs_archivees
// s'ils n'y sont pas déjà. La mémoire anti-boucle (needsUserResolved, needsUserBoucle) et le compteur d'essais
// (needsUserAttempts) restent : ce sont des traces, pas une attente.
// ⛔ processing_since n'est PAS retiré d'une tâche finie : il y est LU — get-pending-jobs (dernier retrait Vinted
//    réussi, juge de la pause anti-robot), l'app (horloge du poste en retard, frise d'une republication).
// ES module, un seul import (même famille, sans réseau) : Deno, Node (selftests) et l'app.

import { archiverErreur, TEXTE_MAX } from "./erreurs-archivees.js";

/** Les clés d'une attente : elles tombent quand l'attente est close. */
export const CLES_ATTENTE_CLOSE = Object.freeze([
  "needs_user_source", "needs_user_sans_motif", "needsUserField", "needsUserFields", "champs_a_completer",
  "needs_user_tick_le", "needs_user_actif_ms", "needs_user_vu_le", "needs_user_vu_erreur",
  "next_action_after",
]);

/** Les statuts finis « réussis » : plus personne n'attend rien. */
export const STATUTS_FINIS_REUSSIS = Object.freeze(["published", "deleted", "sold"]);

const objet = (v) => (v && typeof v === "object" && !Array.isArray(v) ? v : null);
const texte = (v) => String(v ?? "").trim();

/** Le texte est-il déjà dans l'archive (n'importe quelle entrée, à la troncature près) ? */
function dejaArchive(liste, t) {
  const cle = t.slice(0, TEXTE_MAX);
  return (Array.isArray(liste) ? liste : []).some((e) => e && typeof e === "object" && String(e.erreur ?? "") === cle);
}

/** Ajoute un texte à l'archive s'il n'y est pas, avec la date d'origine (`du`) quand elle est connue. */
function archiverSiAbsent(liste, t, statut, par, du) {
  if (!t || dejaArchive(liste, t)) return liste;
  const apres = archiverErreur(liste, t, statut, par);
  if (apres === liste || !apres.length) return liste;
  const derniere = apres[apres.length - 1];
  if (du && derniere && typeof derniere === "object") apres[apres.length - 1] = { ...derniere, du: String(du) };
  return apres;
}

/**
 * Les platform_fields d'une tâche dont l'attente est close.
 * @param {unknown} pf  platform_fields à écrire (jamais modifié en place)
 * @param {{ par?: string }} [opts]  qui ferme (« update-job-status → published », « handler-watch (réveil par capture) »…)
 * @returns {{ pf: Record<string, unknown>, change: boolean, retirees: string[] }}
 *   change = false → rien à écrire (même contenu) : l'appelant ne réécrit pas une ligne inchangée.
 */
export function champsAttenteClose(pf, { par = "" } = {}) {
  const src = objet(pf) ?? {};
  const out = { ...src };
  const retirees = [];
  const avant = Array.isArray(src.erreurs_archivees) ? src.erreurs_archivees : null;
  let archive = avant ?? [];
  const qui = String(par || "attente close").slice(0, 60);
  // Le brut technique : archivé (jamais perdu), puis retiré — un brut périmé ne doit plus orienter un épisode suivant.
  if ("error_technique" in src) {
    const et = src.error_technique;
    const brut = texte(objet(et) ? et.brut : et);
    archive = archiverSiAbsent(archive, brut, null, `${qui} (error_technique)`, objet(et)?.at ?? null);
    delete out.error_technique;
    retirees.push("error_technique");
  }
  // Le message montré pendant l'attente : archivé s'il n'y est pas déjà (un réveil d'avant le 25/10 le jetait).
  const vu = texte(src.needs_user_vu_erreur);
  if (vu) archive = archiverSiAbsent(archive, vu, "needs_user", `${qui} (message de l'attente)`, src.needs_user_vu_le ?? null);
  for (const k of CLES_ATTENTE_CLOSE) {
    if (k in out) { delete out[k]; retirees.push(k); }
  }
  const archiveChange = avant ? archive !== avant : archive.length > 0;
  if (archiveChange) out.erreurs_archivees = archive;
  return { pf: out, change: retirees.length > 0 || archiveChange, retirees };
}

/**
 * (25/10, Thibault 44d125ac) Le DÉBUT de l'attente en cours, daté par ses propres marqueurs : première observation
 * par handler-watch (needs_user_vu_le, remise à zéro à chaque nouvel épisode), motif posé par défaut
 * (needs_user_sans_motif.le), brut technique (error_technique.at) — le plus récent des trois. Aucun → `repli`
 * (la création de la tâche, la règle d'avant). Le réveil par capture comparait la capture à created_at : la
 * capture même que l'extension venait de juger trop vieille défaisait la pause 35 s après sa pose.
 * @param {unknown} pf
 * @param {string|null} [repli]
 * @returns {string|null}
 */
export function debutAttente(pf, repli = null) {
  const p = objet(pf) ?? {};
  const t = [p.needs_user_vu_le, objet(p.needs_user_sans_motif)?.le, objet(p.error_technique)?.at]
    .map((v) => Date.parse(String(v ?? ""))).filter(Number.isFinite);
  return t.length ? new Date(Math.max(...t)).toISOString() : repli;
}

/** Une tâche finie porte-t-elle encore un marqueur d'attente ? (selftests, réparations, sondes) */
export function porteMarqueursAttente(pf) {
  const p = objet(pf);
  if (!p) return false;
  return "error_technique" in p || CLES_ATTENTE_CLOSE.some((k) => k in p);
}
