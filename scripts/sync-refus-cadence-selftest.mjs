// « SYNCHRONISER » NE REFUSE JAMAIS EN SILENCE, NI SUR UN STOCK VIDE (08/11, ayadi007)
//   node scripts/sync-refus-cadence-selftest.mjs
// Cas : ayadi007 réinitialise son inventaire à 11:00:38 ; à 11:01:16 le repli par la file reçoit l'EXCEPTION
// « SYNC_CADENCE » du déclencheur garde_cadence_sync_runs (qui n'avait pas la règle « stock vide » du 26/10) et l'app
// affiche « La demande n'a pas pu être envoyée. Réessaie dans un instant. » — faux motif.
// Gardé ici : (1) l'erreur SYNC_CADENCE devient un refus « cadence » (jamais « erreur ») ; (2) le texte dit un FAIT au
// passé (« lues il y a 8 min »), jamais une heure prévue (règle du 16/10, selftest:aucune-estimation) ; (3) l'appui
// relance le rangement ; (4) la migration 20261108140000 pose la règle « stock vide » dans le déclencheur.
import fs from "node:fs";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const lire = (p) => fs.readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
let n = 0, ko = 0;
const ok = (c, m, d) => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d !== undefined ? `\n      ${JSON.stringify(d)}` : ""}`); } };

const vs = lire("src/utils/vintedSync.js");
const SYNC_CADENCE_MANUELLE_MS = 15 * 60 * 1000;
ok(/export const SYNC_CADENCE_MANUELLE_MS = 15 \* 60 \* 1000;/.test(vs), "la cadence de l'app vaut 15 min (miroir du serveur)");
const fabrique = (nom) => new Function("SYNC_CADENCE_MANUELLE_MS", `${extraireFonctionJs(vs, nom).replace(/^export /, "")}; return ${nom};`)(SYNC_CADENCE_MANUELLE_MS);
const refus = fabrique("refusCadenceDepuisErreur");
const texte = fabrique("texteLectureRecente");

console.log("\n1. L'exception SYNC_CADENCE est un refus de cadence");
const MSG = "SYNC_CADENCE: dressing synchronisé il y a moins de 15 min (dernier run done: 2026-11-08 09:53:23.434+00)";
const r = refus(MSG);
ok(r?.ok === false && r.reason === "cadence" && r.lu_le === "2026-11-08T09:53:23.434Z", "le message réel d'ayadi007 (11:01:16) → reason « cadence », lu_le = 09:53:23 UTC", r);
ok(refus("SYNC_CADENCE: dressing synchronisé il y a moins de 15 min")?.reason === "cadence", "sans date lisible : « cadence » quand même (jamais « erreur »)");
ok(refus("permission denied for table vinted_sync_runs") === null && refus(null) === null, "toute autre erreur : rien (l'appelant garde « erreur »)");
ok(/const cadence = refusCadenceDepuisErreur\(error\.message\);\s*if \(cadence\) return cadence;/.test(vs), "demanderSyncDressingServeur rend ce refus au lieu de « erreur »");

console.log("\n2. Le texte dit un fait au passé, jamais une heure prévue");
const t0 = Date.parse("2026-11-08T10:01:16Z");
ok(texte(r, "fr", t0) === "il y a 8 min" && texte(r, "en", t0) === "8 min ago", "« il y a 8 min » à 11:01:16 (lu à 10:53:23)", texte(r, "fr", t0));
ok(texte({ prochaine_dans_min: 4 }, "fr", t0) === "il y a 11 min", "depuis demander_sync_dressing (« prochaine_dans_min » = 4) : lu il y a 11 min");
ok(texte({}, "fr", t0) === null, "rien de lisible : null (l'écran dit « à l'instant »)");
ok(!/\bdans \$\{|vers \$\{|\bin \$\{/.test(extraireFonctionJs(vs, "texteLectureRecente")), "aucune promesse de délai dans le texte produit");
const st = lire("src/tabs/StockTab.jsx");
const fr = st.slice(st.indexOf("function texteRefusFile(r)"), st.indexOf("function texteRefusFile(r)") + 1600);
ok(/texteLectureRecente\(r, lang\)/.test(fr) && /ont été lues/.test(fr) && /un peu plus tard/.test(fr), "texteRefusFile (« cadence ») : « Tes annonces Vinted ont été lues il y a N min … un peu plus tard »");

console.log("\n3. L'appui n'est jamais un cul-de-sac");
const repli = st.slice(st.indexOf("const replierSurLaFile = async"), st.indexOf("function texteRefusFile(r)"));
ok(/if \(r\?\.reason === 'cadence'\) supabase\.rpc\('synchro_relancer_rangement'\)/.test(repli), "repli par la file : un refus de cadence relance le rangement");
const lancer = st.slice(st.indexOf("const lancer = async"), st.indexOf("const replierSurLaFile = async"));
ok(/if \(r\?\.reason === 'cadence'\) supabase\.rpc\('synchro_relancer_rangement'\)/.test(lancer), "voie file de « Synchroniser » : idem");

console.log("\n4. Le serveur : pas de cadence sur un stock vide, dans le déclencheur aussi");
const m = lire("supabase/migrations/20261108140000_cadence_stock_vide_garde_runs.sql");
const corps = m.slice(m.indexOf("CREATE OR REPLACE FUNCTION public.garde_cadence_sync_runs()"));
ok(/and exists \(select 1 from inventaire i where i\.user_id = new\.user_id and i\.statut = 'stock' and i\.fusionne_dans is null\) then\s*raise exception 'SYNC_CADENCE/.test(corps),
  "garde_cadence_sync_runs : SYNC_CADENCE seulement si un article est au stock (même condition que demander_sync_dressing)");
ok(/if new\.declencheur = 'cron' then[\s\S]*SYNC_CRON_SANS_PREMIERE_SYNC[\s\S]*SYNC_CRON_CADENCE/.test(corps), "le cron garde ses deux règles (jamais d'inauguration, 20 h)");
ok(/md5\(v_d\) <> '55eb8af87d77ca0d6edbcc7c8ee08d45'/.test(m) && fs.existsSync(new URL("../supabase/rollbacks/20261108140000_cadence_stock_vide_garde_runs_INVERSE.sql", import.meta.url)),
  "garde md5 de la prod du 08/11 et inverse présents");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ ${n}/${n} — « Synchroniser » ne refuse jamais en silence`);
process.exit(ko ? 1 : 0);
