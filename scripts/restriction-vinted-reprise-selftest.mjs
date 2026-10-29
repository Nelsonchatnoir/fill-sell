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
import { fileURLToPath, pathToFileURL } from "node:url";

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
ok(/const apresRestriction = out\.filter\(\(j\) => estApresRestrictionVinted\(j\)\);/.test(g)
  && /import \{ estApresRestrictionVinted \} from "\.\.\/_shared\/reprise-apres-restriction\.js";/.test(gpj),
  "les tâches retenues par la restriction, et elles seules (_shared/reprise-apres-restriction.js)");
ok(/vinted_reprise_restriction_jour/.test(g) && /: 10;/.test(g), "un plafond par jour (coin_config, défaut 10)");
ok(/toLocaleDateString\("en-CA", \{ timeZone: "Europe\/Paris" \}\)/.test(g), "le jour de Paris");
ok(/45 \* 60_000/.test(g), "45 min au moins entre deux reprises");
ok(/const j = apresRestriction\[0\];/.test(g) && /\.eq\("status", "pending"\)\.select\("id"\)/.test(g), "une seule par passage, marquée sous garde « pending »");
ok(/\|\| \(j as \{ error\?: unknown \}\)\.error === attenteR\) continue;/.test(g), "aucune ligne inchangée réécrite (le message n'est posé qu'une fois)");
ok(/catch \(_e\) \{ \/\* jamais un point de panne/.test(g), "illisible : la file part comme avant");

// (29/10, lot B 4.10) Qui est une tâche « après restriction » — exécuté (module pur).
console.log("\n3. (29/10, lot B 4.10) Les tâches retenues par la garde du serveur passent aussi par les paliers");
const R = await import(pathToFileURL(join(RACINE, "supabase/functions/_shared/reprise-apres-restriction.js")).href);
const fin = "2026-11-05T22:59:59.000Z";   // famouus-x3 (02ca0f20), 11 tâches retenues jusqu'au 05/11
const tache = (pf, platform = "vinted") => ({ id: "x", platform, action: "republish", status: "pending", platform_fields: pf });
const serveur = tache({ next_action_after: "2026-11-05T23:04:59.000Z", restriction_compte: { jusquau: "05/11/2026", fin, pose_le: "2026-10-29T10:00:00Z" } });
const le = (iso) => Date.parse(iso);
ok(R.retenueParRestrictionVinted(serveur), "restriction_compte posée par get-pending-jobs (aucun pas_de_rouge) : retenue par la restriction");
ok(!R.estApresRestrictionVinted(serveur, le("2026-10-30T12:00:00Z")), "pendant la restriction : pas encore son tour (jamais comptée dans le palier avant la fin)");
ok(!R.estApresRestrictionVinted(serveur, le("2026-11-05T23:01:00Z")), "fin passée mais échéance (fin + 5 min) pas venue : la garde de l'échéance l'écarterait — pas comptée");
ok(R.estApresRestrictionVinted(serveur, le("2026-11-06T08:00:00Z")), "le 06/11 : par les paliers (avant : 11 reparties à la suite)");
ok(!R.estApresRestrictionVinted({ ...serveur, platform_fields: { ...serveur.platform_fields, reprise_restriction_jour: "2026-11-06" } }, le("2026-11-06T08:00:00Z")), "déjà marquée reprise du jour : son tour est venu, jamais deux fois");
ok(!R.estApresRestrictionVinted(tache({ restriction_compte: { fin } }, "beebs"), le("2026-11-06T08:00:00Z")), "une autre plateforme : jamais");
ok(R.estApresRestrictionVinted(tache({ pas_de_rouge: { motif: "compte_restreint_echu" } }), le("2026-11-06T08:00:00Z")), "pas-de-rouge compte_restreint_echu : comme avant");
const pdr = tache({ pas_de_rouge: { motif: "compte_restreint" }, next_action_after: "2026-11-09T23:04:59.000Z" });
ok(!R.estApresRestrictionVinted(pdr, le("2026-11-01T08:00:00Z")) && R.estApresRestrictionVinted(pdr, le("2026-11-10T08:00:00Z")),
  "pas-de-rouge compte_restreint : son échéance d'abord (avant : marquée pendant la restriction, puis libre de tout palier)");
ok(!R.estApresRestrictionVinted(tache({}), le("2026-11-06T08:00:00Z")) && !R.estApresRestrictionVinted(tache({ restriction_compte: { fin: "pas une date" } }), le("2026-11-06T08:00:00Z")),
  "aucune trace de restriction (ou une date illisible) : hors de la règle");

console.log(`\n${rouges ? `✗ ${rouges} RATÉ(S)` : "✓ tout est vert"} — ${verts} vérifications`);
process.exit(rouges ? 1 : 0);
