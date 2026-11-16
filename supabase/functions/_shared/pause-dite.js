// ═══════════════════════════════════════════════════════════════════════════
// LA FILE EN PAUSE SE DIT SUR CHAQUE TÂCHE RETENUE (16/11/2026, point 5 du lot de Nico) — pur, Deno + Node
// ═══════════════════════════════════════════════════════════════════════════
// Constat (contact.grizstyle, Pro) : 88 tâches en attente depuis le 06/11 SANS AUCUN MESSAGE. Cause : sa file est EN PAUSE
// à sa demande depuis le 05/11 22:25 (platform_settings.file_pause). get-pending-jobs les retenait toutes, mais n'écrivait
// « En pause à ta demande » que sur une REPUBLICATION dont le texte était exactement « En file : … » — ses tâches (texte
// vide) et TOUTES les publications ne recevaient rien. Parc le 16/11 : 4 comptes en pause, 158 tâches retenues, 120 sans
// aucun texte. (Les publications neuves n'attendaient PAS un créneau de republication : seule la pause les retenait.)
// La règle : toute tâche retenue par la pause (jobRetenuParPause, _shared/file-pause.js — inchangé, recopié à l'octet dans
// l'extension) porte le texte de la pause, s'il ne dit rien ou ne dit qu'une ATTENTE (« En file », le créneau, le créneau
// d'un lot) ; un texte qui explique autre chose (un refus, une question, une connexion) est gardé. À la reprise, le texte
// de la pause redevient « En file » (republication) ou rien (publication). Verrou : scripts/file-pause-dite-selftest.mjs.
import { MESSAGE_REPUBLICATION_EN_PAUSE } from "./file-pause.js";
import { MESSAGE_EN_FILE } from "./retenue-hors-ligne.js";

export const MESSAGE_PUBLICATION_EN_PAUSE =
  "En pause à ta demande : ta publication partira quand tu reprendras ta file (bouton « Reprendre » du Stock). Rien n'a été envoyé.";

/** Un texte qui ne dit qu'une attente (remplaçable par la pause). */
export function texteDAttente(texte) {
  const t = String(texte ?? "").trim();
  if (!t) return true;
  if (t === MESSAGE_EN_FILE) return true;
  if (/^Republication automatique [^:]*en attente de ton créneau/.test(t)) return true;
  if (/^Republication de ton lot \(plus de 10 articles\) en attente de ton créneau/.test(t)) return true;
  return false;
}

/** Le texte à écrire sur une tâche retenue par la pause, ou null (rien à écrire). */
export function texteSousPause(job) {
  const action = String(job?.action ?? "publish");
  const voulu = action === "republish" ? MESSAGE_REPUBLICATION_EN_PAUSE : action === "publish" ? MESSAGE_PUBLICATION_EN_PAUSE : null;
  if (!voulu) return null;
  const actuel = String(job?.error ?? "").trim();
  if (actuel === voulu) return null;
  return texteDAttente(actuel) ? voulu : null;
}

/** Après la reprise : le texte de la pause redevient celui d'une tâche en file. `undefined` = rien à écrire. */
export function texteApresReprise(job) {
  const t = String(job?.error ?? "").trim();
  if (t === MESSAGE_REPUBLICATION_EN_PAUSE) return MESSAGE_EN_FILE;
  if (t === MESSAGE_PUBLICATION_EN_PAUSE) return null;
  return undefined;
}

export const TEXTES_DE_PAUSE = Object.freeze([MESSAGE_REPUBLICATION_EN_PAUSE, MESSAGE_PUBLICATION_EN_PAUSE]);
