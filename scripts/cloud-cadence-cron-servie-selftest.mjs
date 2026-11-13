// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// VERROU C3 — UN CLIENT CLOUD QUI SYNCHRONISE CHAQUE JOUR GARDE SON RELEVÉ VINTED AUTOMATIQUE (14/11, bloc C3)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
//   npm run selftest:cloud-cadence-cron-servie
//   SELFTEST_BACKGROUND=<background.js d'une copie servie> : la même preuve sur la copie qu'un navigateur exécute
//   (ex. la copie Cloud commune lue sur le serveur : /srv/fillsell-cloud/extension/background.js, lecture seule).
// Le constat (13/11, lecture seule) : compte f0acd3af (essai Cloud), 23 relevés Vinted en 7 jours, TOUS sur
// « Synchroniser » (bouton_distant), 0 automatique depuis le 03/11 12:40. L'alarme quotidienne du navigateur Cloud
// tombe pourtant chaque jour (15:51, heure de Paris, la même minute que les quatre autres comptes Cloud qui, eux, ont
// leur relevé automatique) : refusée par la cadence, notée sur le relevé du geste (« [note] cadence cron : 1 sync 'cron'
// refusée(s) … dernière le 2026-11-13T14:51:14.946Z »). La copie Cloud servie (0.6.186, 2026-11-10T14:40:43Z+ba77b92-cloud)
// compte TOUS les relevés réussis dans ses 20 h : un geste du matin fait refuser l'alarme de l'après-midi, chaque jour.
// Même règle que sur ordinateur (bloc 6 du 13/11 : 28 comptes sans aucun relevé automatique en 7 jours, refusés) —
// rien de propre au Cloud. La règle corrigée (0.6.187, decisionCadenceCron : seuls les relevés AUTOMATIQUES comptent ;
// miroir SQL 20261113170500, APPLIQUÉ en prod) n'est simplement pas encore servie aux navigateurs Cloud.
// ⛔ La cadence (20 h entre deux relevés automatiques) est inchangée et reverrouillée ici.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FICHIER = process.env.SELFTEST_BACKGROUND ? path.resolve(process.env.SELFTEST_BACKGROUND) : path.join(RACINE, "chrome-extension/background.js");
const bg = fs.readFileSync(FICHIER, "utf8").replace(/\r\n/g, "\n");
let verts = 0;
let rouges = 0;
const ok = (m, c, d = "") => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}${d ? ` — ${d}` : ""}`); } };
const H = 3_600_000;
const iso = (s) => new Date(s).toISOString();

console.log(`\n── C3 : le relevé Vinted automatique d'un compte qui synchronise chaque jour (${path.basename(path.dirname(FICHIER))}/${path.basename(FICHIER)}) ──`);
let decision = null;
try {
  const cte = bg.match(/(?:^|[;\n])\s*const SYNC_CRON_COOLDOWN_MS\s*=\s*[^;]+;/)?.[0] ?? "";
  const src = extraireFonctionJs(bg, "decisionCadenceCron");
  const ctx = vm.createContext({ Date, Number, Math });
  vm.runInContext(`${cte.replace(/^[;\n]/, "")}\n${src}\nthis.decisionCadenceCron = decisionCadenceCron;`, ctx);
  decision = ctx.decisionCadenceCron;
} catch (e) {
  ok("la règle de cadence du relevé automatique est une décision nommée (decisionCadenceCron)", false, String(e?.message ?? e));
}
if (decision) {
  ok("la règle de cadence du relevé automatique est une décision nommée (decisionCadenceCron)", true);
  // La journée du 13/11 du compte (synthétique, aux heures relevées) : gestes 09:05, 12:51 ; alarme 15:51 (Paris).
  const alarme = Date.parse("2026-11-13T14:51:14Z");
  const dernierGeste = { id: "g", declencheur: "bouton_distant", finished_at: iso("2026-11-13T11:52:30Z") };
  const dernierAuto = { id: "c", declencheur: "cron", finished_at: iso("2026-11-03T11:40:45Z") };
  const d1 = decision({ dernierDone: dernierGeste, dernierCronDone: dernierAuto, maintenant: alarme });
  ok("geste à 12:52, dernier relevé automatique le 03/11 : l'alarme de 15:51 PART", d1?.ok === true, JSON.stringify(d1));
  // Chaque jour de la semaine (gestes quotidiens avant l'alarme) : le relevé automatique part une fois par jour.
  let parts = 0;
  let auto = dernierAuto;
  for (let j = 0; j < 7; j++) {
    const t = Date.parse("2026-11-07T14:51:14Z") + j * 24 * H;
    const geste = { declencheur: "bouton_distant", finished_at: iso(t - 3 * H) };
    const d = decision({ dernierDone: geste, dernierCronDone: auto, maintenant: t });
    if (d?.ok) { parts++; auto = { declencheur: "cron", finished_at: iso(t + 60_000) }; }
  }
  ok("sept jours de gestes quotidiens : sept relevés automatiques (un par jour)", parts === 7, `${parts}/7`);
  // ⛔ La cadence intouchable : deux relevés automatiques à moins de 20 h → le second attend.
  const d2 = decision({ dernierDone: dernierGeste, dernierCronDone: { declencheur: "cron", finished_at: iso(alarme - 8 * H) }, maintenant: alarme });
  ok("cadence inchangée : un relevé automatique 8 h plus tôt → refusé, prochain à fin + 20 h", d2?.ok === false && d2?.reason === "cadence_cron"
    && d2?.prochaineMs === alarme - 8 * H + 20 * H, JSON.stringify(d2));
  const d3 = decision({ dernierDone: null, dernierCronDone: null, maintenant: alarme });
  ok("inchangé : jamais de première synchro automatique", d3?.ok === false && d3?.reason === "cron_sans_premiere_sync");
}
// L'alarme refusée est rattrapée à « fin + 20 h » (P1), jamais le lendemain.
ok("un refus de cadence arme son rattrapage (armerRattrapageCron)", /armerRattrapageCron\(/.test(bg) && /SYNC_CRON_RATTRAPAGE_ALARM/.test(bg));
console.log(rouges ? `\n✗ ${rouges} rouge(s), ${verts} vert(s)` : `\n✓ C3 : relevé Vinted automatique tenu malgré les gestes quotidiens (${verts} verts)`);
process.exit(rouges ? 1 : 0);
