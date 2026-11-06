// ═══════════════════════════════════════════════════════════════════════════
// Selftest « une tâche retenue par une déconnexion porte le message » (06/11, Nico, point 10 — Guillaume JEHLY)
//   node scripts/attente-session-serveur-selftest.mjs
//
// LE CAS : 122 republications Leboncoin de Guillaume JEHLY (Business) à l'arrêt depuis le 05/11 08:33, Leboncoin
// déconnecté sur son poste (extension_sessions.leboncoin = false, observée le 05/11 07:15). get-pending-jobs les retenait
// (« session plateforme connue morte ») sans rien écrire : aucune tâche ne disait pourquoi, et l'alerte de compte de
// l'app s'efface dès que la sonde a plus de 3 h. LA RÈGLE : la tâche retenue reçoit le message et le marqueur de
// l'attente de session (ancre « En attente de ta connexion à », attente_session) — une fois.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { attenteSessionServeur, attenteSessionEncoreEspacee, attentePoseeParLeServeur, ATTENTE_SESSION_RE } from "../supabase/functions/_shared/attente-session.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const job = (o = {}) => ({ platform: "leboncoin", action: "republish", status: "pending", error: null,
  platform_fields: { republish_source: "manuel", source: "releve" }, ...o });

console.log("1. Une republication Leboncoin retenue, sans message (Guillaume)");
const a = attenteSessionServeur(job(), { observeeLe: "2026-11-05T06:15:08.922Z", navigateur: "Chrome", maintenantIso: "2026-11-06T11:20:00.000Z" });
ok("le message porte l'ancre lue partout (app, handler-watch, get-pending-jobs)", ATTENTE_SESSION_RE.test(a?.error ?? ""), a?.error);
ok("il dit le geste : se connecter à Leboncoin, et que ça repart seul", /Connecte-toi à Leboncoin/.test(a.error) && /repartira toute seule/.test(a.error) && /dans Chrome/.test(a.error));
ok("marqueur attente_session : plateforme, depuis = l'observation, posé par le serveur", a.platform_fields.attente_session?.platform === "leboncoin"
  && a.platform_fields.attente_session.depuis === "2026-11-05T06:15:08.922Z" && /get-pending-jobs/.test(a.platform_fields.attente_session.pose_par));
ok("les autres champs de la tâche gardés", a.platform_fields.republish_source === "manuel" && a.platform_fields.source === "releve");
ok("aucune échéance posée (la retenue du serveur suffit ; rien de servi en retard)", !("next_action_after" in a.platform_fields));

console.log("2. Une fois seulement");
ok("déjà marquée (ancre + marqueur) : rien à écrire", attenteSessionServeur({ ...job(), error: a.error, platform_fields: a.platform_fields }) === null);
ok("marquée par l'extension (son propre texte) : rien à écrire", attenteSessionServeur(job({ error: "En attente de ta connexion à Leboncoin dans Chrome : la republication repartira toute seule dès que tu seras reconnecté(e). Aucune tentative consommée.",
  platform_fields: { attente_session: { platform: "leboncoin", derniere: "2026-11-06T10:00:00Z", observations: 2 } } })) === null);
const autre = attenteSessionServeur(job({ error: "Un autre message", platform_fields: {} }));
ok("un autre message sans marqueur : remplacé par la cause vraie", ATTENTE_SESSION_RE.test(autre?.error ?? ""));

console.log("3. Retrait, publication, autre plateforme, navigateur inconnu");
const r = attenteSessionServeur(job({ action: "delete" }), { navigateur: "Edge" });
ok("un retrait dit le risque de double vente", /risque de double vente/.test(r.error) && /dans Edge/.test(r.error));
ok("une publication : « la publication repartira toute seule »", /la publication repartira toute seule/.test(attenteSessionServeur(job({ action: "publish" })).error));
ok("Beebs nommé « Beebs »", /connexion à Beebs/.test(attenteSessionServeur(job({ platform: "beebs" })).error));
ok("navigateur inconnu : « ton navigateur »", /dans ton navigateur/.test(attenteSessionServeur(job()).error));

console.log("4. La levée existante s'applique (reconnexion vue après la pose)");
const pose = { ...job(), error: a.error, platform_fields: a.platform_fields };
ok("session revue connectée APRÈS : plus d'attente espacée (servie aussitôt)",
  attenteSessionEncoreEspacee(pose, { leboncoin: true, checked_at_par_plateforme: { leboncoin: "2026-11-06T11:30:00Z" } }, Date.parse("2026-11-06T11:31:00Z")) === false);

console.log("5. Branchement (get-pending-jobs)");
const gpj = readFileSync(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
ok("la retenue « session connue morte » pose le message, 50 par passage, compare-and-swap sur pending",
  /const att = attenteSessionServeur\(j as never, \{/.test(gpj) && /if \(marquees >= 50\) break;/.test(gpj)
  && /\.update\(\{ error: att\.error, platform_fields: pfAPersister\(att\.platform_fields\) \}\)\s*\n\s*\.eq\("id", String\(j\.id\)\)\.eq\("status", "pending"\)/.test(gpj));

console.log("6. Le message se lève à la reconnexion, même sans échéance (handler-watch)");
ok("l'attente posée par le serveur est reconnue ; celle de l'extension et une tâche sans marqueur ne le sont pas",
  attentePoseeParLeServeur(a.platform_fields) && !attentePoseeParLeServeur({ attente_session: { pose_par: "extension" } }) && !attentePoseeParLeServeur(null));
const hw = readFileSync(join(ROOT, "supabase/functions/handler-watch/index.ts"), "utf8");
ok("handler-watch : la levée des attentes de session prend aussi celle du serveur (avant le test d'échéance)",
  /if \(attentePoseeParLeServeur\(pf\)\) return true;\s*\n\s*\/\/ Sans échéance en cours[^\n]*\n\s*return Number\.isFinite\(echeance\) && echeance > Date\.now\(\);/.test(hw));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
