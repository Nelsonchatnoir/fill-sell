// ═══════════════════════════════════════════════════════════════════════════
// Selftest « N ≡ EU N » — TAILLE VINTED, SERVEUR (2026-09-23)
//   node scripts/vinted-taille-eu-serveur-selftest.mjs
//
// Le même cas que scripts/vinted-taille-eu-selftest.mjs, vu du serveur :
// get-pending-jobs sert la taille de la GRILLE RELEVÉE quand il la connaît,
// ce qui atteint tous les builds sans passer par le Chrome Web Store.
//   · tailleAServir (republication) : capture « 42 », grille qui écrit
//     « EU 42 » et pas « 42 » nu → « EU 42 » servi (client qui garde « EU ») ;
//   · tailleAServirPublication (publication) : idem, en DERNIER recours,
//     après la table femme qui servait déjà — rien de ce qui passait ne change ;
//   · jamais pour un client qui coupe « EU » (euCoupe), jamais « FR N ».
// Le code testé est IMPORTÉ de _shared/vinted-taille-republication.ts, jamais
// recopié. Rejeu sur la fixture (résultat attendu = code d'avant).
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { ORDRE_EXACT_D_ABORD, grilleDuDernierEchecTaille, optionEuPourNombreNu, tailleAServir, tailleAServirPublication }
  from "../supabase/functions/_shared/vinted-taille-republication.ts";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "scripts/fixtures/tailles-publiees-2026-09-18.json"), "utf8"));

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// Grille des costumes homme telle que l'extension la verrait relevée (union des onglets).
const COSTUMES = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "Taille unique",
  "DE 21", "DE 42", "DE 44", "DE 46", "DE 48", "32S", "42S", "42R", "EU 42", "EU 44", "EU 46", "EU 48", "EU 50"];
const BLAZERS = ["XS", "S", "M", "L", "XL", "Taille unique", "22", "30", "42", "44", "46", "48"];
const FEMME_SEPAREE = ["XXXS", "XXS", "XS", "S", "M", "L", "XL", "Autre", "Taille unique", "EU 34", "EU 36", "EU 38", "EU 40", "UK 8", "UK 10", "FR 38", "FR 40"];
const POINTURES = ["36", "37", "38", "38,5", "39"];
const moderne = { ordrePrefixe: ORDRE_EXACT_D_ABORD, euCoupe: false };

console.log("\n[1] Republication — capture « 42 » sur les costumes homme");
{
  const r = tailleAServir({ captureTaille: "42", inventaireTaille: null, options: COSTUMES }, moderne);
  ok("« 42 » → « EU 42 » servi", r.valeur === "EU 42", JSON.stringify(r));
  ok("   ordre nommé « nu→EU N », étape 1", r.ordre === "nu→EU N" && r.etape === 1, JSON.stringify(r));
  const r48 = tailleAServir({ captureTaille: "48", inventaireTaille: null, options: COSTUMES }, moderne);
  ok("« 48 » → « EU 48 »", r48.valeur === "EU 48", JSON.stringify(r48));
  const vieux = tailleAServir({ captureTaille: "42", inventaireTaille: null, options: COSTUMES }, {});
  ok("client qui coupe « EU » (sans capacité) → rien de servi, refus d'hier mot pour mot", vieux.valeur === null && vieux.motif === "capture non préfixée (hors périmètre)", JSON.stringify(vieux));
  const nue = tailleAServir({ captureTaille: "42", inventaireTaille: null, options: BLAZERS }, moderne);
  ok("grille qui écrit « 42 » nu → rien de servi (l'exact de l'extension fait foi)", nue.valeur === null, JSON.stringify(nue));
  const sans = tailleAServir({ captureTaille: "42", inventaireTaille: null, options: null }, moderne);
  ok("grille non relevée → rien de servi", sans.valeur === null, JSON.stringify(sans));
  const pointure = tailleAServir({ captureTaille: "38", inventaireTaille: null, options: POINTURES }, moderne);
  ok("pointure « 38 » sur une grille de pointures → rien (inchangé)", pointure.valeur === null, JSON.stringify(pointure));
  const prefixee = tailleAServir({ captureTaille: "EU 38", inventaireTaille: null, options: FEMME_SEPAREE }, moderne);
  ok("capture préfixée « EU 38 » → « EU 38 » (étape 1, inchangé)", prefixee.valeur === "EU 38" && prefixee.etape === 1, JSON.stringify(prefixee));
  const fr = tailleAServir({ captureTaille: "40", inventaireTaille: null, options: ["FR 38", "FR 40", "FR 42"] }, moderne);
  ok("« 40 » face à une grille FR seulement → rien : jamais « FR N »", fr.valeur === null, JSON.stringify(fr));
  const deux = tailleAServir({ captureTaille: "42", inventaireTaille: null, options: ["EU 42", "EU 42 ", "EU 44"] }, moderne);
  ok("deux options « EU 42 » (grille douteuse) → rien de servi", deux.valeur === null, JSON.stringify(deux));
}

console.log("\n[2] Publication — le dernier recours, après la table femme");
{
  const h = tailleAServirPublication({ taille: "42", cheminCategorie: "Hommes > Vêtements > Costumes et blazers > Autres", options: COSTUMES }, { euCoupe: false });
  ok("Hommes « 42 » → « EU 42 » (hier : refus « branche Hommes »)", h.valeur === "EU 42", JSON.stringify(h));
  const hv = tailleAServirPublication({ taille: "42", cheminCategorie: "Hommes > Vêtements > Costumes et blazers > Autres", options: COSTUMES });
  ok("Hommes « 42 », client qui coupe « EU » → refus d'hier", hv.valeur === null && /HOMMES/i.test(hv.motif), JSON.stringify(hv));
  const f = tailleAServirPublication({ taille: "38", cheminCategorie: "Femmes > Vêtements > Robes > Robes courtes", options: FEMME_SEPAREE }, { euCoupe: false });
  ok("Femmes « 38 » → « M » (table femme, INCHANGÉE : elle passe avant)", f.valeur === "M" && f.etape === 3, JSON.stringify(f));
  const f46 = tailleAServirPublication({ taille: "46", cheminCategorie: "Femmes > Vêtements > Robes", options: ["XS", "S", "M", "EU 44", "EU 46", "EU 48"] }, { euCoupe: false });
  ok("Femmes « 46 » (hors table 30→44) → « EU 46 » (hier : refus)", f46.valeur === "EU 46", JSON.stringify(f46));
  const p = tailleAServirPublication({ taille: "38", cheminCategorie: "Femmes > Chaussures > Baskets", options: POINTURES }, { euCoupe: false });
  ok("pointure « 38 » → refus (déjà une option), inchangé", p.valeur === null && /déjà une option/.test(p.motif), JSON.stringify(p));
  const l = tailleAServirPublication({ taille: "M", cheminCategorie: "Hommes > Vêtements > Sweats", options: ["S", "M", "L"] }, { euCoupe: false });
  ok("lettre « M » → hors périmètre (inchangé)", l.valeur === null, JSON.stringify(l));
}

console.log("\n[3] optionEuPourNombreNu — la porte, seule");
{
  const g = (o) => o.map((b) => ({ brut: b, norm: b.replace(/\s+/g, " ").trim().toUpperCase() }));
  ok("« 38,5 » ↔ « EU 38.5 » : virgule et point valent pareil", optionEuPourNombreNu("38,5", g(["EU 38.5", "EU 39"]))?.brut === "EU 38.5");
  ok("« 42 » avec « 42 » nu présent → null", optionEuPourNombreNu("42", g(["42", "EU 42"])) === null);
  ok("« XL » → null (pas un nombre)", optionEuPourNombreNu("XL", g(["EU 42"])) === null);
  ok("grille vide → null", optionEuPourNombreNu("42", []) === null);
}

console.log("\n[4] Rejeu du parc — résultat attendu = celui du code d'avant (fixture)");
{
  let n = 0, identiques = 0; const differents = []; const nouveaux = [];
  let sansAttendu = 0;
  for (const c of FIXTURE.combos) {
    if (c.plateforme !== "vinted") continue;
    n++;
    if (!("attendu_republication" in c) || !("attendu_publication" in c)) { sansAttendu++; continue; }
    const rep = tailleAServir({ captureTaille: c.taille, inventaireTaille: null, options: c.options }, moderne).valeur;
    const pub = tailleAServirPublication({ taille: c.taille, cheminCategorie: c.categorie, options: c.options }, { euCoupe: false }).valeur;
    let meme = true;
    for (const [k, v, att] of [["republication", rep, c.attendu_republication], ["publication", pub, c.attendu_publication]]) {
      if (v === att) continue;
      if (att === null && /^\d/.test(c.taille) && v === `EU ${c.taille}`) { nouveaux.push(`[${k}] « ${c.taille} » @ ${c.categorie} → « ${v} »`); continue; }
      meme = false; differents.push(`[${k}] « ${c.taille} » @ ${c.categorie} : attendu ${JSON.stringify(att)}, obtenu ${JSON.stringify(v)}`);
    }
    if (meme) identiques++;
  }
  if (sansAttendu) { ko++; console.log(`  KO   fixture sans résultat attendu sur ${sansAttendu} lignes — exécuter d'abord : node scripts/tailles-rejeu.mjs --figer`); }
  else {
    ok(`${n} combinaisons rejouées, ${identiques} identiques au code d'avant`, differents.length === 0, differents.slice(0, 5).join(" ; "));
    console.log(`  nouveaux appariements « EU N » (là où il n'y avait rien) : ${nouveaux.length}${nouveaux.length ? " — " + nouveaux.join(" ; ") : ""}`);
  }
}

console.log("\n── Grille du dernier échec (24/09, veste Brice « 48 », catégorie « Autres » sans grille au catalogue) ──");
{
  const diag = "taille demandée « 48 » — candidats essayés : « 48 » — onglets vus : S/M/L [XXS, XS, S, M, L, XL, XXL, XXXL, 4XL, 5XL, 6XL, 7XL, 8XL, Taille unique] ; DE [DE 21, DE 22, DE 42, DE 44, DE 46, DE 48, DE 50, … +20] ; UK/US [32S, 34S, 48S, 48R, … +20] ; EU [EU 42, EU 44, EU 46, EU 48, EU 50, EU 52, … +1]";
  const g = grilleDuDernierEchecTaille(diag, "48");
  ok("options relevées, sans « … +N »", Array.isArray(g) && g.includes("EU 48") && !g.some((o) => o.startsWith("…")), JSON.stringify(g));
  const r = tailleAServir({ captureTaille: "48", inventaireTaille: null, options: g }, { ordrePrefixe: ORDRE_EXACT_D_ABORD, euCoupe: false });
  ok("« 48 » → « EU 48 » (jamais DE 48, jamais 48S)", r.valeur === "EU 48", JSON.stringify(r));
  ok("relevé d'une AUTRE taille : rien", grilleDuDernierEchecTaille(diag, "42") === null);
  ok("pas de relevé : rien", grilleDuDernierEchecTaille(null, "48") === null);
  const diag42 = diag.replace("demandée « 48 »", "demandée « 42 »");
  const r42 = tailleAServir({ captureTaille: "42", inventaireTaille: null, options: grilleDuDernierEchecTaille(diag42, "42") }, { ordrePrefixe: ORDRE_EXACT_D_ABORD, euCoupe: false });
  ok("« 42 » → « EU 42 »", r42.valeur === "EU 42", JSON.stringify(r42));
  const coupe = tailleAServir({ captureTaille: "48", inventaireTaille: null, options: g }, {});
  ok("client qui coupe « EU » : rien servi", coupe.valeur === null, JSON.stringify(coupe));
}

console.log(ko === 0 ? "\n[selftest:vinted-taille-eu-serveur] OK\n" : `\n[selftest:vinted-taille-eu-serveur] ÉCHEC — ${ko} vérification(s) en défaut.\n`);
process.exit(ko === 0 ? 0 : 1);
