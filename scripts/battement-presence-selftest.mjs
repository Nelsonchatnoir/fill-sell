// ═══════════════════════════════════════════════════════════════════════════
// LA PRÉSENCE BAT AUSSI PENDANT UN LONG TRAVAIL (29/10, point 5 — Johan Désiré, 098cab75)
// `npm run selftest:battement-presence` — branchements : extension (battement sous le verrou, borné), RPC
// battement_extension (une écriture, anti-rafale), get-pending-jobs (retour du poste), handler-watch (un job sur
// lequel le poste bat n'est jamais repris ni annoncé « ordinateur arrêté »).
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, msg) => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}`); } };

console.log("1. Extension : un battement tant qu'un flux tient le verrou");
const bg = lire("chrome-extension/background.js");
const v = bg.indexOf("function withJobFlowLock(label, fn) {");
const verrou = bg.slice(v, v + 900);
ok(/const arreterBattement = demarrerBattementPresence\(label\);/.test(verrou) && /finally \{\s*arreterBattement\(\);\s*travailEnCours = null;/.test(verrou),
  "withJobFlowLock démarre le battement et l'arrête à la sortie du flux (travail effacé)");
ok(/const BATTEMENT_PRESENCE_MS = 5 \* 60_000;/.test(bg) && /const BATTEMENT_PRESENCE_MAX = 36;/.test(bg), "toutes les 5 min, 36 battements au plus (3 h) par flux");
const b = bg.indexOf("function demarrerBattementPresence(label) {");
const corps = bg.slice(b, b + 1400);
ok(b > 0 && !/setInterval/.test(corps) && /setTimeout\(tic, BATTEMENT_PRESENCE_MS\)/.test(corps), "minuteur en chaîne borné, jamais un setInterval");
ok(/restRequest\("rpc\/battement_extension"/.test(corps) && !/callEdgeFunction/.test(corps), "une RPC PostgREST, aucune fonction edge");
ok(/Date\.now\(\) - dernierSigneDeVieEnvoye >= BATTEMENT_PRESENCE_MS - 15_000/.test(corps), "pas de battement si un poll a stampé depuis moins de 5 min");
ok(/dernierSigneDeVieEnvoye = Date\.now\(\);   \/\/ \(29\/10\) ce poll a stampé/.test(bg), "le poll réussi remet le compteur");
const pj = bg.indexOf("async function processJob(rawJob, accessToken) {");
ok(pj > 0 && /travailEnCours = \{ job: String\(rawJob\?\.id/.test(bg.slice(pj, pj + 600)), "processJob dit quel job est en cours");
ok(/const outcome = await processJob\(job, session\.access_token\);\n    travailEnCours = null;/.test(bg), "la boucle du cycle l'efface après la tâche");

console.log("\n2. RPC battement_extension");
const sql = lire("supabase/migrations/20261029150000_battement_extension.sql");
ok(/security definer/.test(sql) && /set search_path = public, pg_temp/.test(sql) && /v_uid uuid := auth\.uid\(\);/.test(sql), "security definer, search_path, le compte du JWT seulement");
ok(/auth\.jwt\(\) ->> 'session_id'/.test(sql), "le poste = claim session_id (la clé de get-pending-jobs)");
ok(/battement_le', ''\)\s*< to_char\(\(now\(\) - interval '60 seconds'\)/.test(sql), "anti-rafale par poste : rien d'écrit à moins de 60 s");
ok(/revoke all on function public\.battement_extension\(jsonb\) from public, anon;/.test(sql) && /grant execute on function public\.battement_extension\(jsonb\) to authenticated;/.test(sql), "réservée aux comptes connectés");
ok(!/\bselect\b[^;]*\bfrom\b/i.test(sql.replace(/--.*$/mg, "")), "aucune lecture de table");

console.log("\n3. Serveur");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/if \(!Number\.isFinite\(leAvant\) \|\| Date\.now\(\) - leAvant > 10 \* 60_000\) patchPoste\.vivant_depuis = patchPoste\.le;/.test(gpj), "get-pending-jobs date le retour du poste (vivant_depuis)");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok((hw.match(/if \(travailleEncore\(j, (prise|since)\)\) continue;/g) ?? []).length === 2, "handler-watch : ni 'deleted' ni 'captured' repris sous un poste qui bat sur le job");
ok(/const TRAVAIL_EN_COURS_MAX_MS = 2 \* 3600_000;/.test(hw), "borne : 2 h, comme le plafond des reprises");

console.log(`\n${rouges === 0 ? "✓" : "✗"} battement-presence : ${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
