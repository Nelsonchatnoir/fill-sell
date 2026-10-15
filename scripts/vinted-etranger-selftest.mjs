// Selftest — le navigateur et le pays d'un poste, le vendeur Vinted étranger,
// la phrase qui nomme le bon navigateur (09/10, Marta : extension dans Edge,
// app dans Chrome, compte italien).
//   npm run selftest:vinted-etranger
import assert from "node:assert/strict";
import { navigateurDeUA, paysDeEntete, vintedEtranger, paysDeFuseau, paysAppareilDesReglages } from "../supabase/functions/_shared/navigateur-poste.js";
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

// ── (15/10, lot B) LE PAYS DE L'APPAREIL — le signal qui arrive vraiment ────
// Mesuré le 15/10 : cf-ipcountry est vu par la passerelle (FR 376, DE 5 sur
// une heure de get-pending-jobs) mais 0 poste sur 138 n'a jamais porté de pays
// en base : l'en-tête n'atteint pas le code. Le fuseau de l'appareil de l'app
// (Intl), noté par l'app, le remplace.
cas("fuseau → pays : Europe/Rome = IT, Europe/Paris = FR, inconnu = null", () => {
  assert.equal(paysDeFuseau("Europe/Rome"), "IT");
  assert.equal(paysDeFuseau("Europe/Paris"), "FR");
  assert.equal(paysDeFuseau("Atlantic/Canary"), "ES");
  assert.equal(paysDeFuseau("America/New_York"), null);
  assert.equal(paysDeFuseau(""), null);
});
cas("pays d'appareil lu dans platform_settings.vinted.pays_appareil (illisible → null)", () => {
  assert.equal(paysAppareilDesReglages({ vinted: { pays_appareil: "IT" } }), "IT");
  assert.equal(paysAppareilDesReglages({ vinted: { pays_appareil: "it" } }), "IT");
  assert.equal(paysAppareilDesReglages({ vinted: {} }), null);
  assert.equal(paysAppareilDesReglages(null), null);
});
cas("Marta : appareil IT, aucune session vinted.fr → « Autoriser www.vinted.it » (source appareil, jamais affirmée)", () => {
  assert.deepEqual(vintedEtranger({ paysAppareil: "IT", ouverts, sessionVintedFr: null, domaines: PAYS_VINTED_EURO }),
    { pays: "IT", domaine: "www.vinted.it", source: "appareil" });
});
cas("Le pays du COMPTE prime sur celui de l'appareil ; l'appareil sur le réseau", () => {
  assert.equal(vintedEtranger({ paysSonde: "FR", paysAppareil: "IT", ouverts, domaines: PAYS_VINTED_EURO }), null);
  assert.equal(vintedEtranger({ paysAppareil: "IT", paysReseau: "FR", ouverts, domaines: PAYS_VINTED_EURO }).source, "appareil");
});
cas("Appareil IT mais session vinted.fr vivante (Alberto) → rien ; pays fermé (ES) → rien", () => {
  assert.equal(vintedEtranger({ paysAppareil: "IT", ouverts, sessionVintedFr: true, domaines: PAYS_VINTED_EURO }), null);
  assert.equal(vintedEtranger({ paysAppareil: "ES", ouverts, domaines: PAYS_VINTED_EURO }), null);
});

// La phrase : on charge le module de l'app avec un faux client Supabase.
const { register } = await import("node:module");
const faux = "data:text/javascript," + encodeURIComponent("export const supabase = {};");
register("data:text/javascript," + encodeURIComponent(`
  export async function resolve(spec, ctx, next) {
    if (spec === '../lib/supabase') return { url: ${JSON.stringify(faux)}, shortCircuit: true };
    if (spec === './reglagesPlateformes') return { url: "data:text/javascript," + encodeURIComponent("export async function fusionnerReglages(){ return { data: null, error: null }; }"), shortCircuit: true };
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

const { paysVintedDeLAppareil, noteVintedEtranger, domaineVintedDe } = await import("../src/utils/vintedEtrangerApp.js");
cas("app : un appareil en France ne voit rien de plus (aucune note, aucune écriture)", () => {
  assert.equal(paysVintedDeLAppareil("Europe/Paris"), null);
  assert.equal(noteVintedEtranger({ pays: null }), null);
  assert.equal(noteVintedEtranger({ pays: "FR" }), null);
});
cas("app : Marta (Europe/Rome, extension Edge, Italie ouverte) → domaine nommé, deux gestes, puis « Synchroniser »", () => {
  assert.equal(paysVintedDeLAppareil("Europe/Rome"), "IT");
  assert.equal(domaineVintedDe("IT"), "vinted.it");
  const t = noteVintedEtranger({ pays: "IT", navigateur: "edge", ouvert: true });
  assert.ok(t.startsWith("Ton compte Vinted est sur vinted.it ? Dans Microsoft Edge, connecte-toi sur www.vinted.fr avec tes identifiants Vinted habituels"), t);
  assert.ok(t.includes("appuie sur « Autoriser vinted.it »"), t);
  assert.ok(t.endsWith("Puis appuie sur « Synchroniser »."), t);
});
cas("app : pays pas encore ouvert par FillSell → seul le geste qui marche (www.vinted.fr), jamais un bouton qui n'existe pas", () => {
  const t = noteVintedEtranger({ pays: "ES", navigateur: "chrome", ouvert: false });
  assert.ok(t.includes("vinted.es") && t.includes("www.vinted.fr"), t);
  assert.ok(!t.includes("Autoriser"), t);
});

console.log(`vinted-etranger-selftest : ${n} cas verts`);
