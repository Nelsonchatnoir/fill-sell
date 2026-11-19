// Autotest VERROU : LE LOT DÉDUIT, ARTICLE PAR ARTICLE, AVANT DE DEMANDER (19/11/2026 soir, OTA 2 — exigence de Nico).
//
//     node --import ./scripts/loader-ext.mjs scripts/deduction-lot-1911-selftest.mjs
//
// « Une question, c'est un échec de notre déduction. Un lot mélange tout : aucune valeur ne vaut pour tout le lot.
// Pour qui / Univers et tous les champs du même genre se DÉDUISENT de chaque article (catégorie, rayon, titre,
// description, photos). Déduire ne veut jamais dire cacher : chaque valeur déduite reste visible et modifiable, marquée ;
// changée par l'utilisateur, sa valeur fait foi et n'est plus jamais réécrite par une déduction. »
// Banc à 40 (19/11) : 3 « Pour qui ? · Vinted » (boutons de manchette : le rayon eBay « Bijoux pour hommes » et le rayon
// Beebs « Mode › Homme » le disaient — le moteur ne lisait que la copie Vinted) ; 4 « Univers · Leboncoin » (fiches
// d'essai qui ne nomment rien, rayon Leboncoin À CHOISIR — un champ du rayon demandé avant le rayon) ; « État » éclaté
// en 12 groupes (l'ordre des plateformes faisait un autre groupe).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg, d = "") => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d ? ` — ${d}` : ""}`); } };

const P = await charger("src/publication/lot/propositions.js");
const S = await charger("src/publication/lot/sujetsDuLot.js");
const POUR_QUI = ["Femmes", "Hommes", "Filles", "Garçons"];
const UNIVERS = ["Femme", "Maternité", "Homme", "Enfant"];
const ded = (a, q) => P.deduction(q, a);

console.log("1. le public se LIT sur l'article (Pour qui, Univers…)");
{
  const jazz = ded({ titre: "TEST FillSell 999 ne pas acheter - Jazz man boutons", chemins: [["Accessoires de mode", "Bijoux", "Boutons de manchette"], ["Mode", "Accessoires & Bagagerie"], ["Bijoux, montres", "Bijoux pour hommes", "Boutons de manchette"]] }, { libelle: "Pour qui ?", valeurs: POUR_QUI });
  ok(jazz?.valeur === "Hommes" && jazz.source === "rayon", "banc à 40 : « Jazz man boutons » → Hommes, d'après le rayon eBay « Bijoux pour hommes »", JSON.stringify(jazz));
  const arg = ded({ titre: "boutons de manchette argentés", chemins: [["Accessoires de mode", "Bijoux"], ["Mode", "Homme", "Accessoires (homme)", "Bijoux (homme)"]] }, { libelle: "Pour qui ?", valeurs: POUR_QUI });
  ok(arg?.valeur === "Hommes", "banc à 40 : « boutons de manchette argentés » → Hommes, d'après le rayon Beebs « Mode › Homme »");
  ok(ded({ titre: "Doudoune noire femme Zara" }, { libelle: "Pour qui ?", valeurs: POUR_QUI })?.valeur === "Femmes", "une doudoune femme → Femmes (le titre)");
  ok(ded({ titre: "Jean slim", chemins: [["Hommes", "Vêtements", "Jeans"]] }, { libelle: "Univers", valeurs: UNIVERS })?.valeur === "Homme", "un jean du rayon Hommes → Homme (le rayon)");
  ok(ded({ titre: "Body coton 3 mois" }, { libelle: "Univers", valeurs: UNIVERS })?.valeur === "Enfant", "un body 3 mois → Bébé, dit « Enfant » quand la liste n'a pas Bébé (Leboncoin)");
  ok(ded({ titre: "Body coton 3 mois" }, { libelle: "Pour qui", valeurs: ["Femmes", "Hommes", "Bébés"], genre: true })?.valeur === "Bébés", "un body → Bébés quand la liste l'a");
  ok(ded({ titre: "Pull marine", genres: ["Femmes"] }, { libelle: "Univers", valeurs: UNIVERS })?.source === "copie", "le genre déjà porté par une autre copie");
  ok(ded({ titre: "Lot H", objet: "body bébé" }, { libelle: "Univers", valeurs: UNIVERS })?.valeur === "Enfant", "l'objet nommé par l'IA (photos)");
  ok(ded({ titre: "TEST FillSell 28/10 — 0.6.152c rayon par identifiant — ne pas acheter", description: "Article de TEST FillSell, ne pas acheter. Test du 28/10 (0.6.152)." }, { libelle: "Univers", valeurs: UNIVERS }) === null,
    "banc à 40 : une fiche d'essai qui ne nomme rien → rien (jamais au hasard)");
  ok(ded({ titre: "Sac", chemins: [["Femmes", "Sacs"], ["Bijoux pour hommes"]] }, { libelle: "Pour qui ?", valeurs: POUR_QUI }) === null, "deux copies qui se contredisent → rien");
  ok(ded({ titre: "Pull", description: "acheté il y a 2 ans" }, { libelle: "Univers", valeurs: UNIVERS }) === null, "« il y a 2 ans » dans une description n'est pas un âge d'enfant");
  ok(ded({ titre: "Figurine Iron Man" }, { libelle: "Pour qui ?", valeurs: POUR_QUI }) === null, "« Iron Man » ne dit pas « homme »");
  ok(ded({ titre: "Veste homme et femme" }, { libelle: "Univers", valeurs: UNIVERS }) === null, "« homme et femme » : rien de sûr");
}

console.log("2. les autres champs : ce qui est ÉCRIT, dans la liste");
{
  ok(ded({ titre: "Veste 100% laine" }, { libelle: "Matière", valeurs: ["Laine", "Coton", "Autre"] })?.valeur === "Laine", "la matière écrite");
  ok(ded({ titre: "Doudoune noire" }, { libelle: "Matière", valeurs: ["Polyester", "Coton"] }) === null, "la matière TYPIQUE (doudoune → polyester) reste une PROPOSITION, jamais une déduction");
  ok(ded({ titre: "Pull autre couleur", description: "non" }, { libelle: "Couleur", valeurs: ["Autre", "Non", "Bleu"] }) === null, "« Autre », « Non » ne se lisent jamais dans un texte");
  ok(ded({ titre: "Pull TBE" }, { libelle: "État", valeurs: ["Très bon état", "Bon état"], etat: true })?.valeur === "Très bon état", "l'état écrit (« TBE »)");
  ok(ded({ titre: "Robe taille M" }, { libelle: "Taille", valeurs: ["S", "M"] }) === null, "jamais la taille (elle se propage d'une grille à l'autre)");
  ok(ded({ titre: "Veste laine" }, { libelle: "Matière", valeurs: ["Coton"] }) === null, "jamais une valeur hors de la liste");
  const kiabi = ded({ titre: "TEST FillSell 28/10 — marque Kiabi — ne pas acheter", chemins: [["Vêtements, accessoires", "Femmes", "Hauts", "T-shirts"]] }, { libelle: "Type", valeurs: ["T-shirt", "Chemise", "Autre"] });
  ok(kiabi?.valeur === "T-shirt" && kiabi.source === "rayon", "mesure à 200 : « Type · eBay » de la fiche Kiabi → T-shirt, ÉCRIT dans son rayon « T-shirts »", JSON.stringify(kiabi));
  ok(ded({ titre: "Lot H", objet: "t-shirt" }, { libelle: "Type", valeurs: ["T-shirt", "Autre"] })?.source === "objet", "l'objet nommé par l'IA, dit comme tel");
  ok(ded({ titre: "Pull", chemins: [["Autres", "Divers"]] }, { libelle: "Matière", valeurs: ["Coton", "Autre"] }) === null, "« Autres » dans un rayon n'est jamais lu comme « Autre »");
  // (19/11 soir, décision de Nico) eBay « Style » des leggings : obligatoire, TEXTE LIBRE, sans « Legging » dans la
  // suggestion ; la devinette hésitait entre « Jegging » (faux) et rien.
  const STYLE = ["Bootcut", "Jegging", "Skinny", "Straight"];
  const LEG = ["Vêtements, accessoires", "Femme : vêtements", "Leggings"];
  ok(ded({ titre: "legging ironwomen-pink", cheminEbay: LEG }, { libelle: "Style", valeurs: STYLE, texteLibre: true })?.valeur === "Legging",
    "texte libre : « legging » au titre ET rayon eBay « Leggings » → Style « Legging »");
  ok(ded({ titre: "legging ironwomen-pink", cheminEbay: LEG }, { libelle: "Style", valeurs: STYLE }) === null, "liste FERMÉE : jamais un mot hors liste");
  ok(ded({ titre: "Rangement pour yaourtière", cheminEbay: ["Maison", "Cuisine", "Rangement"] }, { libelle: "Type", valeurs: [], texteLibre: true }) === null,
    "« Rangement pour yaourtière » (exemple de Nico) : le titre ne nomme pas clairement le type → rien");
  ok(ded({ titre: "legging ironwomen-pink", cheminEbay: ["Femme : vêtements", "Pantalons"] }, { libelle: "Style", valeurs: STYLE, texteLibre: true }) === null,
    "le mot du titre n'est pas celui du rayon eBay → rien (jamais un mot du titre au hasard)");
  ok(ded({ titre: "Sac femme cuir", cheminEbay: ["Femme : sacs", "Sacs à main"] }, { libelle: "Modèle", valeurs: [], texteLibre: true }) === null, "seulement Style ou Type (jamais un Modèle)");
}

console.log("3. les groupes du lot : un par CHAMP ; un champ du rayon après le rayon");
{
  const q = (cle, libelle, plateformes) => ({ cle, type: "moteur", libelle, plateformes, sujet: cle === "etat" ? "etat" : `${libelle}|${[...plateformes].sort().join(",")}` });
  const mA = { clesQuestions: ["etat"], etatAChoisir: ["vinted", "leboncoin", "beebs", "ebay"] };
  const mB = { clesQuestions: ["etat"], etatAChoisir: ["ebay", "leboncoin"] };
  const sA = S.questionsDeLArticle(mA, []); const sB = S.questionsDeLArticle(mB, []);
  const g = S.sujetsDuLot([{ id: "a", questions: sA }, { id: "b", questions: sB }]);
  ok(g.length === 1 && g[0].lignes.length === 2 && g[0].plateformes.length === 4, "« État » : UN groupe, quelles que soient les plateformes de chaque article", JSON.stringify(g.map((x) => x.sujet)));
  const m1 = { clesQuestions: ["leboncoin:univers", "vinted:size"], genericRequiredStatus: { leboncoin: [{ key: "univers", label: "Univers", state: "missing", required: true }], vinted: [{ key: "size", label: "Taille", state: "missing", required: true }] }, rayonsAChoisir: { leboncoin: { objet: null } } };
  const qs1 = S.questionsDeLArticle(m1, []);
  ok(!qs1.some((x) => x.cle === "leboncoin:univers") && qs1.some((x) => x.cle === "rayon:leboncoin"), "banc à 40 : rayon Leboncoin à choisir → « Univers » n'est pas demandé avant lui", JSON.stringify(qs1.map((x) => x.cle)));
}

console.log("4. le lot pose la déduction, la montre, et la personne fait foi");
{
  const lp = lire("src/publication/lot/LotPublication.jsx");
  const effet = lp.slice(lp.indexOf("LA DÉDUCTION, ARTICLE PAR"), lp.indexOf("}, [tick, lot, etats]);"));
  ok(effet.length > 500 && /deduitsFaits\.current\.has\(marque\)/.test(effet) && /deduitsFaits\.current\.add\(marque\)/.test(effet), "une clé ne se déduit qu'UNE fois par article (jamais réécrite après un changement)");
  ok(!/noterReponseQuestion/.test(effet) && !/repondreChampPartage/.test(effet), "une déduction n'est JAMAIS enregistrée comme une réponse de la personne");
  // (diagnostic à 71) L'objet nommé par l'IA arrive APRÈS le premier passage : une clé sans déduction reste ouverte.
  ok(/if \(!d \|\| !poser\) continue;\n(?:\s*\/\/[^\n]*\n)*\s*deduitsFaits\.current\.add\(marque\);/.test(effet), "rien de lisible encore : la clé se relit plus tard (seule une clé POSÉE est close)");
  ok(/if \(etats\[id\]\?\.phase !== "questions"\) continue;/.test(effet), "seulement ce qui est encore une question (une valeur déjà là n'est jamais touchée)");
  ok(/texteLibre: a\.mode === "FREE_TEXT"/.test(effet) && /cheminEbay: cheminRayon\(m, "ebay"\)/.test(effet), "eBay : le lot dit si le champ est en texte libre, et donne le rayon eBay de l'article");
  ok(/journaliser\("lot_deductions"/.test(effet) && /data-deduits=\{n\}/.test(lp), "le nombre de déductions se dit à l'écran et se journalise");
  ok(/deduits=\{deduits\[ouvert\] \?\? \{\}\}/.test(lp), "la fiche de l'article reçoit ses valeurs déduites");
  const fa = lire("src/publication/lot/FicheArticle.jsx");
  ok(/function marqueDeduit\(ded, valeur, en\)/.test(fa) && /String\(ded\.valeur \?\? ""\) !== String\(valeur \?\? ""\)/.test(fa), "« déduit » seulement tant que la valeur est la déduite (changée : la marque s'en va)");
  ok(/marque=\{marqueDeduit\(deduits\[d\.id\]/.test(fa) && /marqueDeduit\(deduits\.etat, l\.valeur, en\)/.test(fa), "chaque champ du rayon et l'état portent la marque, plateforme par plateforme");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/function marquerPublicChoisi\(gp\)/.test(lps) && /if \(\/pour qui\|univers\|genre\|gender\|department\|sexe\/i\.test\(`\$\{champ\} \$\{a\?\.label \?\? ""\}`\)\) marquerPublicChoisi\(gp\);/.test(lps) && /setPlatformDedicatedField\(p, "genre", v\);\n\s*marquerPublicChoisi\(p\);/.test(lps),
    "le public choisi À LA MAIN se marque sur sa copie (public_choisi)");
  const rp = lire("src/utils/resolutionPublication.js");
  ok(/if \(!pf \|\| typeof pf !== "object" \|\| pf\.public_choisi\) continue;/.test(rp) && /childGenre && lbcPath\?\.\[0\] === "Mode" && !pf\.public_choisi/.test(rp), "au clic Publier, ni le texte ni les copies sœurs ne réécrivent le public choisi à la main");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
