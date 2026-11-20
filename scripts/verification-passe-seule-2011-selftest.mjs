// VERROU (20/11/2026 nuit, ordre de Nico — cliente Cloud 35ab6f0f, 23:24:52) : UNE VÉRIFICATION ANTI-ROBOT QUI PASSE SEULE
// N'EST JAMAIS UN « CHALLENGE », ET LA COPIE CLOUD NE NOMME JAMAIS CHROME.
// Le cas : sur son onglet Beebs du Cloud, la vérification de l'appareil DataDome s'est levée SEULE (l'orchestrateur :
// « verification_passee_seule ») ; beebs.js avait conclu à l'instant « CHALLENGE DATADOME… Ouvrir beebs.app dans Chrome ».
// Maintenant : les pages de dépôt Beebs et Leboncoin attendent la levée (20 s au plus, aucun clic) avant de conclure ; le
// geste restant est dit pour le poste (Cloud : dans l'app — fsPosteCloud() rendu true par la copie Cloud).
// Rouge sur 5973166, vert après.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0, total = 0;
const ok = (c, m) => { total++; if (c) console.log(`  ✓ ${m}`); else { echecs++; console.log(`  ✗ ${m}`); } };
const lire = (p) => fs.readFileSync(path.join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const cons = lire("chrome-extension/content-scripts/consentement.js");
const beebs = lire("chrome-extension/content-scripts/beebs.js");
const lbc = lire("chrome-extension/content-scripts/leboncoin.js");

// ── Les fonctions de consentement.js, exécutées telles quelles (navigateur simulé) ──
const tranche = (nom) => {
  const i = cons.indexOf(nom);
  if (i < 0) return "";
  const j = cons.indexOf("\n}\n", i);
  return cons.slice(i, j + 2);
};
const src = ["async function fsAttendreLeveeAntiRobot", "function fsPosteCloud", "function fsGesteVerificationAntiRobot", "function fsNavigateurCourt"]
  .map(tranche).join("\n");
ok(src.includes("fsAttendreLeveeAntiRobot") && src.includes("fsPosteCloud") && src.includes("fsGesteVerificationAntiRobot"), "consentement.js porte l'attente de levée, le poste et le geste");
const charger = (code) => new Function("globalThis", `${code}\nreturn { fsAttendreLeveeAntiRobot, fsGesteVerificationAntiRobot };`)(
  { navigator: { userAgentData: { brands: [{ brand: "Google Chrome" }] }, userAgent: "Chrome/157" } });
let F = null;
try { F = charger(src.replace(/globalThis\.navigator/g, "globalThis.navigator")); } catch (e) { ok(false, `chargement : ${e.message}`); }
if (F) {
  let lectures = 0;
  const leveeA3 = () => { lectures++; return lectures < 3; };
  ok(await F.fsAttendreLeveeAntiRobot(leveeA3, { maxMs: 2000, pasMs: 5 }) === true && lectures === 3, "rejeu 23:24:52 : la vérification se lève seule → le dépôt continue (aucun verdict)");
  ok(await F.fsAttendreLeveeAntiRobot(() => true, { maxMs: 60, pasMs: 5 }) === false, "toujours là après le délai → le verdict d'avant");
  ok(await F.fsAttendreLeveeAntiRobot(() => { throw new Error("page coupée"); }, { maxMs: 30, pasMs: 5 }) === false, "une lecture qui casse ne vaut jamais « levée »");
  ok(/Ouvrir beebs\.app dans Chrome et résoudre la vérification/.test(F.fsGesteVerificationAntiRobot("beebs.app")), "paquet du Chrome Web Store : le geste d'avant, inchangé");
}
const { patcherContentCloud } = await import("./cloud/build-extension-cloud.mjs").catch(() => ({}));
ok(typeof patcherContentCloud === "function", "la copie Cloud a son patch « poste Cloud »");
if (typeof patcherContentCloud === "function") {
  const cloud = patcherContentCloud(cons).src;
  const srcC = ["async function fsAttendreLeveeAntiRobot", "function fsPosteCloud", "function fsGesteVerificationAntiRobot", "function fsNavigateurCourt"]
    .map((nom) => { const i = cloud.indexOf(nom); return i < 0 ? "" : cloud.slice(i, cloud.indexOf("\n}\n", i) + 2); }).join("\n");
  const FC = charger(srcC);
  const t = FC.fsGesteVerificationAntiRobot("beebs.app");
  ok(!/chrome|ordinateur|extension/i.test(t) && /depuis l'app/.test(t), "copie Cloud : le geste dans l'app, jamais Chrome, l'ordinateur ni l'extension");
  let leve = false; try { patcherContentCloud(cloud); } catch { leve = true; }
  ok(leve, "… ancre unique : appliqué deux fois, le build s'arrête");
}
// ── Les deux pages de dépôt ──
for (const [nom, code, fn] of [["Beebs", beebs, "estPageBotShieldBeebs"], ["Leboncoin", lbc, "estPageBotShieldLbc"]]) {
  const i = code.indexOf(`if (${fn}() && !(await fsAttendreLeveeAntiRobot(${fn}))) {`);
  const bloc = i > 0 ? code.slice(i, code.indexOf("\n  }\n", i)) : "";
  ok(i > 0, `${nom} : la page de dépôt attend la levée AVANT de conclure`);
  ok(bloc.includes("CHALLENGE DATADOME : ") && bloc.includes("fsGesteVerificationAntiRobot(") && !bloc.includes("navigateurCourtPage()"),
    `${nom} : le motif reste (SQL, background), le geste vient de consentement.js`);
}
ok(!/\bconst fsPosteCloud\b|\blet fsPosteCloud\b/.test(cons), "fsPosteCloud est une fonction : un script réinjecté ne casse rien");

console.log(echecs ? `✗ verification-passe-seule-2011 : ${total - echecs}/${total}` : `✓ verification-passe-seule-2011 : ${total}/${total}`);
process.exit(echecs ? 1 : 0);
