// ═══════════════════════════════════════════════════════════════════════════
// UNE PUBLICATION VINTED SANS RAYON REPREND CELUI DE LA CAPTURE — `npm run selftest:vinted-rayon-capture-2111`
// ═══════════════════════════════════════════════════════════════════════════
// (21/11/2026 nuit, rouge 1 de Nico — noubliejamais, « La maison de bluey ») Remise en vente Vinted d'une annonce importée
// (jamais publiée par FillSell) : aucun categoryPath, le formulaire refusait, puis « plusieurs essais automatiques ».
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { vintedSansRayon, champsVintedDeLaCapture } from "../supabase/functions/_shared/vinted-champs-capture.js";
import { classerEchec } from "../supabase/functions/_shared/pas-de-rouge.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8");
let verts = 0, rouges = 0;
const ok = (c, m) => { if (c) { verts++; console.log(`  ✓ ${m}`); } else { rouges++; console.log(`  ✗ ${m}`); } };

const CAPTURE = { id: 34232, captured_at: "2026-11-14T21:40:00Z", libelles: {
  etat: "Très bon état", colis: "Petit", marque: "Bluey", taille: "Taille unique", couleurs: ["Multicolore"], matiere_ids: [300],
  categoryPath: ["Enfants", "Jeux et jouets", "Figurines et accessoires", "Sets de jeux"] } };
const JOB = { platform: "vinted", action: "publish", platform_fields: { capture_id: "34232", remise_en_vente: { restant: 4 } } };

console.log("1. La règle");
ok(vintedSansRayon(JOB), "une publication Vinted sans rayon est à compléter");
ok(!vintedSansRayon({ ...JOB, platform_fields: { categoryPath: ["Femmes", "Vêtements"] } }), "une tâche qui a son rayon n'est jamais touchée");
ok(!vintedSansRayon({ ...JOB, platform_fields: { remise_par_republier: { transaction_id: 1 } } }), "« Republier » de Vinted (vente annulée) : aucun formulaire, rien à poser");
ok(!vintedSansRayon({ ...JOB, platform: "leboncoin" }) && !vintedSansRayon({ ...JOB, action: "republish" }), "Vinted, publication seulement");
const c = champsVintedDeLaCapture(JOB.platform_fields, CAPTURE);
ok(c && c.categoryPath.join(" > ") === "Enfants > Jeux et jouets > Figurines et accessoires > Sets de jeux" && c.etat === "Très bon état"
  && c.marque === "Bluey" && c.taille === "Taille unique" && c.colors?.[0] === "Multicolore" && c.rayon_de_la_capture?.capture_id === 34232,
  "le rayon, l'état, la marque, la taille, les couleurs de la capture — et la trace de leur origine");
const c2 = champsVintedDeLaCapture({ etat: "Neuf avec étiquette", marque: "Autre" }, CAPTURE);
ok(c2.etat === undefined && c2.marque === undefined && c2.categoryPath.length === 4, "ce que porte la tâche garde la main");
ok(champsVintedDeLaCapture({}, { id: 1, libelles: { etat: "Bon état" } }) === null && champsVintedDeLaCapture({}, null) === null,
  "une capture sans rayon : rien (jamais un rayon inventé)");
const r = classerEchec({ platform: "vinted", action: "publish", brut: "platform_fields.categoryPath absent — article non mappé vers le catalogue Vinted", pf: {}, essais: 0, reprisesFaites: 0 });
ok(r.motif === "vinted_rayon_inconnu" && r.statut === "needs_user" && /choisis son rayon Vinted/.test(r.message) && !/plusieurs essais/.test(r.message),
  "sans capture : tout de suite le message qui dit quoi choisir, jamais « plusieurs essais automatiques »");

console.log("2. Le câblage");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/if \(poses >= 20 \|\| !vintedSansRayon\(j as never\)\) continue;/.test(gpj) && /champsVintedDeLaCapture\(pfJ,/.test(gpj)
  && /\.eq\("verdict", "valide"\)\.not\("libelles->categoryPath", "is", null\)/.test(gpj), "get-pending-jobs complète la tâche au départ, depuis une capture valide qui porte un rayon");
ok(!gpj.includes('from "../_shared/pas-de-rouge.js"'), "get-pending-jobs n'importe toujours pas pas-de-rouge (plafond de 5 Mo)");

console.log(`\n${rouges ? "✗" : "✓"} vinted-rayon-capture-2111 : ${verts} contrôles verts, ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
