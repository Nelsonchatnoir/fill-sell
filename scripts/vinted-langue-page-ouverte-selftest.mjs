// (28/10/2026) mele.marta, job 2fd83d73 « Gioco PS4 F1 2015 » : page Vinted en italien, sonde du compte muette
// (http « jeton_expire_session_ouverte », vinted_identite null à 12:24 et 12:25) → pays non lu → vinted_ids_actifs
// non servi → la catégorie est descendue par libellés français : « Électronique » introuvable parmi « Accessori,
// Donna, Uomo, Bambini, Casa, Elettronica, Libri e media… ». Banc : la vraie fonction extraite de vinted.js.
import fs from "node:fs";
import assert from "node:assert/strict";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const vt = fs.readFileSync(new URL("../chrome-extension/content-scripts/vinted.js", import.meta.url), "utf8");
const bg = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
let lang = "it";
globalThis.document = { documentElement: { getAttribute: (k) => (k === "lang" ? lang : null) } };
const langueDePageOuverte = new Function(extraireFonctionJs(vt, "langueDePageOuverte") + "; return langueDePageOuverte;")();

const servi = { vinted_ids: { catalog_id: 3026, status_id: 2 }, vinted_ids_langues_ouvertes: ["it"] };
lang = "it"; assert.equal(langueDePageOuverte(servi), true, "page italienne, « it » ouvert → pose par identifiant");
lang = "it-IT"; assert.equal(langueDePageOuverte(servi), true, "sous-étiquette régionale lue");
lang = "it"; assert.equal(langueDePageOuverte({ vinted_ids: servi.vinted_ids }), false, "rien servi (serveur d'avant) → chemin d'avant");
lang = "de"; assert.equal(langueDePageOuverte(servi), false, "langue non servie (pays fermé) → chemin d'avant");
lang = "fr"; assert.equal(langueDePageOuverte({ ...servi, vinted_ids_langues_ouvertes: ["fr", "it"] }), false, "jamais une page française");
lang = "en"; assert.equal(langueDePageOuverte({ ...servi, vinted_ids_langues_ouvertes: ["en"] }), false, "jamais une page anglaise");
lang = ""; assert.equal(langueDePageOuverte(servi), false, "page sans lang → chemin d'avant");

// La porte des identifiants accepte l'une OU l'autre autorisation, et rien d'autre ne change.
assert.ok(vt.includes("(fields.vinted_ids_actifs === true || langueDePageOuverte(fields))"), "idsVinted lit les deux autorisations");
// La recréation d'une republication transmet la liste servie.
assert.ok(bg.includes("vinted_ids_langues_ouvertes: pf.vinted_ids_langues_ouvertes.map(String)"), "construireJobRecreation la transmet");

console.log("vinted-langue-page-ouverte : OK");
