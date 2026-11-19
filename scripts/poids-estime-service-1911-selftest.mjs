// ═══════════════════════════════════════════════════════════════════════════
// LE POIDS ESTIMÉ DE LA COPIE AU SERVICE (19/11/2026 soir, décision de Nico « zéro friction », client Business) — VERROU
// ═══════════════════════════════════════════════════════════════════════════
// L'app (Opus-1) pose, sur une copie Beebs ou Leboncoin dont la FICHE n'a pas de poids, platform_fields.poids_estime =
// { g, objet, source } (Leboncoin : lbcPoidsGrammes = l'estimation) — jamais inventory.poids_g.
//   · Beebs (get-pending-jobs, format_colis_explicite) ne lisait que le poids de la fiche : le palier « Poids jusqu'à … »
//     manquait → le pré-remplissage de Beebs. Désormais : fiche, sinon poids estimé (_shared/poids-estime.js), tracé
//     format_colis_explicite_source = « poids_estime ».
//   · Leboncoin (colisLbcAuService, _shared/colis-de-la-fiche.js) gardait bien le poids du job sans poids de fiche, mais
//     ne calculait NI le format, NI la tranche PRO, NI les transporteurs depuis lui (« ni poids ni choix sur la fiche :
//     inchangé ») : l'estimation de la copie en tient lieu, seulement si le poids du job EST l'estimation (ou absent).
//   · Vinted (colisVintedRetenuAuService) : un packageSizeId déjà posé n'est jamais remplacé (vérifié, inchangé).
//   node scripts/poids-estime-service-1911-selftest.mjs
import { readFileSync } from "node:fs";
import { formatBeebsExplicite } from "../supabase/functions/_shared/beebs-format-colis.js";
import { colisLbcAuService } from "../supabase/functions/_shared/colis-de-la-fiche.js";
import { colisVintedRetenuAuService } from "../supabase/functions/_shared/vinted-colis.js";

let echecs = 0;
const ok = (cond, quoi, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};
let PE = null;
try { PE = await import("../supabase/functions/_shared/poids-estime.js"); } catch (e) { ok(false, "module _shared/poids-estime.js présent", String(e?.message ?? e).slice(0, 100)); }
const ESTIME = (g) => ({ poids_estime: { g, objet: "pull", source: "ia" } });

console.log("\n1. Beebs : la fiche, sinon le poids estimé de la copie");
if (PE) {
  ok(JSON.stringify(PE.poidsBeebsAuService(null, ESTIME(450))) === JSON.stringify({ g: 450, source: "poids_estime" }), "fiche sans poids → le poids estimé");
  ok(PE.poidsBeebsAuService(1200, ESTIME(450))?.source === "fiche" && PE.poidsBeebsAuService(1200, ESTIME(450))?.g === 1200, "la fiche passe devant");
  ok(PE.poidsBeebsAuService(null, {}) === null && PE.poidsBeebsAuService(null, ESTIME(0)) === null && PE.poidsBeebsAuService(null, ESTIME("abc")) === null
    && PE.poidsBeebsAuService(null, ESTIME(90000)) === null, "rien, zéro, illisible, absurde : rien");
  ok(formatBeebsExplicite({ poidsFiche: PE.poidsBeebsAuService(null, ESTIME(450))?.g, appris: [] })?.titre === "Poids jusqu'à 500g max", "450 g estimés → « Poids jusqu'à 500g max »");
}
{
  const src = readFileSync(new URL("../supabase/functions/get-pending-jobs/index.ts", import.meta.url), "utf8");
  const i = src.indexOf("BEEBS : LE FORMAT DE COLIS À POSER EST DIT À L'EXTENSION");
  const bloc = src.slice(i, i + 6000);
  ok(/poidsBeebsAuService\(poidsDe\.get\(k\), pfJ\)/.test(bloc), "get-pending-jobs : le palier Beebs lit poidsBeebsAuService (fiche, sinon estimé)");
  ok(/"poids_estime"/.test(bloc), "get-pending-jobs : trace « poids_estime » sur format_colis_explicite_source");
}

console.log("\n2. Leboncoin : fiche sans poids → le poids estimé donne le format, la tranche PRO, les transporteurs");
{
  const pf = { lbcPoidsGrammes: 2500, ...ESTIME(2500), lbcTransporteurs: ["Courrier suivi", "Mondial Relay"] };
  const fait = colisLbcAuService(pf, { poids_g: null, attributs: null });
  ok(pf.format_colis === "Moyen", "format ← Moyen (2 500 g estimés)", JSON.stringify(pf));
  ok(String(pf.lbcAspects?.estimated_parcel_weight ?? "") !== "", "tranche PRO posée", JSON.stringify(pf.lbcAspects));
  ok(JSON.stringify(pf.lbcTransporteurs) === JSON.stringify(["Mondial Relay"]), "Courrier suivi (≤ 2 kg) retiré", JSON.stringify(pf.lbcTransporteurs));
  ok(fait.some((f) => /estim/.test(f)), "trace : poids estimé", JSON.stringify(fait));
  const pf2 = { ...ESTIME(300) };
  colisLbcAuService(pf2, { poids_g: null });
  ok(pf2.lbcPoidsGrammes === 300 && pf2.format_colis === "Petit", "poids du job absent : l'estimation est posée, format Petit", JSON.stringify(pf2));
  const pf3 = { lbcPoidsGrammes: 800, ...ESTIME(2500), format_colis: "Petit" };
  colisLbcAuService(pf3, { poids_g: null });
  ok(pf3.lbcPoidsGrammes === 800 && pf3.format_colis === "Petit", "un poids du job qui n'est pas l'estimation (tapé) : inchangé", JSON.stringify(pf3));
  const pf4 = { lbcPoidsGrammes: 2500, ...ESTIME(2500) };
  colisLbcAuService(pf4, { poids_g: 400 });
  ok(pf4.lbcPoidsGrammes === 400 && pf4.format_colis === "Petit", "la fiche pèse : elle passe devant l'estimation", JSON.stringify(pf4));
  const pf5 = { lbcPoidsGrammes: 700, format_colis: "Moyen" };
  const f5 = colisLbcAuService(pf5, { poids_g: null });
  ok(pf5.format_colis === "Moyen" && !f5.length, "sans estimation ni poids de fiche : comportement d'avant (inchangé)", JSON.stringify(pf5));
}

console.log("\n3. Vinted : un format déjà posé n'est jamais remplacé (vérification)");
{
  const retenus = { "Femmes > Vêtements > Pulls": { id: 2, libelle: "Moyen" } };
  const pf = { packageSizeId: 1, categoryPath: ["Femmes", "Vêtements", "Pulls"] };
  ok(colisVintedRetenuAuService(pf, retenus) === null && pf.packageSizeId === 1, "packageSizeId posé : gardé");
  const pfM = { colis_source: "manuel", categoryPath: ["Femmes", "Vêtements", "Pulls"] };
  ok(colisVintedRetenuAuService(pfM, retenus) === null && pfM.packageSizeId == null, "« Vinted choisit » (manuel) : gardé");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
process.exit(echecs ? 1 : 0);
