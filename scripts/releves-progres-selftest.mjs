// Autotest — relevés figés ou en boucle (03/10, points 28 et 31)
//   npm run selftest:releves-progres
//
// · 31 — doriane-henri : relevé Vinted réclamé à 10:43, « running » à 12:44,
//   page 1, 0 article, ses relevés Leboncoin/Beebs/eBay/Opla en file derrière
//   depuis 10:33. Ornella : relevé demandé par le serveur, 0 article en
//   31 min. Cause : une sonde ou une page de relevé attendait la réponse de
//   l'onglet jusqu'à 300 s — au-delà de la vie d'un worker (5 min) —, la
//   ligne restait « running », le chien de garde ne la voyait qu'après 30 min
//   sur updated_at (que la reprise automatique touchait sans rien lire).
// · 28 — 44310spgl : 63 relevés Opla « veilleur » en 4 jours, tous
//   « absente » (session fermée) — rien n'espaçait le veilleur après un échec.
// RÈGLE DE NICO : un relevé tient en 5 minutes ; un relevé qui ne progresse
// plus rend la place ; un arrêt ne conclut jamais rien.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

console.log("\n1. LA PROGRESSION SE MESURE EN BASE (toutes versions)");
const mig = lire("supabase/migrations/20261003150000_releves_progres_et_veilleur.sql");
ok(/ALTER TABLE public\.vinted_sync_runs ADD COLUMN IF NOT EXISTS progres_le timestamptz;/.test(mig), "colonne progres_le");
ok(/IF NEW\.status = 'running' AND OLD\.status IS DISTINCT FROM 'running' THEN\s+NEW\.progres_le := now\(\);/.test(mig),
  "prise ou ré-ouverture : point de départ de la mesure");
ok(/NEW\.items_vus IS DISTINCT FROM OLD\.items_vus\s+OR NEW\.page_suivante IS DISTINCT FROM OLD\.page_suivante/.test(mig) && !/NEW\.updated_at IS DISTINCT FROM/.test(mig) && !/NEW\.erreur IS DISTINCT FROM/.test(mig),
  "avance sur une page, des articles lus/créés/mis à jour — jamais sur une simple écriture d'heure ou d'erreur");
ok(/BEFORE INSERT OR UPDATE ON public\.vinted_sync_runs/.test(mig), "posée par un déclencheur de la base");

console.log("\n2. LE CHIEN DE GARDE : 5 MIN SANS PROGRESSION, ET RIEN DE CONCLU");
const hw = lire("supabase/functions/handler-watch/index.ts");
ok(/const SYNC_RUN_SANS_PROGRES_MIN = 5;/.test(hw), "5 minutes (avant : 30)");
ok(/\.or\(`progres_le\.lt\.\$\{muetIso\},and\(progres_le\.is\.null,updated_at\.lt\.\$\{muetIso\}\)`\);/.test(hw), "jugé sur la progression (updated_at seulement pour une ligne d'avant la colonne)");
ok(/const muetDepuis = Math\.round\(\(now - Date\.parse\(String\(r\.progres_le \?\? r\.updated_at \?\? ""\)\)\) \/ 60_000\);/.test(hw), "la durée dite est celle sans progression");
ok(/status: "expired",/.test(hw) && /\[arret-sans-progres\]/.test(hw), "arrêt = « expired » (jamais lu comme un relevé), raison lisible dans les journaux");
ok(/status: "done",\s+finished_at: new Date\(now\)\.toISOString\(\),[\s\S]{0,200}erreur:\s+`\[incomplet\] relevé interrompu après la lecture de la liste/.test(hw),
  "liste déjà écrite : clos « [incomplet] » — le moteur ne date AUCUNE disparition sur un relevé incomplet");

console.log("\n3. L'EXTENSION NE TIENT PLUS LA PLACE (0.6.90)");
const bg = lire("chrome-extension/background.js");
ok(/sendMessageToTab\(id, \{ type: "VINTED_CURRENT_USER" \}, 30_000\)/.test(bg), "sonde de session du relevé Vinted : 30 s (avant : 300 s)");
ok(/sendMessageToTab\(id, \{ type: "SYNC_DRESSING_PAGE", page, userId: ident\.userId \}, 60_000\)/.test(bg), "page du dressing : 60 s");
ok(/sendMessageToTab\(tabId, \{ type: "OPLA_LISTE_ARTICLES" \}, 90_000\)/.test(bg) && /type: "OPLA_CAPTURE_ARTICLE", listingId: String\(a\.listing_id\) \}, 45_000\)/.test(bg), "liste et fiches Opla : 90 s et 45 s");
ok(/const CAPTURE_BUDGET_MS = 120_000;/.test(bg) && /if \(!sansPage && Date\.now\(\) - debutCaptures > CAPTURE_BUDGET_MS\) \{\s+bilan\.restantes \+= 1;\s+continue;/.test(bg),
  "captures de fiches : 2 min de pages ouvertes au plus, la suite au relevé suivant (rien de perdu)");

console.log("\n4. LE VEILLEUR S'ESPACE APRÈS UN ÉCHEC (toutes versions)");
ok(/EXIT WHEN r\.status = 'done';/.test(mig) && /status IN \('done', 'absente', 'failed', 'expired', 'interrupted', 'incomplete'\)/.test(mig), "série d'échecs comptée jusqu'au dernier relevé réussi");
ok(/WHEN v_echecs = 1 THEN interval '1 hour'\s+WHEN v_echecs = 2 THEN interval '3 hours'\s+ELSE interval '6 hours' END;/.test(mig), "1 h, 3 h, puis 6 h (44310spgl : de ~96 par jour à 4 au plus)");
ok(/IF NEW\.kind IS DISTINCT FROM 'annonces'\s+OR NEW\.declencheur IS DISTINCT FROM 'veilleur'/.test(mig), "le veilleur seul — un relevé demandé depuis l'app part toujours");
ok(/RAISE EXCEPTION 'RELEVE_ECHEC_ESPACE:/.test(mig), "refus nommé (lisible dans les journaux de l'extension)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ relevés : 5 min sans progression rendent la place, le veilleur ne boucle plus, rien n'est conclu sur un arrêt");
