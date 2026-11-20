// Autotest VERROU : L'ÉTAT EST MONTRÉ UNE FOIS, ET JUSTE, DANS CHAQUE ONGLET DE PLATEFORME (20/11/2026, ordre de Nico —
// lot « écrans », point 2 : « État demandé une seule fois »).
//
//     node --import ./scripts/loader-ext.mjs scripts/etat-une-fois-fiche-2011-selftest.mjs
//     RACINE=<copie> node --import ./scripts/loader-ext.mjs scripts/etat-une-fois-fiche-2011-selftest.mjs   (rouge avant)
//
// Relevé sur l'app en ligne (281093a), compte de Nico, lot Vinted + Leboncoin, fiche TEST « Pull col roulé … » : l'article
// est PRÊT (son état « Très bon état » est déduit de « porté quelques fois »), mais l'onglet Vinted montrait DEUX lignes
// « État » — en haut « À ajouter » (le champ dédié de la copie, vide), en bas « Très bon état » (le critère « condition »
// du rayon, là où l'état est rangé). On croit qu'il manque une réponse déjà donnée.
// Ce qu'il prouve :
//   1. la ligne « État » d'une copie lit l'état là où le moteur et le serveur le lisent (etatsDuJob : champ dédié, puis
//      critère du rayon, puis lu sur l'annonce) — plus jamais « À ajouter » pour un état connu ;
//   2. le critère d'état du rayon (Vinted « condition », Leboncoin « condition » / « *_condition », Beebs « État ») n'est
//      plus redit en bas de l'onglet ; il y revient seulement s'il BLOQUE (la question le pose) ;
//   3. les autres critères du rayon restent tous (rien ne disparaît).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.RACINE ? process.env.RACINE : join(dirname(fileURLToPath(import.meta.url)), "..");
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
let ko = 0, n = 0;
const ok = (c, m, d = "") => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 240)}` : ""}`); } };
const essai = (f) => { try { return f(); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };

const C = await charger("src/publication/lot/corrections.js");
const F = await charger("src/publication/lot/ficheLue.js");
if (C.__erreur || F.__erreur) console.log(`  (chargement : ${C.__erreur ?? ""} ${F.__erreur ?? ""})`);

console.log("1. la ligne « État » de la copie lit l'état là où il est rangé");
const m = (pf) => ({ generales: { etat: "" }, edited: { vinted: { platform_fields: pf } } });
ok(essai(() => C.valeurDeLaCopie(m({ vintedAspects: { condition: "Très bon état" } }), "vinted", "etat")) === "Très bon état",
  "Vinted : l'état rangé dans le critère « condition » du rayon (le pull de l'essai) — plus « À ajouter »");
ok(essai(() => C.valeurDeLaCopie(m({ etat: "Bon état", vintedAspects: { condition: "Très bon état" } }), "vinted", "etat")) === "Bon état",
  "le champ dédié de la copie passe devant (inchangé)");
ok(essai(() => C.valeurDeLaCopie({ edited: { leboncoin: { platform_fields: { lbcAspects: { condition: "État neuf" } } } } }, "leboncoin", "etat")) === "État neuf",
  "Leboncoin : son critère « condition »");
ok(essai(() => C.valeurDeLaCopie(m({}), "vinted", "etat")) === "", "aucun état nulle part : vide (« À ajouter »), jamais inventé");
ok(essai(() => C.valeurDeLaCopie({ edited: { vinted: { platform_fields: {} } }, genericRequiredStatus: { vinted: [{ key: "condition", label: "État", state: "ok", value: "Très bon état" }] } }, "vinted", "etat")) === "Très bon état",
  "l'état connu par le seul critère du rayon (la valeur que le moteur lit) : montré en haut, puisqu'il n'est plus redit en bas");

console.log("\n2. le critère d'état du rayon n'est plus redit en bas de l'onglet (sauf s'il bloque)");
const ligne = (key, label, state, value, extra = {}) => ({ key, label, state, value, allowedValues: ["Neuf avec étiquette", "Très bon état", "Bon état"], ...extra });
const ids = (l) => (Array.isArray(l) ? l.map((d) => d.cle).join(",") : JSON.stringify(l));
const vinted = { genericRequiredStatus: { vinted: [ligne("condition", "État", "ok", "Très bon état"), ligne("material", "Matière", "ok", "Laine")] }, edited: { vinted: { platform_fields: {} } } };
ok(ids(essai(() => F.detailsDe(vinted, "vinted"))) === "material", "Vinted : « État » (condition) plus redit ; « Matière » reste", ids(essai(() => F.detailsDe(vinted, "vinted"))));
const lbc = { genericRequiredStatus: { leboncoin: [ligne("condition", "État", "ok", "État neuf"), ligne("creative_activities_product", "Produit", "ok", "Autre")] }, edited: { leboncoin: { platform_fields: {} } } };
ok(ids(essai(() => F.detailsDe(lbc, "leboncoin"))) === "creative_activities_product", "Leboncoin : « condition » plus redit ; « Produit » reste");
const beebs = { genericRequiredStatus: { beebs: [ligne("État", "État", "ok", "Très bon état"), ligne("Âge", "Âge", "ok", "3 ans")] }, edited: { beebs: { platform_fields: {} } } };
ok(ids(essai(() => F.detailsDe(beebs, "beebs"))) === "Âge", "Beebs : « État » plus redit ; « Âge » reste");
const bloque = { genericRequiredStatus: { vinted: [ligne("condition", "État", "invalid", "Neuf", { blocking: true }), ligne("material", "Matière", "ok", "Laine")] }, edited: { vinted: { platform_fields: {} } } };
ok(ids(essai(() => F.detailsDe(bloque, "vinted"))).split(",").includes("condition"), "un critère d'état qui BLOQUE reste (la question le pose)", ids(essai(() => F.detailsDe(bloque, "vinted"))));

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ tout est vert — ${n} vérifications`);
process.exit(ko ? 1 : 0);
