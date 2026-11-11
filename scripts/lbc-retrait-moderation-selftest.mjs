// ═══════════════════════════════════════════════════════════════════════════
// Selftest « retrait Leboncoin : 410 dans la fenêtre de modération = attente » (06/11, Nico, point 11)
//   node scripts/lbc-retrait-moderation-selftest.mjs
//
// LE CAS : Cédric GRIZSTYLE, retrait 1b7be2d6 de l'annonce Leboncoin 3303036848, armé à 22:31 (heure de Paris, vente Vinted) quatre
// minutes après la republication de l'annonce (22:27). Leboncoin répond 410 « Cette annonce est désactivée » à 22:48 et
// 23:04 ; l'extension rend « inconnu » (moderation_recente, < 2 h après le dépôt) et CHAQUE lecture comptait un essai :
// 3/5 à 23:04, et les 5 essais (5/15/30/60 min) tombaient tous dans la fenêtre de 2 h → rouge « retire-la à la main ».
// LA RÈGLE : un 410/404 dans la fenêtre = attente (compteur intact, relecture 15 min) ; hors fenêtre, le 410 clôt le
// retrait sans message (inchangé, extension) ; une annonce revenue en ligne est retirée (inchangé).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  lecture410Moderation, attenteModerationLbc, LBC_MODERATION_REESSAI_MIN, LBC_MODERATION_ATTENTE_MAX_MS,
} from "../supabase/functions/_shared/lbc-retrait-moderation.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

const RETRAIT = { action: "delete", platform: "leboncoin" };
const t0 = Date.parse("2026-11-05T22:04:31.700Z");
const lecture = (http = 410, raison = "moderation_recente") => ({ etat: "unknown", http, raison, lu_le: "2026-11-05T22:04:31.627Z" });
const corps = (l = lecture(), extra = {}) => ({
  arme_par: { chemin: "vente_article_serveur" }, needsUserAttempts: 3, next_action_after: "2026-11-05T22:34:31.709Z",
  needs_user_source: "relancer", pas_de_rouge: { x: 1 }, lecture_etat_retrait: l, ...extra,
});

console.log("1. Le cas de Compte-essai-16 (2e lecture 410 à 23:04 Paris, compteur 2 en base, l'extension envoie 3/5)");
const a = attenteModerationLbc({ job: RETRAIT, pfBase: { needsUserAttempts: 2 }, pfCorps: corps(), maintenant: t0 });
ok("attente posée", !!a, JSON.stringify(a));
ok("aucun essai consommé : le compteur reste celui de la base (2), pas 3", a?.pf.needsUserAttempts === 2, String(a?.pf.needsUserAttempts));
ok(`relecture dans ${LBC_MODERATION_REESSAI_MIN} min`, a?.pf.next_action_after === new Date(t0 + LBC_MODERATION_REESSAI_MIN * 60_000).toISOString(), a?.pf.next_action_after);
ok("trace : depuis, lectures 1, http 410, lu_le", a?.pf.retrait_attente_moderation_lbc?.lectures === 1 && a.pf.retrait_attente_moderation_lbc.http === 410
  && a.pf.retrait_attente_moderation_lbc.depuis === new Date(t0).toISOString() && a.pf.retrait_attente_moderation_lbc.lu_le === "2026-11-05T22:04:31.627Z");
ok("ni question, ni rouge : needs_user_source et pas_de_rouge retirés", !("needs_user_source" in (a?.pf ?? {})) && !("pas_de_rouge" in (a?.pf ?? {})));
ok("les champs de l'essai gardés (lecture, armement)", a?.pf.lecture_etat_retrait?.http === 410 && a?.pf.arme_par?.chemin === "vente_article_serveur");
ok("message : rien à faire, aucun « tentative n/5 », aucun « à la main »", /Rien à faire\.$/.test(a?.message ?? "") && !/tentative|à la main/i.test(a?.message ?? ""), a?.message);
ok("raison du journal : aucune tentative consommée", /aucune tentative consommée/.test(a?.raison ?? ""));

console.log("2. Lectures suivantes dans la fenêtre");
const b = attenteModerationLbc({ job: RETRAIT, pfBase: a.pf, pfCorps: corps(lecture(404)), maintenant: t0 + 15 * 60_000 });
ok("2e lecture (404) : depuis gardé, lectures 2, compteur toujours 2", b?.pf.retrait_attente_moderation_lbc?.depuis === a.pf.retrait_attente_moderation_lbc.depuis
  && b.pf.retrait_attente_moderation_lbc.lectures === 2 && b.pf.needsUserAttempts === 2, JSON.stringify(b?.pf.retrait_attente_moderation_lbc));
const tard = attenteModerationLbc({ job: RETRAIT, pfBase: a.pf, pfCorps: corps(), maintenant: t0 + LBC_MODERATION_ATTENTE_MAX_MS + 60_000 });
ok("bornée : au-delà de 6 h d'attente, le chemin ordinaire reprend (null)", tard === null);

console.log("3. Ce que la règle ne touche pas");
ok("lecture sans « moderation_recente » (anti-robot 403) : chemin ordinaire", attenteModerationLbc({ job: RETRAIT, pfBase: {}, pfCorps: corps(lecture(403, "bot_shield_datadome")) }) === null);
ok("« inconnu » sans 410/404 (http 200, page non reconnue) : chemin ordinaire", attenteModerationLbc({ job: RETRAIT, pfBase: {}, pfCorps: corps(lecture(200)) }) === null);
ok("aucune lecture sur l'essai : chemin ordinaire", attenteModerationLbc({ job: RETRAIT, pfBase: {}, pfCorps: { needsUserAttempts: 1 } }) === null);
ok("Beebs : jamais (sa règle de vérification est la sienne)", attenteModerationLbc({ job: { action: "delete", platform: "beebs" }, pfBase: {}, pfCorps: corps() }) === null);
ok("une republication : jamais (seul le retrait)", attenteModerationLbc({ job: { action: "republish", platform: "leboncoin" }, pfBase: {}, pfCorps: corps() }) === null);
ok("lecture410Moderation : 410 et 404 seulement", !!lecture410Moderation(corps()) && !!lecture410Moderation(corps(lecture(404))) && !lecture410Moderation(corps(lecture(500))));

console.log("4. Branchements (update-job-status) et règle « 410 = hors ligne » inchangée (extension)");
const ujs = readFileSync(join(ROOT, "supabase/functions/update-job-status/index.ts"), "utf8");
ok("update-job-status importe la règle", /import \{ lecture410Moderation, attenteModerationLbc \} from "\.\.\/_shared\/lbc-retrait-moderation\.js";/.test(ujs));
ok("le bloc accepte pending, failed et needs_user (un 5/5 dans la fenêtre redevient une attente)",
  /statutEffectif === "pending" \|\| statutEffectif === "failed" \|\| statutEffectif === "needs_user"\)\s*\n\s*&& body\.platform_fields && typeof body\.platform_fields === "object" && lecture410Moderation\(body\.platform_fields\)\)/.test(ujs));
ok("le bloc écrit l'attente par pfRetraitVerif (champs posés tels quels sur le job)", /pfRetraitVerif = attenteM\.pf;\s*\n\s*statutEffectif = "pending";\s*\n\s*messageEffectif = attenteM\.message;/.test(ujs));
const bg = readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8");
ok("extension : un 410/404 dans les 2 h d'un dépôt FillSell reste « inconnu » (moderation_recente) — le garde-fou",
  /if \(enModeration\) \{[\s\S]{0,300}raison: "moderation_recente", http: res\.http \};/.test(bg) && /const LBC_MODERATION_MS = 2 \* 3600_000;/.test(bg));
ok("extension : hors fenêtre, un 410/404 est « hors ligne » et clôt le retrait sans message (cloreRetraitDejaAbsent)",
  /if \(\(state === "unavailable" \|\| state === "sold"\) && job\.platform !== "beebs"\) \{[\s\S]{0,700}return cloreRetraitDejaAbsent\(accessToken, job, lecture, result, "lecture_apres_echec"\);/.test(bg));

console.log(ko ? `\n${ko} KO` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
