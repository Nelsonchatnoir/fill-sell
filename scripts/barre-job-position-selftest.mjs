// ═══════════════════════════════════════════════════════════════════════════
// Selftest « la barre d'un job : une seule source, la base » (04/11, Nico)
//   npm run selftest:barre-job-position
//
// LE CONSTAT : la progression d'une republication n'était pas la même sur la carte du Stock et dans la file des jobs,
// et repartait à zéro au rafraîchissement. Le moteur partait du moment où L'ÉCRAN voyait l'étape (départ à 0 au
// montage, débord gardé en mémoire, départ jeté au-delà de 6 h).
// CE QUE CE TEST PROUVE, sur les VRAIES fonctions (utils/barresJobs.js, et la classe MoteurBarre extraite de
// components/BarreProgression.jsx, exécutée avec utils/progression.js) :
//   1. la position d'un job est une fonction pure du job en base et de l'heure (republish_step, statut, horodatages) ;
//   2. au premier affichage (rafraîchissement, ouverture de la file), la barre se POSE sur cette position — jamais 0 ;
//   3. la carte montée depuis longtemps et la file ouverte à l'instant visent le même chiffre ;
//   4. jamais en recul d'un état à l'autre (en file ↔ en travail, essai raté, phase suivante), même relu à neuf ;
//   5. une republication en file depuis le matin (créée il y a plus de 6 h) ne repart plus de zéro ;
//   6. ni l'ordre ni la logique des étapes ne changent (les étapes et leurs mots sont ceux d'avant).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const B = await import(pathToFileURL(join(ROOT, "src/utils/barresJobs.js")).href);
const P = await import(pathToFileURL(join(ROOT, "src/utils/progression.js")).href);

let ko = 0;
const ok = (cond, nom, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// ── Le moteur RÉEL de la barre (sans React : la classe et ses aides, extraites du composant) ──
const SRC = lire("src/components/BarreProgression.jsx");
const tranche = (debut, finMarque) => {
  const i = SRC.indexOf(debut);
  const j = SRC.indexOf(finMarque, i);
  if (i < 0 || j < 0) throw new Error(`introuvable : ${debut}`);
  return SRC.slice(i, j + finMarque.length);
};
const code = [
  tranche("const abonnes = new Set();", "\n}\n\nconst REQUETE_REDUITE"),
  "const ESPACE_FINE = \" \";\nconst ecrirePct = (n) => `${n}${ESPACE_FINE}%`;",
  tranche("function plageDe(p) {", "const signatureDe = (p) => `${etatNormalise(p.etat)}|${p.fraction ?? p.etape ?? \"\"}|${p.pas ?? \"\"}`;"),
  "const RAYON = 7;\nconst TOUR = 2 * Math.PI * RAYON;",
  tranche("class MoteurBarre {", "\n}\n"),
  "return MoteurBarre;",
].join("\n").replace("\n}\n\nconst REQUETE_REDUITE", "\n}\n");
const MoteurBarre = new Function(
  "plagesDe", "plageFraction", "plageAncree", "valeurDansPlage", "attenteLongue", "lisser", "etatNormalise", "moyenne",
  "pourcentageEcrit", "VITESSE_FIN", "requestAnimationFrame", "cancelAnimationFrame", "performance", code,
)(P.plagesDe, P.plageFraction, P.plageAncree, P.valeurDansPlage, P.attenteLongue, P.lisser, P.etatNormalise, P.moyenne,
  P.pourcentageEcrit, P.VITESSE_FIN, () => 1, () => {}, performance);

// Une barre montée : rend la valeur visée et affichée de sa piste après un passage du moteur.
function monter() {
  const m = new MoteurBarre(() => {}, () => {});
  return {
    voir(piste) {
      const p = { ...piste, cle: "_" };
      m.maj([p], P.etatNormalise(p.etat) === "termine" ? "termine" : "en_cours", false);
      const r = m.pistes.get("_");
      return { visee: r.visee, affichee: r.affichee };
    },
  };
}

const T = (iso) => Date.parse(iso);
const MAINTENANT = Date.now();
const ilYa = (min) => new Date(MAINTENANT - min * 60_000).toISOString();
const repub = (status, pf, cree = ilYa(9 * 60)) => ({ id: "b3727bbe", platform: "leboncoin", action: "repub" + "lish", status, created_at: cree, platform_fields: pf });
const piste = (job) => B.pisteJob(job, { lang: "fr", maintenant: MAINTENANT });
const valeur = (job) => monter().voir(piste(job)).affichee;   // la barre telle qu'un écran OUVERT À L'INSTANT la montre

console.log("\n[1] position pure du job, lue en base");
{
  const j = repub("processing", { republish_step: "a_capturer", processing_since: ilYa(0.5) });
  const a = B.positionJob(j, B.etapesJob(j), { maintenant: MAINTENANT });
  const b = B.positionJob(structuredClone(j), B.etapesJob(j), { maintenant: MAINTENANT });
  ok(a && JSON.stringify(a) === JSON.stringify(b), "même job, même heure → même position", JSON.stringify([a, b]));
  ok(a.depuis === T(j.platform_fields.processing_since), "le départ est l'horodatage écrit en base (processing_since)");
}

console.log("\n[2] au premier affichage, la barre se POSE sur la position — jamais de remontée depuis 0");
for (const [nom, job] of [
  ["relevé en cours", repub("processing", { republish_step: "a_capturer", processing_since: ilYa(1) })],
  ["copie faite, en attente", repub("pending", { republish_step: "captured", republish_snapshot: { captured_at: ilYa(2) } })],
  ["retirée, remise en ligne", repub("pending", { republish_step: "deleted", deleted_at: ilYa(3) })],
]) {
  const v = monter().voir(piste(job));
  ok(v.affichee > 1 && Math.abs(v.affichee - v.visee) < 1e-9, `${nom} : affichée = visée dès le montage (${v.affichee.toFixed(1)} %)`, JSON.stringify(v));
}
{
  const fini = monter().voir(piste(repub("published", { republish_step: "recreated" })));
  ok(fini.affichee === 100, "republication finie, rouverte : 100 % tout de suite");
}

console.log("\n[3] la carte montée depuis longtemps et la file ouverte à l'instant visent le même chiffre");
{
  const carte = monter();
  carte.voir(piste(repub("pending", { republish_step: "a_capturer" })));
  carte.voir(piste(repub("processing", { republish_step: "a_capturer", processing_since: ilYa(4) })));
  const etat = repub("pending", { republish_step: "captured", republish_snapshot: { captured_at: ilYa(1.5) } });
  const vCarte = carte.voir(piste(etat)).visee;
  const vFile = monter().voir(piste(etat)).visee;
  ok(Math.abs(vCarte - vFile) < 0.05, `même étape, même chiffre (carte ${vCarte.toFixed(2)} %, file ${vFile.toFixed(2)} %)`);
  const etat2 = repub("processing", { republish_step: "captured", processing_since: ilYa(0.3), republish_snapshot: { captured_at: ilYa(1.5) } });
  const c2 = carte.voir(piste(etat2)).visee; const f2 = monter().voir(piste(etat2)).visee;
  ok(Math.abs(c2 - f2) < 0.05, `retrait en cours : carte ${c2.toFixed(2)} %, file ${f2.toFixed(2)} %`);
}

console.log("\n[4] jamais en recul, même relu à neuf à chaque état");
{
  const suite = [
    ["en file", repub("pending", { republish_step: "a_capturer" })],
    ["relevé (1er essai)", repub("processing", { republish_step: "a_capturer", processing_since: ilYa(30) })],
    ["relevé raté, retombé en file", repub("pending", { republish_step: "a_capturer", error_technique: { at: ilYa(29) } })],
    ["relevé (nouvel essai)", repub("processing", { republish_step: "a_capturer", processing_since: ilYa(10), error_technique: { at: ilYa(29) } })],
    ["copie faite", repub("pending", { republish_step: "captured", republish_snapshot: { captured_at: ilYa(9) } })],
    ["retrait (1er essai)", repub("processing", { republish_step: "captured", processing_since: ilYa(8), republish_snapshot: { captured_at: ilYa(9) } })],
    ["retrait raté, retombé", repub("pending", { republish_step: "captured", republish_snapshot: { captured_at: ilYa(9) }, error_technique: { at: ilYa(7) } })],
    ["arrêtée (à toi de jouer)", repub("needs_user", { republish_step: "captured", republish_snapshot: { captured_at: ilYa(9) }, error_technique: { at: ilYa(7) } })],
    ["retirée, remise en ligne", repub("pending", { republish_step: "deleted", deleted_at: ilYa(5) })],
    ["remise en cours", repub("processing", { republish_step: "deleted", deleted_at: ilYa(5), processing_since: ilYa(4) })],
    ["redépôt raté, reprise", repub("pending", { republish_step: "deleted", deleted_at: ilYa(5), recreation_reprise: { at: ilYa(3) } })],
    ["nouvel essai de remise", repub("processing", { republish_step: "deleted", deleted_at: ilYa(5), recreation_reprise: { at: ilYa(3) }, processing_since: ilYa(1) })],
    ["de retour en ligne", repub("published", { republish_step: "recreated" })],
  ];
  let avant = -1; let nomAvant = "";
  for (const [nom, job] of suite) {
    const v = valeur(job);
    ok(v >= avant - 1e-9, `${nom} : ${v.toFixed(1)} % ≥ ${nomAvant || "départ"} (${Math.max(0, avant).toFixed(1)} %)`);
    avant = v; nomAvant = nom;
  }
  // Une même carte qui voit toute la suite : jamais en recul non plus.
  const carte = monter(); let max = 0; let recul = false;
  for (const [, job] of suite) { const v = carte.voir(piste(job)).visee; if (v < max - 1e-9) recul = true; max = Math.max(max, v); }
  ok(!recul, "une carte qui voit toute la suite ne recule jamais");
}

console.log("\n[5] en file depuis le matin (plus de 6 h) : plus jamais 0 %");
{
  const matin = repub("pending", { republish_step: "a_capturer" }, ilYa(11 * 60));
  const p = piste(matin);
  ok(Number.isFinite(p.depuis) && p.depuis === T(matin.created_at), "le départ reste la création du job (plus de « > 6 h = inconnu »)");
  const v = valeur(matin);
  ok(v > 5 && v < 6, `posée près du bout de « file » (${v.toFixed(2)} %), jamais 0`);
  const futur = repub("pending", { republish_step: "a_capturer" }, new Date(MAINTENANT + 3_600_000).toISOString());
  ok(piste(futur).depuis <= Date.now(), "horloge en avance : ramenée à maintenant");
}

console.log("\n[6] ni l'ordre ni la logique des étapes ne changent");
{
  const cles = B.etapesJob(repub("pending", {})).map((e) => e.cle).join(",");
  ok(cles === "file,releve,attente,retrait,remise", "étapes d'une republication inchangées", cles);
  ok(B.etapesJob({ platform: "vinted", action: "publish" }).map((e) => e.cle).join(",") === "file,action", "étapes d'une publication inchangées");
  for (const [job, etape, etat] of [
    [repub("pending", { republish_step: "a_capturer" }), "file", "en_cours"],
    [repub("processing", { republish_step: "a_capturer" }), "releve", "en_cours"],
    [repub("pending", { republish_step: "captured" }), "attente", "en_cours"],
    [repub("processing", { republish_step: "captured" }), "retrait", "en_cours"],
    [repub("pending", { republish_step: "deleted", deleted_at: ilYa(2) }), "remise", "en_cours"],
    [repub("published", { republish_step: "recreated" }), "remise", "termine"],
  ]) {
    const p = piste(job);
    ok(p.etape === etape && p.etat === etat, `${job.status}/${job.platform_fields.republish_step} → « ${etape} », ${etat} (les mots d'avant)`, `${p.etape}/${p.etat}`);
  }
  const pub = piste({ id: "p", platform: "vinted", action: "publish", status: "processing", created_at: ilYa(2), platform_fields: { processing_since: ilYa(1) } });
  ok(pub.etape === "action" && pub.reprise === true && pub.fraction > 0, "une publication suit la même règle");
}

console.log("\n[bandeau « En cours » du Stock] (05/11, capture de Nico à 10:20 : « 0 sur 3 », barre vide, la file à 72 % et 79 %)");
{
  const st = lire("src/tabs/StockTab.jsx");
  const i = st.indexOf("const pisteActif=pisteJob(activite.actif,{...(ctxBarres??{}),lang});");
  ok(i > 0, "le bandeau calcule la barre du job qu'il nomme avec pisteJob (étape lue en base), comme la file");
  ok(/<BarreProgression key=\{activite\.actif\.id\} seulePiste lang=\{lang\} \{\.\.\.pisteActif\}\/>/.test(st),
    "une barre par job (key), toutes les entrées de pisteJob : reprise, position, depuis — posée dès l'affichage");
  ok(!/fraction=\{activite\.faites\/activite\.total\}/.test(st), "plus jamais le seul compte des plateformes finies (0 % tant que rien n'est FINI)");
  const f = lire("src/components/FileDesJobs.jsx");
  ok(/\{\.\.\.pisteJob\(job, ctx\)\}/.test(f), "la file : la même fonction (pisteJob) — même chiffre au même instant");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ la barre d'un job : même chiffre partout, posée dès l'affichage, jamais en recul");
