// Autotest : LA SYNCHRO APRÈS « RÉINITIALISER » (26/10, bloc B — tests de Nico du matin).
//
//     npm run selftest:synchro-reinitialiser
//
// B1 : une annonce en ligne sans fiche est importée ou rattachée, déjà en base ou non — la « dette Beebs » (un dépôt
//      sans numéro) ne retient plus que les annonces apparues APRÈS ce dépôt (essai annulé du 26/10 sur le compte de
//      Nico : 10 annonces Beebs en ligne sur 10 réimportées, celle « en vérification » non).
// B2 : seul un « déconnecté » prouvé ou une plateforme jamais utilisée restent hors de la synchro ; un relevé passé
//      qui a lu des annonces vaut « déjà relevée » ; une sonde muette (403) n'efface plus un état connu.
// B3 : pas de cadence anti-rafale sur un stock vide (app, extension, serveur).
// B4 : « Rapprochement : terminé » seulement quand tous les relevés de la vague sont arrivés.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
let ko = 0;
const ok = (c, m, detail) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ""}`); } };

console.log("B1. La dette Beebs bornée (migration préparée, appliquée seulement sur feu vert)");
const mig = lire("supabase/migrations/20261026150000_synchro_stock_vide_dette_beebs.sql");
const inv = lire("supabase/rollbacks/20261026150000_synchro_stock_vide_dette_beebs_INVERSE.sql");
ok(/md5\(pg_get_functiondef\('public\.demander_sync_dressing'::regproc\)\) <> 'c64ff51ce7842a772f4214b977563770'/.test(mig)
  && /'d144172bfc61397cbf18fb8034790151'/.test(mig) && /'56a0ffed1c5414290052a3efae3c9e15'/.test(mig), "garde md5 des trois corps de prod du 26/10");
ok(/IF a\.platform = 'beebs' AND releve_dette_beebs_depuis\(p_user, COALESCE\(a\.publiee_le, a\.created_at\)\) THEN RETURN NULL; END IF;/.test(mig), "fiche_de : la dette ne retient que les annonces apparues après le dépôt");
ok(/COALESCE\(j\.published_at, j\.created_at\) <= p_vu \+ interval '10 minutes'/.test(mig), "« après le dépôt » : 10 min de marge, jamais une heure");
ok(/REVOKE ALL ON FUNCTION public\.releve_dette_beebs_depuis\(uuid, timestamptz\) FROM PUBLIC, anon, authenticated;/.test(mig), "la nouvelle fonction naît sans droit public");
ok(/DROP FUNCTION IF EXISTS public\.releve_dette_beebs_depuis\(uuid, timestamptz\);/.test(inv) && /IF a\.platform = 'beebs' AND releve_dette_beebs\(p_user\) THEN RETURN NULL; END IF;/.test(inv), "l'inverse remet les corps d'avant");

console.log("B2. « Inconnu » n'exclut plus une plateforme déjà relevée");
const hook = lire("src/annonces/useReleveAnnonces.js");
ok(/\.\.\.Object\.entries\(runs \?\? \{\}\)\.filter\(\(\[, x\]\) => Number\(x\?\.items_vus\) > 0 \|\| Number\(x\?\.total_entries\) > 0\)\.map\(\(\[p\]\) => p\),/.test(hook), "un relevé passé qui a lu des annonces = déjà relevée");
const { ciblesReleve } = await import(pathToFileURL(join(ROOT, "src/annonces/synchroniser.js")).href);
const cibles = ciblesReleve({ plateformes: ["vinted", "leboncoin", "beebs", "ebay", "depop"], choisies: ["vinted"], sessions: { leboncoin: null, beebs: null }, dejaRelevees: ["leboncoin", "beebs", "depop"] });
ok(["leboncoin", "beebs", "depop"].every((p) => cibles.includes(p)) && !cibles.includes("ebay"), "cas de 11:02 : Leboncoin et Beebs (relus à 10:36) repartent ; eBay jamais utilisée reste dehors", cibles);
const bg = lire("chrome-extension/background.js");
const iB = bg.indexOf("UNE SONDE MUETTE N'EFFACE PAS UN ÉTAT CONNU");
const blocB = bg.slice(iB, iB + 2200);
ok(iB > 0 && /if \(releve\[pf\] !== null && releve\[pf\] !== undefined\) continue;\n\s+if \(typeof prev\[pf\] !== "boolean"\) continue;\n\s+fusion\[pf\] = prev\[pf\];/.test(blocB), "sonde muette : la valeur connue reste");
ok(/fusion\.checked_at_par_plateforme\[pf\] = prevPar\[pf\] \?\? prev\.checked_at \?\? null;/.test(blocB), "… avec SA date d'origine (les lecteurs jugent la fraîcheur)");
ok(!/fusion\.vinted_identite = prev/.test(blocB), "l'identité de boutique Vinted n'est jamais reprise");

console.log("B3. Pas de cadence sur un stock vide");
const stock = lire("src/tabs/StockTab.jsx");
ok(/const enCadence = !enCours && cadenceFinA > Date\.now\(\) && source !== 'stock_empty';/.test(stock), "app : stock vide = l'appui lance la synchro");
ok(/async function stockVideCadence\(token, userId\)/.test(bg) && (bg.match(/SYNC_MANUAL_COOLDOWN_MS && !\(await stockVideCadence\(token, userId\)\)/g) ?? []).length === 2, "extension : les deux cadences manuelles sautent sur un stock vide");
ok(/and exists \(select 1 from inventaire i where i\.user_id = v_user and i\.statut = 'stock' and i\.fusionne_dans is null\) then/.test(mig)
  && /AND EXISTS \(SELECT 1 FROM inventaire i WHERE i\.user_id = v_user AND i\.statut = 'stock' AND i\.fusionne_dans IS NULL\) THEN/.test(mig), "serveur : les deux raccourcis de 15 min seulement si le stock n'est pas vide");

console.log("B4. « Terminé » à la fin de tous les relevés");
const bloc = lire("src/stock/BlocSynchro.jsx");
ok(/const relevesEnVol = Array\.isArray\(av\?\.releves\) && av\.releves\.some\(\(x\) => x\.status === 'queued' \|\| x\.status === 'running'\);/.test(bloc), "relevés en file ou en cours lus");
ok(/const rapFini = !!rap && rap\.etat === 'termine' && !relevesEnVol;/.test(bloc) && /ton: rapFini \? 'fait' : 'neutre',\n\s+etat: rapFini \? T\.ligneFini/.test(bloc), "la ligne Rapprochement ne dit « fini » qu'une fois tous les relevés arrivés");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
