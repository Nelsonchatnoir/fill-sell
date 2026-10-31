// ═══════════════════════════════════════════════════════════════════════════
// LA FILE EN PAUSE, LA SYNCHRO QUI PASSE DEVANT (22/10 soir, points 5 et 6 — Louis, validés par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Lu par get-pending-jobs (Deno), l'app (Vite) et les selftests (Node) : une seule définition.
//
// LA PAUSE (point 6) — profiles.platform_settings.file_pause.active, posé par la RPC file_pause_basculer.
//   · Rien de ce qui n'a pas commencé ne part : publications et republications restent en file, dans leur ordre.
//   · ⛔ JAMAIS EN PAUSE : un retrait (celui d'une vente — risque de double vente — comme celui que la personne a
//     demandé), et une republication dont le retrait de l'ancienne annonce est engagé : elle va jusqu'à la remise
//     en ligne, puis la file s'arrête.
// LA SYNCHRO DEMANDÉE (point 5) — un geste de la personne (« Synchroniser », bouton, app) passe devant la file de
//   publications : le serveur ne sert, sur le poll qui l'emporte, que ce qui ne peut pas attendre (retraits,
//   republications dont l'annonce est déjà retirée). Une demande de plus de 10 min ne retient plus rien (jamais une
//   file gelée par une demande que personne ne prend — leçon du 11/10, hu.anastasia).
import { retraitEngage } from "./retenue-creneau.js";

/** La file est-elle en pause ? (platform_settings brut du profil) */
export function estFileEnPause(platformSettings) {
  const v = platformSettings && typeof platformSettings === "object" ? platformSettings.file_pause : null;
  return Boolean(v && typeof v === "object" && (v.active === true || String(v.active).toLowerCase() === "true"));
}

/** Une republication dont le retrait est engagé (annonce retirée ou retrait envoyé) : elle ne s'arrête jamais. */
export function republicationEngagee(job) {
  return String(job?.action ?? "") === "republish" && retraitEngage(job);
}

/** Ce job attend-il la reprise ? (publication ou republication pas encore commencée) */
export function jobRetenuParPause(job) {
  const action = String(job?.action ?? "publish");
  if (action !== "publish" && action !== "republish") return false;   // un retrait n'est JAMAIS en pause
  if (String(job?.status ?? "pending") === "processing") return false; // une tâche commencée va au bout
  return !republicationEngagee(job);
}

/** Le déclencheur d'un relevé demandé PAR LA PERSONNE (pas la veille, pas le serveur). */
export function syncDemandeeParLaPersonne(declencheur) {
  return /^(bouton|bouton_distant|app)(:redemande)?$/.test(String(declencheur ?? ""));
}

/** Une demande de synchro de la personne passe devant la file pendant 10 min au plus. */
export const SYNC_DEVANT_FILE_MS = 10 * 60_000;

/** Ce job peut-il partir AVANT une synchro demandée ? (retraits, republications déjà retirées) */
export function passeAvantLaSynchro(job) {
  const action = String(job?.action ?? "publish");
  if (action !== "publish" && action !== "republish") return true;
  return republicationEngagee(job);
}

/** La phrase de la pause, pour l'app et le popup. */
// (31/10, lot F — Johan) UNE seule vérité : « En pause à ta demande », partout (ligne du job, compteurs, écrans, popup).
export function messageFileEnPause(n, lang = "fr") {
  if (lang === "en") return n > 0 ? `Paused at your request: ${n} listing${n > 1 ? "s" : ""} waiting for you to resume. Removals after a sale keep going.` : "Paused at your request. Removals after a sale keep going.";
  return n > 0 ? `En pause à ta demande : ${n} publication${n > 1 ? "s" : ""} attend${n > 1 ? "ent" : ""} ta reprise. Les retraits après une vente continuent.` : "En pause à ta demande. Les retraits après une vente continuent.";
}

/** (31/10, lot F) Le texte que le SERVEUR écrit sur une republication retenue par la pause (jamais « En file »). */
export const MESSAGE_REPUBLICATION_EN_PAUSE =
  "En pause à ta demande : ta republication repartira quand tu reprendras ta file. Ton annonce est toujours en ligne.";
