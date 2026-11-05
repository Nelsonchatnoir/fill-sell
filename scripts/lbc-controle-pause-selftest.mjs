// Autotest — pause Leboncoin : une visite de contrôle légère, jamais de rafale (03/11, point 7, règle de Nico) —
// `npm run selftest:lbc-controle-pause` (_shared/blocage-leboncoin.js, get-pending-jobs, handler-watch, extension).
// Cas du 02/11 : 96 tâches servies d'un coup ; après un mur de connexion puis une vérification anti-robot, la boucle a
// chargé 57 pages de dépôt (~1 toutes les 25 s) pendant le refus ; aucun contrôle prévu avant 24 h, et c'était une action.
import fs from "node:fs";
import { annonceDejaRetiree, ESSAI_APRES_MS, etatBlocageLbc, blocagePose, blocageLeve, blocageEssaiRefuse, delaiControleLbc, PALIERS_RECHUTE_MS } from "../supabase/functions/_shared/blocage-leboncoin.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const bg = lire("chrome-extension/background.js");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const hw = lire("supabase/functions/handler-watch/index.ts");

console.log("\n1. UNE VISITE DE CONTRÔLE, PAS UNE ACTION, ET PAS UNE PAUSE SANS FIN");
ok(ESSAI_APRES_MS === 2 * 3600_000, "contrôle 2 h après la dernière preuve (24 h avant)");
const T0 = Date.parse("2026-11-02T15:03:21Z");
const ps = { leboncoin: { blocage_acces: blocagePose({}, { signe: "datadome", source: "test", maintenant: new Date(T0).toISOString() }) } };
ok(etatBlocageLbc(ps, T0 + 3600_000).etat === "bloque" && etatBlocageLbc(ps, T0 + 2 * 3600_000).etat === "essai", "bloqué 1 h après, contrôle dû à 2 h");
ok(!/eb\.etat === "essai" && lbc\.length/.test(gpj) && !/jobId: garde/.test(gpj), "get-pending-jobs : l'essai ne sert JAMAIS une tâche");
ok(gpj.includes('declencheur: "controle_blocage_lbc"') && gpj.includes("if (!releveLbc && eb.etat === \"essai\" && essaiPossible) {"), "aucun relevé en file : le serveur pose la visite de contrôle (lecture seule)");
// (05/11, point 19) Le juge de la visite est la règle partagée verdictVisiteControleLbc (blocage-leboncoin.js).
const blocLbc = lire("supabase/functions/_shared/blocage-leboncoin.js");
ok(gpj.includes("const vV = verdictVisiteControleLbc(st, texteE);") && blocLbc.includes('if (st === "done" && !/\\[incomplet\\]/.test(t)) return { verdict: "passe" };'),
  "relevé lu en entier = Leboncoin répond → levée, la file repart d'elle-même");

console.log("\n1 bis. UNE LECTURE RÉUSSIE NE PROUVE PAS LA PUBLICATION : RECHUTES ESPACÉES (garde-fou de Nico)");
{
  const H = 3600_000; const iso = (t) => new Date(t).toISOString();
  ok(PALIERS_RECHUTE_MS.join(",") === [2 * H, 6 * H, 24 * H].join(","), "paliers 2 h, 6 h, 24 h");
  let b = blocagePose({}, { signe: "datadome", source: "t", maintenant: iso(T0) });
  ok(!b.rechutes && Date.parse(b.essai_apres) - T0 === 2 * H, "première pause : visite à 2 h");
  const vers = (bb) => ({ leboncoin: { blocage_acces: bb } });
  let t = T0 + 2 * H;
  const rechuter = () => {
    const leve = blocageLeve({ ...b, essai: { releve_id: "r", le: iso(t) } }, { par: "test", maintenant: iso(t + 60_000) });
    ok(etatBlocageLbc(vers(leve), t + 120_000).etat === "reprise", "visite passée : reprise prudente");
    b = blocagePose(vers(leve), { signe: "datadome", source: "publication refusée", maintenant: iso(t + 10 * 60_000) });
    return Date.parse(b.essai_apres) - (t + 10 * 60_000);
  };
  ok(rechuter() === 2 * H && b.rechutes === 1, "1re rechute (publication refusée après une lecture réussie) : 2 h");
  t += 3 * H; ok(rechuter() === 6 * H && b.rechutes === 2, "2e rechute : 6 h");
  t += 7 * H; ok(rechuter() === 24 * H && b.rechutes === 3, "3e rechute : 24 h");
  t += 25 * H; ok(rechuter() === 24 * H && b.rechutes === 4, "au-delà : 24 h");
  const ref = blocageEssaiRefuse(b, { signe: "datadome", maintenant: iso(t + 30 * H) });
  ok(Date.parse(ref.essai_apres) - (t + 30 * H) === 24 * H && delaiControleLbc(ref) === 24 * H, "visite refusée pendant une rechute : même palier");
  const repris = blocagePose(vers({ ...b, essai: { le: iso(t) } }), { signe: "datadome", source: "t", maintenant: iso(t + 31 * H) });
  ok(repris.rechutes === b.rechutes, "encore bloqué : le nombre de rechutes ne bouge pas");
  ok(!blocagePose({}, { signe: "http_403", source: "t", maintenant: iso(t + 60 * H) }).rechutes, "reprise allée à son terme (blocage rangé) : on repart de zéro");
}

console.log("\n2. JAMAIS DE RAFALE PENDANT UN REFUS (extension)");
const debut = bg.indexOf("function refusLeboncoinDuResultat(outcome) {");
const fin = bg.indexOf("\nfunction noterBlocageLbcServeur", debut);
const refus = new Function(`${bg.slice(debut, fin)}; return refusLeboncoinDuResultat;`)();
ok(refus({ status: "needsUser", error: "CHALLENGE DATADOME : Leboncoin affiche une vérification anti-robot à la place du formulaire de dépôt." }) === "anti_robot", "vérification anti-robot → arrêt du cycle");
ok(refus({ status: "needsUser", error: "Connexion Leboncoin requise : connecte-toi." }) === "connexion", "mur de connexion → arrêt du cycle");
ok(refus({ status: "retry", error: "Leboncoin a refusé l'accès à la page à l'instant, mais ta connexion Leboncoin est bonne" }) === "refus_acces_page", "refus d'accès passager → arrêt du cycle");
ok(refus({ status: "failed", error: "HTTP 403 sur l'API" }) === "http_403" && refus({ status: "failed", error: "« Accès temporairement restreint »" }) === "acces_restreint", "403 et accès restreint → arrêt");
ok(refus({ status: "failed", error: "Prix manquant" }) === null && refus({ status: "failed", error: "annonce 4031234 introuvable" }) === null, "autre échec (prix, numéro qui contient 403) → la file continue");
ok(bg.includes('if (job.platform === "leboncoin" && (lbcRefusCeCycle || await leboncoinEnPause())) {'), "avant chaque tâche Leboncoin : refus de ce cycle ou pause du serveur → laissée en file");
ok(bg.includes("const motifRefus = refusLeboncoinDuResultat(outcome);") && bg.includes("lbcRefusCeCycle = motifRefus;"), "après une tâche Leboncoin refusée : plus aucune ce cycle");
ok(bg.includes('if (platform === "leboncoin" && !sessionFournie && !(declencheur === "bouton_distant" && runId) && await leboncoinEnPause()) {'),
  "relevé lancé par l'extension elle-même pendant la pause : rien ; la visite servie par le serveur passe");

console.log("\n3. UN RELEVÉ RÉUSSI N'EST JAMAIS UNE PREUVE DE RESTRICTION (faux positif du 01/11)");
ok(hw.includes('if (String(r.status ?? "") === "done" && !/\\[incomplet\\]/.test(String(r.erreur ?? ""))) continue;') && hw.includes('select("user_id, finished_at, erreur, status")'),
  "handler-watch : relevé « done » (6/6 lu après un 403 dans une relance) → aucune pause posée");

console.log("\n4. (04/11 nuit, règle de Nico) REPRISE PRUDENTE : UNE ANNONCE DÉJÀ RETIRÉE EST REDÉPOSÉE TOUT DE SUITE");
ok(annonceDejaRetiree({ action: "republish", platform_fields: { republish_step: "deleted" } })
  && !annonceDejaRetiree({ action: "republish", platform_fields: { republish_step: "captured" } })
  && !annonceDejaRetiree({ action: "publish", platform_fields: { republish_step: "deleted" } }) && !annonceDejaRetiree(null),
  "annonce déjà retirée = republication à l'étape « deleted » (rien d'autre)");
{
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(gpj.includes('const retireesB = eb.etat === "reprise" ? lbc.filter((j) => annonceDejaRetiree(j)) : [];')
    && gpj.includes('if (eb.etat === "reprise" && (retireesB.length || (eb.prete && lbc.length))) {')
    && gpj.includes('const retenus = lbc.filter((j) => !serviesB.has(String(j.id)));'),
    "get-pending-jobs : en reprise, les annonces retirées partent tout de suite et comptent pour l'action du moment ; les nouvelles restent espacées");
  ok(gpj.includes('const retireesA = ebA.etat === "reprise" ? lbcA.filter((j) => annonceDejaRetiree(j)) : [];')
    && gpj.includes('const retenusA = lbcA.filter((j) => !serviesA.has(String(j.id)));'),
    "même règle pour la délégation (reprise de l'exécutant)");
}
console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
