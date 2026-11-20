// Autotest VERROU : LE LOT À 200 ARTICLES SANS OUVRIR LES ARTICLES UN PAR UN (19/11/2026 soir, OTA 2 — exigence de Nico).
//
//     node --import ./scripts/loader-ext.mjs scripts/questions-par-champ-1911-selftest.mjs
//
// « Tout ce qui se devine est rempli, ARTICLE PAR ARTICLE : une doudoune et un jean n'ont pas la même matière. Les
// questions qui restent sont regroupées PAR CHAMP […] une ligne par article avec SA proposition, on touche une ligne
// pour la changer, et un seul bouton « Tout valider » pour le groupe. JAMAIS une même valeur imposée à tous. Une valeur
// commune (même état pour tous) peut être proposée en option, jamais par défaut. Un bouton « Publier les prêts (N) »
// fait partir tout de suite ce qui est bon. Le reste attend dans « À régler » sans jamais bloquer les autres. »
// Ce qu'il prouve :
//   1. la proposition de CHAQUE article (propositions.js) : la valeur de la liste écrite dans son titre, sa
//      description, son rayon, l'objet nommé par l'IA ; sinon la matière typique de SON objet ; le genre écrit ou celui
//      de l'objet ; rien de probable → null (« à choisir »), jamais une valeur hors liste ;
//   2. deux articles d'un même champ reçoivent chacun la leur (doudoune → Polyester, jean → Coton, pull → Laine) ;
//   3. le regroupement par champ (sujetsDuLot) : une ligne par article ;
//   4. l'écran : les groupes avant la liste, « Tout valider (N) » par groupe, aucune question sous les lignes
//      d'articles, la taille jamais proposée (elle se propage d'une grille à l'autre), l'état commun en option
//      repliée ; « Publier les prêts (N) » dès qu'un article est prêt, même pendant la préparation ; après l'envoi,
//      le lot revient sur ce qui reste.
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

const MATIERES_EBAY = ["Acrylique", "Coton", "Cuir", "Élasthanne", "Laine", "Lin", "Nylon", "Polyester", "Soie", "Viscose"];
const matiere = (art) => P.proposition({ libelle: "Matière", valeurs: MATIERES_EBAY }, art)?.valeur ?? null;

console.log("1. la proposition de chaque article");
{
  ok(matiere({ titre: "Veste 100 % laine vierge" }) === "Laine", "la matière écrite dans le titre");
  ok(matiere({ titre: "Chemise", description: "Belle chemise en lin lavé" }) === "Lin", "la matière écrite dans la description");
  ok(matiere({ titre: "Doudoune noire" }) === "Polyester", "rien d'écrit : la matière typique de l'objet (doudoune → Polyester)");
  ok(matiere({ titre: "Lot H", objet: "jean slim" }) === "Coton", "l'objet nommé par l'IA (photos) quand le titre ne dit rien");
  ok(matiere({ titre: "Robot aspirateur" }) === null, "un objet sans matière typique : null, « à choisir »");
  ok(P.proposition({ libelle: "Matière", valeurs: ["Plastique", "Métal"] }, { titre: "Doudoune noire" }) === null, "jamais une valeur hors de la liste de la plateforme");
  const genre = (art, valeurs = ["Femmes", "Hommes", "Unisexe"]) => P.proposition({ libelle: "Pour qui", valeurs, genre: true }, art)?.valeur ?? null;
  ok(genre({ titre: "T-shirt femme Picture blanc" }) === "Femmes", "« Pour qui » : le genre écrit");
  ok(genre({ titre: "Boutons de manchette argent" }) === "Hommes", "« Pour qui » : celui de l'objet (boutons de manchette → Hommes)");
  ok(genre({ titre: "Scotch" }) === null, "« Pour qui » : rien de probable → null");
  ok(P.proposition({ libelle: "Couleur", valeurs: ["Noir", "Blanc", "Bleu"] }, { titre: "Pull col rond bleu marine" })?.valeur === "Bleu", "la couleur écrite (mot entier)");
  ok(P.proposition({ libelle: "Couleur", valeurs: ["Or", "Noir"] }, { titre: "Montre Orient" }) === null, "jamais un morceau de mot (« Or » dans « Orient »)");
  const ETATS = ["Neuf avec étiquette", "Neuf sans étiquette", "Très bon état", "Bon état", "Satisfaisant"];
  ok(P.etatEcrit("Robe Zara neuve avec étiquette", ETATS) === "Neuf avec étiquette" && P.etatEcrit("Robe Zara neuf avec étiquette", ETATS) === "Neuf avec étiquette", "l'état écrit : « neuf avec étiquette »");
  ok(P.etatEcrit("Pull TBE taille M", ETATS) === "Très bon état" && P.etatEcrit("Jean, très bon état", ETATS) === "Très bon état", "« TBE », « très bon état »");
  ok(P.etatEcrit("Veste bon état", ETATS) === "Bon état" && P.etatEcrit("Chaussures jamais portées", ETATS) === "Neuf sans étiquette" && P.etatEcrit("Pull pas neuf", ETATS) === null && P.etatEcrit("T-shirt comme neuf", ETATS) === "Très bon état" && P.etatEcrit("Pull porté quelques fois", ETATS) === "Très bon état" && P.etatEcrit("Veste, traces d usure", ETATS) === "Satisfaisant" && P.etatEcrit("Chaussures jamais porté", ETATS) === "Neuf sans étiquette", "« bon état », « jamais porté »");
  ok(P.etatEcrit("Veste noire", ETATS) === null && P.etatEcrit("", ETATS) === null, "rien d'écrit : null — jamais deviné de rien");
  ok(P.etatEcrit("Pull tbe", ["New", "Good"]) === null, "jamais une valeur hors de la liste");
  const lpE = lire("src/publication/lot/LotPublication.jsx");
  ok(/if \(q\.type === "moteur" && q\.cle === "etat"\) \{\n\s*const v = etatEcrit\(`\$\{art\.titre\} \$\{art\.description\}`/.test(lpE), "le groupe État propose l'état ÉCRIT de chaque article");
  ok(P.tailleDuTitre("Sweat Nike Jordan taille M", ["S", "M", "L"]) === "M" && P.tailleDuTitre("Jean Levi's W32") === "W32", "la taille écrite dans le titre (outil, jamais posée par le lot)");
}

console.log("2. chacun la sienne");
{
  const lot = [{ titre: "Doudoune noire Zara" }, { titre: "Jean slim Levi's" }, { titre: "Pull col roulé" }, { titre: "T-shirt basique" }];
  const v = lot.map(matiere);
  ok(v.join("|") === "Polyester|Coton|Laine|Coton", "doudoune → Polyester · jean → Coton · pull → Laine · t-shirt → Coton", v.join("|"));
  ok(new Set(v).size > 1, "jamais une même valeur imposée à tous");
}

console.log("3. le regroupement par champ");
{
  const q = (cle, libelle, plateformes) => ({ cle, type: "moteur", libelle, plateformes, sujet: `${libelle}|${plateformes.join(",")}` });
  const sujets = S.sujetsDuLot([
    { id: "a", questions: [q("ebay:Matière", "Matière", ["ebay"]), q("etat", "État", ["vinted"])] },
    { id: "b", questions: [q("ebay:Matière", "Matière", ["ebay"])] },
    { id: "c", questions: [q("ebay:Matière", "Matière", ["ebay"]), q("etat", "État", ["vinted"])] },
  ]);
  ok(sujets.length === 2 && sujets[0].libelle === "Matière" && sujets[0].lignes.map((l) => l.id).join("") === "abc" && sujets[1].lignes.length === 2,
    "« Matière · eBay — 3 articles », « État — 2 articles » : une ligne par article, le plus nombreux d'abord");
  ok(S.titreDuSujet(sujets[0]) === "Matière · eBay", "le titre du groupe : « Matière · eBay »");
}

console.log("4. l'écran");
{
  const lp = lire("src/publication/lot/LotPublication.jsx");
  ok(/const groupesParChamp = sujetsDuLot\(/.test(lp) && /data-tout-valider=""/.test(lp) && /Tout valider \(\$\{aValider\.length\}\)/.test(lp), "un « Tout valider (N) » par groupe, qui compte les lignes proposées");
  ok(/for \(const l of aValider\) \{ try \{ l\.prop\.appliquer\(\); \} catch \(e\) \{ mettreDeCote\(l\.id, e, "tout_valider"\); \} \}/.test(lp), "« Tout valider » pose la proposition de CHAQUE ligne (un article qui casse : lui seul de côté)");
  ok(/const qs = parChamp \? \[\] : qsTous;/.test(lp), "plus aucune question sous les lignes d'articles quand elles sont rangées par champ");
  ok(/<Rendu f=\{\(\) => ligneMoteur\(l\.id, l\.q\)\} \/>/.test(lp), "toucher une ligne ouvre la MÊME question pour cet article, sur place (sans ouvrir l'article)");
  ok(/q\.cle === "taille" \|\| \(q\.cles\?\.length \?\? 0\) > 1/.test(lp) && /a\.sharedKey === "taille"\) return null;/.test(lp), "la taille n'est jamais proposée par le lot (elle se propage d'une grille à l'autre)");
  ok(/<details className="fsv-champ-commun">/.test(lp) && /Le même pour tous \(option\)/.test(lp), "l'état commun : une option repliée, jamais par défaut");
  ok(!/data-etat-commun/.test(lp), "plus de bloc « État · le même pour les N » ouvert d'office");
  // (banc à 40, 19/11 soir) « Pour qui ? · Vinted — la même pour les 3 », « Univers · Leboncoin — la même pour les 4 »
  // s'ouvraient en tête de liste : une option repliée de leur groupe désormais.
  ok(/\{!parChamp && communeDuLot\.map/.test(lp) && /data-commune-option=""/.test(lp) && /<details className="fsv-champ-commun fsv-lot" data-communes-option="">/.test(lp),
    "« la même pour les N » (Pour qui, Univers…) : repliée dans son groupe, jamais ouverte d'office");
  ok(/if \(!preparationFinie && prets\.length\) \{[\s\S]{0,400}les prêts \(\$\{prets\.length\}\)`;\n\s*onCta = envoyer;/.test(lp), "« Publier les prêts (N) » dès qu'un article est prêt, même pendant la préparation");
  // (20/11/2026, lot de Louis) La fin se juge sur les phases POSÉES par la boucle (l'écran a un rendu de retard sur le
  // dernier article : tout envoi complet revenait sur l'étape 2) — selftest:lot-fin-apres-envoi-2011.
  ok(/const reste = resteApresEnvoi\(lot\.ids, \{ posees, phaseEcran: \(id\) => etatsRef\.current\[id\]\?\.phase, arrete: arretEnvoiRef\.current \}\);\n(?:\s*\/\/[^\n]*\n)*\s*if \(reste\) \{ setEnvoi\(null\); setEtape\("avant"\); \} else setEtape\("fin"\);/.test(lp),
    "après l'envoi des prêts : le lot revient sur ce qui reste, SANS la progression de l'envoi (essai réel, profil iPhone) ; l'écran de fin quand il ne reste rien");
  ok(/nPartis=\{partis\}/.test(lp) && /sont déjà partis/.test(lp), "quitter après « Publier les prêts » : la feuille ne dit plus « Rien n'est encore parti »");
  ok(/dejaPartis: partis/.test(lp) && /quitter\.dejaPartis > 0 \? \(en \? "The rest waits — leave\?" : "Le reste attend — quitter \?"\)/.test(lp),
    "(essai réel, profil Android) le bouton Quitter armé ne dit plus « Rien n'est parti » après un envoi partiel");
  const css = lire("src/publication/lot/lot.css");
  ok(/\.fsv-champ-ligne\s*\{/.test(css) && /\.fsv-champ-val--vide/.test(css), "les lignes des groupes ont leur style (lot.css)");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
