import fs from "node:fs";
import assert from "node:assert/strict";

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

assert.match(background, /const caps = \["taille_par_id", "preuves_retraits_point1_v1"\]/,
  "la 0.6.80 déclare explicitement ses gardes Point 1");
assert.match(serveur, /const preuvesRetraitsPoint1 = capacites\.includes\("preuves_retraits_point1_v1"\)/,
  "le serveur reconnaît la capacité sans relever le minimum général");
assert.match(serveur, /j\.platform === "beebs" && \(j\.action === "delete" \|\| j\.action === "republish"\)/,
  "un ancien build ne reçoit aucun retrait ni republication Beebs");
assert.match(serveur, /j\.platform === "vinted" && j\.action === "delete"/,
  "la garde de compatibilité retient le retrait Vinted direct");
assert.doesNotMatch(serveur, /const exigeExtensionPoint1[\s\S]{0,220}exigePreuveBoutiqueVinted\(j\)/,
  "une republication Vinted reste compatible avec la 0.6.79");
assert.match(serveur, /!exigeExtensionPoint1\(j\)/,
  "le motif posé à tort sur une republication Vinted est nettoyé automatiquement");
assert.match(serveur, /retraits_point1_motif: heldPreuvesRetraitsPoint1 \? MOTIF_ATTENTE_PREUVES_POINT1 : null/,
  "tout job retenu par la compatibilité reçoit un motif lisible");

console.log("✓ Beebs : formulaire réel validé avant retrait, sans soumission ; anciens builds retenus");
