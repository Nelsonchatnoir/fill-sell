// selftest:copie-republication-depop — (24/10, lot « zéro blocage », A2) La copie d'une republication Depop se
// complète AVANT le départ : dépôt FillSell de la même annonce → annonce en ligne relevée → fiche ; jamais par-dessus
// une valeur de la copie (le port que la personne a saisi) ; un rayon seulement s'il désigne UNE feuille Depop ; l'état
// suit la fiche (jamais embelli). Et get-pending-jobs l'applique avant le port et avant de servir.
//   npm run selftest:copie-republication-depop
// Cas réels : Thibault, 24/10 (e62aa536 ← dépôt 38756b0f ; 8615e566 sans dépôt ; 2d418273 frais de port).
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/copie-republication-depop.js")).href);
let n = 0;
const cas = (nom, f) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("copie-republication-depop-selftest");

const USER = "a3002ab6-0000-0000-0000-000000000000";
const LIEN = "https://www.depop.com/products/thznd_733-pull-zara-taille-38-d8e8/";
// La republication telle que relue le 24/10 : recopiée du job de SUIVI du relevé (vide), port répondu par Thibault.
const E62 = {
  id: "e62aa536-a053-4484-a557-632246007f24", user_id: USER, inventaire_id: 1792064440336000, platform: "depop", action: "republish",
  status: "pending", description: null, platform_listing_id: "thznd_733-pull-zara-taille-38-d8e8", listing_url: LIEN,
  platform_fields: { source: "releve", depopPort: "4,95", etat: "Très bon état", republish_source: "manuel", republish_step: "captured" },
};
// Le dépôt FillSell du même lien (platform_listing_id NULL : c'est pour ça que le relevé a créé un second job).
const D387 = {
  id: "38756b0f-e6f3-4b6e-8da0-35252f7064bb", user_id: USER, inventaire_id: 1792064440336000, platform: "depop", action: "publish",
  status: "published", description: "Pull Zara - taille 38 . Grand col rond . Bon état", platform_listing_id: null, listing_url: LIEN,
  published_at: "2026-10-17T05:27:00Z",
  platform_fields: { depopCategoryPath: ["womenswear", "tops", "jumpers"], depopCategoryId: "womenswear/tops/jumpers",
    depopCategoryLibelles: ["Femme", "Hauts", "Pulls"], depopEtat: "used_excellent", depopPort: 4.15, depopMarque: "Zara",
    depopTaille: "M", depopCouleurs: ["grey"], marque: "Zara", taille: "M", genre: "Femme", depop_product_id: 958375048 },
};
const SUIVI = { ...D387, id: "e9f859c1-e5d6-4063-bf30-7e4c2c7df381", description: null, platform_listing_id: "thznd_733-pull-zara-taille-38-d8e8",
  platform_fields: { source: "releve" } };
const CAPTURE_E62 = { categorie: "tops/jumpers", genre: "Femme", etat: "Très bon état", marque: "Zara", taille: "M", depop_id: 958375048,
  description: "Pull Zara - taille 38 . Grand col rond . Bon état" };

cas("1. e62aa536 : tout vient du dépôt FillSell et de l'annonce en ligne — le port de Thibault (4,95) reste le sien", () => {
  assert.deepEqual(M.champsManquantsCopieDepop(E62), ["description", "rayon", "etat"]);
  const r = M.completerCopieDepop({ job: E62, depots: [SUIVI, D387], capture: CAPTURE_E62, fiche: { etat: { v: "Très bon état" } }, le: "2026-10-24T13:00:00Z" });
  assert.ok(r);
  assert.equal(r.description, "Pull Zara - taille 38 . Grand col rond . Bon état");
  assert.deepEqual(r.platform_fields.depopCategoryPath, ["womenswear", "tops", "jumpers"]);
  assert.equal(r.platform_fields.depopEtat, "used_excellent");
  assert.equal(r.platform_fields.depopPort, "4,95", "jamais par-dessus la réponse de la personne");
  assert.equal(r.platform_fields.depopMarque, "Zara");
  assert.deepEqual(r.manquants, []);
  assert.equal(r.platform_fields.copie_completee.depot_id, D387.id);
  assert.equal(r.sources.depopCategoryPath, "depot_fillsell");
});

cas("2. le job de SUIVI du relevé n'est jamais un dépôt ; un dépôt d'un autre article ou d'un autre lien non plus", () => {
  assert.equal(M.depotDeLAnnonce(SUIVI, E62), false);
  assert.equal(M.depotDeLAnnonce({ ...D387, inventaire_id: 1 }, E62), false);
  assert.equal(M.depotDeLAnnonce({ ...D387, listing_url: "https://www.depop.com/products/autre-annonce-1234/", platform_fields: { ...D387.platform_fields, depop_product_id: 1 } }, E62, CAPTURE_E62), false);
  assert.equal(M.depotDeLAnnonce({ ...D387, listing_url: null }, E62, CAPTURE_E62), true, "même produit Depop (958375048) = même annonce");
});

cas("3. 8615e566 sans dépôt : rayon de la capture (groupe/type + genre) seulement s'il désigne UNE feuille ; état de la fiche", () => {
  const job = { ...E62, id: "8615e566", inventaire_id: 2, platform_listing_id: "th1nd_733-black-brown-suede-backpack-cd28",
    listing_url: "https://www.depop.com/products/th1nd_733-black-brown-suede-backpack-cd28/", platform_fields: { source: "releve", depopPort: "9,95" } };
  const capture = { categorie: "accessories/bag", genre: "Homme", etat: "Très bon état", description: "Black & brown suede backpack" };
  const r = M.completerCopieDepop({ job, depots: [], capture, fiche: { etat: { v: "Bon état", source: "releve_leboncoin" }, description: "Sac à dos" } });
  assert.equal(r.description, "Black & brown suede backpack", "l'annonce en ligne d'abord");
  assert.deepEqual(r.platform_fields.depopCategoryPath, ["menswear", "accessories", "bag"]);
  assert.equal(r.platform_fields.depopEtat, "used_good", "la fiche fait foi (Bon état), jamais embellie par l'annonce");
  assert.deepEqual(r.manquants, []);
});

cas("4. sans genre, un groupe/type présent dans plusieurs départements ne donne AUCUN rayon (jamais deviné)", () => {
  assert.equal(M.rayonDepopDeLaCapture({ categorie: "tops/jumpers" }), null);
  assert.deepEqual(M.rayonDepopDeLaCapture({ categorie: "tops/jumpers", genre: "Fille" }), ["kidswear", "tops", "jumpers"]);
  assert.equal(M.rayonDepopDeLaCapture({ categorie: "rayon/inexistant", genre: "Femme" }), null);
});

cas("5. 2d418273 (frais de port) : le port du dépôt FillSell remplit la copie ; la question du port tombe", () => {
  const job = { ...E62, id: "2d418273", inventaire_id: 3, platform_listing_id: "thand_7s3-lot-de-trois-t-shirts-taille-a747",
    listing_url: "https://www.depop.com/products/thand_7s3-lot-de-trois-t-shirts-taille-a747/",
    platform_fields: { source: "releve", republish_step: "a_capturer", needsUserField: { field_key: "depopPort" } } };
  const depot = { ...D387, id: "d2", inventaire_id: 3, listing_url: job.listing_url, description: "Lot de trois t-shirts",
    platform_fields: { depopCategoryPath: ["menswear", "tops", "t-shirts"], depopEtat: "used_good", depopPort: 4.15 } };
  const r = M.completerCopieDepop({ job, depots: [depot], capture: { categorie: "tops/tshirts", genre: "Homme", etat: "Bon état" }, fiche: { etat: "Bon état" } });
  assert.equal(r.platform_fields.depopPort, 4.15);
  assert.ok(!("needsUserField" in r.platform_fields), "la question du port est levée");
  assert.equal(r.platform_fields.depopEtat, "used_good");
});

cas("6. rien à compléter → null ; une beauté entamée n'est jamais montée à « neuf » (la question reste)", () => {
  const complet = { ...E62, description: "x", platform_fields: { depopCategoryPath: ["womenswear", "tops", "jumpers"], depopEtat: "used_good", depopPort: 4 } };
  assert.equal(M.completerCopieDepop({ job: complet }), null);
  assert.equal(M.etatDepopPourLaCopie({ fiche: { etat: "Bon état" }, typeProduit: "makeup" }), null);
  assert.equal(M.etatDepopPourLaCopie({ fiche: { etat: "Neuf avec étiquette" }, typeProduit: "makeup" }), "brand_new");
  assert.equal(M.completerCopieDepop({ job: { ...E62, action: "publish" } }), null, "une publication n'est pas touchée ici");
});

cas("7. get-pending-jobs complète la copie AVANT le port et avant de servir, jamais une fois le retrait engagé", () => {
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  assert.ok(gpj.includes('import { completerCopieDepop, champsManquantsCopieDepop, slugDepop } from "../_shared/copie-republication-depop.js";'));
  const iBloc = gpj.indexOf("LA COPIE D'UNE REPUBLICATION DEPOP SE COMPLÈTE AVANT LE DÉPART");
  const iPort = gpj.indexOf("DEPOP : LES FRAIS DE PORT PAR DÉFAUT");
  assert.ok(iBloc > 0 && iBloc < iPort, "le bloc passe avant le port par défaut");
  const bloc = gpj.slice(iBloc, iPort);
  assert.ok(/retraitEngage\(j\)/.test(bloc), "jamais une fois le retrait engagé");
  assert.ok(/\.eq\("status", "pending"\)/.test(bloc), "écriture gardée par le statut");
  assert.ok(/coalesce|source.*releve|"releve"/.test(bloc) || /depotDeLAnnonce|completerCopieDepop/.test(bloc));
});

console.log(`copie-republication-depop-selftest : ${n} cas verts`);
