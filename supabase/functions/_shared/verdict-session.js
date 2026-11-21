// ═══════════════════════════════════════════════════════════════════════════
// « CONNECTE-TOI » SEULEMENT SI LA PLATEFORME LE DIT, SUR LE MOMENT (21/11/2026 après-midi, décision de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// La règle posée le 21/11 midi pour le Cloud (serveur-cloud/src/lectureSession.js) vaut pour le message d'une TÂCHE.
// L'extension 0.6.197+ lit le COMPTE sur la plateforme avant d'écrire « En attente de ta connexion à … » et joint son
// verdict à la tâche : platform_fields.verdict_session = { verdict: "bonne" | "absente" | "inconnue", par, le }.
//   · « bonne »    : preuve de session bonne (update-job-status : refus passager, SANS borne — les essais s'espacent) ;
//   · « absente »  : la plateforme a dit la session perdue → l'attente de session (« connecte-toi »), comme avant ;
//   · « inconnue » : rien n'est conclu → nouvel essai espacé, JAMAIS « connecte-toi », jamais « déconnecté » écrit.
// Un verdict de plus de 15 min ne compte plus (celui d'un passage d'avant). Pur (Deno + Node) : testé par
// scripts/session-prouvee-selftest.mjs (§ F).
export const FRAICHEUR_VERDICT_SESSION_MS = 15 * 60_000;
export const VERDICTS_SESSION = Object.freeze(["bonne", "absente", "inconnue"]);

/** Le verdict de session joint par l'extension, s'il est lisible et frais (pur) ; sinon null. */
export function verdictSessionFrais(pf, maintenant = Date.now()) {
  const v = pf && typeof pf === "object" ? pf.verdict_session : null;
  if (!v || typeof v !== "object" || !VERDICTS_SESSION.includes(String(v.verdict))) return null;
  const t = Date.parse(String(v.le ?? ""));
  if (!Number.isFinite(t) || maintenant - t > FRAICHEUR_VERDICT_SESSION_MS || t - maintenant > 5 * 60_000) return null;
  return { verdict: String(v.verdict), par: v.par == null ? null : String(v.par), le: new Date(t).toISOString() };
}

/** Le délai du n-ième refus passager (n à partir de 0) d'une session prouvée bonne : 3, 6, 10 min, puis 1 h, 3 h, 6 h. */
export function delaiRefusPassagerMin(n) {
  const k = Math.max(0, Math.floor(Number(n) || 0));
  return [3, 6, 10][k] ?? (k < 6 ? 60 : k < 9 ? 180 : 360);
}

/** Le délai du n-ième passage sans verdict (n à partir de 1) : 10, 30 min, puis 1 h, 3 h, 6 h. */
export function delaiSessionNonVerifieeMin(n) {
  const k = Math.max(1, Math.floor(Number(n) || 1));
  return [10, 30][k - 1] ?? (k < 6 ? 60 : k < 9 ? 180 : 360);
}

/** Le message d'une tâche dont la session n'a pu être ni prouvée bonne ni prouvée perdue (pur) — jamais « connecte-toi ». */
export function texteSessionNonVerifiee(label) {
  return `${label} n'a pas laissé FillSell vérifier ta connexion à l'instant : rien à faire de ton côté, nouvel essai automatique.`;
}
