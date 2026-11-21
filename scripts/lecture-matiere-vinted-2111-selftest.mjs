// ═══════════════════════════════════════════════════════════════════════════
// VERROU — 21/11/2026, URGENT de Nico (Vetis Shop), point 2 : la MATIÈRE de l'annonce Vinted d'origine est reprise
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant : un article importé de Vinted partait sur Beebs et Leboncoin SANS matière (matiere = ""), alors que sa
// page publique la porte en clair : `{"code":"material","data":{"title":"Matière","value":"Polyester"},"type":"text"}`
// (relu le 21/11 sur une robe du compte). FillSell ne la vidait pas : il ne la lisait jamais (lireFluxNextVinted ne
// rendait que texte, couleur, marque, rayon).
// Ce qu'il prouve :
//   1. l'extension (background.js lu tel quel) rend la matière de la page, et la pose sur la fiche (source vinted_detail) ;
//   2. l'app (texteDuVendeur) la pose aussi, et l'écran qui s'ouvre la voit — jamais une matière saisie écrasée ;
//   3. le serveur (lecture de fond) relit UNE fois une fiche sans matière lue par un lecteur d'avant, et seulement par un
//      poste qui sait la lire ;
//   4. la base arbitre : « manuel » (rang 5) gagne toujours contre « vinted_detail » (rang 4).
//   node --import ./scripts/loader-ext.mjs scripts/lecture-matiere-vinted-2111-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import * as tv from "../src/publication/texteDuVendeur.js";
import { aLireEnFond, listeLectureFond, LECTURE_MATIERE_VERSION_MIN, LECTEUR_AVEC_MATIERE } from "../supabase/functions/_shared/lecture-fond.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const BG = readFileSync(join(RACINE, "chrome-extension/background.js"), "utf8").replace(/\r\n/g, "\n");
const GPJ = readFileSync(join(RACINE, "supabase/functions/get-pending-jobs/index.ts"), "utf8");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
function extraire(nom) {
  const m = new RegExp(`\\n((?:async )?function ${nom}\\()`).exec(BG);
  if (!m) throw new Error(`fonction introuvable : ${nom}`);
  const debut = m.index + 1;
  return BG.slice(debut, BG.indexOf("\n}\n", debut) + 2);
}

console.log("1. L'extension lit la matière de la page publique");
{
  const ctx = { console: { log() {}, warn() {}, error() {} }, JSON, Date, Math, Number, String, Boolean, Array, Object, Set, Map, RegExp, parseInt };
  vm.createContext(ctx);
  const { lireFluxNextVinted } = vm.runInContext(`${extraire("lireFluxNextVinted")}\n;({ lireFluxNextVinted })`, ctx);
  const ID = "10286501910";
  const attributs = (mat) => `6:["$","div",null,{"attributes":[{"code":"brand","data":{"title":"Marque","value":"Jean Marc Philippe"},"type":"text"},`
    + `{"code":"status","data":{"title":"État","value":"Très bon état"},"type":"text"},`
    + (mat ? `{"code":"material","data":{"title":"Matière","value":${JSON.stringify(mat)}},"type":"text"},` : "")
    + `{"code":"color","data":{"title":"Couleur","value":"Noir, Blanc"},"type":"text"}],"item_id":${ID},"section_title":"Détails"}]\n`;
  const desc = `5:["$","div",null,{"data":{"description":"Robe d'été portefeuille, étiquette en photo.","item_id":${ID}},"name":"description"}]\n`;
  const page = (flux) => `<html><head><title>robe d été style portefeuille | Vinted</title></head><body><script>self.__next_f.push([1,${JSON.stringify(flux)}])</script></body></html>`;
  const lu = lireFluxNextVinted(page(desc + attributs("Polyester")), ID);
  ok(lu?.matiere === "Polyester", "« Matière : Polyester » → matiere = « Polyester »", JSON.stringify(lu?.matiere));
  ok(lu?.couleur === "Noir" && lu?.couleur2 === "Blanc" && lu?.marque === "Jean Marc Philippe", "couleur, couleur2 et marque : inchangées");
  const sans = lireFluxNextVinted(page(desc + attributs(null)), ID);
  ok(sans && Object.prototype.hasOwnProperty.call(sans, "matiere") && sans.matiere === null, "une annonce sans matière : la clé est là, vide (lecteur ≥ 0.6.197)");
  const deux = lireFluxNextVinted(page(desc + attributs("Coton, Élasthanne")), ID);
  ok(deux?.matiere === "Coton, Élasthanne", "plusieurs matières : le texte de Vinted tel quel", JSON.stringify(deux?.matiere));
  const ecrire = extraire("ecrireLecturePagePublique");
  ok(/matiere:\s*lu\.matiere/.test(ecrire), "ecrireLecturePagePublique pose la matière (attributsChamps, source vinted_detail)");
  ok(/lu\.matiere \? "matiere" : null/.test(ecrire), "… et la compte dans les champs lus");
  ok(/lecteur:\s*2/.test(ecrire), "… et marque la lecture « lecteur: 2 »");
  ok(/matiere:\s*texte\(/.test(extraire("analyserPagePubliqueVinted")), "la page avec JSON-LD rend aussi la clé matiere");
}

console.log("2. L'app pose la matière, sans jamais écraser une saisie");
{
  const at = "2026-11-21T14:30:00Z";
  const a = tv.attributsDepuisPagePublique({ couleur: "Noir", marque: "Mango", matiere: "Polyester", catalog_id: 1065 }, at);
  ok(a.matiere?.v === "Polyester" && a.matiere.source === "vinted_detail", "matiere posée, source vinted_detail (la base arbitre)");
  ok(a.page_publique_lue?.lecteur === LECTEUR_AVEC_MATIERE, "la lecture est marquée lecteur 2");
  const vieux = tv.attributsDepuisPagePublique({ couleur: "Noir", catalog_id: 1065 }, at);
  ok(!("matiere" in vieux) && vieux.page_publique_lue && !("lecteur" in vieux.page_publique_lue), "une extension ≤ 0.6.196 (sans la clé) : rien de faux, lecture non marquée");
  const vide = tv.attributsDepuisPagePublique({ couleur: "Noir", matiere: null }, at);
  ok(!("matiere" in vide) && vide.page_publique_lue?.lecteur === 2, "annonce sans matière : rien posé, mais lue par le bon lecteur (pas relue)");
  const enMemoire = tv.attributsAjoutesEnMemoire({ matiere: { v: "Soie", source: "manuel", at } }, a);
  ok(enMemoire.matiere.v === "Soie" && enMemoire.couleur?.v === "Noir", "en mémoire : la matière saisie (Soie) reste, la couleur manquante arrive");
  const neuve = tv.attributsAjoutesEnMemoire({ matiere: { v: "", source: "vinted_liste", at } }, a);
  ok(neuve.matiere.v === "Polyester", "en mémoire : une matière vide est remplie");
  ok(!("page_publique_lue" in tv.attributsAjoutesEnMemoire(null, a)), "en mémoire : seulement des champs, pas la trace de lecture");
}

console.log("3. Le serveur relit UNE fois une fiche sans matière (lecture de fond)");
{
  const maintenant = Date.parse("2026-11-21T15:00:00Z");
  const lueHier = { v: "2026-11-20T10:00:00Z", source: "vinted_detail", at: "2026-11-20T10:00:00Z" };
  const fiche = { id: 1, vinted_item_id: "10286501910", vinted_catalog_id: 1065, description: "Robe", couleur: { v: "Noir" }, page_publique_lue: lueHier, created_at: "2026-11-20T09:00:00Z" };
  ok(aLireEnFond(fiche, maintenant) === false, "ancien poste : une fiche complète lue hier n'est pas relue (inchangé)");
  ok(aLireEnFond(fiche, maintenant, { lecteurMatiere: true }) === true, "poste ≥ 0.6.197 : sans matière, lue par un lecteur d'avant → relue");
  ok(aLireEnFond({ ...fiche, page_publique_lue: { ...lueHier, lecteur: 2 } }, maintenant, { lecteurMatiere: true }) === false, "déjà lue par le lecteur 2 : jamais relue (une seule fois)");
  ok(aLireEnFond({ ...fiche, matiere: { v: "Polyester" } }, maintenant, { lecteurMatiere: true }) === false, "une matière connue : pas relue");
  ok(aLireEnFond({ ...fiche, page_publique_lue: { ...lueHier, echec: "antirobot" } }, maintenant, { lecteurMatiere: true }) === false, "un échec récent : la pause habituelle (7 jours) tient");
  const regle = { actif: true, mode: "rattrapage", par_cycle: 3, lecteurMatiere: true };
  ok(listeLectureFond([fiche], regle, maintenant).length === 1 && listeLectureFond([fiche], { ...regle, lecteurMatiere: false }, maintenant).length === 0, "la liste servie suit le poste");
  ok(LECTURE_MATIERE_VERSION_MIN === "0.6.197", "la version qui sait lire la matière : 0.6.197");
  ok(/const lecteurMatiereLf = versionAuMoins\(version, LECTURE_MATIERE_VERSION_MIN\)/.test(GPJ) && /matiere:attributs->matiere/.test(GPJ), "get-pending-jobs lit la matière et la version du poste");
  ok(/listeLectureFond\(lignesTriees, \{ \.\.\.regleLf, lecteurMatiere: lecteurMatiereLf \}/.test(GPJ), "… et la passe à la règle");
}

console.log(`\n${verts} vertes, ${rouges} rouges — matière Vinted reprise (URGENT Vetis, point 2).`);
if (rouges) { console.log("ROUGE"); process.exit(1); }
