// Verrou « get-pending-jobs sous le plafond de 5 Mo » (20/11, point 1 de Nico).
//
// La nuit du 20/11, deux déploiements de get-pending-jobs ont été refusés par Supabase (413, « Function source code
// exceeds the maximum deployment size (5 MB) ») pour quelques centaines d'octets : le graphe local faisait 4,69 Mo.
// Découpe sans changement de comportement (code DÉPLACÉ tel quel, ré-exporté sous les mêmes noms) :
//   · src/utils/iconeObjet.js  ← detectType + l'icône d'objet (sortis de src/utils/shared.js) ;
//   · _shared/restriction-vinted.js ← restrictionVinted, sa phrase, acte(), rienTouche() (sortis de pas-de-rouge.js).
// get-pending-jobs importe ces deux petits modules au lieu de shared.js (341 Ko tirés) et de pas-de-rouge.js (145 Ko).
//
// Ce test échoue si :
//   1. le graphe local de get-pending-jobs (deno info) dépasse BUDGET octets (marge sous le refus constaté à ~4,67 Mo) ;
//   2. shared.js ou pas-de-rouge.js reviennent dans le graphe ;
//   3. les ré-exports ne sont plus les MÊMES fonctions (shared.js ↔ iconeObjet.js, pas-de-rouge.js ↔ restriction-vinted.js).
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUDGET = 4_600_000;
let echecs = 0;
const ok = (c, m) => { console.log(`${c ? "✓" : "✗"} ${m}`); if (!c) echecs++; };

// ── 1-2. Le graphe ────────────────────────────────────────────────────────────
const brut = execFileSync("deno", ["info", "--json", pathToFileURL(join(RACINE, "supabase/functions/get-pending-jobs/index.ts")).href], {
  encoding: "utf8", maxBuffer: 64 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"],
});
const info = JSON.parse(brut);
const locaux = info.modules.filter((m) => String(m.specifier).startsWith("file:"));
const total = locaux.reduce((s, m) => s + (m.size || 0), 0);
const erreurs = info.modules.filter((m) => m.error);
ok(erreurs.length === 0, `graphe résolu sans erreur (${erreurs.map((m) => m.specifier).join(", ") || "aucune"})`);
ok(total > 1_000_000 && total <= BUDGET, `graphe local ${total} octets ≤ ${BUDGET} (${locaux.length} fichiers)`);
const dans = (fin) => locaux.some((m) => String(m.specifier).endsWith(fin));
ok(!dans("/src/utils/shared.js"), "src/utils/shared.js n'est pas dans le graphe");
ok(!dans("/_shared/pas-de-rouge.js"), "_shared/pas-de-rouge.js n'est pas dans le graphe");
ok(dans("/src/utils/iconeObjet.js") && dans("/_shared/restriction-vinted.js"), "les deux petits modules sont bien ceux importés");

// ── 3. Mêmes fonctions, mêmes noms ────────────────────────────────────────────
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const S = await imp("src/utils/shared.js");
const I = await imp("src/utils/iconeObjet.js");
const nomsIcone = ["detectType", "SUPPORT_NON_LIVRE_RE", "LIVRE_EXPLICITE_RE", "estSupportNonLivre", "detectObjectIconKeyword",
  "zonesObjetAccessoireTexte", "zonesContenantBijoux", "estContenantDeBijoux", "familleDuCasque", "detectObjectKeywordDetail",
  "titreNommeUneDecorationMurale", "detectObjectIcon", "ALL_OBJECT_ICONS"];
ok(nomsIcone.every((n) => n in I && S[n] === I[n]), "shared.js ré-exporte les 13 noms d'iconeObjet.js (mêmes objets)");
ok(S.detectObjectIcon("Jean Levi's 501 W32", "", "Mode") === "👖" && S.detectType("Robe d'été fleurie", "") === "Mode",
  "detectObjectIcon / detectType rendent comme avant (jean → 👖, robe → Mode)");
const P = await imp("supabase/functions/_shared/pas-de-rouge.js");
const R = await imp("supabase/functions/_shared/restriction-vinted.js");
ok(["restrictionVinted", "messageRestrictionVinted", "rienTouche"].every((n) => typeof R[n] === "function" && P[n] === R[n]),
  "pas-de-rouge.js ré-exporte restrictionVinted, messageRestrictionVinted, rienTouche (mêmes fonctions)");
const r = R.restrictionVinted({ last_diagnostic: { titre: "Compte restreint jusqu'au 26/09/2026", corps: "" } });
ok(r && r.jusquau === "26/09" && /restreint ton compte jusqu'au 26\/09/.test(R.messageRestrictionVinted(r, "republish", {})),
  "restriction Vinted lue et dite comme avant");

if (echecs) { console.log(`\n✗ ${echecs} échec(s)`); process.exit(1); }
console.log("\n✓ get-pending-jobs sous le plafond, découpe sans changement de comportement");
