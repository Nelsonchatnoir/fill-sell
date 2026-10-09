// `npm run selftest:depop-jeton` — LE JETON DEPOP EST RENOUVELÉ PAR LA PAGE
// (09/10/2026, parcours réel de Nico).
//
// Mesuré le 09/10 : le jeton `access_token` de Depop expire (≈ 1 h) et seule
// la page le renouvelle, à son chargement. L'onglet de travail de l'extension
// (chargé une fois, réutilisé sans navigation) envoyait un jeton mort : chaque
// geste Depop finissait « Session Depop illisible (reseau) » (job 1ad7fa87,
// 09:11:03 UTC) jusqu'à ce que quelqu'un ouvre depop.com.
//
// Ce test EXÉCUTE le bloc ⟦depop-jeton⟧ de background.js (horloge simulée,
// API Chrome simulées) et lit le reste :
//   A. session vivante → rien ; session FERMÉE (sans jeton, 401) → jamais de
//      rechargement ; pas de réponse → jamais de rechargement ;
//   B. erreur RÉSEAU → UN rechargement du MÊME onglet, beforeunload neutralisé
//      AVANT, puis la session relue → « renouvelé » ;
//   C. jeton toujours mort → échec borné à 20 s, puis PAUSE de 30 min (aucun
//      rechargement pendant la pause), puis un nouvel essai ;
//   D. beforeunload non neutralisable → aucun rechargement ;
//   E. le bloc ne met jamais rien au premier plan et ne crée aucun onglet ;
//   F. tous les gestes Depop passent par assurerScriptDepopSurOnglet, qui
//      vérifie le script PUIS le jeton ;
//   G. le connecteur dit bien « reseau » quand fetch rejette (jeton mort sans
//      CORS), et « session fermée » sans jeton ou sur 401.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const dit = (nom, c, detail) => { if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

const bg = lire("chrome-extension/background.js");
const m = bg.match(/\/\/ ⟦depop-jeton:début⟧\n([\s\S]*?)\/\/ ⟦depop-jeton:fin⟧/);
if (!m) { console.error("❌ bloc ⟦depop-jeton⟧ introuvable dans background.js"); process.exit(1); }
const bloc = m[1];

// Un monde simulé : horloge, onglet, réponses de la page.
function monde({ sessions, statuts = [], neutralise = true, scriptVivant = true }) {
  let maintenant = 1_791_000_000_000; // une heure réelle (09/10/2026) : la pause se compte depuis 0 au démarrage du service worker
  const journal = [];
  const reponses = [...sessions];
  const etats = [...statuts];
  const DateSimulee = class extends Date { static now() { return maintenant; } };
  const ctx = {
    Date: DateSimulee, console, String, Number, Math, JSON, Error,
    sleep: async (ms) => { maintenant += ms; },
    sendMessageToTabOnce: async (tabId, msg) => {
      journal.push(`message:${msg.type}:${tabId}`);
      const r = reponses.length > 1 ? reponses.shift() : reponses[0];
      if (r === "lance") throw new Error("Receiving end does not exist");
      return r;
    },
    neutralizeBeforeUnload: async (tabId) => { journal.push(`neutralise:${tabId}`); return neutralise; },
    scriptDepopVivantSurOnglet: async (tabId) => { journal.push(`ping:${tabId}`); return { ok: scriptVivant }; },
    chrome: {
      tabs: {
        reload: async (tabId) => { journal.push(`reload:${tabId}`); },
        get: async (tabId) => ({ id: tabId, status: etats.length > 1 ? etats.shift() : (etats[0] ?? "complete") }),
        update: async () => { journal.push("INTERDIT:tabs.update"); },
        create: async () => { journal.push("INTERDIT:tabs.create"); },
      },
      windows: { update: async () => { journal.push("INTERDIT:windows.update"); } },
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${bloc}\nthis.assurerJetonDepop = assurerJetonDepop;`, ctx);
  return {
    assurer: (tabId = 7) => ctx.assurerJetonDepop(tabId),
    journal, avancer: (ms) => { maintenant += ms; }, reponses,
  };
}
const OK = { connecte: true, id: 380069661 };
const RESEAU = { connecte: null, motif: "reseau" };
const FERMEE = { connecte: false, motif: "http_401" };
const SANS_JETON = { connecte: false, motif: "sans_jeton" };
const compte = (j, p) => j.filter((x) => x.startsWith(p)).length;

console.log("\nA. CE QUI NE RECHARGE JAMAIS");
{
  const w = monde({ sessions: [OK] });
  const r = await w.assurer();
  dit("session vivante → { ok, deja }, aucun rechargement", r.ok === true && r.deja === true && compte(w.journal, "reload") === 0, JSON.stringify(r));
}
for (const [nom, s] of [["401 (session fermée)", FERMEE], ["sans jeton", SANS_JETON]]) {
  const w = monde({ sessions: [s] });
  const r = await w.assurer();
  dit(`${nom} → « session_fermee », aucun rechargement`, r.ok === false && r.motif === "session_fermee" && compte(w.journal, "reload") === 0, JSON.stringify(r));
}
{
  const w = monde({ sessions: [null] });
  const r = await w.assurer();
  dit("pas de réponse de la page → aucun rechargement", r.ok === false && /^session_illisible_/.test(r.motif) && compte(w.journal, "reload") === 0, JSON.stringify(r));
}
{
  const w = monde({ sessions: [{ connecte: null, motif: "http_500" }] });
  const r = await w.assurer();
  dit("erreur HTTP (pas réseau) → aucun rechargement", r.ok === false && compte(w.journal, "reload") === 0, JSON.stringify(r));
}

console.log("\nB. ERREUR RÉSEAU (JETON MORT) → LA PAGE LE RENOUVELLE");
{
  const w = monde({ sessions: [RESEAU, OK], statuts: ["loading", "complete"] });
  const r = await w.assurer(42);
  dit("renouvelé", r.ok === true && r.renouvele === true, JSON.stringify(r));
  dit("UN seul rechargement, du MÊME onglet", compte(w.journal, "reload:42") === 1 && compte(w.journal, "reload") === 1, w.journal.join(" "));
  dit("beforeunload neutralisé AVANT le rechargement", w.journal.indexOf("neutralise:42") >= 0 && w.journal.indexOf("neutralise:42") < w.journal.indexOf("reload:42"), w.journal.join(" "));
  dit("le script est revérifié après le chargement, puis la session relue", w.journal.lastIndexOf("ping:42") > w.journal.indexOf("reload:42")
    && w.journal.lastIndexOf("message:DEPOP_SESSION:42") > w.journal.lastIndexOf("ping:42"), w.journal.join(" "));
  dit("borné : renouvelé en moins de 20 s (horloge simulée)", r.attente_ms <= 20_000, r.attente_ms);
}

console.log("\nC. JETON TOUJOURS MORT → ÉCHEC BORNÉ, PUIS PAUSE DE 30 MIN");
{
  const w = monde({ sessions: [RESEAU] });
  const r1 = await w.assurer();
  dit("échec « jeton_non_renouvele » après ≤ 20 s (+ un pas)", r1.ok === false && r1.motif === "jeton_non_renouvele" && r1.attente_ms <= 21_500, JSON.stringify(r1));
  dit("un seul rechargement pour cet échec", compte(w.journal, "reload") === 1, w.journal.join(" "));
  w.avancer(10 * 60_000);
  const r2 = await w.assurer();
  dit("10 min plus tard : en pause, AUCUN rechargement", r2.motif === "renouvellement_en_pause" && compte(w.journal, "reload") === 1, JSON.stringify(r2));
  w.avancer(21 * 60_000);
  const r3 = await w.assurer();
  dit("31 min plus tard : un nouvel essai (un rechargement de plus)", compte(w.journal, "reload") === 2 && r3.ok === false, JSON.stringify(r3));
}
{
  const w = monde({ sessions: [RESEAU, FERMEE] });
  const r = await w.assurer();
  dit("rechargée puis session fermée → « session_fermee » (et pause)", r.ok === false && r.motif === "session_fermee" && compte(w.journal, "reload") === 1, JSON.stringify(r));
  const r2 = await w.assurer();
  dit("…puis aucun rechargement pendant la pause", compte(w.journal, "reload") === 1, JSON.stringify(r2));
}
{
  const w = monde({ sessions: [RESEAU], scriptVivant: false });
  const r = await w.assurer();
  dit("script muet après le rechargement → échec borné, jamais d'attente infinie", r.ok === false && r.attente_ms <= 21_500, JSON.stringify(r));
}

console.log("\nD. BEFOREUNLOAD NON NEUTRALISABLE → RIEN");
{
  const w = monde({ sessions: [RESEAU], neutralise: false });
  const r = await w.assurer();
  dit("« dialogue_possible », aucun rechargement", r.ok === false && r.motif === "dialogue_possible" && compte(w.journal, "reload") === 0, JSON.stringify(r));
}

console.log("\nE. RIEN AU PREMIER PLAN, AUCUN ONGLET CRÉÉ");
{
  const interdits = [/windows\.update/, /focused/, /active\s*:\s*true/, /tabs\.update/, /tabs\.create/, /createWorkTab/, /navigateWorkTab/];
  for (const re of interdits) dit(`le bloc n'utilise pas ${re}`, !re.test(bloc));
  dit("chrome.tabs.reload sur l'onglet reçu (même id)", /chrome\.tabs\.reload\(tabId\)/.test(bloc));
  dit("attente bornée à 20 s, pause de 30 min", /DEPOP_JETON_ATTENTE_MS = 20_000/.test(bloc) && /DEPOP_RENOUVELLEMENT_PAUSE_MS = 30 \* 60_000/.test(bloc));
}

console.log("\nF. TOUS LES GESTES DEPOP PASSENT PAR LA PORTE : SCRIPT PUIS JETON");
{
  const f = bg.match(/async function assurerScriptDepopSurOnglet\(tabId\) \{([\s\S]*?)\n\}/);
  const corps = f ? f[1] : "";
  dit("assurerScriptDepopSurOnglet : script vivant d'abord", /scriptDepopVivantSurOnglet\(tabId\)/.test(corps) && /if \(!v\.ok\) return v;/.test(corps));
  dit("…puis le jeton (jamais bloquant : le geste dit lui-même ce qui manque)", /assurerJetonDepop\(tabId\)\.catch/.test(corps) && /return v;\s*$/.test(corps.trim()));
  const appels = (bg.match(/assurerScriptDepopSurOnglet\(tabId\)/g) ?? []).length;
  dit("publication, retrait, relevé, onglet prêt (capture, ventes, état) : 4 appelants", appels >= 4, appels);
  dit("publication", /if \(job\.platform === "depop"\) \{\s*const v = await assurerScriptDepopSurOnglet\(tabId\);/.test(bg));
  dit("retrait", /const v = await assurerScriptDepopSurOnglet\(tabId\);\s*if \(!v\.ok\) throw new Error\(`pas de réponse du content script Depop \(\$\{v\.motif\}\) — rien n'a été touché`\);/.test(bg));
  dit("relevé", /const vivant = await assurerScriptDepopSurOnglet\(tabId\);/.test(bg));
  dit("onglet prêt (capture, ventes, état d'une annonce)", /async function ongletDepopPret\(\) \{[\s\S]*?assurerScriptDepopSurOnglet\(tabId\)/.test(bg));
  dit("la sonde de session ne recharge rien (passive)", !/async function sonderSessionDepop\(\) \{[\s\S]*?(assurerJetonDepop|chrome\.tabs\.reload)[\s\S]*?\n\}/.test(bg.match(/async function sonderSessionDepop\(\) \{[\s\S]*?\n\}/)?.[0] ?? ""));
}

console.log("\nG. LE CONNECTEUR DIT « RÉSEAU » QUAND FETCH REJETTE");
{
  const cs = lire("chrome-extension/content-scripts/depop.js");
  dit("depopJson : un fetch rejeté rend { statut: 0, erreurReseau }", /catch \(e\) \{\s*return \{ statut: 0, ok: false, corps: null, erreurReseau:/.test(cs));
  dit("depopSession : sans jeton → connecte false", /if \(!depopJeton\(\)\) return \{ connecte: false, motif: "sans_jeton" \};/.test(cs));
  dit("depopSession : 401 → connecte false", /if \(moi\.statut === 401\) return \{ connecte: false, motif: "http_401" \};/.test(cs));
  dit("depopSession : réseau → connecte null, motif « reseau »", /return \{ connecte: null, motif: moi\.erreurReseau \? "reseau" : `http_\$\{moi\.statut\}` \};/.test(cs));
  dit("DEPOP_SESSION répond par depopSession", /msg\?\.type === "DEPOP_SESSION"\) return repondre\(depopSession\(\)/.test(cs));
}

if (ko) { console.error(`\n❌ selftest:depop-jeton — ${ko} échec(s)`); process.exit(1); }
console.log("\n[selftest:depop-jeton] OK — un jeton Depop mort est renouvelé par la page, une fois, sans rafale ni fenêtre, et jamais sur une session fermée.");
