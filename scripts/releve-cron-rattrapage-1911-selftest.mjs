// VERROU (19/11/2026 soir, demande de Nico — compte faf5021a sur le Cloud) : LE RELEVÉ AUTOMATIQUE QUI N'A PAS PU PARTIR
// EST RETENTÉ, PAS PERDU JUSQU'AU LENDEMAIN.
// Constat : relevé Beebs automatique (déclencheur « cron ») les nuits du 13, 14, 16, 17 et 19/11, pas le 15 ni le 18. Le
// 18/11 à 03:29:34 (Paris) sa ligne a été refusée à la création : « RELEVE_ATTEND_REPUBLICATION: republication 032a02de
// (beebs) entre le retrait et la recréation de son annonce — le relevé partira dès qu'elle sera remise en ligne » — et
// rien ne le relançait. Maintenant : un relevé automatique qui n'a pas pu PARTIR (run_non_cree, deja_en_cours) est retenté
// 30 min plus tard, même déclencheur et mêmes gardes, au plus 4 fois par jour ; aucun relevé posé par le serveur.
// Rouge sur 18e7d19, vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const bg = fs.readFileSync(path.join(ROOT, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const essai = (nom) => { try { return extraireFonctionJs(bg, nom); } catch { return ""; } };
const constante = (nom) => bg.match(new RegExp(`^const ${nom} = [^;]+;`, "m"))?.[0] ?? "";

const code = [constante("RELEVE_PLATEFORMES"), constante("RELEVE_CRON_RATTRAPAGE_ALARM"), constante("RELEVE_CRON_RATTRAPAGE_MIN"),
  constante("RELEVE_CRON_RATTRAPAGES_MAX"), constante("RELEVE_CRON_A_RATTRAPER"), constante("CLE_RELEVE_CRON_RATTRAPAGE"),
  essai("jourParis"), essai("armerRattrapageReleveCron"), essai("rattraperReleveCron")].join("\n");
ok(/armerRattrapageReleveCron/.test(code) && /rattraperReleveCron/.test(code), "les fonctions du rattrapage existent");
if (/armerRattrapageReleveCron/.test(code) && /rattraperReleveCron/.test(code)) {
  const stock = new Map();
  const alarmes = [];
  const lances = [];
  let reponse = () => ({ ok: false, reason: "run_non_cree" });
  const chrome = {
    storage: { local: { get: async (k) => (stock.has(k) ? { [k]: stock.get(k) } : {}), set: async (o) => { for (const [k, v] of Object.entries(o)) stock.set(k, v); } } },
    alarms: { create: (nom, o) => alarmes.push([nom, o]) },
  };
  const lancerRelevePlateforme = async (a) => { lances.push(a); return reponse(a); };
  const api = new Function("chrome", "lancerRelevePlateforme", "console", `${code}\nreturn { armerRattrapageReleveCron, rattraperReleveCron, RELEVE_CRON_RATTRAPAGE_ALARM };`)(
    chrome, lancerRelevePlateforme, { log() {}, warn() {} });
  const T = Date.parse("2026-11-18T02:29:34Z");
  const w = await api.armerRattrapageReleveCron(["beebs"], { maintenant: T });
  ok(w === T + 30 * 60_000 && alarmes.at(-1)?.[0] === api.RELEVE_CRON_RATTRAPAGE_ALARM, "relevé Beebs refusé à 03:29 → nouvel essai armé 30 min plus tard");
  await api.rattraperReleveCron();
  ok(lances.at(-1)?.platform === "beebs" && lances.at(-1)?.declencheur === "cron", "le rattrapage relance le MÊME relevé automatique (déclencheur « cron », toutes les gardes)");
  ok(alarmes.length === 2, "encore refusé (republication pas finie) → réarmé");
  reponse = () => ({ ok: true });
  const avant = alarmes.length;
  await api.rattraperReleveCron();
  ok(alarmes.length === avant && (stock.get("fillsell_releve_cron_rattrapage")?.plateformes ?? []).length === 0, "parti → plus rien à rattraper, aucune alarme de plus");
  reponse = () => ({ ok: false, reason: "cadence" });
  await api.armerRattrapageReleveCron(["beebs"], { maintenant: T });
  await api.rattraperReleveCron();
  ok((stock.get("fillsell_releve_cron_rattrapage")?.plateformes ?? []).length === 0, "refus de cadence (relevé déjà fait) : jamais retenté");
  reponse = () => ({ ok: false, reason: "run_non_cree" });
  stock.clear(); alarmes.length = 0;
  for (let i = 0; i < 6; i++) await api.armerRattrapageReleveCron(["beebs"], { maintenant: T + i * 60_000 });
  ok(alarmes.length === 4, `au plus 4 essais par jour (${alarmes.length})`);
  await api.armerRattrapageReleveCron(["beebs"], { maintenant: T + 26 * 3600_000 });
  ok(alarmes.length === 5, "le lendemain (heure de Paris) : le compteur repart");
  ok((await api.armerRattrapageReleveCron(["inconnue"], { maintenant: T + 27 * 3600_000 })) === null, "une plateforme inconnue n'arme rien");
}
const quotidien = essai("releverQuotidien");
ok(/const r = await lancerRelevePlateforme\(\{ platform, declencheur: "cron" \}\)/.test(quotidien) && /RELEVE_CRON_A_RATTRAPER\.includes\(r\?\.reason\)/.test(quotidien)
  && /armerRattrapageReleveCron\(aRattraper\)/.test(quotidien), "l'alarme quotidienne note ce qui n'a pas pu partir et arme le rattrapage");
ok(/alarm\.name === RELEVE_CRON_RATTRAPAGE_ALARM\) \{\s+withJobFlowLock\("releve-annonces-cron-rattrapage", rattraperReleveCron\)/.test(bg), "l'alarme de rattrapage est écoutée (sous le verrou des onglets)");

console.log(echecs ? `✗ releve-cron-rattrapage-1911 : ${total - echecs}/${total}` : `✓ releve-cron-rattrapage-1911 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
