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
const WORK_WINDOW_KEY = "fillsell_work_window";
const fausseChrome = ({ etatFenetre = "minimized", gele = undefined, actif = undefined, dediee = false } = {}) => {
  const journal = { updates: [], ongletsActives: [], session: dediee ? { [WORK_WINDOW_KEY]: 7 } : {} };
  return {
    journal,
    chrome: {
      tabs: {
        get: async (id) => ({ id, windowId: 7, ...(gele === undefined ? {} : { frozen: gele }), ...(actif === undefined ? {} : { active: actif }) }),
        update: async (id, opts) => { journal.ongletsActives.push({ id, ...opts }); return {}; },
      },
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
  `const FENETRE_RESTAUREE_KEY = "fillsell_fenetre_restauree_onglet_muet";\nconst WORK_WINDOW_KEY = "${WORK_WINDOW_KEY}";\n${extraireFonction(BG, "restaurerFenetrePourOngletMuet")}\n${extraireFonction(BG, "reminimiserFenetreSiRestauree")}\n${extraireFonction(BG, "montrerOngletDansFenetreDediee")}\nreturn { restaurerFenetrePourOngletMuet, reminimiserFenetreSiRestauree, montrerOngletDansFenetreDediee };`)(
  fc.chrome, async () => {}, { warn: () => {}, log: () => {} });
assert.ok(new RegExp(`const WORK_WINDOW_KEY = "${WORK_WINDOW_KEY}"`).test(BG), "la clé de la fenêtre dédiée du banc est celle du background");

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

// ── (01/11 soir, gjehly — 0.6.165) Une fenêtre visible ne montre que son onglet actif ──────────────────────────────────
await cas("fenêtre dédiée minimisée, onglet caché derrière le porte-page : fenêtre visible ET onglet montré, jamais le focus", async () => {
  const fc = fausseChrome({ actif: false, dediee: true });
  assert.equal(await charger(fc).restaurerFenetrePourOngletMuet(42), true);
  assert.deepEqual(fc.journal.updates[0], { id: 7, state: "normal", focused: false });
  assert.deepEqual(fc.journal.ongletsActives, [{ id: 42, active: true }]);
  assert.ok(fc.journal.updates.every((u) => u.focused === false));
});

await cas("fenêtre dédiée DÉJÀ visible mais onglet caché (relevé de client-229c7b07 : normal, tab_active false) : geste fait", async () => {
  const fc = fausseChrome({ etatFenetre: "normal", gele: false, actif: false, dediee: true });
  assert.equal(await charger(fc).restaurerFenetrePourOngletMuet(42), true);
  assert.deepEqual(fc.journal.ongletsActives, [{ id: 42, active: true }]);
});

await cas("onglet hors fenêtre dédiée (fenêtre de l'utilisateur) : jamais activé — on ne change pas ce qu'il regarde", async () => {
  const fc = fausseChrome({ etatFenetre: "normal", gele: false, actif: false, dediee: false });
  assert.equal(await charger(fc).restaurerFenetrePourOngletMuet(42), false);
  assert.equal(fc.journal.ongletsActives.length + fc.journal.updates.length, 0);
  const fc2 = fausseChrome({ actif: false, dediee: false });
  assert.equal(await charger(fc2).restaurerFenetrePourOngletMuet(42), true, "fenêtre minimisée : rendue visible comme avant");
  assert.equal(fc2.journal.ongletsActives.length, 0, "… mais l'onglet d'une fenêtre non dédiée n'est jamais activé");
  assert.equal(await charger(fausseChrome({ actif: false, dediee: false })).montrerOngletDansFenetreDediee(42), false);
  const fc3 = fausseChrome({ actif: false, dediee: true });
  assert.equal(await charger(fc3).montrerOngletDansFenetreDediee(42), true, "onglet neuf de la fenêtre dédiée : montré");
  assert.equal(await charger(fausseChrome({ actif: true, dediee: true })).montrerOngletDansFenetreDediee(42), false, "déjà actif : rien");
});

await cas("la sonde de l'onglet muet : remède seulement sur preuve (injection manquée, flux sans fin au formulaire hydraté)", () => {
  const remedeOngletMuet = new Function(`${extraireFonction(BG, "remedeOngletMuet")}\nreturn remedeOngletMuet;`)();
  assert.equal(remedeOngletMuet({ scripts_manifeste: false, ready_state: "complete" }), "injection_manquee");
  assert.equal(remedeOngletMuet({ scripts_manifeste: false, ready_state: "interactive" }), "injection_manquee");
  assert.equal(remedeOngletMuet({ scripts_manifeste: false, ready_state: "loading", formulaire_hydrate: true }), "flux_sans_fin");
  assert.equal(remedeOngletMuet({ scripts_manifeste: false, ready_state: "loading", formulaire_hydrate: false }), null, "formulaire mort : rien");
  assert.equal(remedeOngletMuet({ scripts_manifeste: true, ready_state: "complete" }), null, "scripts déjà là (muet pour une autre raison) : jamais une seconde injection");
  assert.equal(remedeOngletMuet({ fil_bloque: true }), null, "fil de la page bloqué : rien");
  assert.equal(remedeOngletMuet({ erreur: "Cannot access contents" }), null);
  assert.equal(remedeOngletMuet(null), null);
  const s = extraireFonction(BG, "sonderOngletMuet");
  assert.ok(/injectImmediately: true/.test(s) && /world: "MAIN"/.test(s) && /SONDE_ONGLET_MUET_MS/.test(s), "sonde immédiate, deux mondes, bornée");
  assert.ok(/journaliserEvenementFenetre\("sonde_onglet_muet"/.test(s), "le verdict part dans le journal de fenêtre (work_window_state)");
  assert.ok(!/sendMessage|\.click\(|\.value\s*=/.test(s), "la sonde ne touche à rien de la page");
  const inj = extraireFonction(BG, "injecterScriptsManquants");
  assert.ok(/getManifest\(\)\.content_scripts/.test(inj) && /files: fichiers, injectImmediately: true/.test(inj), "les fichiers mêmes du manifeste, dans leur ordre");
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
