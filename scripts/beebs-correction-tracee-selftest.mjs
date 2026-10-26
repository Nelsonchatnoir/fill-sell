// ═══════════════════════════════════════════════════════════════════════════
// BEEBS : UNE CORRECTION TRACÉE DE LA COPIE PASSE DEVANT LA VALEUR QUE L'ANNONCE AFFICHE ENCORE
// (26/10 nuit, point 12 — l'extension) — `npm run selftest:beebs-correction-tracee`
// ═══════════════════════════════════════════════════════════════════════════
// chaouidz, Beebs 34229052 (job 29f9116e) : pointure « 16 » fausse, corrigée en « 31 » par
// scripts/reparations/20261026_copies_valeurs_fausses.sql, avec sa trace platform_fields.correction_tracee.
// Le serveur la respecte (get-pending-jobs, _shared/correction-tracee.js) ; beebs.js, à la republication, relit
// l'annonce (champs_lus_sur_l_annonce.lus.taille = « 16 ») et posait d'abord la taille AFFICHÉE.
// Ce test prouve :
//   1. la PARITÉ : le miroir de beebs.js (correctionTient, beebs.js n'est pas un module) rend le même verdict que
//      la fonction du serveur, sur un produit exhaustif de cas (traces abîmées, clés, casse, espaces, accents NFD) ;
//   2. le cas chaouidz : « 31 » part seul, jamais « 16 » en repli ;
//   3. une annonce qui affiche une 3e valeur (la personne l'a changée sur Beebs) : rien n'est forcé ;
//   4. le câblage (taillesAPoser, avertissement du job) et le serveur toujours branché sur la même règle.
// Le code testé est CELUI de l'extension (extrait de beebs.js), jamais une recopie.
import fs from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const src = lire("chrome-extension/content-scripts/beebs.js");
const { correctionTient: serveur } = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/correction-tracee.js")).href);

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const ctx = vm.createContext({});
vm.runInContext(["valeurAfficheeSurLAnnonce", "correctionTient", "taillesAPoser"].map((n) => extraireFonctionJs(src, n)).join("\n") +
  "\nthis.api = { valeurAfficheeSurLAnnonce, correctionTient, taillesAPoser };", ctx);
const { correctionTient: extension, taillesAPoser } = ctx.api;

console.log("\n1. PARITÉ : le miroir de beebs.js et _shared/correction-tracee.js, cas par cas");
{
  const NFD = (s) => s.normalize("NFD");
  const TRACES = [
    undefined, null, "taille", 42, [], {},
    { cle: "taille", avant: "16", apres: "31" },
    { cle: "taille", avant: " 16 ", apres: "31 " },
    { cle: "taille", avant: "16", apres: "" },
    { cle: "taille", avant: "16", apres: "   " },
    { cle: "taille", avant: "", apres: "31" },
    { cle: "taille", avant: null, apres: "31" },
    { cle: "Taille", avant: "16", apres: "31" },
    { avant: "16", apres: "31" },
    { cle: "age", avant: "8 ans - 12 ans", apres: "16 ans et +" },
    { cle: "age", avant: "2 ans - 3 ans", apres: "3 ans - 4 ans" },
    { cle: "taille", avant: "Ajustable", apres: "Taille unique" },
    { cle: "taille", avant: NFD("Équipée"), apres: "Évasée" },
  ];
  const COPIES = [undefined, null, "", "31", " 31", "31 ", "32", "16", "16 ans et +", "3 ans - 4 ans", "8 ans - 12 ans", "TAILLE UNIQUE", NFD("Évasée"), 31];
  const AFFICHEES = [undefined, null, "", "16", " 16 ", "30", "31", 16, "8 ans - 12 ans", "2 ans - 3 ans", "AJUSTABLE", "Équipée", NFD("Équipée")];
  let n = 0, ecarts = 0, vrais = 0;
  for (const cle of ["taille", "age", "Taille", "couleur"]) {
    for (const trace of TRACES) {
      for (const copie of COPIES) {
        for (const affichee of AFFICHEES) {
          const pf = { correction_tracee: trace, [cle]: copie };
          const s = serveur(pf, cle, affichee);
          const e = extension(pf, cle, affichee);
          n++;
          if (s) vrais++;
          if (s !== e) { ecarts++; if (ecarts <= 5) console.error(`      écart : cle=${cle} trace=${JSON.stringify(trace)} copie=${JSON.stringify(copie)} affichée=${JSON.stringify(affichee)} → serveur ${s}, beebs.js ${e}`); }
        }
      }
    }
  }
  for (const pf of [null, undefined, "x", 0, []]) {
    n++;
    if (serveur(pf, "taille", "16") !== extension(pf, "taille", "16")) ecarts++;
  }
  ok(n > 10000, `produit exhaustif : ${n} cas`);
  ok(vrais > 50, `dont ${vrais} où la correction tient (le corpus mord des deux côtés)`);
  ok(ecarts === 0, `même verdict sur les ${n} cas (${ecarts} écart)`);
}

console.log("\n2. LE CAS DE chaouidz (Beebs 34229052, job 29f9116e)");
// platform_fields tels qu'en base après le script du 26/10, plus la lecture de l'annonce faite AVANT le retrait.
const TRACE_CHAOUIDZ = {
  cle: "taille", avant: "16", apres: "31", source: "correction", annonce: "34229052",
  motif: "pointure de la fiche « EU 31 » et du titre « Pointure 31 » ; « 16 » choisi à une question le 24/10",
  le: "2026-10-25T22:14:41.977333+00:00", par: "scripts/reparations/20261026_copies_valeurs_fausses.sql (point 12 de Nico)",
};
const pfChaouidz = (lue) => ({
  taille: "31", correction_tracee: TRACE_CHAOUIDZ, republish_step: "captured",
  champs_lus_sur_l_annonce: { le: "2026-10-26T02:00:00Z", lus: { taille: lue, etat: "Très bon état" }, repris: {}, pose_par: "extension (fiche en ligne, avant retrait)" },
});
{
  const t = taillesAPoser(pfChaouidz("16"));
  ok(t.primaire === "31", "la pointure posée est « 31 » (la copie corrigée)", JSON.stringify(t));
  ok(t.replis.length === 0, "« 16 » n'est JAMAIS tenté en repli (c'est la valeur fausse)", JSON.stringify(t.replis));
  ok(t.correctionTracee === true && t.affichee === "16", "la décision est nommée (pour l'avertissement du job)");
  ok(serveur(pfChaouidz("16"), "taille", "16") === true, "le serveur garde lui aussi « 31 » (même verdict)");
}

console.log("\n3. L'ANNONCE AFFICHE UNE 3e VALEUR : RIEN N'EST FORCÉ");
{
  const t = taillesAPoser(pfChaouidz("30"));
  ok(t.primaire === "30" && t.replis.length === 1 && t.replis[0] === "31" && !t.correctionTracee,
    "« 30 » affichée (changée depuis sur Beebs) : la valeur affichée d'abord, la copie en repli — règle du 03/10", JSON.stringify(t));
  ok(serveur(pfChaouidz("30"), "taille", "30") === false, "le serveur ne force rien non plus");
  const sansLecture = taillesAPoser({ taille: "31", correction_tracee: TRACE_CHAOUIDZ });
  ok(sansLecture.primaire === "31" && sansLecture.replis.length === 0, "rien de relu sur l'annonce (publication, ou poste plus ancien) : la copie seule, comme avant");
}

console.log("\n4. LE CÂBLAGE");
{
  ok(/function correctionTient\(pf, cle, valeurAffichee\) \{/.test(src) && /MIROIR de supabase\/functions\/_shared\/correction-tracee\.js/.test(src),
    "beebs.js porte le miroir, nommé comme tel");
  const corps = extraireFonctionJs(src, "taillesAPoser");
  ok(/if \(affichee && correctionTient\(fields, "taille", affichee\)\) \{\n\s+return \{ primaire: copie, replis: \[\]/.test(corps),
    "taillesAPoser consulte la correction AVANT la règle « valeur affichée d'abord »");
  const appel = src.indexOf("const tailles = taillesAPoser(fields);");
  ok(appel > 0 && /tailles\.correctionTracee/.test(src.slice(appel, appel + 600)), "le remplisseur dit la correction dans les avertissements du job");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(gpj.includes('import { correctionTient } from "../_shared/correction-tracee.js";')
    && /const correctionTientIci = correctionTient\(pf, "taille", tCap\);/.test(gpj), "le serveur applique la même règle (get-pending-jobs)");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ Beebs : une correction tracée passe devant la valeur que l'annonce affiche encore — même règle que le serveur");
