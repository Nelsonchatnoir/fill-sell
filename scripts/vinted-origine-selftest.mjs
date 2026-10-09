// Selftest — l'origine Vinted de l'extension (0.6.106, 09/10 — Marta, vendeuse
// italienne ; extension dans Edge).
//   npm run selftest:vinted-origine
//
// Ce qu'il garantit, sur le code LIVRÉ (chrome-extension/) :
//   a. aucun littéral vinted.fr de CODE ne subsiste hors de vinted-origine.js,
//      sauf deux exceptions nommées ici (et pourquoi) ;
//   b. sans permission étrangère : origine https://www.vinted.fr, motifs
//      d'onglets, adresses et textes d'avant À L'OCTET (vendeurs français) —
//      et aucun cookie lu, rien d'écrit ;
//   c. vinted.it accordé + session (v_uid) sur vinted.it seulement → vinted.it ;
//   d. session sur vinted.fr ET vinted.it accordé → vinted.fr (un Français
//      n'est jamais basculé) ;
//   e. manifest : aucune permission obligatoire nouvelle (permissions,
//      host_permissions, content_scripts identiques à la 0.6.105), les
//      domaines étrangers SEULEMENT en optionnel (et en web_accessible_resources,
//      qui n'est pas une permission) ; liste CWS et page /legal alignées ;
//   f. le navigateur nommé : « Chrome » sous Google Chrome (textes d'avant),
//      « Edge » sous Microsoft Edge ; le message « pas connecté » garde ses
//      marqueurs machine et nomme le domaine et le navigateur ;
//   g. le popup ne montre « Autoriser vinted.<pays> » que sur
//      contexte.vinted_etranger (jamais à un Français).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { HOTES_OPTIONNELS_CWS, HOTES_LIVRABLES_CWS } from "./hotes-livrables-cws.mjs";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const EXT = path.join(RACINE, "chrome-extension");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("vinted-origine-selftest");

// ── Le module, chargé comme le service worker le charge (script classique) ──
function charger({ marques = ["Google Chrome", "Chromium"], ua = "" } = {}) {
  const g = { navigator: { userAgentData: marques ? { brands: marques.map((brand) => ({ brand })) } : undefined, userAgent: ua } };
  new Function("globalThis", "self", lire("chrome-extension/vinted-origine.js"))(g, g);
  return g.FILLSELL_VINTED;
}
// Un faux `chrome` : permissions accordées, cookies posés, stockage, journal des lectures.
function fauxChrome({ accordes = [], cookies = {} } = {}) {
  const journal = { cookies: 0, ecritures: 0 };
  const store = {};
  return {
    journal, store,
    permissions: { getAll: async () => ({ origins: ["https://*.vinted.fr/*", ...accordes] }) },
    cookies: {
      get: async ({ url, name }) => {
        journal.cookies++;
        const v = cookies[new URL(url).origin]?.[name];
        return v ? { name, value: v } : null;
      },
    },
    storage: { local: {
      get: async (k) => ({ [k]: store[k] }),
      set: async (o) => { journal.ecritures++; Object.assign(store, o); },
    } },
  };
}

// ── a. aucun littéral vinted.fr de CODE hors du module ─────────────────────
await cas("a. aucun littéral vinted.fr de code hors de vinted-origine.js (2 exceptions nommées)", () => {
  const EXCEPTIONS = [
    // Le content script ne charge pas le module : défaut de SA page, le même que ORIGINE_FR.
    ["chrome-extension/content-scripts/vinted.js", /^\s*: "https:\/\/www\.vinted\.fr";$/],
    // L'hôte vinted.fr reste accepté tel quel (vendeurs français), le domaine actif en plus.
    ["chrome-extension/background.js", /^\s*if \(host !== "vinted\.fr" && host !== "www\.vinted\.fr" && !VO\.estHoteVintedDeTravail\(host\)\) return null;$/],
  ];
  const fichiers = execFileSync("git", ["-C", RACINE, "ls-files", "chrome-extension"]).toString().split("\n")
    .filter((f) => f.endsWith(".js") && !f.endsWith("vinted-origine.js"));
  const fautes = [];
  for (const f of fichiers) {
    const lignes = lire(f).split("\n");
    lignes.forEach((L, i) => {
      if (!/vinted\.fr/.test(L)) return;
      const t = L.trim();
      if (/^(\/\/|\*|\/\*)/.test(t)) return;                         // commentaire
      if (/console\.(log|warn|error|info)\(/.test(L)) return;         // journal
      if (/_BUILD\s*=|^"20\d\d-\d\d-\d\d/.test(t)) return;            // empreinte de version
      if (/^`\(\$\{!t \? "disparu"/.test(t)) return;                  // suite d'un console.log multi-ligne
      if (/\/\*[^*]*vinted\.fr[^*]*\*\//.test(L) && !/"[^"]*vinted\.fr|`[^`]*vinted\.fr/.test(L.replace(/\/\*.*?\*\//g, ""))) return;
      if (EXCEPTIONS.some(([ef, re]) => ef === f && re.test(L))) return;
      fautes.push(`${f}:${i + 1}: ${t.slice(0, 140)}`);
    });
  }
  assert.deepEqual(fautes, [], `littéraux vinted.fr de code restants :\n${fautes.join("\n")}`);
});

// ── b. sans permission étrangère : vinted.fr, à l'octet ────────────────────
await cas("b. sans permission étrangère : origine, motifs, adresses identiques à la 0.6.105 ; aucun cookie lu, rien d'écrit", async () => {
  const VO = charger();
  const ch = fauxChrome();
  assert.equal(VO.origineVinted(), "https://www.vinted.fr");
  assert.equal(await VO.rafraichirOrigineVinted(ch), "https://www.vinted.fr");
  assert.equal(await VO.chargerOrigineVinted(ch), "https://www.vinted.fr");
  assert.equal(ch.journal.cookies, 0, "aucun cookie lu sur le chemin français");
  assert.equal(ch.journal.ecritures, 0, "rien d'écrit sur le chemin français");
  // Les littéraux d'avant (0.6.105), reconstruits par le module.
  assert.equal(`${VO.origineVinted()}/items/new`, "https://www.vinted.fr/items/new");
  assert.equal(`${VO.origineVinted()}/`, "https://www.vinted.fr/");
  assert.equal(`${VO.origineVinted()}/*`, "https://www.vinted.fr/*");
  assert.equal(`${VO.origineVinted()}/api/v2/users/current`, "https://www.vinted.fr/api/v2/users/current");
  assert.equal(VO.motifOngletsVinted(), "*://*.vinted.fr/*");
  assert.equal(VO.domaineVintedAffiche(), "vinted.fr");
  assert.equal(VO.hoteVinted(), "www.vinted.fr");
  assert.equal(VO.urlAnnonceVinted(123), "https://www.vinted.fr/items/123");
  assert.equal(VO.estOrigineEtrangere(), false);
  // L'hôte d'une annonce acceptée par la sonde : vinted.fr seulement.
  assert.equal(VO.estHoteVintedDeTravail("www.vinted.fr"), true);
  assert.equal(VO.estHoteVintedDeTravail("www.vinted.it"), false);
});

// ── c. vinted.it accordé + session sur vinted.it seulement → vinted.it ─────
await cas("c. vinted.it accordé, session v_uid sur vinted.it seulement → origine vinted.it (mémorisée, relue au démarrage)", async () => {
  const VO = charger({ marques: ["Microsoft Edge", "Chromium"] });
  const ch = fauxChrome({ accordes: ["https://www.vinted.it/*"], cookies: { "https://www.vinted.it": { v_uid: "4242" } } });
  assert.equal(await VO.rafraichirOrigineVinted(ch), "https://www.vinted.it");
  assert.equal(VO.motifOngletsVinted(), "*://*.vinted.it/*");
  assert.equal(VO.domaineVintedAffiche(), "vinted.it");
  assert.equal(VO.urlAnnonceVinted(9), "https://www.vinted.it/items/9");
  assert.equal(VO.estHoteVintedDeTravail("www.vinted.it"), true);
  assert.equal(ch.store[VO.CLE_STOCKAGE], "https://www.vinted.it");
  // Redémarrage du service worker : l'origine mémorisée revient, permission toujours là.
  const VO2 = charger();
  assert.equal(await VO2.chargerOrigineVinted(ch), "https://www.vinted.it");
  // Permission retirée : retour à vinted.fr.
  const VO3 = charger();
  const sans = fauxChrome();
  sans.store[VO3.CLE_STOCKAGE] = "https://www.vinted.it";
  assert.equal(await VO3.chargerOrigineVinted(sans), "https://www.vinted.fr");
});

await cas("c'. vinted.it accordé, AUCUNE session nulle part → vinted.it (c'est là qu'il faut se connecter)", async () => {
  const VO = charger();
  const ch = fauxChrome({ accordes: ["https://www.vinted.it/*"] });
  assert.equal(await VO.rafraichirOrigineVinted(ch), "https://www.vinted.it");
});

// ── d. session sur les deux → vinted.fr ───────────────────────────────────
await cas("d. session sur vinted.fr ET vinted.it accordé → vinted.fr (jamais basculé)", async () => {
  const VO = charger();
  const ch = fauxChrome({ accordes: ["https://www.vinted.it/*"], cookies: {
    "https://www.vinted.fr": { v_uid: "1" }, "https://www.vinted.it": { v_uid: "2" } } });
  assert.equal(await VO.rafraichirOrigineVinted(ch), "https://www.vinted.fr");
  assert.equal(VO.motifOngletsVinted(), "*://*.vinted.fr/*");
});

await cas("d'. le contexte serveur : seul un domaine Vinted étranger connu est retenu", () => {
  const VO = charger();
  assert.deepEqual(VO.domaineEtrangerDuServeur({ pays: "IT", domaine: "www.vinted.it", source: "reseau" }),
    { pays: "IT", hote: "www.vinted.it", motif: "https://www.vinted.it/*", domaine: "vinted.it", source: "reseau" });
  // Le pays lu sur le COMPTE Vinted est gardé comme tel (le popup l'affirme) ;
  // celui du réseau reste une déduction (le popup dit « si »).
  assert.equal(VO.domaineEtrangerDuServeur({ pays: "IT", domaine: "www.vinted.it", source: "compte_vinted" }).source, "compte_vinted");
  assert.equal(VO.domaineEtrangerDuServeur({ pays: "IT", domaine: "www.vinted.it" }).source, "reseau");
  assert.equal(VO.domaineEtrangerDuServeur(null), null);
  assert.equal(VO.domaineEtrangerDuServeur({ pays: "FR", domaine: "www.vinted.fr" }), null);
  assert.equal(VO.domaineEtrangerDuServeur({ pays: "XX", domaine: "www.exemple.com" }), null);
});

// ── e. manifest ───────────────────────────────────────────────────────────
await cas("e. manifest : aucune permission obligatoire nouvelle ; domaines étrangers seulement en optionnel (+ WAR)", () => {
  const man = JSON.parse(lire("chrome-extension/manifest.json").replace(/^﻿/, ""));
  const ref = JSON.parse(execFileSync("git", ["-C", RACINE, "show", "02f9f67:chrome-extension/manifest.json"]).toString().replace(/^﻿/, ""));
  assert.equal(man.version, "0.6.106");
  assert.deepEqual(man.permissions, ref.permissions, "permissions inchangées");
  assert.deepEqual(man.host_permissions, ref.host_permissions, "host_permissions inchangées");
  assert.deepEqual(man.content_scripts, ref.content_scripts, "content_scripts inchangés");
  const etrangers = ["be", "lu", "nl", "de", "at", "it", "es", "pt", "ie", "fi", "ee", "lv", "lt", "sk", "si", "hr", "gr"].map((t) => `https://www.vinted.${t}/*`);
  const ajoutOpt = man.optional_host_permissions.filter((h) => !ref.optional_host_permissions.includes(h));
  assert.deepEqual([...ajoutOpt].sort(), [...etrangers].sort(), "seuls les domaines Vinted étrangers s'ajoutent en optionnel");
  assert.ok(ref.optional_host_permissions.every((h) => man.optional_host_permissions.includes(h)), "aucun optionnel retiré (Opla, Depop)");
  const war = man.web_accessible_resources.flatMap((w) => w.matches);
  const refWar = ref.web_accessible_resources.flatMap((w) => w.matches);
  assert.deepEqual(war.filter((h) => !refWar.includes(h)).sort(), [...etrangers].sort(), "WAR : seuls les domaines étrangers s'ajoutent (selectors/*.js importés par vinted.js)");
  const obligatoires = JSON.stringify({ h: man.host_permissions, c: man.content_scripts });
  assert.ok(!/vinted\.(be|lu|nl|de|at|it|es|pt|ie|fi|ee|lv|lt|sk|si|hr|gr)/.test(obligatoires), "aucun domaine étranger obligatoire");
  for (const h of etrangers) {
    assert.ok(HOTES_OPTIONNELS_CWS.includes(h), `liste CWS (optionnel) : ${h}`);
    assert.ok(!HOTES_LIVRABLES_CWS.includes(h), `jamais livrable obligatoire : ${h}`);
  }
  const legal = lire("src/pages/Legal.jsx");
  for (const h of etrangers) assert.ok(legal.includes(`{ key: '${h}', scope: 'optional_host_permissions',`), `/legal : ${h}`);
  // Les scripts enregistrés à l'octroi : les mêmes que vinted.fr.
  const bg = lire("chrome-extension/background.js");
  assert.match(bg, /const VINTED_ETRANGER_SCRIPTS = \["content-scripts\/consentement\.js", "content-scripts\/vinted\.js"\];/);
  assert.match(bg, /^importScripts\("vinted-origine\.js"\);$/m);
  assert.match(lire("chrome-extension/popup.html"), /<script src="vinted-origine\.js"><\/script>\s*<script src="popup\.js"><\/script>/);
});

// ── f. le navigateur nommé ────────────────────────────────────────────────
await cas("f. « Chrome » sous Google Chrome (textes d'avant), « Edge » sous Edge, repli « ton navigateur »", () => {
  assert.equal(charger({ marques: ["Google Chrome", "Chromium", "Not=A?Brand"] }).navigateurCourt(), "Chrome");
  assert.equal(charger({ marques: ["Microsoft Edge", "Chromium"] }).navigateurCourt(), "Edge");
  assert.equal(charger({ marques: ["Microsoft Edge", "Chromium"] }).navigateurLong(), "Microsoft Edge");
  assert.equal(charger({ marques: ["Brave", "Chromium"] }).navigateurCourt(), "Brave");
  assert.equal(charger({ marques: ["Chromium"] }).navigateurCourt(), "ton navigateur");
  assert.equal(charger({ marques: ["Chromium"] }).navigateurPossessif(), "ton navigateur");
  assert.equal(charger({ marques: ["Google Chrome"] }).navigateurPossessif(), "ton Chrome");
  assert.equal(charger({ marques: null, ua: "Mozilla/5.0 Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0" }).navigateurCourt(), "Edge");
  const bg = lire("chrome-extension/background.js");
  // Plus aucun « dans Chrome » écrit en dur dans une chaîne destinée à la personne.
  const enDur = bg.split("\n").filter((L) => /dans Chrome|Chrome ouvert|ton Chrome/.test(L)
    && !/^\s*(\/\/|\*)/.test(L) && !/console\.(log|warn|error)/.test(L) && /["'`][^"'`]*(dans Chrome|Chrome ouvert|ton Chrome)/.test(L));
  assert.deepEqual(enDur, []);
});

await cas("f'. « pas connecté » : marqueurs gardés, domaine et navigateur nommés (Marta : Edge, vinted.it)", () => {
  const bg = lire("chrome-extension/background.js");
  const d = bg.indexOf('"[pas_connecte] [cause403] session_absente — aucune session Vinted dans " + VO.navigateurLong()');
  assert.ok(d > 0, "message trouvé");
  const expr = bg.slice(d, bg.indexOf(",\n", d));
  const VO = charger({ marques: ["Microsoft Edge", "Chromium"] });
  // L'origine de Marta, une fois vinted.it accordé et sa session vue.
  return VO.rafraichirOrigineVinted(fauxChrome({ accordes: ["https://www.vinted.it/*"], cookies: { "https://www.vinted.it": { v_uid: "7" } } }))
    .then(() => {
      const texte = new Function("VO", `return ${expr};`)(VO);
      assert.match(texte, /^\[pas_connecte\] \[cause403\] session_absente — aucune session Vinted dans Microsoft Edge /);
      assert.match(texte, /connecte-toi sur www\.vinted\.it dans Microsoft Edge, puis relance la synchronisation\.$/);
      // Lu par l'app : la situation « pas_connecte » (src/annonces/finReleve.js).
      assert.match(texte, /\[pas_connecte\]|aucune session vinted|session_absente/i);
      const fr = new Function("VO", `return ${expr};`)(charger());
      assert.match(fr, /aucune session Vinted dans Google Chrome .* connecte-toi sur www\.vinted\.fr dans Google Chrome,/);
    });
});

// ── g. le popup ───────────────────────────────────────────────────────────
await cas("g. popup : « Autoriser vinted.<pays> » seulement sur contexte.vinted_etranger, accès non accordé", () => {
  const pop = lire("chrome-extension/popup.js");
  assert.match(pop, /state\.vintedEtranger = FILLSELL_VINTED\.domaineEtrangerDuServeur\(data\?\.contexte\?\.vinted_etranger\);/);
  assert.match(pop, /if \(p\.key === "vinted" && state\.vintedEtranger && state\.vintedEtrangerAcces === false\) \{/);
  assert.match(pop, /chrome\.permissions\.request\(\{ origins: \[state\.vintedEtranger\.motif\] \}\)/);
  assert.match(pop, /type: "VINTED_ETRANGER_ACCES_ACCORDE"/);
  assert.match(lire("chrome-extension/background.js"), /if \(msg\?\.type === "VINTED_ETRANGER_ACCES_ACCORDE"\) \{/);
});

console.log(`vinted-origine-selftest : ${n} cas verts`);
