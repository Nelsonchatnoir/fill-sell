// ═══════════════════════════════════════════════════════════════════════════
// Selftest « un relevé posé par le serveur n'est jamais avalé en silence » (05/11, point 4 — louis-seller / Amiral)
//   npm run selftest:releve-veille-miroir
//
// LE CAS : get-pending-jobs posait la visite de contrôle d'une pause Leboncoin (déclencheur 'controle_blocage_lbc'),
// absent de releve_est_veille() : le déclencheur garde_releve_sans_geste fait RETURN NULL — ni ligne, ni erreur.
// 690 refus pour le compte Amiral le 04/11, 7 comptes en pause, aucune pause levable depuis le 03/11 ; Amiral en pause,
// le Leboncoin délégué de louis-seller ne partait plus.
// CE QUE CE TEST VERROUILLE :
//   1. tout déclencheur ÉCRIT par une fonction serveur dans vinted_sync_runs est un geste (releve_est_geste) ou une
//      veille (releve_est_veille, telle que la DERNIÈRE migration la définit) — un nouveau déclencheur oublié rougit ici ;
//   2. le miroir de l'app (src/utils/declencheursReleve.js) est EXACTEMENT la liste de la base ;
//   3. get-pending-jobs dit une visite de contrôle non posée, même sans erreur, et ne la sert plus « devant ».
// ⚠ À TRANCHER PAR NICO (05/11) : 'reprise_connexion' (handler-watch) et 'serveur:levee_antirobot' (get-pending-jobs)
//   sont refusés par la même garde depuis sa création (05/10) — leurs relevés n'ont plus jamais été écrits. Les ouvrir
//   relancerait des relevés automatiques endormis depuis un mois : décision, pas correctif. Listés ici pour ne rougir
//   que sur un déclencheur NOUVEAU.
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(p, "utf8").replace(/\r\n/g, "\n");
const { DECLENCHEURS_VEILLE } = await import(pathToFileURL(join(ROOT, "src/utils/declencheursReleve.js")).href);
const A_TRANCHER = ["reprise_connexion", "serveur:levee_antirobot"];

let ko = 0;
const ok = (cond, nom, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// La liste de releve_est_veille selon la DERNIÈRE migration qui la définit.
const dossierMig = join(ROOT, "supabase/migrations");
const migs = readdirSync(dossierMig).filter((f) => f.endsWith(".sql")).sort()
  .filter((f) => /FUNCTION public\.releve_est_veille\(/.test(lire(join(dossierMig, f))));
const derniere = migs.at(-1);
const corps = lire(join(dossierMig, derniere));
const bloc = corps.slice(corps.lastIndexOf("FUNCTION public.releve_est_veille("));
const liste = [...(bloc.match(/IN \(([\s\S]*?)\)/)?.[1] ?? "").matchAll(/'([^']*)'/g)].map((m) => m[1]);
const GESTE_RE = /^(bouton|bouton_distant|app)(:redemande)?$/;   // releve_est_geste, définition de prod

console.log(`\n[1] tout déclencheur écrit par le serveur passe la garde (releve_est_veille de ${derniere})`);
ok(liste.length >= 9 && liste.includes("controle_blocage_lbc"), `la liste de la base porte la visite de contrôle (${liste.length} déclencheurs)`, liste.join(","));
const fichiers = [];
(function parcourir(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    const p = join(d, e.name);
    if (e.isDirectory()) parcourir(p); else if (/\.(ts|js)$/.test(e.name)) fichiers.push(p);
  }
})(join(ROOT, "supabase/functions"));
const ecrits = new Map();
for (const f of fichiers) {
  const s = lire(f);
  let i = -1;
  while ((i = s.indexOf("vinted_sync_runs", i + 1)) >= 0) {
    const zone = s.slice(i, i + 700);
    const ins = zone.indexOf(".insert(");
    if (ins < 0 || ins > 200) continue;
    const m = zone.slice(ins).match(/declencheur:\s*(["'`])([^"'`]+)\1/);
    if (!m || m[2].includes("${")) continue;   // gabarit « …:redemande » : un geste rejoué
    if (!ecrits.has(m[2])) ecrits.set(m[2], []);
    ecrits.get(m[2]).push(`${relative(ROOT, f)}:${s.slice(0, i).split("\n").length}`);
  }
}
ok(ecrits.has("controle_blocage_lbc") && ecrits.size >= 8, `déclencheurs écrits relevés dans le code (${ecrits.size})`, [...ecrits.keys()].join(","));
for (const [d, ou] of ecrits) {
  if (A_TRANCHER.includes(d)) { console.log(`  ⚠    ${d} : refusé par la garde depuis le 05/10 — à trancher par Nico (${ou.join(", ")})`); continue; }
  ok(GESTE_RE.test(d) || liste.includes(d), `${d} : passe la garde`, `ni geste ni veille — garde_releve_sans_geste l'avalerait EN SILENCE (${ou.join(", ")})`);
}

console.log("\n[2] le miroir de l'app est exactement la liste de la base");
const app = [...DECLENCHEURS_VEILLE].sort().join(",");
ok(app === [...liste].sort().join(","), "src/utils/declencheursReleve.js = releve_est_veille()", `app ${app} | base ${[...liste].sort().join(",")}`);

console.log("\n[3] get-pending-jobs : la visite de contrôle");
const gpj = lire(join(ROOT, "supabase/functions/get-pending-jobs/index.ts"));
const iV = gpj.indexOf('declencheur: "controle_blocage_lbc", queued_at');
const zoneV = gpj.slice(iV, iV + 2200);
ok(/visite de contrôle NON posée \(\$\{eN \? eN\.message : "aucune ligne écrite/.test(zoneV), "une ligne avalée sans erreur est DITE (journal), plus jamais muette");
ok(!/declencheur: "controle_blocage_lbc", devant: true/.test(gpj), "jamais servie « devant » (la garde de pause de l'extension ≥ 0.6.170 la refuserait)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ aucun relevé du serveur n'est avalé en silence ; le miroir de l'app suit la base");
