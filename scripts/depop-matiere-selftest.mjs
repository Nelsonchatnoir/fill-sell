// `npm run selftest:depop-matiere` — LA MATIÈRE PART SUR DEPOP (30/10/2026, lot E, essai B7).
// Essai réel du 30/10 : un t-shirt « Femme » dont l'étiquette dit « Coton biologique » partait sur Vinted avec sa
// matière et sur Depop SANS (la copie Depop n'en portait pas, le connecteur envoyait `attributes: {}`).
// Le formulaire de Depop envoie `attributes: { material: ["cotton-organic"] }` (requête relevée le 30/10).
//
// Ce qu'il tient :
//   A. les listes du connecteur (identifiants actifs, types qui acceptent la matière) = le relevé
//      docs/plateformes/depop/attributs.json, et la table de l'app (DEPOP_MATIERES) n'en sort pas ;
//   B. l'app : la matière de la fiche ou la composition de l'étiquette → depopMatieres (4 au plus, inconnu écarté) ;
//   C. le connecteur : la matière part dans `attributes.material` sur un type qui l'accepte, jamais sur une robe ni
//      une montre, jamais un identifiant inconnu, 4 au plus ; sans matière, `attributes: {}` comme avant ;
//   D. la résolution de l'app lit la matière commune des autres copies, puis la fiche ; la copie d'une republication
//      reprend la matière du dépôt.
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0;
const dit = (nom, c, detail) => { if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

const att = await import("../src/utils/depopAttributs.js");
const dp = await import("../src/utils/depopPublication.js");

const ctx = vm.createContext({ console, URL, Math, Number, String, Array, Object, Set, Map, JSON, Date, Promise, RegExp, Error, globalThis: undefined });
ctx.globalThis = ctx;
vm.runInContext(lire("chrome-extension/content-scripts/depop-tailles.js"), ctx, { filename: "depop-tailles.js" });
vm.runInContext(`${lire("chrome-extension/content-scripts/depop.js")}
;globalThis.__t = { depopPrevol, depopMatieresDuJob, DEPOP_MATIERES_IDS, DEPOP_TYPES_AVEC_MATIERE, DEPOP_MATIERES_MAX };`, ctx, { filename: "depop.js" });
const T = ctx.__t;
const REL = JSON.parse(lire("docs/plateformes/depop/attributs.json")).attributs_par_type.find((a) => a.id === "material");

console.log("\nA. LES LISTES = LE RELEVÉ");
{
  const memes = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));
  const actifs = new Set(REL.valeurs.filter((v) => v.statut === "active").map((v) => v.id));
  dit("identifiants du connecteur = matières actives du relevé", memes(new Set(T.DEPOP_MATIERES_IDS), actifs));
  dit("types du connecteur = types qui acceptent la matière", memes(new Set(T.DEPOP_TYPES_AVEC_MATIERE), new Set(REL.utilise_par_types)));
  dit("4 au plus (max_selection du relevé)", T.DEPOP_MATIERES_MAX === REL.max_selection && REL.max_selection === 4);
  const horsListe = Object.keys(att.DEPOP_MATIERES).filter((id) => !actifs.has(id));
  dit("la table de l'app n'a que des identifiants actifs", horsListe.length === 0, horsListe.join(", "));
}

console.log("\nB. L'APP : LA MATIÈRE DE LA FICHE DEVIENT DES IDENTIFIANTS");
{
  const c = (pf) => dp.champsDepop({ icon: "👕", genre: "Femme", pf: { etat: "Très bon état", depopPort: "4", ...pf }, rayonParMoteur: true, categorieId: "womenswear/tops/tshirts" }).champs;
  dit("« Coton biologique » (l'étiquette de l'essai) → cotton-organic", JSON.stringify(c({ matiere: "Coton biologique" }).depopMatieres) === '["cotton-organic"]');
  dit("composition « Coton, Polyester, Élasthanne » → 3 identifiants dans l'ordre",
    JSON.stringify(c({ matiere: "Coton, Polyester, Élasthanne" }).depopMatieres) === '["cotton","polyester","elastane-lycra-spandex"]');
  dit("« 80% coton, 20% élasthanne » → cotton, elastane", JSON.stringify(c({ matiere: "80% coton, 20% élasthanne" }).depopMatieres) === '["cotton","elastane-lycra-spandex"]');
  dit("matière inconnue : rien (jamais envoyée telle quelle)", c({ matiere: "Fibre magique" }).depopMatieres === undefined);
  dit("sans matière : aucun champ (comme avant)", !("depopMatieres" in c({})));
  const cinq = c({ matiere: "Coton, Lin, Soie, Laine, Viscose" }).depopMatieres;
  dit("cinq matières : les 4 premières", JSON.stringify(cinq) === '["cotton","linen","silk","wool"]', JSON.stringify(cinq));
}

console.log("\nC. LE CONNECTEUR : `attributes.material` SUR UN TYPE QUI L'ACCEPTE");
{
  const job = (chemin, depopMatieres) => ({
    description: "Article de test", photos: ["https://x/1.jpg"], price: 999,
    platform_fields: { depopCategoryPath: chemin, depopEtat: "used_excellent", depopPort: 4, depopCouleurs: ["white"], ...(depopMatieres ? { depopMatieres } : {}) },
  });
  const v1 = T.depopPrevol(job(["womenswear", "tops", "tshirts"], ["cotton-organic"]));
  dit("t-shirt : cotton-organic part", v1.ok && JSON.stringify(v1.matieres) === '["cotton-organic"]', JSON.stringify(v1));
  const v2 = T.depopPrevol(job(["womenswear", "dresses", "casual-dresses"], ["cotton"]));
  dit("robe (le type n'a pas de matière chez Depop) : rien ne part", v2.ok && v2.matieres.length === 0, JSON.stringify(v2.matieres));
  const v3 = T.depopPrevol(job(["womenswear", "tops", "tshirts"], ["cotton", "bambou", "cotton", "silk", "wool", "linen"]));
  dit("identifiant inconnu écarté, doublon retiré, 4 au plus", JSON.stringify(v3.matieres) === '["cotton","silk","wool","linen"]', JSON.stringify(v3.matieres));
  const v4 = T.depopPrevol(job(["womenswear", "tops", "tshirts"], null));
  dit("sans matière : liste vide", v4.ok && Array.isArray(v4.matieres) && v4.matieres.length === 0);
  const src = lire("chrome-extension/content-scripts/depop.js");
  dit("le corps du dépôt envoie `attributes: { material }`, sinon `{}`",
    /attributes: v\.matieres\?\.length \? \{ material: v\.matieres \} : \{\},/.test(src));
}

console.log("\nD. LES SOURCES DE LA MATIÈRE");
{
  const res = lire("src/utils/resolutionPublication.js");
  dit("résolution : copie Depop, puis valeur commune des copies, puis la fiche",
    res.includes('const matiereDepop = String(pf.matiere || sharedFields.matiere || initialListing?.matiere || "").trim();')
    && res.includes("pf: matiereDepop ? { ...pf, matiere: matiereDepop } : pf"));
  const cop = lire("supabase/functions/_shared/copie-republication-depop.js");
  dit("republication : la copie reprend depopMatieres du dépôt", /"depopMatieres",\n\]\);/.test(cop));
}

console.log(ko ? `\n❌ ${ko} échec(s)` : "\n✅ depop-matiere : tout est vert");
process.exit(ko ? 1 : 0);
