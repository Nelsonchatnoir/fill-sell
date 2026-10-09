// `npm run selftest:depop-reprise-lecture` — UNE LECTURE DEPOP QUI ÉCHOUE
// « RÉSEAU » EST REPRISE, UNE ÉCRITURE JAMAIS (09/10/2026, parcours réel).
//
// Mesuré le 09/10 depuis la page de Nico, avec le MÊME jeton valable :
// users/me en échec RAPIDE (« Failed to fetch » en 20 à 40 ms) 3 fois sur 19 à
// 1,5 s d'intervalle, 200 autour ; la lecture publique (sans Authorization) :
// 0 sur 19. La publication croisée 1ad7fa87 a perdu 15 min sur son tout
// premier appel (« Session Depop illisible (reseau) », 09:11:03 UTC).
// ⚠️ Le correctif d'abord écrit (dccbb2a : recharger l'onglet, « jeton
//    expiré ») reposait sur un diagnostic FAUX — l'échec est passager, le
//    jeton était valable — il est retiré (background.js redevient celui de la
//    0.6.105 testée) ; ce test le garde : aucun rechargement de page ici.
//
// Ce test EXÉCUTE le bloc ⟦depop-lecture⟧ de content-scripts/depop.js (fetch,
// cookie et horloge simulés) :
//   A. une lecture (GET) qui échoue « réseau » puis répond → la réponse, après
//      deux reprises au plus (1 s, 2,5 s) ;
//   B. trois échecs → « reseau » (erreurReseau), jamais plus de trois appels ;
//   C. une ÉCRITURE (POST, DELETE) qui échoue → « reseau » au PREMIER échec,
//      un seul appel (jamais une annonce créée deux fois) ;
//   D. une RÉPONSE (401, 404, 429, 500) n'est jamais reprise ;
//   E. sans jeton : 401 sans aucun appel ;
//   F. aucun rechargement de page, ni dans le connecteur ni dans background.js.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const dit = (nom, c, detail) => { if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

const cs = lire("chrome-extension/content-scripts/depop.js");
const m = cs.match(/\/\/ ⟦depop-lecture:début⟧\n([\s\S]*?)\/\/ ⟦depop-lecture:fin⟧/);
if (!m) { console.error("❌ bloc ⟦depop-lecture⟧ introuvable dans content-scripts/depop.js"); process.exit(1); }

// Un monde simulé : la file des issues de fetch (« X » = rejet réseau, un
// nombre = un statut HTTP), l'horloge, le cookie.
function monde(issues, { cookie = "access_token=jeton-de-test; other=1" } = {}) {
  const appels = [];
  const attentes = [];
  const file = [...issues];
  const ctx = {
    console, String, Number, JSON, Object, Error, Promise, decodeURIComponent,
    DEPOP_API: "https://webapi.depop.com",
    document: { cookie },
    setTimeout: (f, ms) => { attentes.push(ms); f(); return 0; },
    fetch: async (url, init) => {
      appels.push({ url, methode: init?.method, auth: !!init?.headers?.Authorization });
      const issue = file.length > 1 ? file.shift() : file[0];
      if (issue === "X") throw new TypeError("Failed to fetch");
      return { status: issue, ok: issue >= 200 && issue < 300, text: async () => JSON.stringify({ id: 380069661 }) };
    },
  };
  vm.createContext(ctx);
  vm.runInContext(`${m[1]}\nthis.depopJson = depopJson;`, ctx);
  return { depopJson: ctx.depopJson, appels, attentes };
}

console.log("\nA. UNE LECTURE QUI ÉCHOUE PUIS RÉPOND");
{
  const w = monde(["X", 200]);
  const r = await w.depopJson("/presentation/api/v1/users/me/");
  dit("un échec puis 200 → la réponse", r.ok === true && r.statut === 200, JSON.stringify(r));
  dit("deux appels, une attente de 1 s", w.appels.length === 2 && JSON.stringify(w.attentes) === "[1000]", `${w.appels.length} appels, attentes ${JSON.stringify(w.attentes)}`);
  dit("l'appel repris porte le même jeton", w.appels.every((a) => a.auth));
}
{
  const w = monde(["X", "X", 200]);
  const r = await w.depopJson("/api/v1/sellerOnboarding/sellerStatus/");
  dit("deux échecs puis 200 → la réponse", r.ok === true, JSON.stringify(r));
  dit("trois appels, attentes 1 s puis 2,5 s", w.appels.length === 3 && JSON.stringify(w.attentes) === "[1000,2500]", `${w.appels.length} appels, ${JSON.stringify(w.attentes)}`);
}
{
  const w = monde(["X", 200]);
  const r = await w.depopJson("/presentation/api/v1/products/by-slug/x-y/", { authentifie: false });
  dit("une lecture PUBLIQUE est reprise de même", r.ok === true && w.appels.length === 2 && !w.appels[0].auth, JSON.stringify(r));
}

console.log("\nB. TROIS ÉCHECS → « RÉSEAU », JAMAIS PLUS");
{
  const w = monde(["X"]);
  const r = await w.depopJson("/presentation/api/v1/users/me/");
  dit("statut 0 + erreurReseau (ce que depopSession lit comme « reseau »)", r.statut === 0 && r.ok === false && typeof r.erreurReseau === "string" && r.erreurReseau.length > 0, JSON.stringify(r));
  dit("trois appels au plus, 3,5 s d'attente au total", w.appels.length === 3 && w.attentes.reduce((a, b) => a + b, 0) === 3500, `${w.appels.length} appels, ${JSON.stringify(w.attentes)}`);
  dit("le nombre d'essais est dit (essais: 3)", r.essais === 3, r.essais);
}

console.log("\nC. UNE ÉCRITURE N'EST JAMAIS REPRISE ICI");
for (const methode of ["POST", "DELETE", "PUT"]) {
  const w = monde(["X", 201]);
  const r = await w.depopJson("/presentation/api/v1/listing/products/", { methode, corps: methode === "DELETE" ? undefined : { a: 1 } });
  dit(`${methode} en échec → « reseau » au premier échec, UN seul appel`, r.statut === 0 && w.appels.length === 1 && w.attentes.length === 0, `${w.appels.length} appels, ${JSON.stringify(r)}`);
}

console.log("\nD. UNE RÉPONSE N'EST JAMAIS REPRISE");
for (const statut of [401, 404, 429, 500]) {
  const w = monde([statut, 200]);
  const r = await w.depopJson("/presentation/api/v1/users/me/");
  dit(`${statut} → rendu tel quel, un seul appel`, r.statut === statut && w.appels.length === 1, `${w.appels.length} appels`);
}

console.log("\nE. SANS JETON : 401, AUCUN APPEL");
{
  const w = monde([200], { cookie: "other=1" });
  const r = await w.depopJson("/presentation/api/v1/users/me/");
  dit("sansJeton, 401, aucun appel", r.statut === 401 && r.sansJeton === true && w.appels.length === 0, JSON.stringify(r));
}

console.log("\nF. AUCUN RECHARGEMENT DE PAGE");
{
  dit("le connecteur ne recharge rien (ni location.reload, ni chrome.tabs)", !/location\.reload|chrome\.tabs\./.test(cs));
  const bg = lire("chrome-extension/background.js");
  dit("background.js n'a plus de « renouvellement de jeton » Depop (dccbb2a retiré)", !/assurerJetonDepop|depop-jeton|DEPOP_RENOUVELLEMENT/.test(bg));
  // depopSession lit erreurReseau comme « reseau » : contrat inchangé.
  dit("depopSession : réseau → { connecte: null, motif: « reseau » } (inchangé)", /return \{ connecte: null, motif: moi\.erreurReseau \? "reseau" : `http_\$\{moi\.statut\}` \};/.test(cs));
}

if (ko) { console.error(`\n❌ selftest:depop-reprise-lecture — ${ko} échec(s)`); process.exit(1); }
console.log("\n[selftest:depop-reprise-lecture] OK — une lecture Depop qui échoue « réseau » est reprise deux fois, une écriture jamais, une réponse jamais, et rien n'est rechargé.");
