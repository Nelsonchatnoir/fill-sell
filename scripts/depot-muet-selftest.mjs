// Autotest — un dépôt « muet » se compte depuis sa dernière remise en file —
// `npm run selftest:depot-muet` (_shared/depot-muet.js).
// Cas réel du 15/10 : geronimo, Beebs 14887481 (« Le Livre des Louveteaux »),
// créé le 03/10 23:58, remis en file à la main le 15/10 au soir, ANNULÉ par
// handler-watch à 20:03 (« restée en attente trop longtemps », 11 jours).
// Glowik 2c38bff2 (créé le 06/10, relancé le 15/10) l'aurait été le 16/10.
import { depuisDerniereRemiseEnFile, depotMuetDepuis } from "../supabase/functions/_shared/depot-muet.js";
import fs from "node:fs";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const maintenant = Date.parse("2026-10-15T18:03:01Z");

console.log("\n1. CRÉÉ IL Y A 11 JOURS, JAMAIS RELANCÉ → MUET");
const brut = { created_at: "2026-10-03T21:58:04Z", platform_fields: {} };
ok(depotMuetDepuis(brut, { maintenant }).muet === true, "geronimo sans relance : muet (11 j)");

console.log("\n2. TOUTE REMISE EN FILE FAIT REPARTIR LE COMPTEUR");
const parBase = { ...brut, platform_fields: { remis_en_file_le: "2026-10-15T17:30:00Z" } };
ok(depotMuetDepuis(parBase, { maintenant }).muet === false, "remis_en_file_le (déclencheur de la base) : pas muet");
const parApp = { ...brut, platform_fields: { derniere_relance_manuelle: "2026-10-15T17:30:00Z" } };
ok(depotMuetDepuis(parApp, { maintenant }).muet === false, "derniere_relance_manuelle (app) : pas muet");
const parArchive = { ...brut, platform_fields: { erreurs_archivees: [{ le: "2026-10-15T17:30:00Z", par: "relance_manuelle", statut: "needs_user" }] } };
ok(depotMuetDepuis(parArchive, { maintenant }).muet === false, "archive écrite par une relance : pas muet");
const parClos = { ...brut, platform_fields: { pending_muet_clos_le: "2026-10-10T10:00:00Z" } };
ok(depotMuetDepuis(parClos, { maintenant }).muet === false, "fermeture précédente : le compteur repart (règle du 20/09 gardée)");
ok(depuisDerniereRemiseEnFile({ created_at: "2026-10-03T21:58:04Z", platform_fields: { remis_en_file_le: "2026-10-01T00:00:00Z" } }) === Date.parse("2026-10-03T21:58:04Z"),
  "une date plus ancienne que la création ne recule jamais le compteur");

console.log("\n3. CE QUI NE FAIT PAS REPARTIR");
const archiveTechnique = { ...brut, platform_fields: { erreurs_archivees: [{ le: "2026-10-14T10:00:00Z", par: "update-job-status → pending (reprise)", statut: "processing" }] } };
ok(depotMuetDepuis(archiveTechnique, { maintenant }).muet === true, "une reprise technique (processing → pending) n'est pas une remise en file");
const pause = { created_at: "2026-10-03T21:58:04Z", platform_fields: { antirobot_pause_cumul_ms: 3 * 86400000 } };
ok(depotMuetDepuis(pause, { maintenant }).muet === false, "pause anti-robot déduite (règle du 25/09 gardée)");

console.log("\n4. LE BALAYAGE L'UTILISE");
const hw = fs.readFileSync(new URL("../supabase/functions/handler-watch/index.ts", import.meta.url), "utf8");
ok(/depotMuetDepuis\(j, \{ maintenant: now, jours: PENDING_MUET_JOURS \}\)/.test(hw), "handler-watch juge les dépôts muets par depotMuetDepuis");
ok(!/const depuis = Number\.isFinite\(clos\) \? Math\.max\(ne, clos\) : ne;/.test(hw), "l'ancien calcul (création ou fermeture seules) a disparu");

console.log(ko ? `\n${ko} ÉCHEC(S)` : "\nTOUT VERT");
process.exit(ko ? 1 : 0);
