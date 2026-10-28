// ═══════════════════════════════════════════════════════════════════════════
// « HORS LIGNE SANS RECRÉATION » : JAMAIS QUAND L'ENVOI EST PARTI ET N'A PAS ÉTÉ DÉMENTI (26/10 nuit, point 2b)
// `npm run selftest:alerte-orpheline` — exécute _shared/alerte-orpheline.js sur les cas réels du 25/10, puis vérifie le
// branchement dans handler-watch (mail au support) et la phrase « Reprise après interruption » (interruption-poste.js).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const A = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/alerte-orpheline.js")).href);
const I = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/interruption-poste.js")).href);
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };
const t = (iso) => Date.parse(iso);

console.log("1. nerema75, 259e97c8 (Vinted, une-passe) : retrait ET envoi à 19:44 — l'alerte de 20:15 était fausse");
const nerema = {
  republish_step: "deleted", deleted_at: "2026-10-25T18:44:14.000Z", deleted_at_client: "2026-10-25T18:44:13.118Z", deleted_at_serveur: "2026-10-25T18:44:14.000Z",
  recreation_tentee: { n: 1, at: "2026-10-25T18:44:14.000Z", via: "une_passe" }, recreation_envois: ["2026-10-25T18:44:14.000Z"],
};
ok(A.alerteOrphelineDue(nerema, t("2026-10-25T19:15:04Z")).due === false, "20:15 : envoi parti, jamais démenti → pas d'alerte", JSON.stringify(A.alerteOrphelineDue(nerema, t("2026-10-25T19:15:04Z"))));
ok(A.alerteOrphelineDue(nerema, t("2026-10-25T19:15:04Z")).motif === "envoi_parti", "motif : envoi_parti");
ok(A.alerteOrphelineDue(nerema, t("2026-10-26T00:45:00Z")).motif === "envoi_non_verifie", "jamais relu au bout de 6 h → l'alerte « remise en ligne non vérifiée » (aucune attente sans fin)");

console.log("\n2. Sébastien, 1ab00947 (Beebs) : retrait 18:30, PC coupé 18:33, rien renvoyé — une vraie orpheline");
const seb = { republish_step: "deleted", deleted_at: "2026-10-25T17:30:39.000Z" };
ok(A.alerteOrphelineDue(seb, t("2026-10-25T18:03:01Z")).due === true && A.alerteOrphelineDue(seb, t("2026-10-25T18:03:01Z")).motif === "sans_envoi", "19:03 : rien n'est parti depuis le retrait → l'alerte, comme avant");
ok(A.alerteOrphelineDue(seb, t("2026-10-25T17:50:00Z")).due === false, "moins de 30 min après le retrait → trop tôt");

console.log("\n3. Envoi parti, puis relecture qui ne trouve pas la copie");
const relu = { ...nerema, gardes: { prevol_recreation: { verdict: "a_recreer", at: "2026-10-25T18:50:00.000Z" } } };
ok(A.alerteOrphelineDue(relu, t("2026-10-25T19:15:00Z")).due === false, "relu sans copie il y a 25 min → pas encore (le renvoi peut partir)");
ok(A.alerteOrphelineDue(relu, t("2026-10-25T19:21:00Z")).motif === "relu_sans_copie", "relu sans copie, rien renvoyé depuis 30 min → l'alerte");
const reenvoye = { ...relu, recreation_envois: ["2026-10-25T18:44:14.000Z", "2026-10-25T18:55:00.000Z"] };
ok(A.alerteOrphelineDue(reenvoye, t("2026-10-25T19:30:00Z")).motif === "envoi_parti", "un nouvel envoi après la relecture → de nouveau « envoi parti »");
const rv = { ...nerema, recreation_verifiee: { verdict: "aucune", le: "2026-10-25T19:00:00.000Z", apres: "2026-10-25T18:44:14.000Z" } };
ok(A.alerteOrphelineDue(rv, t("2026-10-25T19:31:00Z")).motif === "relu_sans_copie", "un relevé serveur « aucune » après l'envoi compte aussi (LBC, Beebs)");
const avantEnvoi = { ...nerema, gardes: { prevol_recreation: { verdict: "a_recreer", at: "2026-10-25T18:40:00.000Z" } } };
ok(A.alerteOrphelineDue(avantEnvoi, t("2026-10-25T19:30:00Z")).motif === "envoi_parti", "une relecture ANTÉRIEURE à l'envoi ne dément rien");

console.log("\n4. Sans heure de retrait : on ne crie pas");
ok(A.alerteOrphelineDue({ republish_step: "deleted" }, t("2026-10-25T20:00:00Z")).due === false, "pas de retrait daté → pas d'alerte (comme avant)");

console.log("\n5. Branchements");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/import \{ alerteOrphelineDue, envoiDepuisLeRetrait \} from "\.\.\/_shared\/alerte-orpheline\.js";/.test(hw), "handler-watch importe la règle");
ok(/\(j\.platform_fields\?\.deleted_at \|\| j\.platform_fields\?\.republish_suppression_envoyee\) && alerteOrphelineDue\(j\.platform_fields, now\)\.due\)/.test(hw), "le mail au support ne part que si l'alerte est due (étape deleted, ou suppression envoyée — 28/10)");
const avecEnvoi = I.messageInterruption({ etape: "deleted", vivant: false, platform: "vinted", vuLe: "2026-10-25T18:44:20.000Z", envoiLe: "2026-10-25T18:44:14.000Z" });
ok(/^Reprise après interruption : le retrait et l'envoi de ta nouvelle annonce sont partis à 19:44/.test(avecEnvoi) && !/s'est arrêté juste après le retrait/.test(avecEnvoi), "à la personne : « … le retrait et l'envoi de ta nouvelle annonce sont partis à 19:44 », plus « arrêté juste après le retrait »", avecEnvoi);
const sansEnvoi = I.messageInterruption({ etape: "deleted", vivant: false, platform: "beebs", vuLe: "2026-10-25T17:34:36.000Z" });
ok(/s'est arrêté juste après le retrait/.test(sansEnvoi), "sans envoi : la phrase d'avant, vraie");
ok(/envoiLe: (Number\.isFinite\(envoiRetrait\)|envoiDepuisLeRetrait)/.test(hw), "handler-watch passe l'heure de l'envoi à la phrase");

// (28/10 soir, Nico) Une suppression ENVOYÉE jamais prouvée (étape 'captured') alerte aussi, après 30 min.
ok(/\.not\("platform_fields->republish_suppression_envoyee", "is", null\)/.test(hw) && /"platform_fields->>republish_step", "eq", "captured"/.test(hw),
  "(28/10) handler-watch lit aussi les suppressions envoyées restées à « captured »");
{
  const t0 = Date.parse("2026-10-26T08:27:15Z");
  const seb = { republish_step: "captured", republish_suppression_envoyee: { at: "2026-10-26T08:27:15Z", annonce: "34207184" } };
  ok(A.suppressionEnvoyeeLe(seb) === t0, "(28/10) heure de la suppression envoyée lue");
  const r1 = A.alerteOrphelineDue(seb, t0 + 31 * 60_000);
  ok(r1.due === true && r1.motif === "suppression_envoyee", "(28/10) Sébastien : suppression envoyée sans preuve + 31 min → l'alerte", JSON.stringify(r1));
  ok(A.alerteOrphelineDue(seb, t0 + 10 * 60_000).due === false, "(28/10) avant 30 min : pas encore");
  ok(A.alerteOrphelineDue({ republish_step: "captured" }, t0 + 99 * 60_000).due === false, "(28/10) « captured » sans suppression envoyée : rien");
  ok(A.alerteOrphelineDue({ ...seb, republish_step: "a_capturer" }, t0 + 99 * 60_000).due === false, "(28/10) autre étape : rien");
}

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
