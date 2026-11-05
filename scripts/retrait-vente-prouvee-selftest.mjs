// Autotest — délai vente → retrait et rythme Leboncoin (05/11, points 10, 10A, 12 et 15 — Louis) —
// `npm run selftest:retrait-vente-prouvee`.
//   · serveur : un retrait de vente PROUVÉE (numéro de commande) est servi sans l'attente de 10 min ; dans « une action
//     Leboncoin toutes les 10 min », les retraits d'abord (_shared/retrait-vente-prouvee.js, get-pending-jobs) ;
//   · extension 0.6.174 : un retrait passe avant tout ; le numéro d'annonce d'une vente Leboncoin est lu dans le détail de
//     la transaction AVANT l'envoi ; une pause Leboncoin arrête aussi la messagerie et les lectures de routine.
import fs from "node:fs";
import { FENETRE_VENTE_MS, retraitDeVenteEnAttente, retraitServiSansAttente, retraitsDabord, venteProuveePourRetrait } from "../supabase/functions/_shared/retrait-vente-prouvee.js";

let ko = 0, n = 0;
const ok = (c, nom, d = "") => { n++; if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const MAINT = Date.parse("2026-11-05T10:56:00Z");
// Cas réel du 05/11 (louis-seller, Legging 10672640008) : vente 10:49:40Z, retraits armés 10:53:32Z, servis 11:05:2xZ.
const retrait = (o = {}) => ({ id: "r1", action: "delete", platform: "depop", inventaire_id: 1792354259491005, user_id: "u", created_at: "2026-11-05T10:53:32Z",
  platform_fields: { arme_par: { chemin: "vente_article_serveur" }, next_action_after: "2026-11-05T11:03:32Z" }, ...o });
const vente = (o = {}) => ({ user_id: "u", inventaire_id: 1792354259491005, created_at: "2026-11-05T10:53:30Z", commande_ref: "17723871944:10672640008", ...o });

console.log("1. Serveur : une vente prouvée n'attend pas 10 min");
ok(retraitDeVenteEnAttente(retrait(), MAINT), "retrait de vente qui attend son heure → candidat");
ok(!retraitDeVenteEnAttente(retrait({ action: "publish" }), MAINT), "une publication → jamais");
ok(!retraitDeVenteEnAttente(retrait({ platform_fields: { arme_par: { chemin: "doublon_vendu_confirme" }, next_action_after: "2026-11-05T11:03:32Z" } }), MAINT), "un retrait qui n'est pas armé par une vente → jamais");
ok(!retraitDeVenteEnAttente(retrait({ platform_fields: { arme_par: { chemin: "vente_article_serveur" }, next_action_after: "2026-11-05T10:50:00Z" } }), MAINT), "échéance passée → déjà servi, rien à lever");
ok(venteProuveePourRetrait(retrait(), [vente()]), "vente de la fiche avec numéro de commande Vinted → prouvée");
ok(venteProuveePourRetrait(retrait(), [vente({ commande_ref: "370563621" })]), "transaction Leboncoin → prouvée");
ok(!venteProuveePourRetrait(retrait(), [vente({ commande_ref: null })]), "« Vendu » cliqué à la main (aucun numéro) → garde ses 10 min");
ok(!venteProuveePourRetrait(retrait(), [vente({ user_id: "autre" })]), "la vente d'un autre compte → jamais");
ok(!venteProuveePourRetrait(retrait(), [vente({ inventaire_id: 1 })]), "la vente d'une autre fiche → jamais");
ok(!venteProuveePourRetrait(retrait(), [vente({ created_at: new Date(Date.parse("2026-11-05T10:53:32Z") - FENETRE_VENTE_MS - 60_000).toISOString() })]),
  "une vente ancienne de la même fiche (série revendue) ne lève pas l'attente d'aujourd'hui");
const servi = retraitServiSansAttente(retrait());
ok(!("next_action_after" in servi.platform_fields) && servi.platform_fields.attente_levee?.motif === "vente_prouvee" && servi.platform_fields.arme_par?.chemin === "vente_article_serveur",
  "servi sans échéance (l'extension ne le saute plus), le reste intact");
ok("next_action_after" in retrait().platform_fields, "l'original n'est pas modifié (rien n'est écrit en base)");
const file = [
  { id: "a", action: "republish", created_at: "2026-11-01T13:15:00Z" }, { id: "b", action: "republish", created_at: "2026-11-01T13:25:00Z" },
  { id: "c", action: "delete", created_at: "2026-11-01T12:58:43Z" }, { id: "d", action: "delete", created_at: "2026-11-01T12:58:44Z" },
];
ok([...file].sort(retraitsDabord).map((j) => j.id).join("") === "cdab", "Leboncoin « une action / 10 min » : les retraits d'abord, puis l'ancienneté (01/11 : 45 min derrière 3 republications)");

console.log("\n2. get-pending-jobs : branché au bon endroit");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const iLeve = gpj.indexOf("UNE VENTE PROUVÉE RETIRE SES COPIES TOUT DE");
const iFiltre = gpj.indexOf("UNE TÂCHE EN ATTENTE PROGRAMMÉE N'EST PAS SERVIE (04/10)");
ok(iLeve > 0 && iFiltre > iLeve, "la levée passe AVANT le filtre des tâches en attente programmée");
const bloc = gpj.slice(iLeve, iFiltre);
ok(/\.not\("commande_ref", "is", null\)/.test(bloc) && /\.eq\("user_id", user\.id\)/.test(bloc), "lit les ventes à numéro de commande du compte seulement");
ok(!/\.update\(/.test(bloc), "rien n'est écrit en base");
ok((gpj.match(/\.sort\(retraitsDabord\)/g) ?? []).length === 2, "les deux files Leboncoin espacées (propriétaire, délégation) trient les retraits d'abord");

console.log("\n3. Extension : un retrait passe avant tout");
const bg = lire("chrome-extension/background.js");
const prio = bg.slice(bg.indexOf("const prioriteRepub = (j) => {"), bg.indexOf("jobs = jobs\n    .map((j, i) => [j, i])"));
ok(/if \(j\.action === "delete"\) return -1;/.test(prio), "rang -1 pour un retrait, devant les publications et les republications « deleted »");
ok(!/j\.action === "publish" \|\| j\.action === "delete"/.test(prio), "le retrait ne partage plus le rang des publications");

console.log("\n4. Extension : le numéro d'annonce d'une vente Leboncoin (10A, 12)");
const det = bg.slice(bg.indexOf("async function lireDetailsVentesLeboncoin"), bg.indexOf("async function lireDetailsVentesLeboncoin") + 2600);
ok(/\/api\/consumergoods\/proxy\/v2\/pages\/transactions\//.test(det), "le détail : l'appel que fait la page Leboncoin (vérifié sur le compte de Nico le 05/11)");
ok(/http === 403 \|\| http === 429\) \{ echecs\.push\(\{ ref, http \}\); break; \}/.test(det), "un 403/429 arrête le paquet (jamais forcer)");
ok(/"bundle"/.test(det), "une vente groupée n'est jamais rattachée à une annonce");
ok(/const LBC_DETAIL_PAR_RUN = 16;/.test(bg) && /const LBC_DETAIL_PAR_INJECTION = 8;/.test(bg) && /900 \+ Math\.random\(\) \* 1200/.test(det), "cadencé : 16 par passage, 8 par injection, 0,9–2,1 s");
const env = bg.slice(bg.indexOf("LEBONCOIN : le numéro d'annonce AVANT l'envoi"), bg.indexOf("let bilan = await envoyerVentesRelevees(token, platform, lignesVentes);"));
ok(env.length > 0 && /etat\.leboncoin_numeros = borner\(numeros\)/.test(env), "lu AVANT l'envoi, mémorisé par appareil (une transaction détaillée une fois, délégué compris)");
ok(/\(ratees\[ref\] \?\? 0\) < 2/.test(env), "un refus ordinaire : deux essais au plus");
ok(/LBC_ARRIERE_JOURS = 30/.test(bg) && /annonce_id=is\.null/.test(bg), "l'arriéré : les ventes des 30 derniers jours encore sans numéro");

console.log("\n5. Extension : une pause Leboncoin arrête tout (15)");
const mess = bg.slice(bg.indexOf("async function releverMessagerieBeta"), bg.indexOf("async function releverMessagerieBeta") + 4000);
ok(/platform === "leboncoin" && \(\(await leboncoinEnPause\(\)\) \|\| \(await leboncoinDelegueAilleurs\(\)\)\)/.test(mess), "messagerie : pas de Leboncoin en pause, ni sur un compte qui délègue Leboncoin");
const chk = bg.slice(bg.indexOf("async function checkPublishedListings"), bg.indexOf("async function checkPublishedListings") + 1500);
ok(/if \(plateforme === "leboncoin" && lbcEnPause\) return;/.test(chk) && /lbcEnPause \|\| \(await leboncoinDelegueAilleurs\(\)\)\) \? "&platform=neq\.leboncoin"/.test(chk),
  "lectures de routine : aucune page Leboncoin pendant la pause (compte et délégué)");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — vente → retrait, rythme Leboncoin`);
process.exit(ko ? 1 : 0);
