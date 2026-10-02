// Autotest du MUR DE CONNEXION de la page de dépôt Leboncoin —
// `npm run selftest:lbc-mur-connexion`
//
// Le 02/10, cinq republications de xxewwer se sont arrêtées sur « le titre
// n'est plus au rendez-vous » : le formulaire n'avait pas changé, la session
// Leboncoin était fermée. Déconnecté, Leboncoin garde /deposer-une-annonce,
// sans champ mot de passe, et affiche (relevé sur un Chrome neuf le 02/10) :
//   <h3>Bonjour !</h3>
//   <p>Connectez-vous ou créez un compte pour déposer votre annonce.</p>
//   <button>Me connecter</button><button>Créer un compte</button>
// et le jeton `luat` est absent du localStorage.
//
// Ce que ce test garantit :
//   1. LA MÊME LECTURE : murConnexionDepotLbc a le MÊME CORPS dans
//      content-scripts/leboncoin.js (le dépôt, la recréation) et dans
//      background.js (la garde avant retrait, sondePageDepotLbc) ;
//   2. dans un VRAI Chrome (page servie sur https://www.leboncoin.fr/
//      deposer-une-annonce par interception, aucun accès réseau) :
//      · le mur réel → « mur » de type connexion, session prouvée fermée ;
//      · le formulaire présent → aucun mur, rien ne manque, même avec un
//        bandeau de cookies ;
//      · LA GARDE NE S'ASSOUPLIT PAS : formulaire changé, page qui charge,
//        brouillon restauré, mur masqué → « le titre » manque, aucun retrait ;
//      · captcha → mur anti-robot.
// Les deux fonctions sont relues À LA SOURCE, jamais recopiées ici.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").split("\r\n").join("\n");
const bg = lire("chrome-extension/background.js");
const cs = lire("chrome-extension/content-scripts/leboncoin.js");

let ko = 0;
const ok = (cond, nom, detail = "") => {
  if (cond) console.log(`  ✓ ${nom}`);
  else { console.error(`  ✗ ${nom}${detail ? `\n      ${detail}` : ""}`); ko++; }
};

// Extrait une fonction par son en-tête et l'accolade fermante à SON indentation.
function extraire(src, entete, indent) {
  const d = src.indexOf(`${indent}${entete}`);
  if (d < 0) return null;
  const f = src.indexOf(`\n${indent}}\n`, d);
  if (f < 0) return null;
  return src.slice(d, f + indent.length + 3);
}
const dedent = (s, indent) => s.split("\n").map((l) => (l.startsWith(indent) ? l.slice(indent.length) : l)).join("\n").trim();

console.log("\n1. LA MÊME LECTURE DANS LA GARDE ET DANS LE DÉPÔT");
const murCs = extraire(cs, "function murConnexionDepotLbc() {", "");
const murBg = extraire(bg, "function murConnexionDepotLbc() {", "  ");
const sonde = extraire(bg, "function sondePageDepotLbc() {", "");
ok(!!murCs, "murConnexionDepotLbc trouvée dans content-scripts/leboncoin.js");
ok(!!murBg, "murConnexionDepotLbc trouvée dans background.js (dans sondePageDepotLbc)");
ok(!!sonde, "sondePageDepotLbc trouvée dans background.js");
if (!murCs || !murBg || !sonde) { console.error("\n✗ extraction impossible — arrêt"); process.exit(1); }
ok(dedent(murCs, "") === dedent(murBg, "  "), "corps identiques, à la lettre",
  "les deux copies ont divergé : la garde et le dépôt ne liraient plus la page de la même façon");
ok(/sonde:\s*sondePageDepotLbc/.test(bg), "PREVOL_DEPOT.leboncoin.sonde = sondePageDepotLbc");

// ── Les pages, telles que Leboncoin les rend ─────────────────────────────────
const page = (corps) => `<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>leboncoin</title></head><body>${corps}</body></html>`;
const ENTETE = `<header role="banner"><h1>Déposer une annonce</h1><button type="button">Quitter</button></header>`;
const MUR = `<div><div><h3>Bonjour !</h3><p>Connectez-vous ou créez un compte pour déposer votre annonce.</p></div>`
  + `<div><button data-spark-component="button" type="button">Me connecter</button>`
  + `<button data-spark-component="button" type="button">Créer un compte</button></div></div>`;
const FORM = `<form><label for=":form-field-_r_0_">Quel est le titre de l’annonce ?*</label>`
  + `<input type="text" name="subject" id=":form-field-_r_0_"></form>`;
const COOKIES = `<div role="dialog"><p>Pour leboncoin, votre expérience sur notre site est une priorité.</p>`
  + `<button>Accepter</button><button>Continuer sans accepter</button></div>`;
const CAS = [
  { nom: "mur réel, jeton absent (xxewwer, 02/10)", html: page(`<main id="mainContent">${ENTETE}${MUR}</main>${COOKIES}`), jeton: false,
    sonde: { mur: true, murType: "connexion", sessionPage: "morte", manquants: [] }, murCs: true },
  { nom: "mur réel, jeton encore posé (périmé)", html: page(`<main>${ENTETE}${MUR}</main>`), jeton: true,
    sonde: { mur: true, murType: "connexion", sessionPage: null, manquants: [] }, murCs: true },
  { nom: "page qui charge, jeton absent", html: page(`<main>${ENTETE}</main>`), jeton: false,
    sonde: { mur: true, murType: "connexion", sessionPage: null, manquants: [] }, murCs: true },
  { nom: "formulaire présent (connecté)", html: page(`<main>${ENTETE}${FORM}</main>`), jeton: true,
    sonde: { mur: false, manquants: [] }, murCs: false },
  { nom: "formulaire présent + bandeau de cookies", html: page(`<main>${ENTETE}${FORM}</main>${COOKIES}`), jeton: true,
    sonde: { mur: false, manquants: [] }, murCs: false },
  { nom: "formulaire présent, jeton absent : le formulaire l'emporte", html: page(`<main>${ENTETE}${FORM}</main>`), jeton: false,
    sonde: { mur: false, manquants: [] }, murCs: false },
  { nom: "GARDE STRICTE — formulaire changé (champ renommé)", html: page(`<main>${ENTETE}<input type="text" name="title"></main>`), jeton: true,
    sonde: { mur: false, manquants: ["le titre"] }, murCs: false },
  { nom: "GARDE STRICTE — page qui charge (connecté)", html: page(`<main>${ENTETE}</main>`), jeton: true,
    sonde: { mur: false, manquants: ["le titre"] }, murCs: false },
  { nom: "GARDE STRICTE — brouillon restauré à l'étape critères", html: page(`<main>${ENTETE}<label for="condition">État</label><input id="condition"></main>`), jeton: true,
    sonde: { mur: false, manquants: ["le titre"] }, murCs: false },
  { nom: "GARDE STRICTE — mur présent mais masqué (display:none)", html: page(`<main>${ENTETE}<div style="display:none">${MUR}</div></main>`), jeton: true,
    sonde: { mur: false, manquants: ["le titre"] }, murCs: false },
  { nom: "GARDE STRICTE — « Se connecter » caché (aria-hidden)", html: page(`<main>${ENTETE}<nav aria-hidden="true"><a href="/connexion">Se connecter</a></nav></main>`), jeton: true,
    sonde: { mur: false, manquants: ["le titre"] }, murCs: false },
  { nom: "vérification anti-robot", html: page(`<iframe src="https://geo.captcha-delivery.com/captcha/?x=1"></iframe>`), jeton: true,
    sonde: { mur: true, murType: "anti_robot", manquants: [] }, murCs: null },
];

console.log("\n2. DANS UN VRAI CHROME (page interceptée, aucun réseau)");
let chromium;
try { ({ chromium } = await import("playwright")); }
catch (e) { console.error(`  ✗ playwright introuvable (${e?.message ?? e})`); process.exit(1); }
let nav;
try { nav = await chromium.launch({ channel: "chrome", headless: true }); }
catch (e) { console.error(`  ✗ Chrome introuvable pour l'autotest (${String(e?.message ?? e).split("\n")[0]})`); process.exit(1); }
try {
  for (const c of CAS) {
    const ctx = await nav.newContext();
    await ctx.route("**/*", (route) => {
      const u = route.request().url();
      if (u.startsWith("https://www.leboncoin.fr/deposer-une-annonce")) {
        return route.fulfill({ status: 200, contentType: "text/html; charset=utf-8", body: c.html });
      }
      return route.fulfill({ status: 204, body: "" });
    });
    if (c.jeton) await ctx.addInitScript(() => { try { localStorage.setItem("luat", "jeton-de-test"); } catch { /* */ } });
    const p = await ctx.newPage();
    await p.goto("https://www.leboncoin.fr/deposer-une-annonce");
    const rs = await p.evaluate(`(${sonde})()`);
    const rc = await p.evaluate(`(${murCs})()`);
    const e = c.sonde;
    const bonneSonde = (!!rs.mur === e.mur)
      && (!e.murType || rs.murType === e.murType)
      && (!("sessionPage" in e) || (rs.sessionPage ?? null) === e.sessionPage)
      && JSON.stringify(rs.manquants ?? []) === JSON.stringify(e.manquants);
    ok(bonneSonde, `garde : ${c.nom}`, `attendu ${JSON.stringify(e)} — obtenu ${JSON.stringify(rs)}`);
    if (c.murCs !== null) {
      ok(!!rc === c.murCs, `dépôt : ${c.nom} → ${c.murCs ? "mur reconnu" : "pas de mur"}`, `obtenu ${JSON.stringify(rc)}`);
    }
    await ctx.close();
  }
} finally {
  await nav.close();
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ mur de connexion Leboncoin : une seule lecture, la garde reste stricte");
