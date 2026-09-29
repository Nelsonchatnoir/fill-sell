import fs from "node:fs";
import assert from "node:assert/strict";
import { correctifPourJob } from "../supabase/functions/_shared/correctifs-extension.js";

const background = fs.readFileSync(new URL("../chrome-extension/background.js", import.meta.url), "utf8");
const beebs = fs.readFileSync(new URL("../chrome-extension/content-scripts/beebs.js", import.meta.url), "utf8");
const serveur = fs.readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");

const iPrevol = background.indexOf("prevolFormulaireRecreationBeebs({ ...job, platform_fields: pf })");
const iRetrait = background.indexOf("({ result } = await executerRetraitViaHandler(job, accessToken));", iPrevol);
assert.ok(iPrevol > 0 && iRetrait > iPrevol, "le pré-vol Beebs complet précède le retrait");
assert.match(background.slice(iPrevol, iRetrait), /if \(!ok\)[\s\S]*return \{ status: "skipped"/,
  "sans preuve positive, la branche rend la main avant le retrait");
assert.match(background.slice(iPrevol, iRetrait), /markNeedsUser\(accessToken, job, resultatPrevol\)/,
  "un champ dynamique manquant devient une question avant retrait");

const iDrapeau = beebs.indexOf("const republishPreflightOnly = fields.republish_prevol_only === true");
const iRetour = beebs.indexOf("republishPreflight: true", iDrapeau);
const iClic = beebs.indexOf("publishBtn?.click()", iDrapeau);
assert.ok(iDrapeau > 0 && iRetour > iDrapeau && iClic > iRetour,
  "le remplisseur Beebs rend sa preuve de pré-vol avant tout clic de publication");
assert.match(beebs, /!republishPreflightOnly && job\.photos\?\.length \? await uploadPhotos/,
  "le pré-vol n'envoie pas les photos");
assert.doesNotMatch(beebs, /la copie ne porte aucune taille[^\n]+valeur neutre/,
  "une taille absente n'est jamais remplacée par « Taille unique »");

assert.match(serveur, /\["publish", "republish"\]\.includes\(String\(j\.action\)\)/,
  "les valeurs certaines de la fiche sont aussi servies aux republications Beebs");
assert.match(serveur, /\["couleur", "Couleur"\], \["matiere", "Matière"\], \["taille", "Taille"\]/,
  "la taille explicite de la fiche alimente le redépôt");

const misscat = {
  id: "2586c549-53f1-463d-82d2-f96596773da6",
  platform: "beebs",
  action: "republish",
  status: "needs_user",
  handler_build: "2026-09-27T20:16:30Z+66a8887 · v0.6.77",
  error: "Beebs exige des champs encore vides pour cette catégorie : Pointure. clé du champ à trancher: Pointure.",
  platform_fields: {
    republish_step: "deleted",
    needs_user_source: "champ_a_choisir",
    needsUserField: { field_key: "Pointure", target: { key: "taille", root: null } },
  },
};
assert.equal(correctifPourJob(misscat)?.cle, "beebs_prevol_champs_avant_retrait",
  "le vrai job Bottines LPB est réarmé automatiquement par un poste 0.6.80");
assert.equal(correctifPourJob({ ...misscat, platform_fields: { ...misscat.platform_fields, needs_user_source: "boutique_etrangere" } }), null,
  "un autre besoin utilisateur n'est jamais réarmé par cette porte");

console.log("✓ Beebs : formulaire réel validé avant retrait, sans soumission ; taille certaine resservie");
