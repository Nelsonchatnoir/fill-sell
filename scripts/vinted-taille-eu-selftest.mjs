// ═══════════════════════════════════════════════════════════════════════════
// Selftest « N ≡ EU N » — TAILLE VINTED, EXTENSION (2026-09-23)
//   node scripts/vinted-taille-eu-selftest.mjs [chemin/vers/vinted.js]
//
// LE CAS : vestes de costume de Joséphine (jobs d6ec3d42, 9a3da3d5). La
// capture rend « 42 » ; le formulaire (Hommes > Vêtements > Costumes et
// blazers > Autres) range la même taille sous l'onglet EU et l'écrit « EU 42 ».
// Depuis la 0.6.25, plus rien ne rapprochait les deux ; le job tombait en
// needs_user avec « relance quand tu veux » — et la relance rebutait.
//
// CE QUE CE TEST PROUVE, sur LE CODE RÉELLEMENT EMBARQUÉ (fonctions extraites
// de vinted.js, jamais recopiées) :
//   1. « 42 » sur le panneau de Joséphine → « EU 42 » cliqué, onglet EU ;
//   2. tout ce qui passait AVANT passe PAREIL : le candidat « EU N » n'est
//      essayé qu'après tous les autres, dans tous les onglets — rejeu sur les
//      combinaisons (taille × grille relevée) des jobs publiés du 18 au
//      23/09 (scripts/fixtures/tailles-publiees-2026-09-18.json, résultat
//      attendu = celui du code d'avant, figé dans ce fichier par
//      scripts/tailles-rejeu.mjs) ;
//   3. un échec déterministe rend un CHOIX (needsUserField avec la liste des
//      tailles vues) et ne dit plus « relance ».
// ═══════════════════════════════════════════════════════════════════════════
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chargerTailleVinted, panneau } from "./lib/vinted-taille-bac.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CHEMIN = process.argv[2] ?? join(ROOT, "chrome-extension/content-scripts/vinted.js");
const SRC = readFileSync(CHEMIN, "utf8");
const FIXTURE = JSON.parse(readFileSync(join(ROOT, "scripts/fixtures/tailles-publiees-2026-09-18.json"), "utf8"));
const bac = (document) => chargerTailleVinted(SRC, document);

let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };

// ── [1] LE PANNEAU DE JOSÉPHINE (last_diagnostic du job d6ec3d42, 23/09) ───
const SML = ["XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "Taille unique"];
const DE = ["DE 21", "DE 22", "DE 23", "DE 24", "DE 25", "DE 26", "DE 27", "DE 28", "DE 29", "DE 30", "DE 31", "DE 32", "DE 33", "DE 42", "DE 44", "DE 46", "DE 48", "DE 50", "DE 51", "DE 52", "DE 54", "DE 56", "DE 58", "DE 60"];
const UKUS = ["32S", "34S", "36S", "38S", "40S", "42S", "44S", "46S", "48S", "50S", "52S", "54S", "56S", "32R", "34R", "35R", "36R", "37R", "38R", "39R", "40R", "42R", "44R", "46R", "48R"];
const EU = ["EU 42", "EU 44", "EU 46", "EU 48", "EU 50", "EU 52", "EU 54", "EU 56", "EU 58", "EU 60", "EU 62", "EU 64", "EU 66", "EU 68", "EU 70", "EU 72", "EU 74", "EU 76", "EU 78", "EU 80", "Taille unique"];
const COSTUMES = () => panneau([
  { texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML },
  { texte: "DE", groupe: 91, idDepart: 2200, options: DE },
  { texte: "UK/US", groupe: 92, idDepart: 2300, options: UKUS },
  { texte: "EU", groupe: 93, idDepart: 2400, options: EU },
]);

console.log("\n[1] Joséphine — « 42 » et « 48 » sur le panneau des costumes homme");
for (const [taille, attendu] of [["42", "EU 42"], ["48", "EU 48"]]) {
  const { document, clics } = COSTUMES();
  const b = bac(document);
  const warnings = [];
  const pose = await b.selectTailleVinted({ taille }, warnings);
  ok(`« ${taille} » posée`, pose === true, `pose=${pose} ${warnings.join(" | ")}`);
  ok(`   → option cliquée « ${attendu} »`, clics[clics.length - 1] === attendu, `clics=${JSON.stringify(clics)}`);
  ok(`   → warning « posée sous la forme « ${attendu} » »`, warnings.some((w) => String(w).includes(`posée sous la forme « ${attendu} »`)), warnings.join(" | "));
}
{
  const c = bac(COSTUMES().document).candidatsTailleVinted("42");
  ok("candidats de « 42 » : « 42 » d'abord, « EU 42 » ensuite", JSON.stringify(c) === JSON.stringify(["42", "EU 42"]), JSON.stringify(c));
  // (06/10, dbz70) « EU 42 » d'abord ; la forme nue « 42 » vient APRÈS et ne
  // se cherche que dans une grille sans onglet ou l'onglet EU (cf. [1bis]).
  const c2 = bac(COSTUMES().document).candidatsTailleVinted("EU 42");
  ok("« EU 42 » garde son pays (« 42 » nu seulement après)", JSON.stringify(c2) === JSON.stringify(["EU 42", "42"]), JSON.stringify(c2));
  const uk = bac(COSTUMES().document).candidatsTailleVinted("UK 12");
  ok("« UK 12 » ne devient pas « 12 »", JSON.stringify(uk) === JSON.stringify(["UK 12"]), JSON.stringify(uk));
  const c3 = bac(COSTUMES().document).candidatsTailleVinted("W32 L34");
  ok("candidats de « W32 L34 » : inchangés (jamais « EU »)", JSON.stringify(c3) === JSON.stringify(["W32 L34", "W32", "32"]), JSON.stringify(c3));
  ok("jamais « FR N » ni « UK N » pour un nombre nu", !bac(COSTUMES().document).candidatsTailleVinted("42").some((x) => /^(FR|UK|IT|US)\s/i.test(x)));
}

// ── [1bis] dbz70 (06/10) : « EU 40 » face à la grille nue des chaussures ─────
// Relevé dans le Chrome de Nico le 06/10 : catalog 2632 (Femmes > Chaussures >
// Baskets) = groupe 7 « Chaussures », « 34 » … « 46 » nus, sans onglet ; la
// capture de l'annonce d'origine rend « EU 40 » (size_id 2037, groupe 87 EU).
console.log("\n[1bis] dbz70 — « EU 40 » sur la grille nue des chaussures, et les onglets interdits");
const POINTURES_NUES = ["34", "34.5", "35", "35.5", "36", "36.5", "37", "37.5", "38", "38.5", "39", "39.5", "40", "40.5", "41", "41.5", "42", "42.5", "43", "43.5", "44", "44.5", "45", "45.5", "46", "Taille unique", "Autre"];
for (const [taille, attendu] of [["EU 40", "40"], ["EU 40.5", "40.5"], ["EU 38", "38"]]) {
  const { document, clics } = panneau([{ texte: "", groupe: 7, idDepart: 55, options: POINTURES_NUES }]);
  const warnings = [];
  const pose = await bac(document).selectTailleVinted({ taille }, warnings);
  ok(`« ${taille} » posée sur la grille nue`, pose === true, warnings.join(" | "));
  ok(`   → option cliquée « ${attendu} », une seule`, clics.length === 1 && clics[0] === attendu, JSON.stringify(clics));
}
{
  // Panneau des costumes : « EU 43 » n'existe dans aucun onglet. La forme nue
  // « 43 » ne doit JAMAIS être cherchée dans DE, UK/US ou S/M/L.
  const { document, clics } = panneau([
    { texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML },
    { texte: "DE", groupe: 91, idDepart: 2200, options: [...DE, "43"] },
    { texte: "UK/US", groupe: 92, idDepart: 2300, options: [...UKUS, "43"] },
    { texte: "EU", groupe: 93, idDepart: 2400, options: EU },
  ]);
  const pose = await bac(document).selectTailleVinted({ taille: "EU 43" }, []);
  ok("costumes « EU 43 » absent : rien posé, jamais un « 43 » d'un autre onglet", pose === false && clics.length === 0, JSON.stringify(clics));
  const { document: d2, clics: c2b } = COSTUMES();
  const pose2 = await bac(d2).selectTailleVinted({ taille: "EU 42" }, []);
  ok("costumes « EU 42 » → « EU 42 » (onglet EU), inchangé", pose2 === true && c2b[c2b.length - 1] === "EU 42", JSON.stringify(c2b));
  const { document: d3, clics: c3b } = panneau([
    { texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML },
    { texte: "EU", groupe: 93, idDepart: 2400, options: ["40", "42", "44"] },
  ]);
  const pose3 = await bac(d3).selectTailleVinted({ taille: "EU 42" }, []);
  ok("onglet EU qui écrit « 42 » nu → « 42 » de l'onglet EU", pose3 === true && c3b[c3b.length - 1] === "42", JSON.stringify(c3b));
  const { document: d4, clics: c4b } = panneau([{ texte: "", groupe: 7, idDepart: 55, options: POINTURES_NUES }]);
  const pose4 = await bac(d4).selectTailleVinted({ taille: "UK 8" }, []);
  ok("« UK 8 » sur la grille nue : rien posé (jamais une conversion de système)", pose4 === false && c4b.length === 0, JSON.stringify(c4b));
}

// ── [2] CE QUI PASSAIT PASSE PAREIL — cas relevés ────────────────────────────
{
  const { document, clics } = panneau([{ texte: "", groupe: 7, idDepart: 100, options: ["8 ans", "10 ans", "12 ans"] }]);
  await bac(document).selectTailleVinted({ taille: "10 years" }, []);
  ok("Beganton : 10 years est traduit en 10 ans", clics[0] === "10 ans", JSON.stringify(clics));
}
console.log("\n[2] Rien ne bouge là où ça marchait");
{
  const { document, clics } = panneau([{ texte: "", groupe: 7, idDepart: 100, options: ["34", "34,5", "35", "38", "38,5", "39", "42", "Taille unique", "Autre"] }]);
  await bac(document).selectTailleVinted({ taille: "38" }, []);
  ok("pointure « 38 » sur une grille nue → « 38 » (exact)", clics[0] === "38", JSON.stringify(clics));
  const p2 = panneau([{ texte: "", groupe: 7, idDepart: 100, options: ["38", "38,5", "39"] }]);
  await bac(p2.document).selectTailleVinted({ taille: "38.5" }, []);
  ok("« 38.5 » → « 38,5 » (nombre ancré, inchangé)", p2.clics[0] === "38,5", JSON.stringify(p2.clics));
}
{
  const BLAZERS = ["XS", "S", "M", "L", "XL", "Taille unique", "22", "23", "30", "42", "44", "46", "48", "90", "94"];
  const { document, clics } = panneau([{ texte: "", groupe: 75, idDepart: 1580, options: BLAZERS }]);
  await bac(document).selectTailleVinted({ taille: "42" }, []);
  ok("blazers, grille qui écrit « 42 » nu → « 42 » (le nu prime toujours)", clics[0] === "42", JSON.stringify(clics));
}
{
  const { document, clics } = COSTUMES();
  await bac(document).selectTailleVinted({ taille: "EU 44" }, []);
  ok("« EU 44 » capturé → onglet EU, « EU 44 » (inchangé)", clics[0] === "EU 44", JSON.stringify(clics));
  const p = COSTUMES();
  await bac(p.document).selectTailleVinted({ taille: "M" }, []);
  ok("« M » → « M » dans S/M/L (inchangé)", p.clics[0] === "M", JSON.stringify(p.clics));
  const q = COSTUMES();
  await bac(q.document).selectTailleVinted({ taille_ids: [2401], taille: "42" }, []);
  ok("id 2401 capturé → posé PAR ID (« EU 44 »), le libellé ne joue pas", q.clics[0] === "EU 44", JSON.stringify(q.clics));
}
{
  const JEANS = [{ texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML }, { texte: "W", groupe: 88, idDepart: 1900, options: ["W23 | FR 32", "W30 | FR 40", "W32 | FR 42", "W34 | FR 44"] }];
  const p = panneau(JEANS);
  await bac(p.document).selectTailleVinted({ taille: "W32 L34" }, []);
  ok("« W32 L34 » → « W32 | FR 42 » (17/09, inchangé)", p.clics[0] === "W32 | FR 42", JSON.stringify(p.clics));
  const q = panneau(JEANS);
  const b = bac(q.document);
  const pose = await b.selectTailleVinted({ taille: "42" }, []);
  ok("« 42 » sur une grille de jeans (ni « 42 » ni « EU 42 ») → toujours refusé", pose === false && q.clics.length === 0, `pose=${pose} clics=${JSON.stringify(q.clics)}`);
  ok("   → les options vues (tous onglets) sont retenues pour le choix", b.vues().includes("W32 | FR 42") && b.vues().includes("M"), JSON.stringify(b.vues()));
  const r = panneau([{ texte: "", groupe: 4, idDepart: 200, options: ["Prématuré, jusqu'à 44cm", "3 ans / 98 cm", "4 ans / 104 cm"] }]);
  await bac(r.document).selectTailleVinted({ taille: "3" }, []);
  ok("« 3 » → « 3 ans / 98 cm » (grille enfant, inchangé)", r.clics[0] === "3 ans / 98 cm", JSON.stringify(r.clics));
}

// ── [3] LE VERDICT : UN CHOIX, PAS UNE RELANCE ──────────────────────────────
console.log("\n[3] L'échec déterministe rend un choix fermé");
{
  const q = panneau([{ texte: "S/M/L", groupe: 80, idDepart: 1735, options: SML }, { texte: "EU", groupe: 93, idDepart: 2400, options: EU }]);
  const b = bac(q.document);
  await b.selectTailleVinted({ taille: "37" }, []);
  const v = b.verdictTailleHorsGrille({ taille: "37", categoryPath: ["Hommes", "Vêtements", "Costumes et blazers", "Autres"] }, b.optionsRelevees.get("taille") ?? [], { onePass: { item_id: "1" } });
  ok("needsUserField posé : Taille, liste fermée des options vues", v.needsUserField?.field_key === "size" && Array.isArray(v.needsUserField.allowed_values) && v.needsUserField.allowed_values.includes("EU 42") && v.needsUserField.allowed_values.includes("M"), JSON.stringify(v.needsUserField).slice(0, 200));
  ok("republication → cible republish_user_fields.taille", v.needsUserField?.target?.root === "republish_user_fields" && v.needsUserField?.target?.key === "taille", JSON.stringify(v.needsUserField?.target));
  const vp = b.verdictTailleHorsGrille({ taille: "37", categoryPath: [] }, ["M"], {});
  ok("publication → cible taille (racine)", !vp.needsUserField?.target?.root && vp.needsUserField?.target?.key === "taille", JSON.stringify(vp.needsUserField?.target));
  ok("le message ne dit plus « relance »", !/relance/i.test(v.error), v.error);
  ok("le message nomme le geste (« ✋ Compléter ») et la seconde sortie (catégorie)", /Compléter/.test(v.error) && /catégorie/.test(v.error), v.error);
  ok("le diagnostic reste servi", /taille demandée « 37 »/.test(v.diagnostic ?? ""), v.diagnostic);
}

// ── [4] REJEU : combinaisons taille × grille des jobs publiés (18→23/09) ────
console.log("\n[4] Rejeu du parc — résultat attendu = celui du code d'avant (fixture)");
{
  let n = 0, identiques = 0; const differents = []; const nouveaux = [];
  let sansAttendu = 0;
  for (const c of FIXTURE.combos) {
    if (c.plateforme !== "vinted") continue;
    n++;
    if (!("attendu_extension" in c)) { sansAttendu++; continue; }
    const { document, clics } = panneau([{ texte: "", groupe: 1, idDepart: 1, options: c.options }]);
    const pose = await bac(document).selectTailleVinted({ taille: c.taille }, []);
    const resultat = pose ? clics[clics.length - 1] : null;
    if (resultat === c.attendu_extension) identiques++;
    else if (c.attendu_extension === null && /^\d/.test(c.taille) && resultat === `EU ${c.taille}`) nouveaux.push(`« ${c.taille} » @ ${c.categorie} → « ${resultat} »`);
    else differents.push(`« ${c.taille} » @ ${c.categorie} : attendu ${JSON.stringify(c.attendu_extension)}, obtenu ${JSON.stringify(resultat)}`);
  }
  if (sansAttendu) {
    ko++;
    console.log(`  KO   fixture sans résultat attendu sur ${sansAttendu} lignes — exécuter d'abord : node scripts/tailles-rejeu.mjs --figer`);
  } else {
    ok(`${n} combinaisons rejouées, ${identiques} identiques au code d'avant`, differents.length === 0, differents.slice(0, 5).join(" ; "));
    console.log(`  nouveaux appariements « EU N » (là où il n'y avait rien) : ${nouveaux.length}${nouveaux.length ? " — " + nouveaux.join(" ; ") : ""}`);
  }
}

console.log(ko === 0 ? "\n[selftest:vinted-taille-eu] OK\n" : `\n[selftest:vinted-taille-eu] ÉCHEC — ${ko} vérification(s) en défaut.\n`);
process.exit(ko === 0 ? 0 : 1);
