// Autotest — FORMAT DU COLIS VINTED : LE CHOIX DE LA PERSONNE, RIEN DE DEVINÉ
// (05/10, décision de Nico) — `npm run selftest:vinted-colis-choix`
//
// « Rien de deviné ; le choix de la personne est retenu. » Avant : vinted.js
// FORÇAIT « Petit » sur toute la Mode (règle du 12/07), la vérification après
// le clic n'était qu'un console.warn, la reprise juste avant le dépôt ne
// valait que pour les républications, et le relevé de grille ne lisait que le
// titre des tailles. Ce test garantit, sur le code LIVRÉ :
//   1. le choix lu sur le job (réponse colis_choisi > packageSizeId de l'app >
//      packageSize), et AUCUN format sans choix — plus de « Petit » d'office ;
//   2. selectPackageSize (vraie fonction, faux formulaire) : coche l'id
//      choisi, relit après le clic (second clic, puis « non_pris »), ne
//      clique jamais « Petit » pour un libellé inconnu, ne lève plus quand le
//      choix n'est pas offert ;
//   3. la question « Format du colis » (field_key colis) : liste fermée des
//      libellés LUS sur le formulaire, réponse dans colis_choisi.libelle ;
//   4. la relecture juste avant le dépôt, publication comme républication ;
//   5. le bilan (colis_bilan) : id, libellé, source ;
//   6. le relevé de grille : « id|libellé » intact pour l'app, l'exemple à
//      part (« id|libellé|exemple »).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { extraireFonctionJs } from "./lib/extraire-fonction-js.mjs";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/vinted.js"), "utf8").split("\r\n").join("\n");
const { grilleReleveeDepuisOptions } = await import(pathToFileURL(join(ROOT, "src/utils/vintedColis.js")).href);

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };
const corps = (nom) => extraireFonctionJs(src, nom);

const TABLE = new Function(`${src.match(/const VINTED_PACKAGE_SIZES_PAR_ID = \{[\s\S]*?\};/)[0]}; return VINTED_PACKAGE_SIZES_PAR_ID;`)();
const RADIOS_COLIS_SEL = src.match(/const RADIOS_COLIS_SEL = '([^']+)';/)?.[1];
const texteComparable = new Function(`${corps("texteComparable")}; return texteComparable;`)();

// ── Faux formulaire : la section « Format du colis » telle que relevée ──────
// (radios package_type_selector_<id>, cellule #package-size-<id>, titre
// --cell--title avec le badge « Recommandé », exemple --cell--body).
function formulaire(grille) {
  const radios = grille.map((g) => {
    const r = { id: `package_type_selector_${g.id}`, checked: Boolean(g.coche), disabled: false, prend: g.prend !== false };
    const cellule = {
      querySelector: (q) => (q.includes("--cell--title") ? { textContent: `${g.titre}${g.reco ? "Recommandé" : ""}` }
        : q.includes("--cell--body") ? (g.exemple ? { textContent: g.exemple } : null) : null),
    };
    r.closest = (q) => (q.startsWith('[id^="package-size-"]') ? cellule : null);
    return r;
  });
  const clics = [];
  const trouver = (n) => radios.find((x) => x.id === `package_type_selector_${n}`) ?? null;
  return {
    radios, clics,
    document: { querySelectorAll: (q) => (q.includes("package_type_selector_") ? radios : []) },
    simulateFullClick: (r) => { clics.push(Number(r.id.replace("package_type_selector_", ""))); if (r.prend) { for (const x of radios) x.checked = false; r.checked = true; } },
    waitForKey: async (_k, { params }) => { const r = trouver(params.n); if (!r) throw new Error("aucun des maillons n'a résolu"); return r; },
    sel: async () => ({
      resolveSelector: (_p, _k, { params }) => {
        const r = trouver(params.n);
        if (!r) { const e = new Error("absent"); e.name = "SelectorResolutionError"; throw e; }
        return { el: r };
      },
    }),
  };
}
const muet = { warn() {}, log() {} };
const fabriquer = (f) => new Function(
  "VINTED_PACKAGE_SIZES_PAR_ID", "RADIOS_COLIS_SEL", "document", "waitForKey", "sel", "simulateFullClick", "humanPause", "texteComparable", "console",
  `${corps("selectPackageSize")}
   ${corps("lireGrilleColisFormulaire")}
   ${corps("colisDansGrille")}
   ${corps("bilanColis")}
   ${corps("questionFormatColis")}
   ${corps("colisChoisiDuJob")}
   return { selectPackageSize, lireGrilleColisFormulaire, colisDansGrille, bilanColis, questionFormatColis, colisChoisiDuJob };`,
)(TABLE, RADIOS_COLIS_SEL, f.document, f.waitForKey, f.sel, f.simulateFullClick, async () => {}, texteComparable, muet);

const PMG = [
  { id: 1, titre: "Petit", exemple: "Pour les articles qui tiennent dans une grande enveloppe" },
  { id: 2, titre: "Moyen", exemple: "Pour les articles qui tiennent dans une boîte à chaussures", reco: true, coche: true },
  { id: 3, titre: "Grand", exemple: "Pour les articles qui tiennent dans un carton de déménagement" },
  { id: 8, titre: "Volumineux et lourd", exemple: "Pour les objets lourds" },
];

console.log("\n1. LE CHOIX LU SUR LE JOB — ET RIEN SANS CHOIX");
{
  const { colisChoisiDuJob } = fabriquer(formulaire([]));
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  ok(colisChoisiDuJob({}) === null, "aucune clé → aucun choix (Vinted garde son pré-coché)");
  ok(colisChoisiDuJob({ categorie: "Mode", taille: "M", categoryPath: ["Femmes", "Vêtements", "Robes"] }) === null,
    "Mode avec taille : PLUS de « Petit » d'office (règle du 12/07 remplacée)");
  ok(colisChoisiDuJob({ packageSizeId: 0, colis_source: "manuel" }) === null, "« Vinted choisit » (0, manuel) → aucun choix");
  ok(eq(colisChoisiDuJob({ packageSizeId: 2, packageSize: "Moyen", colis_source: "manuel" }), { id: 2, libelle: "Moyen", source: "choix" }), "choix de l'app (manuel) → id 2 « Moyen »");
  ok(eq(colisChoisiDuJob({ packageSizeId: 3, colis_source: "retenu" }), { id: 3, libelle: "Grand", source: "choix" }), "retenu du rayon, sans libellé → libellé de la table");
  ok(colisChoisiDuJob({ packageSizeId: 8, packageSize: "Volumineux et lourd" })?.libelle === "Volumineux et lourd",
    "le libellé du job (relevé sur le formulaire) prime sur la table (« 5 kg » pour 8)");
  ok(eq(colisChoisiDuJob({ colis_choisi: { libelle: "Grand" }, packageSizeId: 1, packageSize: "Petit" }), { id: null, libelle: "Grand", source: "choix" }),
    "la réponse à la question (colis_choisi) prime sur tout");
  ok(colisChoisiDuJob({ packageSizeId: 1, packageSize: "Petit" }, true)?.source === "annonce_origine", "républication → source « annonce_origine »");
  ok(eq(colisChoisiDuJob({ packageSize: "Grand" }), { id: null, libelle: "Grand", source: "choix" }), "libellé seul → choix par libellé");
}

console.log("\n2. selectPackageSize SUR UN FAUX FORMULAIRE");
{
  let f = formulaire(PMG);
  ok(await fabriquer(f).selectPackageSize("Grand", 3) === "pose" && f.radios[2].checked && f.clics.at(-1) === 3, "id choisi offert → coché, « pose »");
  f = formulaire(PMG);
  await fabriquer(f).selectPackageSize("Moyen", 2);
  ok(f.clics.join(",") === "1,2" && f.radios[1].checked, "choix déjà pré-coché → aller-retour (correctif du 22/09 gardé)");
  f = formulaire(PMG.map((g) => (g.id === 1 ? { ...g, prend: false } : g)));
  ok(await fabriquer(f).selectPackageSize("Petit", 1) === "non_pris" && f.clics.filter((c) => c === 1).length === 2,
    "radio relu NON coché après le clic → second clic, puis « non_pris » (plus un simple console.warn)");
  f = formulaire([{ id: 11, titre: "5 kg" }, { id: 12, titre: "10 kg", coche: true, reco: true }, { id: 13, titre: "20 kg" }]);
  ok(await fabriquer(f).selectPackageSize("10 kg", 9) === "pose" && f.radios[1].checked, "id 9 absent, même libellé « 10 kg » sous 12 → posé (même format)");
  f = formulaire([{ id: 11, titre: "5 kg" }, { id: 12, titre: "10 kg" }]);
  ok(await fabriquer(f).selectPackageSize("Très grand", null) === "non_offert" && f.clics.length === 0,
    "libellé inconnu de la table et non offert → « non_offert », AUCUN clic (l'ancien `|| 1` cliquait « Petit »)");
  f = formulaire(PMG);
  ok(await fabriquer(f).selectPackageSize("Énorme", 14) === "defaut_vinted" && f.clics.length === 0 && f.radios[1].checked,
    "choix non offert, « Recommandé » pré-coché → « defaut_vinted », rien cliqué");
  f = formulaire([]);
  ok(await fabriquer(f).selectPackageSize("Moyen", 2) === "section_absente", "section non rendue → « section_absente »");
  f = formulaire([{ id: 1, titre: "Petit" }, { id: 2, titre: "Moyen" }]);
  let leve = false;
  try { await fabriquer(f).selectPackageSize("Grand", 3); } catch { leve = true; }
  ok(!leve, "choix non offert et rien de coché : plus d'exception (la relecture avant le dépôt pose la question)");
  ok(/async function selectPackageSize\(size = null, packageSizeId = null\)/.test(src), "plus de « Petit » par défaut dans la signature");
}

console.log("\n3. LA GRILLE LUE, LE CHOIX DANS LA GRILLE, LA QUESTION, LE BILAN");
{
  const f = formulaire(PMG);
  const F = fabriquer(f);
  const grille = F.lireGrilleColisFormulaire();
  ok(grille.map((g) => `${g.id}|${g.libelle}`).join(" ") === "1|Petit 2|Moyen 3|Grand 8|Volumineux et lourd", "libellés lus, badge « Recommandé » ôté");
  ok(grille[0].exemple === "Pour les articles qui tiennent dans une grande enveloppe" && grille[1].coche, "exemple sous la taille et radio coché lus");
  ok(F.colisDansGrille(grille, 8, "5 kg")?.id === 8, "par id d'abord");
  ok(F.colisDansGrille([{ id: 11, libelle: "5 kg" }], 8, "5 kg")?.id === 11, "sinon par libellé affiché (« 5 kg » sous 8 ou 11)");
  ok(F.colisDansGrille(grille, 14, "30 kg") === null, "non offert → null");

  const q = F.questionFormatColis(grille, { id: 14, libelle: "30 kg" }, []);
  const n = q.needsUserField;
  ok(q.success === false && q.needsUser === true && n.field_key === "colis" && n.field_label === "Format du colis", "question needs_user « Format du colis » (field_key colis, drapeau needsUser lu par le background — essai réel 7eadeb5b)");
  ok(JSON.stringify(n.allowed_values) === JSON.stringify(["Petit", "Moyen", "Grand", "Volumineux et lourd"]) && n.options_completes === true && n.input_type === "radio",
    "liste FERMÉE des libellés offerts par CE formulaire");
  ok(n.target?.root === "colis_choisi" && n.target?.key === "libelle", "réponse dans colis_choisi.libelle — relue en premier par colisChoisiDuJob");
  ok(/30 kg/.test(q.error) && /jamais à ta place/.test(q.error) && /Rien n'a été envoyé/.test(q.error), "le message nomme le choix non offert, rien n'est envoyé");
  ok(/8\|Volumineux et lourd\|Pour les objets lourds/.test(q.diagnostic), "le diagnostic porte la grille avec ses exemples");
  ok(/n'en coche aucun/.test(F.questionFormatColis(grille, null, []).error), "rien de coché, aucun choix → la même question, autre phrase");

  const b1 = F.bilanColis(grille.map((g) => ({ ...g, coche: g.id === 3 })), { id: 3, libelle: "Grand", source: "choix" }, 3);
  ok(b1.id === 3 && b1.libelle === "Grand" && b1.source === "choix" && b1.voulu?.id === 3, "bilan : choix posé → source « choix »");
  const b2 = F.bilanColis(grille, null, null);
  ok(b2.id === 2 && b2.libelle === "Moyen" && b2.source === "defaut_vinted" && !b2.voulu && /boîte à chaussures/.test(b2.exemple), "bilan : sans choix → « defaut_vinted » (le pré-coché de Vinted), exemple compris");
  ok(F.bilanColis(grille, { id: 1, libelle: "Petit", source: "annonce_origine" }, 1).source === "defaut_vinted", "bilan : choix non retenu → dit « defaut_vinted », voulu à côté");
  ok(F.bilanColis([], { id: 1, libelle: "Petit", source: "annonce_origine" }, 1).source === "envoi_direct", "bilan : section absente, format armé dans le POST → « envoi_direct »");
  ok(F.bilanColis([], null, null).source === "aucun", "bilan : rien → « aucun »");
  ok(JSON.stringify(b2.grille) === JSON.stringify(["1|Petit", "2|Moyen", "3|Grand", "8|Volumineux et lourd"]), "bilan : la grille offerte (« id|libellé »)");
}

console.log("\n4. LE REMPLISSAGE : PLUS RIEN DE FORCÉ, RELECTURE AVANT LE DÉPÔT");
const remplir = corps("remplirFormulaireVinted");
ok(!/const isFashionJob/.test(remplir) && !/\?\? "Petit"/.test(remplir), "plus de règle Mode ni de repli « Petit » dans le remplissage");
ok(/const colisChoix = colisChoisiDuJob\(fields, recreation \|\| Boolean\(onePass\)\);/.test(remplir), "le choix vient de colisChoisiDuJob");
ok(/if \(verdictColis === "defaut_vinted" \|\| verdictColis === "non_offert"\) colisFormatNonOffert = true;/.test(remplir),
  "choix non offert → la une-passe demande AVANT tout retrait (question 0.6.85 gardée)");
const iRelecture = remplir.indexOf("// ══ RELECTURE DU FORMAT JUSTE AVANT LE DÉPÔT (05/10)");
const iPrix = remplir.indexOf("if (colisRepose && job.price != null) await ensurePriceCommitted(job.price);");
const iSuppr = remplir.indexOf("onePassDeleted = true;");
const iClic = remplir.indexOf('const publishBtn = await waitForKey("publish.submit");');
ok(iRelecture > iSuppr && iRelecture < iPrix && iPrix < iClic, "la relecture est le dernier geste colis : après le retrait une-passe, avant la relecture du prix et le clic");
const relecture = remplir.slice(iRelecture, iPrix);
ok(/const publicationNeuve = !recreation && !onePass;/.test(relecture), "s'applique à la publication ET à la républication (question seulement en publication)");
ok(/await selectPackageSize\(cibleDepot\.libelle \|\| wantedPackage, cibleDepot\.id\);\s*colisRepose = true;/.test(relecture), "choix offert mais décoché au dépôt → reposé (puis prix relu)");
ok((relecture.match(/return \{ \.\.\.questionFormatColis\(/g) ?? []).length === 2, "publication : choix non offert OU rien de coché → la question, rien n'est soumis");
ok(/n'a pas été retenu par le formulaire de Vinted/.test(relecture) && /throw err;/.test(relecture), "publication : choix toujours pas retenu → arrêt AVANT le dépôt, jamais un autre format");
ok(/if \(cocheDepot\) armerColisPourPost\(cocheDepot\.id\);/.test(relecture), "le format effectivement coché part aussi dans le corps du POST (sonde)");
ok(/noterColisBilan\(bilanColis\(grilleDepot, colisChoix, colisIdPourPost\)\);/.test(relecture), "le bilan dit ce qui part");
ok(/colis_bilan: fin\.colisBilan/.test(corps("fillListingForm")), "le résultat porte colis_bilan");

console.log("\n5. LE RELEVÉ DE GRILLE : COMPATIBLE, AVEC L'EXEMPLE À PART");
ok(/discovered\[discovered\.length - 1\]\.exemples = exemplesColis;/.test(src), "les exemples rangés dans `exemples` du même relevé");
ok(/`\$\{g\.id\}\|\$\{g\.libelle\}\|\$\{String\(g\.exemple \?\? ""\)\.replace\(\/\\\|\/g, "\/"\)\.slice\(0, 160\)\}`/.test(src), "format « id|libellé|exemple » (une barre dans l'exemple devient « / »)");
const opts = grilleReleveeDepuisOptions(["1|Petit", "2|Moyen", "3|Grand", "8|Volumineux et lourd"]);
ok(opts.map((g) => g.libelle).join(",") === "Petit,Moyen,Grand,Volumineux et lourd", "`options` « id|libellé » : l'app lit toujours les bons libellés");
ok(grilleReleveeDepuisOptions(["1|Petit|Pour les articles…"])[0]?.libelle !== "Petit",
  "(pourquoi l'exemple n'est PAS dans `options` : l'app en ferait le libellé « Petit|Pour… »)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ format du colis : le choix de la personne, relu jusqu'au dépôt ; sans choix, Vinted ; sinon une question — rien de deviné");
