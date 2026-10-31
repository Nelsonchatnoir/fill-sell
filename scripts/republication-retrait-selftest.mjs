// ═══════════════════════════════════════════════════════════════════════════
// UN RETRAIT FERME LES REPUBLICATIONS EN ATTENTE DE LA MÊME ANNONCE (31/10) — `npm run selftest:republication-retrait`
// ═══════════════════════════════════════════════════════════════════════════
// Exécute le module livré (_shared/republication-retrait.js) sur le cas vu chez Nico le 31/10 (republication Beebs
// 34269931 en attente, retrait ciblé fait) et ses voisins : republication engagée jamais touchée, autre annonce,
// autre plateforme, autre compte, retrait échoué ou annulé, numéro lu dans le lien seulement. Puis vérifie que les
// porte (get-pending-jobs, à chaque poll, avant la pause) appelle bien ce module.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  republicationFermableParRetrait, retraitVivant, republicationsAClore, retraitDeLaRepublication,
  clotureRepublicationParRetrait, MESSAGE_REPUBLICATION_RETRAIT, STATUTS_RETRAIT_VIVANT,
} from "../supabase/functions/_shared/republication-retrait.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };

const NICO = "f44b5917-bccc-4431-ba41-f40571a2ed18";
const repub = (o = {}) => ({
  id: "ce39e77c-0000-0000-0000-000000000001", user_id: NICO, inventaire_id: 1793438600001, platform: "beebs", action: "republish",
  status: "needs_user", platform_listing_id: "34269931", listing_url: null,
  platform_fields: { republish_step: "a_capturer", needs_user_source: "introuvable_a_confirmer" }, ...o,
});
const retrait = (o = {}) => ({
  id: "ce3c2fb7-0000-0000-0000-000000000002", user_id: NICO, inventaire_id: 1793438600001, platform: "beebs", action: "delete",
  status: "deleted", platform_listing_id: "34269931", listing_url: null, created_at: "2026-10-31T10:07:51Z", ...o,
});

console.log("1. Le cas du 31/10 : republication Beebs en attente, retrait fait de la même annonce");
ok(republicationFermableParRetrait(repub()), "republication needs_user, étape a_capturer, rien retiré → fermable");
ok(retraitVivant(retrait()), "retrait 'deleted' avec un numéro → vivant");
ok(republicationsAClore([repub()], retrait()).length === 1, "update-job-status : la republication est à clore");
ok(retraitDeLaRepublication(repub({ status: "pending" }), [retrait({ status: "pending" })])?.id === retrait().id, "get-pending-jobs : retrait encore en attente → trouvé");
const patch = clotureRepublicationParRetrait({ republish_step: "a_capturer", needsUserAttempts: 2 }, { le: "2026-10-31T12:00:00Z", retraitId: "r1", numero: "34269931", par: "test" });
ok(patch.status === "cancelled" && patch.error === MESSAGE_REPUBLICATION_RETRAIT, "clôture : cancelled + le message");
ok(patch.platform_fields.arret_utilisateur === "2026-10-31T12:00:00Z" && patch.platform_fields.hors_quota === true, "clôture : arret_utilisateur + hors_quota");
ok(patch.platform_fields.republication_retrait_demande?.annonce === "34269931" && patch.platform_fields.republish_step === "a_capturer", "clôture : trace du retrait, champs d'origine gardés");
ok(patch.platform_fields.needsUserAttempts >= 99, "clôture : une vieille boucle ne la requalifie jamais en reprise");
ok(/rien n'a été recréé/.test(MESSAGE_REPUBLICATION_RETRAIT) && /retirée à ta demande/.test(MESSAGE_REPUBLICATION_RETRAIT), "le message dit ce qui s'est passé");

console.log("2. Jamais une republication engagée, jamais une autre annonce");
ok(!republicationFermableParRetrait(repub({ platform_fields: { republish_step: "deleted" } })), "étape 'deleted' (ancienne annonce retirée) → jamais");
ok(!republicationFermableParRetrait(repub({ platform_fields: { republish_step: "captured", deleted_at: "2026-10-31T09:00:00Z" } })), "deleted_at posé → jamais");
ok(!republicationFermableParRetrait(repub({ platform_fields: { republish_step: "captured", republish_suppression_envoyee: { le: "x" } } })), "suppression envoyée → jamais");
ok(!republicationFermableParRetrait(repub({ platform_fields: { republish_step: "recreated" } })), "étape 'recreated' → jamais");
ok(republicationFermableParRetrait(repub({ status: "pending", platform_fields: { republish_step: "captured" } })), "étape 'captured' sans retrait engagé → fermable");
ok(!republicationFermableParRetrait(repub({ status: "processing" })), "un job en cours → jamais");
ok(!republicationFermableParRetrait(repub({ action: "publish" })), "une publication → hors règle");
ok(republicationsAClore([repub({ platform_listing_id: "34269932" })], retrait()).length === 0, "autre numéro → rien");
ok(republicationsAClore([repub({ platform: "leboncoin" })], retrait()).length === 0, "autre plateforme → rien");
ok(republicationsAClore([repub({ user_id: "autre" })], retrait()).length === 0, "autre compte → rien");
ok(republicationsAClore([repub({ id: retrait().id })], retrait()).length === 0, "le retrait lui-même → rien");
for (const st of ["failed", "cancelled"]) ok(republicationsAClore([repub()], retrait({ status: st })).length === 0, `retrait ${st} → rien`);
ok(STATUTS_RETRAIT_VIVANT.join(",") === "pending,processing,needs_user,deleted", "retraits vivants : pending, processing, needs_user, deleted");
ok(republicationsAClore([repub()], retrait({ platform_listing_id: null })).length === 0, "retrait sans numéro → rien (jamais sur un titre)");

console.log("3. Le numéro lu dans le lien quand la colonne manque (retrait armé depuis le logo du Stock)");
const rVinted = retrait({ platform: "vinted", platform_listing_id: null, listing_url: "https://www.vinted.fr/items/10604418731-test-fillsell" });
const pVinted = repub({ platform: "vinted", platform_listing_id: null, listing_url: "https://www.vinted.fr/items/10604418731", status: "pending" });
ok(republicationsAClore([pVinted], rVinted).length === 1, "Vinted : même numéro par les liens → à clore");
ok(republicationsAClore([{ ...pVinted, listing_url: "https://www.vinted.fr/items/10604418732" }], rVinted).length === 0, "Vinted : autre numéro → rien");
const rLbc = retrait({ platform: "leboncoin", platform_listing_id: null, listing_url: "https://www.leboncoin.fr/ad/vetements/3298959829" });
ok(republicationsAClore([repub({ platform: "leboncoin", platform_listing_id: "3298959829", status: "pending" })], rLbc).length === 1, "Leboncoin : colonne d'un côté, lien de l'autre → à clore");
ok(retraitDeLaRepublication(repub({ status: "pending" }), [retrait({ created_at: "2026-10-30T00:00:00Z", id: "ancien" }), retrait({ created_at: "2026-10-31T00:00:00Z", id: "recent" })])?.id === "recent", "plusieurs retraits → le plus récent");

console.log("4. La porte : get-pending-jobs, à chaque poll, AVANT la pause");
const GPJ = lire("supabase/functions/get-pending-jobs/index.ts");
ok(GPJ.includes('import { retraitDeLaRepublication, clotureRepublicationParRetrait, STATUTS_RETRAIT_VIVANT } from "../_shared/republication-retrait.js";'), "get-pending-jobs importe le module");
const iRetrait = GPJ.indexOf("UN RETRAIT DE LA MÊME ANNONCE CLÔT LA REPUBLICATION EN ATTENTE");
const iPause = GPJ.indexOf("let filePause = false;");
const iCible = GPJ.indexOf("UNE REPUBLICATION VISE L'ANNONCE EN LIGNE ACTUELLE");
ok(iRetrait > 0 && iPause > iRetrait && iCible > iRetrait, "avant la pause (une file en pause se clôt aussi) et avant la garde de la cible");
const bloc = GPJ.slice(iRetrait, iPause);
ok(bloc.includes('.in("status", ["pending", "needs_user"])'), "republications en attente ET en attente d'un geste (le cas du 31/10)");
ok(bloc.includes('.gte("created_at", new Date(Date.now() - 30 * 86400_000)') && bloc.includes(".limit(500)"), "bornée : retraits des 30 derniers jours, 500 au plus");
const lectures = bloc.split("const { data: ligne }")[0];
ok(!lectures.includes("platform_fields, ") && !lectures.includes('platform_fields")') && lectures.includes("platform_fields->>republish_step"), "aucune lecture de platform_fields entier à chaque poll (clés utiles seulement)");
ok(bloc.includes("retraitDeLaRepublication(jR,") && bloc.includes("clotureRepublicationParRetrait(") && bloc.includes('.eq("status", String(r.status))'), "verdict du module, clôture compare-and-swap sur le statut lu");
ok(bloc.includes("out = out.filter((j) => !closes.has"), "une republication close n'est jamais servie");
const UJS = lire("supabase/functions/update-job-status/index.ts");
ok(!/republication-retrait/.test(UJS), "update-job-status inchangé (son déploiement a été refusé le 31/10 : la porte unique est get-pending-jobs)");
// Les clés recomposées suffisent à retraitEngage : une republication engagée reste hors règle.
const leger = (o) => ({ ...repub({ status: "pending" }), platform_fields: o });
ok(!republicationFermableParRetrait(leger({ republish_step: "a_capturer", deleted_at: "2026-10-31T09:00:00Z" })), "clés légères : deleted_at → engagée, jamais close");

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
if (rouges) process.exit(1);
