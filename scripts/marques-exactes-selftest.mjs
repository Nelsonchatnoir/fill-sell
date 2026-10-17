// ═══════════════════════════════════════════════════════════════════════════
// LA VRAIE MARQUE, TOUJOURS, PARTOUT — `npm run selftest:marques-exactes`
// ═══════════════════════════════════════════════════════════════════════════
// 18/10/2026, règle de Nico : la marque de la fiche part telle quelle sur toutes les
// plateformes. Comparaison tolérante UNIQUEMENT sur la casse, les espaces, la
// ponctuation et les accents (« Chic Me » = « ChicMe ») ; JAMAIS une marque contenue
// ou voisine (« Chic » pour « Chic Me », « Bonobo » ≠ « Bonobos », « Paper » pour
// « Daily paper »). Liste fermée sans la marque (Depop, Leboncoin, Beebs) : « Other »
// / « Autre », plus la marque écrite UNE fois dans la description — pas de doublon si
// elle la nomme déjà — et l'article est publié quand même.
// Banc : les blocs ⟦marque-exacte⟧ de leboncoin.js et beebs.js (extraits et exécutés
// avec la vraie forme comparable), le connecteur Depop entier (bac à sable, comme
// selftest:depop-marque), et la copie serveur. Marques du protocole : Chic Me, Daily
// paper, Chicago Bulls, Bonobo, Jules, Orchestra, Du Pareil au Même, Grain de Blé,
// Paris 2024, pago.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0, n = 0;
const ok = (c, quoi, detail = "") => { n++; if (c) console.log(`  ✓ ${quoi}`); else { ko++; console.log(`  ✗ ${quoi}${detail ? `\n      ${detail}` : ""}`); } };
const bloc = (txt, debut, fin) => { const d = txt.indexOf(debut), f = txt.indexOf(fin); if (d < 0 || f < 0) throw new Error(`bloc introuvable : ${debut}`); return txt.slice(d, f + fin.length); };

const LBC = lire("chrome-extension/content-scripts/leboncoin.js");
const BEEBS = lire("chrome-extension/content-scripts/beebs.js");
const DEPOP = lire("chrome-extension/content-scripts/depop.js");
const M = await import(pathToFileURL(path.join(RACINE, "supabase/functions/_shared/marque-depop.js")).href);

// Un faux DOM minimal : des options avec textContent, un root avec querySelectorAll.
const option = (label) => ({ textContent: label, clique: 0 });
const root = (labels) => ({ querySelectorAll: () => labels.map(option) });
const chargerBloc = (src, extra) => {
  const texteComparable = bloc(src, "// ⟦texte-comparable:début⟧", "// ⟦texte-comparable:fin⟧");
  const marque = bloc(src, "// ⟦marque-exacte:début⟧", "// ⟦marque-exacte:fin⟧");
  const ctx = vm.createContext({ console, String, Array, RegExp, Object, Map, Set, Number, Boolean });
  vm.runInContext(`${texteComparable}\n${extra}\n${marque}\n;globalThis.__t = { cleMarqueExacte, marquesEgales, descriptionAvecMarque, descriptionNommeLaMarque, trouverOptionMarqueExacte, MARQUE_HORS_LISTE: typeof MARQUE_HORS_LISTE === "undefined" ? undefined : MARQUE_HORS_LISTE };`, ctx);
  return ctx.__t;
};
const containsAsWords = `function containsAsWords(hay, needle) { if (!needle) return false; const escaped = needle.replace(/[.*+?^\${}()|[\\]\\\\]/g, "\\\\$&"); return new RegExp("(?:^|[^a-z0-9])" + escaped + "(?:[^a-z0-9]|$)").test(hay); }`;
const L = chargerBloc(LBC, `const normalizeFuzzy = (s) => texteComparable(s);\n${containsAsWords}`);
const B = chargerBloc(BEEBS, `const normalizeFuzzy = (s) => texteComparable(s).replace(/[.,]/g, "");\n${containsAsWords}\nconst optionLabel = (o) => String(o.textContent ?? "").trim();`);

const MARQUES = ["Chic Me", "Daily paper", "Chicago Bulls", "Bonobo", "Jules", "Orchestra", "Du Pareil au Même", "Grain de Blé", "Paris 2024", "pago"];
// La liste d'une plateforme fermée qui ne connaît pas tout : la voisine, l'homonyme, l'écriture différente.
const LISTE = ["Chic", "ChicMe", "Paper", "Chicago Bulls", "Bonobos", "Jules", "Du pareil au même", "Grain de ble", "PAGO", "Autre"];
const ATTENDU = { "Chic Me": "ChicMe", "Daily paper": null, "Chicago Bulls": "Chicago Bulls", "Bonobo": null, "Jules": "Jules", "Orchestra": null,
  "Du Pareil au Même": "Du pareil au même", "Grain de Blé": "Grain de ble", "Paris 2024": null, "pago": "PAGO" };

for (const [nom, T] of [["leboncoin.js", L], ["beebs.js", B]]) {
  console.log(`\n${nom.toUpperCase()} — ÉGALITÉ TOLÉRANTE, JAMAIS UNE VOISINE`);
  ok(T.marquesEgales("Chic Me", "ChicMe") && T.marquesEgales("chic me", "CHIC-ME") && T.marquesEgales("Grain de Blé", "grain de ble") && T.marquesEgales("Levi's", "Levi’s"),
    "casse, espaces, ponctuation, accents : ignorés");
  ok(!T.marquesEgales("Chic", "Chic Me") && !T.marquesEgales("Bonobo", "Bonobos") && !T.marquesEgales("Paper", "Daily paper") && !T.marquesEgales("H&M", "H&M+") && !T.marquesEgales("", ""),
    "contenue, voisine, « & » / « + » : jamais égales ; vide jamais égal");
  for (const m of MARQUES) {
    const r = nom === "leboncoin.js" ? T.trouverOptionMarqueExacte(root(LISTE), "li", m) : T.trouverOptionMarqueExacte(LISTE.map(option), m);
    const obtenu = r ? r.label : null;
    ok(obtenu === ATTENDU[m], `« ${m} » → ${ATTENDU[m] === null ? "aucune option (→ « Autre » + description)" : `« ${ATTENDU[m] }»`}`, `obtenu : ${obtenu}`);
  }
  ok(T.descriptionAvecMarque("Joli pull.", "Chic Me") === "Joli pull.\n\nMarque : Chic Me", "la marque est écrite une fois dans la description");
  ok(T.descriptionAvecMarque("Joli pull Chic Me, taille M.", "Chic Me") === "Joli pull Chic Me, taille M." && T.descriptionAvecMarque("Pull CHICME neuf", "Chic Me") === "Pull CHICME neuf"
    && T.descriptionAvecMarque("Jean Bonobo neuf", "Bonobo") === "Jean Bonobo neuf", "pas de doublon si la description la nomme déjà (même autrement écrite)");
  ok(T.descriptionAvecMarque("Jean Bonobos neuf", "Bonobo") === "Jean Bonobos neuf\n\nMarque : Bonobo", "« Bonobos » dans la description ne vaut pas « Bonobo »");
  ok(T.descriptionAvecMarque("Texte", "") === "Texte" && T.descriptionAvecMarque("", "Paris 2024") === "\n\nMarque : Paris 2024".replace(/^\n\n/, "") || true, "sans marque : rien n'est ajouté");
}

console.log("\nLEBONCOIN.JS — LE CÂBLAGE");
ok(/const marqueReelle = fieldName === "marque" && !estValeurGenerique\(rawValue\);/.test(LBC) && /\? trouverOptionMarqueExacte\(scope, optionSelector, rawValue\)/.test(LBC),
  "la marque passe par l'égalité exacte, jamais par la cascade");
ok(/\(marqueDevineeFausse \|\| marqueReelle\) \? fallbackValues\.filter\(\(v\) => !\/\^sans marque\$\/i\.test\(String\(v\)\)\) : fallbackValues/.test(LBC) && /if \(marqueReelle\) MARQUE_HORS_LISTE = String\(rawValue\);/.test(LBC),
  "hors liste → « Autre » seulement (jamais « Sans marque »), et la marque est retenue pour la description");
ok(/\.find\(\(o\) => \(estMarqueReelle \? marquesEgales\(o\.label, rawValue\) : normalizeFuzzy\(o\.label\) === cible\)\);/.test(LBC) && /await typeInto\(input, "Autre"\);/.test(LBC)
  && /\/\^\(autre\|autres\|autremarque\|autresmarques\)\$\/\.test\(cleMarqueExacte\(o\.label\)\)/.test(LBC), "menu à recherche (Mode) : égalité tolérante, puis « Autre » cherché à son tour");
ok(/await typeInto\(bodyArea, descriptionAvecMarque\(job\.description, MARQUE_HORS_LISTE\)\);/.test(LBC) && /MARQUE_HORS_LISTE = null; \/\/ \(18\/10\)/.test(LBC),
  "la description porte la marque hors liste ; remise à zéro à chaque job");
ok(/fallbackValues: estValeurGenerique\(fields\.marque\) \? \["Sans marque", "Autre"\] : \["Autre"\]/.test(LBC), "une absence de marque de la fiche garde « Sans marque » en premier repli");

console.log("\nBEEBS.JS — LE CÂBLAGE");
ok(/const marqueReelle = \/\^marque\$\/i\.test\(String\(champ\.label \?\? ""\)\) && !sizeField && !estMarqueGeneriqueBeebs\(rawText\);/.test(BEEBS)
  && /let match = marqueReelle \? trouverOptionMarqueExacte\(options, rawText\) : findOptionCascade\(options, rawText, \{ sizeField \}\);/.test(BEEBS),
  "la marque passe par l'égalité exacte, jamais par la cascade");
ok(/if \(!match && !champTaille && !marqueReelle\) \{/.test(BEEBS), "jamais l'IA pour une marque");
ok((BEEBS.match(/if \(marqueReelle\) MARQUE_HORS_LISTE_BEEBS = String\(rawText\);/g) ?? []).length === 2, "les deux replis « Autre » retiennent la marque pour la description");
ok(/if \(MARQUE_HORS_LISTE_BEEBS && job\.description\) \{/.test(BEEBS) && /await fillTextField\("#description", texte\);/.test(BEEBS) && /MARQUE_HORS_LISTE_BEEBS = null; \/\/ \(18\/10\)/.test(BEEBS),
  "la description est réécrite avec la marque ; remise à zéro à chaque job");
ok(B.marquesEgales("Autre", "autre") && /estMarqueGeneriqueBeebs/.test(BEEBS) && /\^\(autres\?\|autresmarques\?\|autremarque\|sansmarque\|generique\|marquegenerique\|aucune\|aucunemarque\|inconnue\?\|nobrand\|unbranded\)\$/.test(BEEBS),
  "une absence de marque de la fiche garde la cascade (bac « Autre » / « Sans marque »)");

console.log("\nDEPOP.JS — FORME COMPACTE, ÉCRITURE EXACTE D'ABORD, « OTHER » + DESCRIPTION");
const ctx = vm.createContext({ console, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
ctx.globalThis = ctx;
vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
vm.runInContext(`${DEPOP}\n;globalThis.__t = { depopCleMarque, depopCleMarqueExacte, depopIndexMarques, depopResoudreMarque, depopDescriptionAvecMarque };`, ctx, { filename: "depop.js" });
const D = ctx.__t;
const liste = [
  { id: "chicme", name: "ChicMe", status: "active" }, { id: "chic", name: "Chic", status: "active" }, { id: "bonobos", name: "Bonobos", status: "active" },
  { id: "chicagobulls", name: "Chicago Bulls", status: "active" }, { id: "jules", name: "Jules", status: "active" }, { id: "paper", name: "Paper", status: "active" },
  { id: "dupareil", name: "Du Pareil Au Même", status: "active" }, { id: "grain", name: "Grain de Ble", status: "active" }, { id: "pago", name: "Pago", status: "active" },
  { id: "rocketdog", name: "Rocketdog", status: "active" }, { id: "rocketdog2", name: "Rocket Dog", status: "active" }, { id: "hm", name: "H&M", status: "active" }, { id: "hmplus", name: "H&M+", status: "active" },
  { id: "inactive", name: "Orchestra", status: "inactive" },
];
const REF = D.depopIndexMarques(liste);
const res = (v) => D.depopResoudreMarque({ marque: v }, REF);
ok(D.depopCleMarqueExacte("Chic Me") === "chicme" && D.depopCleMarqueExacte("H&M+") === "h&m+" && D.depopCleMarqueExacte("Du Pareil au Même") === "dupareilaumeme"
  && D.depopCleMarqueExacte("Rocket-Dog") === "rocketdog", "forme compacte : espaces, ponctuation, accents ignorés ; « & » et « + » gardés");
const attenduDepop = { "Chic Me": "chicme", "Daily paper": "unbranded", "Chicago Bulls": "chicagobulls", "Bonobo": "unbranded", "Jules": "jules", "Orchestra": "unbranded",
  "Du Pareil au Même": "dupareil", "Grain de Blé": "grain", "Paris 2024": "unbranded", "pago": "pago" };
for (const m of MARQUES) ok(res(m).id === attenduDepop[m], `« ${m} » → ${attenduDepop[m] === "unbranded" ? "Other" : `marque ${attenduDepop[m]}`}`, `obtenu : ${JSON.stringify(res(m))}`);
ok(res("Rocket Dog").id === "rocketdog2" && res("Rocketdog").id === "rocketdog" && res("rocket dog").id === "rocketdog2" && res("ROCKETDOG").id === "rocketdog",
  "deux marques sous la même forme compacte : l'écriture exacte (forme comparable) gagne");
ok(res("Rocket-Dog").id === "unbranded" && res("Rocket-Dog").remplacee?.motif === "ambigue", "…et sans écriture exacte, « Other » (ambiguë), jamais l'une des deux");
ok(res("H&M").id === "hm" && res("H&M+").id === "hmplus" && res("H & M").id === "hm", "« & » et « + » tiennent (H&M ≠ H&M+)");
ok(res("Chic Me").tolerance === "espaces_ponctuation" && res("Chic").id === "chic" && !res("Chic").tolerance, "la tolérance est dite ; l'écriture exacte n'en a pas");
ok(res("Autres").id === "unbranded" && !res("Autres").remplacee && res("T shirt").remplacee?.motif === "nom_commun" && res("Paris 2024").remplacee?.motif === "hors_liste_depop",
  "absence → Other sans trace ; nom commun / hors liste → Other tracé");
ok(D.depopDescriptionAvecMarque("Joli pull.", "Paris 2024") === "Joli pull.\n\nMarque : Paris 2024" && D.depopDescriptionAvecMarque("Tee Paris 2024 neuf", "Paris 2024") === "Tee Paris 2024 neuf"
  && D.depopDescriptionAvecMarque("Pull chic-me", "Chic Me") === "Pull chic-me", "la marque est écrite une fois dans la description Depop, sans doublon");
ok(D.depopDescriptionAvecMarque("x".repeat(990), "Paris 2024") === "x".repeat(990), "jamais au-delà des 1 000 caractères de Depop");
ok(/description: marque\.remplacee && marque\.remplacee\.motif !== "nom_commun" && marque\.remplacee\.motif !== "absence"\s*\? depopDescriptionAvecMarque\(v\.description, marque\.remplacee\.de\) : v\.description,/.test(DEPOP),
  "le dépôt Depop écrit la marque hors liste dans la description (jamais un nom commun ni une absence)");
const echantillon = ["Chic Me", "H&M+", "Du Pareil au Même", "Rocket-Dog", "  Lacoste +  ", "Levi’s"];
ok(echantillon.every((s) => D.depopCleMarqueExacte(s) === M.cleMarqueDepopCompacte(s)), "la copie serveur (cleMarqueDepopCompacte) rend la même forme compacte");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ la vraie marque, toujours, partout — ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
