// Autotest — LE FORMAT DE COLIS QUE VINTED A RETIRÉ D'UN RAYON SE REMPLACE SEUL (25/10, Nico)
//   npm run selftest:vinted-colis-tranche
//
// « Corrige pour que ces republications passent sans rien demander. » Romain Knockaert (c28e2c60,
// « Bottes hautes », 211) : l'id 8 de son dépôt du 08/10 a quitté la grille de ce rayon le 15/10 ; la
// une-passe demandait « Format du colis » (Petit / Moyen / Grand). Ce test garantit :
//   1. la MÊME règle des deux côtés : serveur (_shared/vinted-colis-tranche.js, questions tranchées, règle 9)
//      et extension (vinted.js, une-passe) — même table de capacités, mêmes réponses ;
//   2. l'ordre des capacités du référentiel de Vinted : SMALL < MEDIUM < LARGE < HEAVY_SMALL = BULKY_SMALL <
//      HEAVY_MEDIUM = BULKY_MEDIUM < HEAVY_LARGE = BULKY_LARGE < BULKY_X_LARGE ;
//   3. la une-passe (vraie fonction selectPackageSize, faux formulaire) pose le format choisi, n'en pose aucun
//      hors de la grille affichée, et ne remplace JAMAIS un choix de la personne ni une capture déplacée par
//      FillSell ; le format choisi est celui reposé en dernier, armé pour le POST et tracé dans le bilan.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const vt = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8").split("\r\n").join("\n");
const bg = fs.readFileSync(join(ROOT, "chrome-extension/background.js"), "utf8").split("\r\n").join("\n");
const S = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/vinted-colis-tranche.js")).href);

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const corps = (nom) => extraireFonctionJs(vt, nom);

console.log("\n1. LA MÊME RÈGLE AU SERVEUR ET DANS L'EXTENSION");
const tableExt = new Function(`${vt.match(/const RANG_COLIS_VINTED = \{[\s\S]*?\};/)[0]}; return RANG_COLIS_VINTED;`)();
ok(JSON.stringify(tableExt) === JSON.stringify({ ...S.RANG_COLIS_VINTED }), "table des capacités identique (vinted.js ↔ _shared/vinted-colis-tranche.js)");
const capaciteExt = new Function("RANG_COLIS_VINTED", `${corps("formatColisParCapacite")}; return formatColisParCapacite;`)(tableExt);
const G = (ids) => ids.map((id) => ({ id, libelle: { 1: "Petit", 2: "Moyen", 3: "Grand", 8: "5 kg", 9: "10 kg", 10: "20 kg", 11: "5 kg", 12: "10 kg", 13: "20 kg", 14: "30 kg" }[id] ?? `n°${id}` }));
const cas = [
  [8, [1, 2, 3], 3, "plus_grand_offert"],      // Romain : 8 face à Petit/Moyen/Grand → Grand
  [3, [11, 12, 13, 14], 11, "plus_petit_suffisant"],
  [2, [11, 12, 13, 14], 11, "plus_petit_suffisant"],
  [13, [8, 9, 10], 10, "plus_petit_suffisant"],
  [14, [8, 9, 10], 10, "plus_grand_offert"],
  [9, [1, 2, 3, 8], 8, "plus_grand_offert"],
  [1, [2, 3], 2, "plus_petit_suffisant"],
  [8, [11, 12], 11, "plus_petit_suffisant"],    // même capacité, autre famille (5 kg ↔ 5 kg)
  [3, [1, 2, 3], null, null],                  // offert : rien à trancher
  [8, [1, 7], null, null],                     // id de rang inconnu : la question reste
  [7, [1, 2, 3], null, null],                  // format d'origine inconnu : rien de deviné
  [8, [], null, null],
];
for (const [voulu, ids, attendu, regle] of cas) {
  const s = S.formatColisParCapacite(voulu, G(ids));
  const e = capaciteExt(voulu, G(ids));
  ok((s?.id ?? null) === attendu && (e?.id ?? null) === attendu && (s?.regle ?? null) === regle && JSON.stringify(s) === JSON.stringify(e),
    `${voulu} face à {${ids.join(",")}} → ${attendu ?? "rien"}${regle ? ` (${regle})` : ""}`, `serveur ${JSON.stringify(s)} / extension ${JSON.stringify(e)}`);
}

console.log("\n2. LA UNE-PASSE SUR UN FAUX FORMULAIRE (« Bottes hautes » du 25/10 : Petit / Moyen / Grand, Grand recommandé)");
{
  const TABLE = new Function(`${vt.match(/const VINTED_PACKAGE_SIZES_PAR_ID = \{[\s\S]*?\};/)[0]}; return VINTED_PACKAGE_SIZES_PAR_ID;`)();
  const RADIOS_COLIS_SEL = vt.match(/const RADIOS_COLIS_SEL = '([^']+)';/)?.[1];
  const texteComparable = new Function(`${corps("texteComparable")}; return texteComparable;`)();
  const grille = [{ id: 1, titre: "Petit" }, { id: 2, titre: "Moyen" }, { id: 3, titre: "Grand", reco: true, coche: true }];
  const radios = grille.map((g) => {
    const r = { id: `package_type_selector_${g.id}`, checked: Boolean(g.coche), disabled: false };
    const cellule = { querySelector: (q) => (q.includes("--cell--title") ? { textContent: `${g.titre}${g.reco ? "Recommandé" : ""}` } : null) };
    r.closest = (q) => (q.startsWith('[id^="package-size-"]') ? cellule : null);
    return r;
  });
  const trouver = (n) => radios.find((x) => x.id === `package_type_selector_${n}`) ?? null;
  const clics = [];
  const F = new Function(
    "VINTED_PACKAGE_SIZES_PAR_ID", "RADIOS_COLIS_SEL", "RANG_COLIS_VINTED", "document", "waitForKey", "sel", "simulateFullClick", "humanPause", "texteComparable", "console",
    `${corps("selectPackageSize")}
     ${corps("lireGrilleColisFormulaire")}
     ${corps("formatColisParCapacite")}
     ${corps("idColisConnu")}
     return { selectPackageSize, lireGrilleColisFormulaire, formatColisParCapacite, idColisConnu };`,
  )(TABLE, RADIOS_COLIS_SEL, tableExt,
    { querySelectorAll: (q) => (q.includes("package_type_selector_") ? radios : []) },
    async (_k, { params }) => { const r = trouver(params.n); if (!r) throw new Error("aucun des maillons n'a résolu"); return r; },
    async () => ({ resolveSelector: (_p, _k, { params }) => { const r = trouver(params.n); if (!r) { const e = new Error("absent"); e.name = "SelectorResolutionError"; throw e; } return { el: r }; } }),
    (r) => { clics.push(Number(r.id.replace("package_type_selector_", ""))); for (const x of radios) x.checked = false; r.checked = true; },
    async () => {}, texteComparable, { warn() {}, log() {} });
  const verdict = await F.selectPackageSize("Lourd (2 kg et +)", 8);
  ok(verdict === "defaut_vinted" && clics.length === 0, "le format capturé (8) n'est plus offert : « defaut_vinted », rien cliqué (comme avant)");
  const choix = F.formatColisParCapacite(F.idColisConnu(8, "Lourd (2 kg et +)"), F.lireGrilleColisFormulaire());
  ok(choix?.id === 3 && choix.libelle === "Grand", "règle B : « Grand », le plus grand proposé (ce que Vinted recommande)");
  ok(await F.selectPackageSize(choix.libelle, choix.id) === "pose" && radios[2].checked, "« Grand » posé et relu coché (aller-retour du 22/09 compris)");
}

console.log("\n3. LE CODE LIVRÉ");
const remplir = corps("remplirFormulaireVinted");
const iB = remplir.indexOf("let colisTranche = null;");
const iPost = remplir.indexOf("const colisIdPourPost = colisVoulu ? (colisTranche?.choix?.id ?? idColisConnu(wantedPackageId, wantedPackage)) : null;");
const iQ = remplir.indexOf("if (onePass?.item_id && (!colisVoulu || colisFormatNonOffert)) {");
const iSuppr = remplir.indexOf("const del = await deleteVintedItemViaApi(String(onePass.item_id)");
ok(iB > 0 && iPost > iB && iQ > iPost && iSuppr > iQ, "règle B : au pas « Colis », AVANT la question et AVANT tout retrait ; le format choisi est armé pour le POST");
const blocB = remplir.slice(iB, iPost);
ok(/if \(onePass\?\.item_id && !recreation && colisFormatNonOffert && colisChoix\?\.source === "annonce_origine"\s*&& fields\.rayon_capture_corrige !== true\) \{/.test(blocB),
  "seulement en une-passe, sur le format CAPTURÉ (jamais un choix de la personne), jamais sur une capture déplacée par FillSell");
ok(/if \(choixT && \(await selectPackageSize\(choixT\.libelle, choixT\.id\)\) === "pose"\) \{\s*colisFormatNonOffert = false;/.test(blocB),
  "la question n'est levée que si le format choisi est POSÉ (sinon la question d'avant)");
ok(/noterColisTranche\(colisTranche\);/.test(blocB) && /m\.colisBilan = bilan \? \{ \.\.\.bilan, \.\.\.\(m\.colisTranche \? \{ tranche_par_fillsell: m\.colisTranche \} : \{\}\) \} : null;/.test(vt),
  "tracé dans colis_bilan.tranche_par_fillsell (format d'origine, grille, choix)");
ok(/await selectPackageSize\(colisTranche\?\.choix\?\.libelle \?\? wantedPackage, colisTranche\?\.choix\?\.id \?\? wantedPackageId\);\s*colisRepose = true;/.test(remplir),
  "dernière passe : c'est le format choisi qui se repose avant le clic");
ok(/colisDansGrille\(grilleDepot, colisTranche\?\.choix\?\.id \?\? wantedPackageId, colisTranche\?\.choix\?\.libelle \?\? wantedPackage\)/.test(remplir),
  "relecture juste avant le dépôt : le format choisi, reposé s'il a été décoché");
ok(/rayon_capture_corrige: true/.test(bg) && /pf\.capture_corrigee_par_la_fiche\.raisons\.includes\("categorie_oeuvre"\)\s*&& !pf\.capture_corrigee_annulee\)/.test(bg),
  "background : une capture déplacée par FillSell (œuvre d'art, non encore rendue à son rayon) le dit à la une-passe");
const blocQ = vt.slice(vt.indexOf("if (onePass?.item_id && (!colisVoulu || colisFormatNonOffert)) {"), vt.indexOf("if (onePass?.item_id && colisVoulu && colisSectionAbsente) {"));
ok(blocQ.includes('field_key: "package_size_id"') && blocQ.includes('target: { root: "colis_choisi", key: "libelle" }'),
  "la question d'avant reste pour tout le reste (format inconnu, choix de la personne non proposé, rayon déplacé)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ format de colis retiré par Vinted : le plus petit qui suffit, sinon le plus grand — la même règle au serveur et dans la une-passe");
