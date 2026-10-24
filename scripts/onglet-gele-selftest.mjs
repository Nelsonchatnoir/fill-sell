// selftest:onglet-gele — (24/10 soir, seghirdeborah711) Un onglet de travail gelé par Chrome (fenêtre minimisée,
// économie d'énergie) ne répond à rien tant qu'il reste caché : recharger ou rouvrir dans la même fenêtre minimisée ne
// pouvait rien (veste 571cafdc : 3 h 50, « content script muet, ni après rechargement puis onglet neuf »). Dernier
// geste : la fenêtre de travail devient visible SANS le focus, pour ce job seulement, puis se re-minimise.
//   npm run selftest:onglet-gele
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BG = fs.readFileSync(path.join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
let n = 0;
const cas = async (nom, f) => { await f(); n++; console.log(`  ✓ ${nom}`); };
console.log("onglet-gele-selftest");

function extraireFonction(source, nom) {
  const debut = source.indexOf(`function ${nom}(`);
  if (debut < 0) throw new Error(`${nom} introuvable`);
  let p = source.indexOf("(", debut); let parens = 0;
  for (; p < source.length; p++) { if (source[p] === "(") parens++; else if (source[p] === ")") { parens--; if (parens === 0) break; } }
  let i = source.indexOf("{", p); let prof = 0;
  for (; i < source.length; i++) { if (source[i] === "{") prof++; else if (source[i] === "}") { prof--; if (prof === 0) break; } }
  const avant = source.lastIndexOf("async ", debut);
  return source.slice(avant === debut - 6 ? avant : debut, i + 1);
}
const fausseChrome = ({ etatFenetre = "minimized", gele = undefined } = {}) => {
  const journal = { updates: [], session: {} };
  return {
    journal,
    chrome: {
      tabs: { get: async (id) => ({ id, windowId: 7, ...(gele === undefined ? {} : { frozen: gele }) }) },
      windows: {
        get: async (id) => ({ id, state: etatFenetre }),
        update: async (id, opts) => { journal.updates.push({ id, ...opts }); return {}; },
      },
      storage: { session: {
        set: async (o) => { Object.assign(journal.session, o); },
        get: async (k) => ({ [k]: journal.session[k] }),
        remove: async (k) => { delete journal.session[k]; },
      } },
    },
  };
};
const charger = (fc) => new Function("chrome", "journaliserEvenementFenetre", "console",
  `const FENETRE_RESTAUREE_KEY = "fillsell_fenetre_restauree_onglet_muet";\n${extraireFonction(BG, "restaurerFenetrePourOngletMuet")}\n${extraireFonction(BG, "reminimiserFenetreSiRestauree")}\nreturn { restaurerFenetrePourOngletMuet, reminimiserFenetreSiRestauree };`)(
  fc.chrome, async () => {}, { warn: () => {}, log: () => {} });

await cas("fenêtre de travail minimisée : rendue visible SANS focus, mémorisée, puis re-minimisée après le job", async () => {
  const fc = fausseChrome();
  const f = charger(fc);
  assert.equal(await f.restaurerFenetrePourOngletMuet(42), true);
  assert.deepEqual(fc.journal.updates[0], { id: 7, state: "normal", focused: false });
  assert.equal(fc.journal.session.fillsell_fenetre_restauree_onglet_muet.windowId, 7);
  await f.reminimiserFenetreSiRestauree();
  assert.deepEqual(fc.journal.updates[1], { id: 7, state: "minimized", focused: false });
  assert.equal(fc.journal.session.fillsell_fenetre_restauree_onglet_muet, undefined, "mémoire vidée");
  await f.reminimiserFenetreSiRestauree();
  assert.equal(fc.journal.updates.length, 2, "rien à re-minimiser ensuite");
});

await cas("fenêtre déjà visible, onglet non gelé : AUCUN geste (le mutisme a une autre cause)", async () => {
  const fc = fausseChrome({ etatFenetre: "normal", gele: false });
  assert.equal(await charger(fc).restaurerFenetrePourOngletMuet(42), false);
  assert.equal(fc.journal.updates.length, 0);
});

await cas("onglet gelé par Chrome dans une fenêtre visible : geste fait (jamais le focus)", async () => {
  const fc = fausseChrome({ etatFenetre: "normal", gele: true });
  assert.equal(await charger(fc).restaurerFenetrePourOngletMuet(42), true);
  assert.ok(fc.journal.updates.every((u) => u.focused === false));
});

await cas("ordre des gestes : rechargement, onglet neuf, PUIS fenêtre visible ; re-minimisée après CHAQUE job ; relevé « tab_frozen »", () => {
  const g = extraireFonction(BG, "getOrCreateWorkTab");
  const iRelance = g.indexOf("relancerOngletMuet(platform, tabId, url");
  const iVisible = g.indexOf("restaurerFenetrePourOngletMuet(relance.tabId)");
  assert.ok(iRelance > 0 && iVisible > iRelance, "la fenêtre ne devient visible qu'après rechargement + onglet neuf");
  assert.ok(/ni fenêtre de travail visible/.test(g), "le message d'échec dit les trois gestes");
  assert.equal((BG.match(/await processJob\(job, session\.access_token\);[\s\S]{0,400}?await reminimiserFenetreSiRestauree\(\)/g) ?? []).length, 2,
    "re-minimisation après chaque job, dans les deux boucles");
  assert.ok(!/state: "normal", focused: true/.test(BG.slice(BG.indexOf("async function restaurerFenetrePourOngletMuet"), BG.indexOf("async function reminimiserFenetreSiRestauree"))), "jamais le focus");
  assert.ok(/tab_frozen: typeof tab\?\.frozen === "boolean" \? tab\.frozen : null/.test(BG), "le relevé de fenêtre dit si l'onglet est gelé");
});

console.log(`onglet-gele-selftest : ${n} cas verts`);
