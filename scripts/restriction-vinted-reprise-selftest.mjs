// ═══════════════════════════════════════════════════════════════════════════
// APRÈS UNE RESTRICTION VINTED (26/10, Johan DÉSIRÉ — Nico) — `npm run selftest:restriction-vinted-reprise`
// ═══════════════════════════════════════════════════════════════════════════
// Johan, restreint jusqu'au 09/11 : 49 republications retenues, toutes reprogrammées à la même minute. Vérifié ici
// (code livré) :
//   1. le message COMPLET de la page de Vinted est gardé sur le compte (platform_settings.vinted.restriction), une
//      écriture par restriction, par platform_settings_fusionner ;
//   2. la file repart par paliers : au plus coin_config.vinted_reprise_restriction_jour par jour de Paris (défaut 10),
//      une à la fois, 45 min au moins entre deux, marquées ; le reste attend, sans rien perdre ; jamais une réécriture
//      d'une ligne inchangée.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, msg) => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}`); } };

const ujs = lire("supabase/functions/update-job-status/index.ts");
const bloc = ujs.slice(ujs.indexOf("(26/10, Johan DÉSIRÉ — Nico) Une restriction Vinted"), ujs.indexOf("(26/10, Johan DÉSIRÉ — Nico) Une restriction Vinted") + 2600);
console.log("1. Le message complet, gardé sur le compte");
ok(/sortie\.motif === "compte_restreint" && String\(jPdr\?\.platform \?\? ""\) === "vinted"/.test(bloc), "seulement une restriction Vinted classée par pas-de-rouge");
ok(/String\(diag\["corps"\] \?\? ""\)/.test(bloc) && /slice\(0, 4000\)/.test(bloc), "le titre ET le corps de la page (4 000 caractères), jamais le seul titre");
ok(/rpc\("platform_settings_fusionner", \{\s*p_chemin: \["vinted", "restriction"\]/.test(bloc), "écrit par platform_settings_fusionner (jamais l'objet entier)");
ok(/deja\["jusquau"\] !== r\.jusquau/.test(bloc), "une écriture par restriction : la même date n'est pas réécrite");

const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const g = gpj.slice(gpj.indexOf("APRÈS UNE RESTRICTION VINTED, LA FILE REPART PAR PALIERS"), gpj.indexOf("APRÈS UNE RESTRICTION VINTED, LA FILE REPART PAR PALIERS") + 5200);
console.log("\n2. La reprise par paliers (get-pending-jobs)");
ok(/\["compte_restreint", "compte_restreint_echu"\]\.includes/.test(g), "les tâches retenues par la restriction, et elles seules");
ok(/vinted_reprise_restriction_jour/.test(g) && /: 10;/.test(g), "un plafond par jour (coin_config, défaut 10)");
ok(/toLocaleDateString\("en-CA", \{ timeZone: "Europe\/Paris" \}\)/.test(g), "le jour de Paris");
ok(/45 \* 60_000/.test(g), "45 min au moins entre deux reprises");
ok(/const j = apresRestriction\[0\];/.test(g) && /\.eq\("status", "pending"\)\.select\("id"\)/.test(g), "une seule par passage, marquée sous garde « pending »");
ok(/\|\| \(j as \{ error\?: unknown \}\)\.error === attenteR\) continue;/.test(g), "aucune ligne inchangée réécrite (le message n'est posé qu'une fois)");
ok(/catch \(_e\) \{ \/\* jamais un point de panne/.test(g), "illisible : la file part comme avant");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
