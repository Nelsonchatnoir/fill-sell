// Autotest — une tâche qui ne démarre jamais ne retient plus la file (03/10, point F)
//   npm run selftest:tache-sans-demarrage
//
// doriane-henri (0.6.89) : guitare Paw Patrol (publication, en file depuis le
// 28/09) et coque A05 (republication, depuis le 27/09) servies à chaque passage
// (toutes les 8 min) et jamais commencées ; cycle de 8 min au lieu de 2.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/tache-sans-demarrage.js")).href);
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const now = Date.parse("2026-10-03T16:00:00Z");
const H = 3600_000;
const resa = (n, ageMs) => ({ servi_n: n, premier_service: new Date(now - ageMs).toISOString() });
const guitare = { id: "4bf31094", platform: "vinted", action: "publish", status: "pending", platform_fields: { verifier_doublon_avant_publication: true } };
const coque = { id: "63b68552", platform: "vinted", action: "republish", status: "pending", platform_fields: { republish_step: "a_capturer" } };

console.log("\n1. LA RÈGLE");
ok(M.tacheAMettreDeCote(guitare, resa(15, 2 * H), now), "servie 15 fois en 2 h sans démarrer → mise de côté (doriane-henri)");
ok(M.tacheAMettreDeCote(coque, resa(12, 3 * H), now), "republication pas encore retirée : idem");
ok(!M.tacheAMettreDeCote(guitare, resa(11, 5 * H), now), "moins de 12 services : on attend encore");
ok(!M.tacheAMettreDeCote(guitare, resa(40, 1 * H), now), "moins de 2 h : on attend encore (une file chargée se vide)");
ok(!M.tacheAMettreDeCote({ ...coque, platform_fields: { republish_step: "deleted" } }, resa(50, 9 * H), now),
  "JAMAIS une republication déjà retirée : l'annonce est hors ligne, on insiste");
ok(!M.tacheAMettreDeCote({ ...guitare, status: "processing" }, resa(50, 9 * H), now), "une tâche en cours n'est pas concernée");
ok(!M.tacheAMettreDeCote(guitare, null, now), "sans réservation lue : rien");
// (04/10, jennifer.cot 9923ee78) l'extension saute exprès une tâche en attente programmée.
ok(!M.tacheAMettreDeCote({ ...coque, platform_fields: { republish_step: "captured", next_action_after: new Date(now + 3 * H).toISOString() } }, resa(61, 9 * H), now),
  "attente programmée (next_action_after futur) : jamais « sans démarrage »");
ok(M.tacheAMettreDeCote({ ...coque, platform_fields: { republish_step: "captured", next_action_after: new Date(now - H).toISOString() } }, resa(61, 9 * H), now),
  "attente échue : la règle s'applique de nouveau");

console.log("\n2. LE TEXTE : ce qui se passe, et le geste — jamais « job »");
const t1 = M.messageTacheSansDemarrage(guitare, resa(15, 30 * 24 * H));
const t2 = M.messageTacheSansDemarrage(coque, resa(15, 30 * 24 * H));
const t3 = M.messageTacheSansDemarrage({ ...guitare, action: "delete" }, resa(15, 30 * 24 * H));
ok(/n'arrive pas à démarrer sur ton ordinateur depuis le/.test(t1) && /Rien n'a été publié sur Vinted/.test(t1) && /Ferme Chrome complètement puis rouvre-le, puis relance-la\./.test(t1), "publication", t1);
ok(/Ton annonce est toujours en ligne sur Vinted, rien n'a été retiré\./.test(t2), "republication : l'annonce est intacte", t2);
ok(/Ton annonce Vinted est toujours en ligne/.test(t3) && /retire l'annonce à la main sur Vinted/.test(t3), "retrait : l'annonce est toujours en ligne, le geste de secours", t3);
ok(![t1, t2, t3].some((t) => /\bjobs?\b|réservation|poste/i.test(t)), "aucun mot de développeur");

console.log("\n3. CÂBLAGE");
const mig = lire("supabase/migrations/20261003190000_reservation_servi_sans_demarrer.sql");
ok(/ADD COLUMN IF NOT EXISTS servi_n integer NOT NULL DEFAULT 1/.test(mig) && /ADD COLUMN IF NOT EXISTS premier_service timestamptz NOT NULL DEFAULT now\(\)/.test(mig), "compteur et date du premier service");
ok(/IF r\.poste=p_poste THEN\s+-- \(03\/10\)[^\n]*\n\s+UPDATE jobs_reservations_extension SET servi_n=servi_n\+1 WHERE job_id=v_id;/.test(mig), "même poste, réservation non commencée : compté");
ok(/servi_n=CASE WHEN jobs_reservations_extension\.poste=EXCLUDED\.poste AND NOT jobs_reservations_extension\.commence\s+THEN jobs_reservations_extension\.servi_n\+1 ELSE 1 END/.test(mig), "réservation renouvelée : le compte continue sur le même poste, repart sinon");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/if \(!tacheAMettreDeCote\(j, resa\)\) continue;/.test(gpj) && /\.update\(\{ status: "needs_user", error: messageTacheSansDemarrage\(j, resa\), platform_fields: pf \}\)\s+\.eq\("id", j\.id as string\)\.eq\("status", "pending"\)/.test(gpj),
  "get-pending-jobs : mise de côté conditionnelle, la file servie sans elle");
const stock = lire("src/tabs/StockTab.jsx");
ok(/'tache_sans_demarrage',\s*\n\];/.test(stock) && /delete pf\.tache_sans_demarrage;/.test(stock), "app : la relance la remet en file");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ une tâche qui ne démarre jamais passe à la personne ; la file passe");
