// Selftest — le navigateur et le pays d'un poste, le vendeur Vinted étranger,
// la phrase qui nomme le bon navigateur (09/10, Marta : extension dans Edge,
// app dans Chrome, compte italien).
//   npm run selftest:vinted-etranger
import assert from "node:assert/strict";
import { navigateurDeUA, paysDeEntete, vintedEtranger } from "../supabase/functions/_shared/navigateur-poste.js";
import { PAYS_VINTED_EURO } from "../supabase/functions/_shared/vinted-pays.ts";

// noteNavigateur importe le client Supabase de l'app : on rejoue sa logique
// pure par import dynamique avec un faux module.
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("vinted-etranger-selftest");

// En-têtes RÉELS relevés dans les journaux edge du 09/10.
const UA_EDGE_MARTA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36 Edg/154.0.0.0";
const UA_CHROME_MARTA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36";

cas("Edge se lit AVANT Chrome (Edge cite aussi Chrome/)", () => {
  assert.equal(navigateurDeUA(UA_EDGE_MARTA), "edge");
  assert.equal(navigateurDeUA(UA_CHROME_MARTA), "chrome");
  assert.equal(navigateurDeUA("Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36 OPR/106"), "opera");
  assert.equal(navigateurDeUA(""), null);
});
cas("pays du réseau : IT gardé, XX / T1 / vide écartés", () => {
  assert.equal(paysDeEntete("IT"), "IT");
  assert.equal(paysDeEntete("it"), "IT");
  assert.equal(paysDeEntete("XX"), null);
  assert.equal(paysDeEntete("T1"), null);
  assert.equal(paysDeEntete(null), null);
});

const ouverts = new Set(["IT"]);
cas("Marta : réseau IT, aucune session vinted.fr, Italie ouverte → « Autoriser www.vinted.it »", () => {
  const v = vintedEtranger({ paysReseau: "IT", ouverts, sessionVintedFr: null, domaines: PAYS_VINTED_EURO });
  assert.deepEqual(v, { pays: "IT", domaine: "www.vinted.it", source: "reseau" });
});
cas("Jamais un Français (réseau FR)", () => {
  assert.equal(vintedEtranger({ paysReseau: "FR", ouverts: new Set(["IT", "FR"]), domaines: PAYS_VINTED_EURO }), null);
});
cas("Jamais à qui travaille déjà sur vinted.fr (Alberto, compte IT, sonde 200)", () => {
  assert.equal(vintedEtranger({ paysSonde: "IT", paysReseau: "IT", ouverts, sessionVintedFr: true, domaines: PAYS_VINTED_EURO }), null);
});
cas("Jamais pour un pays fermé (Espagne, vinted_pays_es absent)", () => {
  assert.equal(vintedEtranger({ paysReseau: "ES", ouverts, domaines: PAYS_VINTED_EURO }), null);
});
cas("Le pays du COMPTE Vinted prime sur celui du réseau", () => {
  assert.deepEqual(vintedEtranger({ paysSonde: "IT", paysReseau: "FR", ouverts, domaines: PAYS_VINTED_EURO }),
    { pays: "IT", domaine: "www.vinted.it", source: "compte_vinted" });
});

// La phrase : on charge le module de l'app avec un faux client Supabase.
const { register } = await import("node:module");
const faux = "data:text/javascript," + encodeURIComponent("export const supabase = {};");
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === '../lib/supabase') return { url: ${JSON.stringify(faux)}, shortCircuit: true };
    return next(spec, ctx);
  }`));
const { noteNavigateur, navigateurDeLApp, navigateurDesPostes } = await import("../src/utils/navigateurExtension.js");

cas("Marta : extension Edge, app Chrome → la phrase nomme les deux navigateurs", () => {
  const t = noteNavigateur({ ext: "edge", app: navigateurDeLApp(UA_CHROME_MARTA), plateforme: "Vinted" });
  assert.match(t, /installée dans Microsoft Edge/);
  assert.match(t, /tu utilises FillSell dans Google Chrome/);
  assert.match(t, /Connecte-toi à Vinted dans Microsoft Edge, ou installe l'extension dans Google Chrome/);
});
cas("Extension Chrome, app Chrome → rien (aucun texte de plus pour le parc)", () => {
  assert.equal(noteNavigateur({ ext: "chrome", app: "chrome", plateforme: "Vinted" }), null);
});
cas("Navigateur du poste inconnu (extension < serveur du 09/10) → rien", () => {
  assert.equal(noteNavigateur({ ext: null, app: "chrome", plateforme: "Vinted" }), null);
});
cas("App mobile (Android) : pas de navigateur d'app ; extension dans Edge → on nomme Edge", () => {
  assert.equal(navigateurDeLApp("Mozilla/5.0 (Linux; Android 14; wv) AppleWebKit/537.36 Chrome/154.0 Mobile Safari/537.36"), null);
  assert.match(noteNavigateur({ ext: "edge", app: null, plateforme: "Vinted" }), /dans Microsoft Edge que ta session Vinted/);
});
cas("Le poste vu le plus récemment l'emporte, au-delà de 48 h il est oublié", () => {
  const maintenant = Date.parse("2026-10-09T10:00:00Z");
  assert.equal(navigateurDesPostes({
    a: { le: "2026-10-09T09:00:00Z", navigateur: "chrome" },
    b: { le: "2026-10-09T09:55:00Z", navigateur: "edge" },
    c: { le: "2026-10-01T09:55:00Z", navigateur: "opera" },
  }, maintenant), "edge");
  assert.equal(navigateurDesPostes({ c: { le: "2026-10-01T09:55:00Z", navigateur: "opera" } }, maintenant), null);
});

console.log(`vinted-etranger-selftest : ${n} cas verts`);
