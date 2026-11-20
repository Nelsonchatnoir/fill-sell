// ═══════════════════════════════════════════════════════════════════════════
// UNE PAUSE N'EST PAS UNE DÉCONNEXION ; UN COMPTE REFUSÉ DIT POURQUOI — `npm run selftest:pause-et-compte-refuse`
// ═══════════════════════════════════════════════════════════════════════════
// (20/11/2026 soir, blocs B3 et B4 de Nico) B3 — bertaberry41 : pendant un refus passager de Leboncoin (403, nouvel essai
// automatique, vérification confirmée par le Cloud), ses 5 publications disaient « Leboncoin est à reconnecter » et sa
// carte le montrait déconnecté. B4 — linda.yoann35 : Beebs ne connaît pas son compte ; 194 publications Beebs en file
// disaient « Beebs est à reconnecter », réécrites toutes les ~10 min (levée par handler-watch, re-marquées par
// get-pending-jobs). Verrous : la règle pure (_shared/pause-plateforme.js, attente-session.js, src/publication/
// comptesRefuses.js, src/cloud/connexionsCloud.js) et son câblage (get-pending-jobs, handler-watch, lot).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  pauseDeLaPlateforme, pausePlateformeServeur, sansPausePlateforme, causeRefusCompte, texteRefusCompte, boutiqueProuvee,
} from "../supabase/functions/_shared/pause-plateforme.js";
import { attenteSessionServeur, ATTENTE_SESSION_RE } from "../supabase/functions/_shared/attente-session.js";
import { refusActifs, messageCompteRefuse } from "../src/publication/comptesRefuses.js";
import { etatsAvecPauses, avancementConnexions } from "../src/cloud/connexionsCloud.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };
const now = Date.parse("2026-11-20T17:40:00Z");

console.log("1. B3 — une pause n'est pas une déconnexion");
{
  ok(pauseDeLaPlateforme({ leboncoin: { cloud_verification: { etat: "verification_en_cours" } } }, "leboncoin")?.annonceeParLeCloud === false,
    "vérification en cours de confirmation : pause, le texte neutre est le nôtre");
  ok(pauseDeLaPlateforme({ leboncoin: { cloud_verification: { etat: "a_resoudre" } } }, "leboncoin")?.annonceeParLeCloud === true,
    "vérification à résoudre : pause annoncée par le Cloud (son geste « Résoudre »), jamais réécrite");
  ok(pauseDeLaPlateforme({ leboncoin: { blocage_acces: { signe: "http_403", le: "2026-11-20T17:34:32Z" } } }, "leboncoin")?.cause === "blocage_acces",
    "pause d'accès (403 vu par la veille) : pause");
  ok(pauseDeLaPlateforme({ leboncoin: { blocage_acces: { le: "x", leve_le: "y" } } }, "leboncoin") === null && pauseDeLaPlateforme({}, "beebs") === null,
    "pause levée, ou rien : pas une pause (une vraie déconnexion reste « à reconnecter »)");
  const job = { platform: "leboncoin", action: "publish", error: "x", platform_fields: { attente_session: { pose_par: "get-pending-jobs (session connue morte)" } } };
  const p = pausePlateformeServeur(job, { cloud: true, maintenantIso: new Date(now).toISOString() });
  ok(p && !ATTENTE_SESSION_RE.test(p.error) && /Courte pause de Leboncoin sur FillSell Cloud : ça repart tout seul, rien à faire/.test(p.error)
    && !p.platform_fields.attente_session && p.platform_fields.pause_plateforme,
    "texte neutre (jamais « En attente de ta connexion »), l'ancien marqueur « à reconnecter » part");
  ok(pausePlateformeServeur({ ...job, platform_fields: { refus_passager: { n: 1 }, next_action_after: new Date(now + 120_000).toISOString() } }, { maintenantIso: new Date(now).toISOString() }) === null,
    "un refus passager en cours garde son mot (« nouvel essai automatique ») jusqu'à son échéance");
  ok(pausePlateformeServeur({ ...job, platform_fields: { attente_verification_cloud: { etat: "a_resoudre" } } }) === null, "le message du Cloud n'est jamais écrasé");
  const relu = { ...job, error: p.error, platform_fields: p.platform_fields };
  ok(pausePlateformeServeur(relu, { cloud: true, maintenantIso: new Date(now).toISOString() }) === null, "déjà posé : aucune ligne réécrite");
  const fin = sansPausePlateforme(relu);
  ok(fin && fin.error === null && !fin.platform_fields.pause_plateforme && sansPausePlateforme({ platform_fields: {} }) === null,
    "la pause finie : le message et le marqueur partent ; rien d'autre n'est touché");
  const etats = etatsAvecPauses({ leboncoin: { connecte: false, maj_le: "x" }, beebs: { connecte: false } }, { leboncoin: { cloud_verification: { etat: "verification_en_cours" } } });
  ok(etats.leboncoin.connecte === true && etats.leboncoin.en_pause && etats.beebs.connecte === false,
    "carte de connexion : la plateforme en pause n'est pas montrée déconnectée ; une vraie déconnexion, si");
  const av = avancementConnexions({ plateformes: [{ id: "leboncoin" }, { id: "beebs" }], etats });
  ok(av.connectees === 1 && av.aConnecter.map((x) => x.id).join() === "beebs", "l'avancement ne compte que la vraie déconnexion");
}

console.log("2. B4 — le compte refusé dit pourquoi");
{
  ok(!boutiqueProuvee({}) && causeRefusCompte({}) === "sans_boutique", "aucune annonce, aucune publication, aucun relevé avec annonces : pas encore de compte");
  ok(causeRefusCompte({ annonces: 1 }) === "autre_compte" && causeRefusCompte({ publiees: 2 }) === "autre_compte" && causeRefusCompte({ relevesAvecAnnonces: 1 }) === "autre_compte",
    "une preuve de boutique : le compte connecté n'est pas celui de la boutique");
  const job = { platform: "beebs", action: "publish", error: "En attente de ta connexion à Beebs dans FillSell Cloud : Beebs est à reconnecter.", platform_fields: {} };
  const a = attenteSessionServeur(job, { cloud: true, refusCompte: "sans_boutique", maintenantIso: new Date(now).toISOString() });
  ok(a && /tu n'as pas encore de compte Beebs/.test(a.error) && /Crée ton compte sur Beebs, puis reconnecte-le ici/.test(a.error)
    && !/à reconnecter\./.test(a.error) && /Aucune tentative consommée/.test(a.error) && ATTENTE_SESSION_RE.test(a.error),
    "« Tu n'as pas encore de compte Beebs : crée-le sur Beebs, puis reconnecte-le ici » (même ancre d'attente)");
  ok(a.platform_fields.attente_session.cause === "refus_compte" && a.platform_fields.attente_session.refus === "sans_boutique", "la cause est gardée sur l'attente");
  ok(attenteSessionServeur({ ...job, error: a.error, platform_fields: a.platform_fields }, { cloud: true, refusCompte: "sans_boutique" }) === null,
    "déjà au bon texte : aucune ligne réécrite");
  ok(/le compte connecté n'est pas celui de ta boutique Beebs/.test(texteRefusCompte(job, { cause: "autre_compte", cloud: true })), "« autre compte que celui de ta boutique »");
  ok(/sur ton ordinateur|dans l'app/.test(texteRefusCompte(job, { cause: "sans_boutique", cloud: false })) && !/FillSell Cloud/.test(texteRefusCompte(job, { cause: "sans_boutique", cloud: false })),
    "même règle pour l'extension (sans « FillSell Cloud »)");
  const r = refusActifs([
    { platform: "beebs", rc: { le: new Date(now - 3600_000).toISOString() } },
    { platform: "beebs", att: { cause: "refus_compte", refus: "sans_boutique", derniere: new Date(now - 600_000).toISOString() } },
    { platform: "leboncoin", rc: { le: new Date(now - 30 * 3600_000).toISOString() } },
  ], now);
  ok(r.beebs?.cause === "sans_boutique" && !r.leboncoin, "avant l'envoi : refus de moins de 24 h, avec sa cause ; un refus ancien ne grise plus rien");
  ok(/Tu n'as pas encore de compte Beebs/.test(messageCompteRefuse("beebs", "sans_boutique")) && /Rien n.est envoyé à Beebs/.test(messageCompteRefuse("beebs", "autre_compte")),
    "la raison dite sur la plateforme grisée");
}

console.log("3. Le câblage");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/pause: pauseDeLaPlateforme\(psProfil, pf\)/.test(gpj) && /if \(m\.pause\.annonceeParLeCloud\) continue;/.test(gpj) && /pausePlateformeServeur\(j as never/.test(gpj),
    "get-pending-jobs : une plateforme du Cloud en pause garde sa file retenue, avec le texte neutre (jamais « à reconnecter »)");
  ok(/if \(!m\?\.refus && pfJ\.refus_passager && Date\.parse\(String\(pfJ\.next_action_after/.test(gpj), "get-pending-jobs : un refus passager en cours n'est jamais réécrit");
  ok(/refus = causeRefusCompte\(\{ annonces:/.test(gpj) && /refusCompte: m\?\.refus \?\? null/.test(gpj), "get-pending-jobs : le refus du compte porte sa cause");
  ok(/sansPausePlateforme\(j as never\)/.test(gpj), "get-pending-jobs : la pause finie, le message neutre part des tâches servies");
  const hw = lire("supabase/functions/handler-watch/index.ts");
  ok(/if \(attentePoseeParLeServeur\(pf\)\) return \(pf\.attente_session as Record<string, unknown> \| undefined\)\?\.cause !== "refus_compte";/.test(hw),
    "handler-watch : jamais de levée d'un compte refusé sur la seule foi du coffre (fin du va-et-vient des 194 tâches)");
  const lot = lire("src/publication/lot/LotPublication.jsx");
  ok(/lireComptesRefuses\(supabase, userId,/.test(lot) && /setPauses\(\{ \.\.\.\(refus \?\? \{\}\), \.\.\.globales \}\)/.test(lot), "lot : la plateforme qui refuse le compte est indisponible avant l'envoi, avec sa raison");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(lps.includes("const refus = await lireComptesRefuses(supabase, userId, { lang })") && lps.includes("setPausedReasons({ ...(refus ?? {}), ...globales })"),
    "à l'unité : la plateforme qui refuse le compte est grisée avant l'envoi, avec sa raison (et dans chaque moteur du lot)");
  const uc = lire("src/cloud/useConnexionsCloud.js");
  ok(/const etats = etatsAvecPauses\(coffre\.data \?\? \{\}, ps\);/.test(uc), "carte : les états du coffre passent par la règle des pauses");
}

console.log(`\n${rouges ? "✗" : "✓"} pause-et-compte-refuse : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
