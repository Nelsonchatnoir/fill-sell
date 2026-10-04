// Autotest — un même échec répété sort de la boucle, et y reste (04/10, Ciddjy)
//   npm run selftest:boucle-technique
//
// Ciddjy (cielmo, 0.6.89) : republications Vinted rejouées jusqu'à 8 fois,
// « rien à faire de ton côté ». Le remplissage prend 4 à 5 min sur son
// ordinateur, la borne de 5 min le coupait. Sortie de boucle (ujs v124), puis
// remise en file 2 min plus tard par le réveil « capture fraîche » (04/10
// 10:42) : corrigé. Port de maintien en vie allumé compte par compte.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const ujs = lire("supabase/functions/update-job-status/index.ts");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const hw = lire("supabase/functions/handler-watch/index.ts");
const ops = lire("supabase/functions/ops-digest/index.ts");

console.log("\n1. LA SORTIE (update-job-status)");
ok(/const seuilBoucle = canalCoupeParTimeout \? 3 : 4;/.test(ujs), "3ᵉ onglet muet, 4ᵉ canal coupé");
ok(/boucle_technique: \{/.test(ujs) && /needs_user_source: "relancer"|source: "relancer"|"relancer"/.test(ujs), "needs_user « relancer » et trace boucle_technique");
ok(/const nouvelleSerie = Number\.isFinite\(relanceLe\) && \(!Number\.isFinite\(dernierEchec\) \|\| relanceLe > dernierEchec\);/.test(ujs)
  && /const deja = nouvelleSerie \? 0 : Math\.max\(/.test(ujs), "une relance manuelle ouvre une nouvelle série (compteur à zéro)");
ok(/Math\.max\(\s*Date\.parse\(String\(\(\(pfBase\.canal_coupe_derniere/.test(ujs) && /pfBase\.boucle_technique \?\? \{\}\) as Record<string, unknown>\)\["le"\]/.test(ujs),
  "dernier échec = le plus récent des deux traces (reprise, sortie)");

console.log("\n2. ELLE N'Y REVIENT PAS EN SILENCE");
ok(/if \(pfC\.boucle_technique\) continue;/.test(gpj), "get-pending-jobs : le balayage « canal coupé » ne la re-file pas");
const reveil = hw.slice(hw.indexOf("UNE CAPTURE FRAÎCHE ET VALIDE RÉVEILLE LE JOB"));
ok(/if \(pf\.boucle_technique \|\| source === "tache_sans_demarrage"\) continue;/.test(reveil.slice(0, 6000)),
  "handler-watch : une capture fraîche ne réveille ni une sortie de boucle ni une mise de côté");
ok(/\.not\("platform_fields->boucle_technique", "is", null\)/.test(ops), "ops-digest : la sortie de boucle remonte en rouge");

console.log("\n3. LE REMÈDE : LE PORT DE MAINTIEN EN VIE, COMPTE PAR COMPTE");
ok(/\["keepalive"\] === true\) keepaliveActif = true;/.test(gpj) && /from\("profiles"\)\.select\("beta_flags"\)/.test(gpj),
  "get-pending-jobs : profiles.beta_flags.keepalive allume le port pour ce compte");
const bg = lire("chrome-extension/background.js");
ok(/const FILL_BORNE_MS = 10 \* 60_000;/.test(bg) && /if \(!keepaliveActif\) return sendMessageToTab\(tabId, \{ type: "FILL_LISTING", job \}\);/.test(bg),
  "extension : port borné à 10 min, chemin classique (5 min) quand il est éteint");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ un même échec répété sort de la boucle et y reste ; le port s'allume compte par compte");
