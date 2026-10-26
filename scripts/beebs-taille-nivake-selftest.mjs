// Autotest — ceinture Beebs de nivake03, la RÈGLE (03/10 nuit) —
// `npm run selftest:beebs-taille-nivake`
// Job réel 8d487ebb : copie « L », annonce en ligne 34074935 affichant
// « Taille : Ajustable » (relevé du 02/10, ld+json), grille du rayon
// « Ceintures (homme) » en mm. La republication reprenait « L » → question,
// annonce déjà retirée. Règle de Nico : un champ VISIBLE sur l'annonce n'est
// jamais demandé — la taille affichée passe en premier, la copie en repli,
// jamais d'approximation.
// (26/10 nuit, point 12 — chaouidz, Beebs 34229052) SAUF une correction TRACÉE
// de la copie (platform_fields.correction_tracee) qui tient : l'annonce affiche
// encore l'ancienne valeur (« 16 »), la copie porte la nouvelle (« 31 ») → la
// copie seule, jamais « 16 » en repli. Parité serveur :
// scripts/beebs-correction-tracee-selftest.mjs.
import fs from "node:fs";
import vm from "node:vm";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const src = fs.readFileSync(join(ROOT, "chrome-extension/content-scripts/beebs.js"), "utf8").split("\r\n").join("\n");
let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

// Extrait une déclaration de niveau 0 (function … jusqu'à la « } » en colonne 0,
// ou const … sur une ligne) — le code testé est CELUI de l'extension.
const extraire = (nom) => {
  const f = src.indexOf(`\nfunction ${nom}(`);
  if (f >= 0) return src.slice(f + 1, src.indexOf("\n}\n", f) + 2);
  const c = src.indexOf(`\nconst ${nom} =`);
  if (c >= 0) return src.slice(c + 1, src.indexOf("\n", c + 1));
  throw new Error(`${nom} introuvable dans beebs.js`);
};
const ctx = vm.createContext({});
vm.runInContext(["texteComparable", "normalizeFuzzy", "containsAsWords", "PURE_NUMBER_RE",
  "valeurAfficheeSurLAnnonce", "correctionTient", "taillesAPoser", "findOptionCascade"].map(extraire).join("\n") +
  "\nthis.api = { valeurAfficheeSurLAnnonce, taillesAPoser, findOptionCascade };", ctx);
const { valeurAfficheeSurLAnnonce, taillesAPoser, findOptionCascade } = ctx.api;
// optionLabel lit le DOM : ici, des options-chaînes (le libellé EST la valeur).
vm.runInContext("function optionLabel(el) { return String(el); }", ctx);

const GRILLE = ["70 mm", "75 mm", "80 mm", "85 mm", "90 mm", "95 mm", "100 mm", "105 mm", "110 mm", "115 mm", "120 mm", "125 mm", "Ajustable"];
const pfNivake = {
  taille: "L",
  republish_step: "captured",
  champs_lus_sur_l_annonce: { le: "2026-10-02T01:16:02Z", lus: { taille: "Ajustable", etat: "Neuf, avec étiquette" }, repris: {} },
};

console.log("\n1. LA TAILLE AFFICHÉE D'ABORD, LA COPIE EN REPLI");
const t = taillesAPoser(pfNivake);
ok(t.primaire === "Ajustable" && t.replis.length === 1 && t.replis[0] === "L", "ceinture : « Ajustable » (annonce) d'abord, « L » (copie) en repli", JSON.stringify(t));
ok(findOptionCascade(GRILLE, t.primaire, { sizeField: true })?.label === "Ajustable", "« Ajustable » est posée telle quelle dans la grille en mm");
ok(findOptionCascade(GRILLE, "L", { sizeField: true }) === null, "« L » n'est JAMAIS approchée dans une grille en mm (ni « 100 mm », ni « Ajustable »)");

console.log("\n1 bis. SAUF UNE CORRECTION TRACÉE QUI TIENT (26/10 nuit, point 12)");
{
  // La copie de chaouidz telle qu'en base après le script du 26/10 (job 29f9116e), relue sur l'annonce avant le retrait.
  const trace = { cle: "taille", avant: "16", apres: "31", source: "correction", annonce: "34229052",
    par: "scripts/reparations/20261026_copies_valeurs_fausses.sql (point 12 de Nico)" };
  const pf = (lue, surcharge = {}) => ({ taille: "31", correction_tracee: trace, republish_step: "captured",
    champs_lus_sur_l_annonce: { le: "2026-10-26T01:00:00Z", lus: { taille: lue }, repris: {} }, ...surcharge });
  const c = taillesAPoser(pf("16"));
  ok(c.primaire === "31" && c.replis.length === 0 && c.correctionTracee === true,
    "chaouidz : l'annonce affiche encore « 16 », la copie corrigée « 31 » part SEULE (jamais « 16 » en repli)", JSON.stringify(c));
  const autre = taillesAPoser(pf("30"));
  ok(autre.primaire === "30" && autre.replis.length === 1 && autre.replis[0] === "31" && !autre.correctionTracee,
    "l'annonce affiche une 3e valeur (« 30 », changée depuis sur Beebs) : rien n'est forcé, la valeur affichée d'abord", JSON.stringify(autre));
  const deja = taillesAPoser(pf("31"));
  ok(deja.primaire === "31" && deja.replis.length === 0 && !deja.correctionTracee, "l'annonce affiche déjà « 31 » : la même valeur, sans repli");
  const repondue = taillesAPoser(pf("16", { taille: "32" }));
  ok(repondue.primaire === "16" && repondue.replis[0] === "32" && !repondue.correctionTracee,
    "la copie ne porte plus la valeur corrigée (« 32 ») : la trace ne tient plus, règle du 03/10 (comme le serveur)", JSON.stringify(repondue));
  const age = taillesAPoser(pf("16", { correction_tracee: { ...trace, cle: "age" } }));
  ok(age.primaire === "16" && !age.correctionTracee, "une correction d'une AUTRE clé (âge) ne touche pas la taille");
  ok(taillesAPoser(pf("  16 ", { taille: " 31" })).primaire === "31", "espaces et casse pliés comme au serveur");
}

console.log("\n2. RIEN N'EST INVENTÉ");
ok(taillesAPoser({ taille: "M" })?.primaire === "M" && taillesAPoser({ taille: "M" }).replis.length === 0, "publication (rien de lu sur une annonce) : la copie seule, comme avant");
ok(taillesAPoser({}) === null && taillesAPoser({ taille: "  " }) === null, "ni copie ni annonce : rien à poser (la question reste)");
ok(taillesAPoser({ taille: "m", champs_lus_sur_l_annonce: { lus: { taille: "M" } } }).replis.length === 0, "même valeur des deux côtés : pas de repli en double");
ok(taillesAPoser({ champs_lus_sur_l_annonce: { repris: { taille: "38 / M" } } }).primaire === "38 / M", "copie vide, taille reprise de l'annonce (repris) : posée");
ok(valeurAfficheeSurLAnnonce({ champs_lus_sur_l_annonce: "x" }, "taille") === "" && valeurAfficheeSurLAnnonce(null, "taille") === "", "trace absente ou illisible : rien");

console.log("\n3. LE CÂBLAGE DANS LE REMPLISSEUR");
const appel = src.indexOf("const tailles = taillesAPoser(fields);");
const bloc = src.slice(appel, appel + 1200);
ok(appel > 0 && /selectDropdownValue\("Taille", tailles\.primaire, warnings, unfilledRequired, \{ sizeField: true, fallbackTexts: tailles\.replis \}\)/.test(bloc)
  && /selectDropdownValue\("Pointure", sansEu\(tailles\.primaire\)/.test(bloc), "Taille et Pointure : valeur affichée, puis la copie en repli");
ok(!/if \(fields\.taille\) \{\n\s+await selectDropdownValue\("Pointure"/.test(src), "plus de chemin qui ne connaît que la copie");
ok(/if \(sizeField && panelSearchInput\(trigger\)\) \{\n\s+const completes = await researchPanelFor\(trigger, ""\);/.test(src), "le repli d'une taille se juge sur la liste ENTIÈRE (pas celle filtrée par la frappe)");
ok(/\|\| valeurAfficheeSurLAnnonce\(fields, "taille"\);/.test(src), "une taille affichée non posée n'est jamais remplacée par « Unique »");
ok(/lireRefusFormulaireBeebs\(\{ tailleVoulue: tailles \? \[tailles\.primaire, \.\.\.tailles\.replis\] : fields\.taille/.test(src), "la taille affichée posée n'est pas lue comme un refus de Beebs");
ok(/if \(tailles\.correctionTracee\) \{\n\s+warnings\.push\(`taille: l'annonce en ligne affiche encore/.test(bloc),
  "(26/10) la correction tracée qui passe devant est dite dans les avertissements du job");
const iIa = src.indexOf("const champTaille = sizeField ||");
ok(iIa > 0 && /if \(!match && !champTaille && !marqueReelle\)/.test(src.slice(iIa, iIa + 320)), "toujours aucune IA pour une taille (ni pour une vraie marque, 18/10)");

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ ceinture nivake03 : la taille que l'annonce affiche est reposée, jamais demandée, jamais approchée");
