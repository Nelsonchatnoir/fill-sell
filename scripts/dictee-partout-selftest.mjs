// ═══════════════════════════════════════════════════════════════════════════
// Selftest « LA DICTÉE PARTOUT » (29/10, lot B 1.3)
//   npm run selftest:dictee-partout
//
// Demande de Nico : « vérifie que la dictée vocale est bien reprise partout où
// le vendeur peut écrire ». Ce test prouve, sans micro ni réseau :
//   1. la fusion des résultats de la reconnaissance du navigateur (micro du
//      Lens, web, continuous = true) ne re-verse plus la session à chaque
//      résultat — l'ancien collage est rejoué pour montrer le doublon ;
//   2. le texte dicté s'AJOUTE (espace ou saut de ligne), le curseur suit ou
//      reste, un seul micro tient la place à la fois (utils/dictee.js) ;
//   3. en lisant les sources : chaque champ de texte libre de la liste du 29/10
//      porte <BoutonDictee> JUSTE APRÈS lui (avant tout autre champ), contrôlé
//      (valeur=) ou non (sans valeur=) selon le champ ; le composant ne
//      s'affiche pas sans dicteeDisponible() ; le micro du Lens passe par la
//      fusion.
// ═══════════════════════════════════════════════════════════════════════════
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
let ko = 0;
const ok = (nom, cond, detail = "") => { if (!cond) ko++; console.log(`  ${cond ? "ok  " : "KO  "} ${nom}${cond ? "" : `   ← ${detail}`}`); };
const lire = (rel) => fs.readFileSync(join(ROOT, rel), "utf8").replace(/\r\n/g, "\n");

const D = await import(pathToFileURL(join(ROOT, "src/utils/dictee.js")).href);

// ── 1. La fusion des résultats (continuous = true) ──────────────────────────
console.log("\n1. Reconnaissance du navigateur en continu : seuls les mots neufs s'ajoutent");
const R = (...textes) => textes.map((t) => (typeof t === "string" ? { texte: t, final: true } : t));
// L'ANCIEN collage d'App.jsx (toggleLensMic), rejoué tel quel.
function ancienCollage(champ, evenements) {
  let c = champ;
  for (const results of evenements) {
    const t = results.map((r) => r.texte).join(" ");
    c = (c ? c + " " : "") + t;
  }
  return c;
}
function nouvelleFusion(champ, evenements) {
  let c = champ;
  let verse = "";
  for (const results of evenements) {
    const r = D.fusionnerResultatsReconnaissance(verse, results);
    verse = r.session;
    if (r.ajout) c = D.ajouterDictee(c, r.ajout);
  }
  return c;
}
const ordinateur = [R("robe"), R("robe", " rouge"), R("robe", " rouge", " taille M")];
const avantFix = ancienCollage("", ordinateur);
ok("l'ancien collage DOUBLAIT (preuve du défaut)", /robe robe/.test(avantFix), avantFix);
ok("Chrome ordinateur : « robe rouge taille M », une fois", nouvelleFusion("", ordinateur) === "robe rouge taille M", nouvelleFusion("", ordinateur));
const android = [R("robe"), R("robe", "robe rouge"), R("robe", "robe rouge", "Robe rouge taille M")];
ok("Chrome Android (résultats cumulés) : une fois", nouvelleFusion("", android) === "robe rouge taille M", nouvelleFusion("", android));
ok("après un texte déjà tapé, à la fin", nouvelleFusion("Jean slim", ordinateur) === "Jean slim robe rouge taille M", nouvelleFusion("Jean slim", ordinateur));
ok("un résultat provisoire ne s'ajoute pas", D.fusionnerResultatsReconnaissance("", [{ texte: "rob", final: false }]).ajout === "");
ok("aucun résultat → rien", D.fusionnerResultatsReconnaissance("", []).ajout === "" && D.fusionnerResultatsReconnaissance("", null).ajout === "");
const revision = D.fusionnerResultatsReconnaissance("robe", R("rose rouge"));
ok("une révision du navigateur n'ajoute que les mots en plus", revision.ajout === "rouge", JSON.stringify(revision));
const recul = D.fusionnerResultatsReconnaissance("robe rouge", R("robe"));
ok("une session qui raccourcit n'ajoute rien et garde la plus longue", recul.ajout === "" && recul.session === "robe rouge", JSON.stringify(recul));

// ── 2. Ajouter, le curseur, un seul micro ───────────────────────────────────
console.log("\n2. Le texte s'AJOUTE ; le curseur ; un seul micro à la fois");
ok("espace par défaut", D.ajouterDictee("Robe Zara", "taille M") === "Robe Zara taille M");
ok("saut de ligne pour une description", D.ajouterDictee("Robe Zara.  \n", "Portée deux fois.", "\n") === "Robe Zara.\nPortée deux fois.");
ok("champ vide : le texte seul", D.ajouterDictee("", "Robe", "\n") === "Robe" && D.ajouterDictee("   ", "Robe") === "Robe");
ok("dictée vide : le champ ne bouge pas", D.ajouterDictee("Robe", "   ") === "Robe" && D.ajouterDictee("Robe", null) === "Robe");
ok("aucun autre séparateur admis", D.ajouterDictee("a", "b", "<br>") === "a b");
const auBout = D.curseurApresDictee("Robe ", { debut: 5, fin: 5 }, 16);
ok("curseur au bout → il suit l'ajout", auBout.debut === 16 && auBout.fin === 16, JSON.stringify(auBout));
const milieu = D.curseurApresDictee("Robe rouge", { debut: 2, fin: 4 }, 21);
ok("curseur au milieu → il reste où il était", milieu.debut === 2 && milieu.fin === 4, JSON.stringify(milieu));
const sansFocus = D.curseurApresDictee("Robe", null, 10);
ok("sans sélection lue → au bout", sansFocus.debut === 10 && sansFocus.fin === 10);
const coupe = D.curseurApresDictee("abcdefghij", { debut: 8, fin: 9 }, 5);
ok("plafond de caractères : le curseur reste dans le champ", coupe.debut === 5 && coupe.fin === 5, JSON.stringify(coupe));
let arretsA = 0;
const libererA = D.reserverMicro(() => { arretsA++; });
ok("un micro réservé tient la place", D.microReserve());
let arretsB = 0;
const libererB = D.reserverMicro(() => { arretsB++; });
ok("le micro qui démarre arrête celui qui écoutait", arretsA === 1 && arretsB === 0, `A=${arretsA} B=${arretsB}`);
libererA();
ok("l'ancien micro qui se libère ne libère pas le nouveau", D.microReserve());
libererB();
ok("le nouveau se libère", !D.microReserve());
D.reserverMicro(() => { throw new Error("déjà arrêté"); });
const libererC = D.reserverMicro(() => {});
ok("un micro qui lève en s'arrêtant ne bloque pas le suivant", D.microReserve());
libererC();

// ── 3. Les sources ──────────────────────────────────────────────────────────
console.log("\n3. Le composant, et chaque champ de texte libre");
const comp = lire("src/components/BoutonDictee.jsx");
ok("BoutonDictee : « Dicter » / « Dictate » en aria-label", /dicter: 'Dicter'/.test(comp) && /dicter: 'Dictate'/.test(comp) && /aria-label=\{t\.dicter\}/.test(comp));
ok("BoutonDictee : rien sans dicteeDisponible()", /useState\(\(\) => dicteeDisponible\(\)\)/.test(comp) && /if \(!disponible\) return null;/.test(comp));
ok("BoutonDictee : le texte s'ajoute par ajouterDictee", /ajouterDictee\(avant, texte, sep\)/.test(comp));
ok("BoutonDictee : un seul micro (reserverMicro)", /reserverMicro\(/.test(comp));
ok("BoutonDictee : cible tactile 44 px, rond visible 36 px", /width: 44, height: 44/.test(comp) && /width: 36, height: 36/.test(comp));
ok("BoutonDictee : toucher le micro ne retire pas le focus au champ", /onMouseDown=\{\(e\) => e\.preventDefault\(\)\}/.test(comp));
ok("BoutonDictee : jetons --fs-* avec repli sur la palette UI", /var\(--fs-\$\{nom\}, \$\{repli\}\)/.test(comp) && /from '\.\/ui'/.test(comp));
ok("BoutonDictee : aucune écriture en base", !/supabase\s*\.\s*(from|rpc)\s*\(/.test(comp));

// Chaque champ : une ancre UNIQUE dans le champ ; <BoutonDictee …/> doit suivre
// la fin du champ avant tout autre champ de saisie.
const CHAMPS = [
  { f: "src/publication/lot/LotPublication.jsx", nom: "lot · description à écrire (sans lecteur)", ancre: "placeholder={M.placeholder} aria-label={M.ecrireTitre}", controle: true },
  { f: "src/publication/lot/LotPublication.jsx", nom: "lot · titre qui part", ancre: "defaultValue={titreQuiPart}", controle: false },
  { f: "src/publication/lot/LotPublication.jsx", nom: "lot · description qui part", ancre: "defaultValue={descriptionQuiPart}", controle: false },
  { f: "src/publication/lot/LotPublication.jsx", nom: "lot · question description", ancre: 'defaultValue="" aria-label="Description"', controle: false },
  { f: "src/publication/BlocQuestions.jsx", nom: "questions · description Vinted", ancre: 'm.modifierCarte("vinted", "description", ev.target.value)', controle: true },
  { f: "src/publication/AttenteLectureOrigine.jsx", nom: "attente de lecture · description à écrire", ancre: "placeholder={L.placeholder} aria-label={L.ecrireTitre}", controle: true },
  { f: "src/tabs/StockTab.jsx", nom: "stock · ajout manuel · nom", ancre: "<Field label={t('fieldNom')}", controle: true },
  { f: "src/tabs/StockTab.jsx", nom: "stock · ajout manuel · description", ancre: "onChange={e=>setIDesc(e.target.value.slice(0,DESC_MANUELLE_MAX))}", controle: true },
  { f: "src/tabs/StockTab.jsx", nom: "stock · description exigée par une plateforme", ancre: "setTexte((t) => ({ ...t, description: e.target.value }))", controle: true },
  { f: "src/App.jsx", nom: "Modifier l'article · nom", ancre: "onChange={e=>setEditItem(p=>({...p,title:e.target.value}))}", controle: true },
  { f: "src/App.jsx", nom: "Modifier l'article · description", ancre: "onChange={e=>setEditItem(p=>({...p,description:e.target.value.slice(0,DESC_MANUELLE_MAX)}))}", controle: true },
  { f: "src/App.jsx", nom: "Signaler un bug / support", ancre: "onChange={e=>setBugMessage(e.target.value)}", controle: true },
  { f: "src/messagerie/EspaceMessagerie.jsx", nom: "messagerie · réponse", ancre: "onChange={(e) => setTexte(e.target.value.slice(0, 2000))}", controle: true },
];
const sources = new Map();
for (const c of CHAMPS) {
  if (!sources.has(c.f)) sources.set(c.f, lire(c.f));
  const s = sources.get(c.f);
  const n = s.split(c.ancre).length - 1;
  if (n !== 1) { ok(`${c.nom} : ancre unique`, false, `${n} occurrence(s) de ${c.ancre}`); continue; }
  const i = s.indexOf(c.ancre);
  const fin = s.indexOf("/>", i);
  const suite = s.slice(fin + 2, fin + 2 + 1500);
  const j = suite.indexOf("<BoutonDictee");
  const autre = suite.search(/<textarea\b|<input\b|<Field\b|<select\b/);
  const porte = j >= 0 && (autre < 0 || j < autre);
  const balise = porte ? suite.slice(j, suite.indexOf("/>", j) + 2) : "";
  const bonMode = c.controle ? /\bvaleur=\{/.test(balise) : !/\bvaleur=/.test(balise) && /\bonChange=\{/.test(balise);
  ok(`${c.nom} (${c.f.split("/").pop()}:${s.slice(0, i).split("\n").length}) porte <BoutonDictee>`, porte, j < 0 ? "aucun <BoutonDictee> après le champ" : "un autre champ s'intercale");
  if (porte) ok(`${c.nom} : ${c.controle ? "contrôlé (valeur=)" : "non contrôlé (onChange, sans valeur=)"}`, bonMode, balise);
}
for (const f of sources.keys()) {
  ok(`${f.split("/").pop()} importe BoutonDictee`, /^import BoutonDictee from ['"][./]+(components\/)?BoutonDictee['"];?$/m.test(sources.get(f)));
}

console.log("\n4. Le micro du Lens (App.jsx, toggleLensMic)");
const app = sources.get("src/App.jsx");
const debutLens = app.indexOf("async function toggleLensMic(");
const lens = debutLens >= 0 ? app.slice(debutLens, app.indexOf("\n  }\n", debutLens)) : "";
ok("toggleLensMic trouvé", lens.length > 0);
ok("l'ancien collage de toute la session a disparu", !/Array\.from\(e\.results\)\.map\(r=>r\[0\]\.transcript\)\.join\(" "\)/.test(lens));
ok("les résultats passent par fusionnerResultatsReconnaissance", /fusionnerResultatsReconnaissance\(verse,/.test(lens));
ok("le micro du Lens prend la place (reserverMicro), web et natif", (lens.match(/reserverMicro\(/g) ?? []).length === 2);

// Les champs que Nico branche lui-même : dit, sans faire échouer.
console.log("\n(info) champs branchés par Nico avec ce composant :");
for (const f of ["src/components/ListingPreviewScreen.jsx", "src/components/BlocValeursGenerales.jsx", "src/publication/lot/FicheArticle.jsx"]) {
  const s = lire(f);
  console.log(`  ·  ${f.split("/").pop()} : ${/<BoutonDictee\b/.test(s) ? "porte <BoutonDictee>" : "pas encore"}`);
}

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
