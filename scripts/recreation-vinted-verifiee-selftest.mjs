// Autotest — remise en ligne Vinted : jamais un essai de plus sans relire le dressing —
// `npm run selftest:recreation-vinted-verifiee`
// (supabase/functions/_shared/recreation-vinted-verifiee.js, recreation-vinted-envois.js,
//  get-pending-jobs, update-job-status, migration 20261018170000).
// Heures RELEVÉES le 18/10 chez Régis (juchsregis, boutique 31995881), en UTC :
//   short Levi's f33d2e5d — retrait Vinted 13:11:38 (en-tête Date), daté 13:18:45 par la base ;
//   copies nées de nos envois : 13:11:49, 13:19:42, 13:32:58, 13:39:39, 13:51:37, 14:01:41, 14:07:40.
import { readFileSync } from "node:fs";
import {
  decisionVerificationRecreation, recreationAVerifier, copiesProbables, releveQualifiant, titreNorm, retraitLe, envoisDe,
  ATTENTE_RELEVE_MIN, MESSAGE_ATTENTE,
} from "../supabase/functions/_shared/recreation-vinted-verifiee.js";
import { heureVintedDuRetrait, fusionnerEnvois, memesEnvois } from "../supabase/functions/_shared/recreation-vinted-envois.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const T = (h) => Date.parse(`2026-10-18T${h}Z`);

const pfLevis = {
  republish_step: "deleted", vinted_item_id: "7125590020", vinted_account_id: "31995881",
  suppression_verdict: { conclusion: "supprimee", date_serveur: "2026-10-18T13:11:38.000Z" },
  deleted_at: "2026-10-18T13:18:45.791Z", deleted_at_serveur: "2026-10-18T13:18:45.791Z", deleted_at_client: "2026-10-18T13:11:38.000Z",
  recreation_tentee: { n: 2, at: "2026-10-18T13:18:45.900Z" },
  republish_snapshot: { titre: "Short jean Levi's levi Strauss 24x32 525 8501" },
};
const job = (pf, extra = {}) => ({ id: "f33d2e5d", platform: "vinted", action: "republish", status: "pending", inventaire_id: 1792328734917018,
  title: "Short jean Levi's levi Strauss 24x32 525 8501", platform_fields: pf, ...extra });

console.log("Heure Vinted du retrait, envois");
ok(heureVintedDuRetrait(pfLevis, T("14:00:00")) === T("13:11:38"), "l'en-tête Date de Vinted (13:11:38) fait foi");
ok(heureVintedDuRetrait({ suppression_verdict: { date_serveur: "2026-10-18T15:00:00Z" } }, T("14:00:00")) === null, "une date dans le futur n'est pas lue");
ok(heureVintedDuRetrait({}, T("14:00:00")) === null, "sans verdict : rien");
const env1 = fusionnerEnvois({ recreation_envois: ["2026-10-18T13:11:38.000Z"] }, pfLevis, T("14:00:00"));
ok(env1.length === 2 && env1[0] === "2026-10-18T13:11:38.000Z" && env1[1] === "2026-10-18T13:18:45.900Z", "les envois s'accumulent (base + écriture), à la seconde, triés", JSON.stringify(env1));
const env2 = fusionnerEnvois({ recreation_envois: env1 }, { ...pfLevis, recreation_tentee: { at: "2026-10-18T13:31:57Z" } }, T("14:00:00"));
ok(env2.length === 3 && env2[2] === "2026-10-18T13:31:57.000Z", "une nouvelle tentative s'ajoute sans perdre les précédentes");
ok(memesEnvois(env2, [...env2]) && !memesEnvois(env1, env2), "comparaison des envois");
ok(retraitLe(pfLevis) === T("13:11:38"), "le retrait le plus tôt (horloge Vinted) sert de seuil, pas 13:18:45");
ok(envoisDe(pfLevis).includes(T("13:11:38")), "le retrait compte comme un envoi (la une-passe soumet dans la foulée)");

console.log("Garde avant tout nouvel essai");
ok(recreationAVerifier(job(pfLevis))?.essai === T("13:18:45.900"), "une republication retirée avec un essai est à vérifier");
ok(recreationAVerifier(job({ ...pfLevis, republish_step: "captured" })) === null, "étape captured : rien");
ok(recreationAVerifier(job(pfLevis, { platform: "leboncoin" })) === null, "Leboncoin : son propre circuit");
ok(recreationAVerifier(job({ ...pfLevis, recreation_tentee: undefined, recreation_envois: undefined })) === null, "aucun essai : servie comme avant");

const d1 = decisionVerificationRecreation(job(pfLevis), { releves: [], fiches: [], maintenant: T("13:25:00") });
ok(d1?.action === "retenir" && d1.error === MESSAGE_ATTENTE, "moins de 12 min après l'essai : retenue, message vrai");
const d2 = decisionVerificationRecreation(job(pfLevis), { releves: [], fiches: [], maintenant: T("13:31:00") });
ok(d2?.action === "demander_releve", "12 min passées sans relevé : relevé du dressing demandé");
ok(d2.platform_fields.recreation_attente_releve?.depuis, "l'attente est datée");

const releveTot = { id: "r1", kind: "dressing", status: "done", started_at: "2026-10-18T13:25:00Z", items_vus: 104, total_entries: 104 };
const releveIncomplet = { id: "r2", kind: "dressing", status: "done", started_at: "2026-10-18T13:40:00Z", items_vus: 96, total_entries: 104 };
const releveBon = { id: "r3", kind: "dressing", status: "done", started_at: "2026-10-18T13:40:00Z", items_vus: 104, total_entries: 104 };
ok(releveQualifiant([releveTot], T("13:18:45.900")) === null, "un relevé commencé trop tôt après l'essai ne compte pas");
ok(releveQualifiant([releveIncomplet], T("13:18:45.900")) === null, "un relevé incomplet (96/104) ne compte pas");
ok(releveQualifiant([releveBon], T("13:18:45.900"))?.id === "r3", "un relevé complet, commencé ≥ 12 min après, compte");

const d3 = decisionVerificationRecreation(job(pfLevis), { releves: [releveBon], fiches: [], maintenant: T("13:45:00") });
ok(d3?.action === "servir" && d3.platform_fields.recreation_verifiee?.releve === "r3", "relevé complet sans copie : essai suivant autorisé, tracé");
ok(recreationAVerifier(job(d3.platform_fields)) === null, "une fois vérifiée, la même tentative n'est plus retenue");
ok(recreationAVerifier(job({ ...d3.platform_fields, recreation_tentee: { at: "2026-10-18T13:50:00Z", n: 3 } })) !== null,
  "un nouvel essai rouvre la vérification (jamais deux essais sans relecture)");

console.log("Copie déjà au stock (importée pendant un essai)");
const ficheCopie = { id: 777, vinted_item_id: "10427636564", titre: "Short jean Levi's levi Strauss 24x32 525 8501", listed_at_guess: "2026-10-18T13:19:42Z", vinted_account_id: "31995881" };
const ficheAutreTitre = { ...ficheCopie, id: 778, vinted_item_id: "1", titre: "Short Levi's 501" };
const ficheAutreBoutique = { ...ficheCopie, id: 779, vinted_item_id: "2", vinted_account_id: "999" };
const ficheHorsFenetre = { ...ficheCopie, id: 780, vinted_item_id: "3", listed_at_guess: "2026-10-18T17:00:00Z" };
const ficheAvantRetrait = { ...ficheCopie, id: 781, vinted_item_id: "4", listed_at_guess: "2026-10-18T13:05:00Z" };
const ficheOrigine = { ...ficheCopie, id: 1792328734917018, vinted_item_id: "7125590020" };
const copies = copiesProbables(job(pfLevis), [ficheCopie, ficheAutreTitre, ficheAutreBoutique, ficheHorsFenetre, ficheAvantRetrait, ficheOrigine]);
ok(copies.length === 1 && copies[0].vinted_item_id === "10427636564", "seule la copie née de nos envois (titre + boutique + heure) est retenue",
  JSON.stringify(copies.map((c) => c.vinted_item_id)));
const d4 = decisionVerificationRecreation(job(pfLevis), { releves: [releveBon], fiches: [ficheCopie], maintenant: T("13:45:00") });
ok(d4?.action === "question" && /10427636564/.test(d4.error) && /Rien n'a été recréé/.test(d4.error), "copie probable : la question, jamais un essai de plus");

console.log("Six heures sans relevé");
const d5 = decisionVerificationRecreation(job({ ...pfLevis, recreation_attente_releve: { depuis: "2026-10-18T07:00:00Z" } }),
  { releves: [], fiches: [], maintenant: T("13:45:00") });
ok(d5?.action === "question" && /à l'aveugle/.test(d5.error), "au-delà de 6 h sans relevé : la question honnête");

console.log("Normalisation du titre (identique à la base)");
ok(titreNorm("Short jean Levi’s  levi-Strauss 24x32") === titreNorm("short jean levi s levi strauss 24x32"), "ponctuation et casse ignorées");
ok(titreNorm("France bloc feuillet n° 10 BF10 NEUF++") === "france bloc feuillet n 10 bf10 neuf", "symboles retirés");

console.log("Branchements (ancres)");
const ujs = readFileSync(new URL("../supabase/functions/update-job-status/index.ts", import.meta.url), "utf8");
const gpj = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
const mig = readFileSync(new URL("../supabase/migrations/20261018170000_recreation_vinted_rattachee_au_releve.sql", import.meta.url), "utf8");
ok(/if \(pfW\.deleted_at_serveur !== serveurDeja\) \{\s*pfW\.deleted_at_serveur = serveurDeja;\s*touche = true;/.test(ujs),
  "update-job-status : les repères du retrait ne sont plus effacés (touche marqué)");
ok(/heureVintedDuRetrait\(pfW\) \?\? heureVintedDuRetrait\(pfH\)/.test(ujs) && /pfW\.recreation_envois = envois;/.test(ujs),
  "update-job-status : heure Vinted d'abord, envois accumulés");
ok(/recreationAVerifier\(j\)/.test(gpj) && /declencheur: "serveur:verif_redepot"/.test(gpj) && gpj.indexOf("REMISE EN LIGNE VINTED : JAMAIS UN ESSAI DE PLUS") < gpj.indexOf("JAMAIS UN DEUXIÈME DÉPÔT BEEBS"),
  "get-pending-jobs : garde branchée avant le bloc Beebs, relevé demandé par le serveur");
ok(/create trigger inventaire_a_rattache_recreation_vinted\s+before insert on public\.inventaire/i.test(mig)
  && "inventaire_a_rattache_recreation_vinted" < "inventaire_ecarte_import_sync", "migration : le rattachement tire AVANT l'écart des imports automatiques");

if (ko) { console.error(`\n${ko} contrôle(s) en échec`); process.exit(1); }
console.log("\nTous les contrôles passent.");
