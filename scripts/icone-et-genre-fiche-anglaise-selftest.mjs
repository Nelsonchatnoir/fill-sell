// ═══════════════════════════════════════════════════════════════════════════
// VERROU — L'ICÔNE ET LE GENRE D'UNE FICHE QUI N'EST PAS EN FRANÇAIS (12/11, Nico, point 1b)
// ═══════════════════════════════════════════════════════════════════════════
// Compte c7c382b7 (profil en anglais, fiches Lens en anglais), soirée du 12/11 :
//   · pull 1793976905070 « knitted wool jumper, blue, EU M » (mot de l'IA « knitted jumper ») ;
//   · manteau 1793976405140 « long herringbone coat, black and white, size 48 » (« long herringbone coat ») ;
//   · pantalon 1793477172219 « London blue track trousers with red trim, size 16 ».
// Aucune règle française ne connaît « jumper », « coat », « trousers » → repli du TYPE « Mode » = 👗 (robe). La garde
// de genre jugeait sur la robe : « Homme n'est pas un rayon Vinted pour cet article » (rayons_valides [Femme, Fille])
// alors que le rayon résolu était « Hommes › … › Pardessus et manteaux longs » (usage_logs 19:57:27) ; elle a répondu
// « Femme » pour pouvoir publier → tâche Vinted e446c2d0 partie avec genre Femme et SON rayon choisi « Hommes › Pulls ».
// Décision de Nico : une règle INDÉPENDANTE de la langue (identifiants de catégorie), jamais une lecture de la copie
// française, jamais un mot anglais ajouté aux règles. Ce verrou prouve :
//   A. l'icône se déduit du rayon (identifiant) quand elle n'était qu'un repli de type — et SEULEMENT dans ce cas ;
//   B. la garde de genre juge sur le rayon qui part ; un genre cohérent avec lui n'est jamais une question ;
//   C. un rayon CHOISI aligne le genre de sa plateforme (plus jamais « genre Femme + rayon Hommes ») ;
//   D. eBay suit : un pull d'homme n'est plus rangé en « Robes ».
//   node --import ./scripts/loader-ext.mjs scripts/icone-et-genre-fiche-anglaise-selftest.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getVintedCategoryPath, vintedGenreRequired } from "../src/utils/vintedCategories.js";
import { getBeebsCategoryPath, beebsGenreRequired } from "../src/utils/beebsCategories.js";
import { getEbayCategoryId } from "../src/utils/ebayCategories.js";
import * as rayonPublication from "../src/utils/rayonPublication.js";
import * as genreAChoisir from "../src/publication/moteur/genreAChoisir.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0;
let reussis = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { reussis++; console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), "utf8").replace(/\r\n/g, "\n");

// ── resolveArticleIconDetail, découpée TELLE QUELLE de l'écran (le composant n'est pas importable sous Node) ──
async function outilsEcran() {
  const src = lire("src/components/ListingPreviewScreen.jsx");
  const tranche = (debut) => {
    const i = src.indexOf(debut);
    if (i < 0) throw new Error(`introuvable dans ListingPreviewScreen.jsx : ${debut}`);
    return src.slice(i, src.indexOf("\n}\n", i) + 3);
  };
  const url = (rel) => pathToFileURL(path.join(RACINE, rel)).href;
  // Les noms importés par l'écran depuis le module de l'icône par identifiant, s'il existe.
  const imp = src.match(/import \{([^}]+)\} from "\.\.\/utils\/iconeDeLaCategorie";/);
  const code = [
    `import * as S from "${url("src/utils/shared.js")}";`,
    "const { detectObjectIcon, detectObjectIconKeyword, detectObjectKeywordDetail, ALL_OBJECT_ICONS, estSupportNonLivre, titreNommeUneDecorationMurale } = S;",
    `import { familleJeuVideo } from "${url("src/utils/jeuxVideo.js")}";`,
    `import { estAnglaisAvere } from "${url("supabase/functions/_shared/langue.js")}";`,
    imp ? `import {${imp[1]}} from "${url("src/utils/iconeDeLaCategorie.js")}";` : "",
    "const VALID_OBJECT_ICONS = new Set(ALL_OBJECT_ICONS);",
    tranche("function resolveArticleIconDetail({"),
    "export { resolveArticleIconDetail };",
  ].join("\n");
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "fillsell-icone-genre-"));
  const fichier = path.join(dossier, "outils-ecran.mjs");
  fs.writeFileSync(fichier, code);
  try { return await import(pathToFileURL(fichier).href); }
  finally { fs.rmSync(dossier, { recursive: true, force: true }); }
}
const { resolveArticleIconDetail } = await outilsEcran();
let rayonsPourLIcone = () => [];
try { ({ rayonsPourLIcone } = await import("../src/utils/iconeDeLaCategorie.js")); } catch { /* module absent : rouge attendu */ }

// Les rayons RÉELS du 12/11 (identifiants de l'arbre Vinted relevé, docs/vinted-catalog-tree.txt).
const PULL_CHOISI = { chemin: ["Hommes", "Vêtements", "Sweats et pulls", "Pulls et pulls à capuche"], id: "267", le: "2026-11-12T18:50:45.271Z" };
const PULL_RESOLU = { chemin: ["Femmes", "Vêtements", "Sweats et sweats à capuche", "Sweats", "Pulls d'hiver"], id: "529", mot: "knitted jumper", choisi_par_ia: true };
const MANTEAU_VINTED = { chemin: ["Hommes", "Vêtements", "Manteaux et vestes", "Manteaux", "Pardessus et manteaux longs"], id: null, mot: "long herringbone coat" };
const MANTEAU_BEEBS = ["Mode", "Homme", "Vêtements (homme)", "Pulls et gilets (homme)", "Pulls ras de cou (homme)"];
const icone = ({ titre, categorie = "Mode", aiObjet = null, aiIcon = null, edited = {}, pfParPlateforme = null, catalogueVinted = null }) => {
  const initialListing = { titre, categorie };
  const rayons = rayonsPourLIcone({ edited, pfParPlateforme, catalogueVinted });
  return resolveArticleIconDetail({ initialListing, edited, pf: {}, aiIcon, aiObjet, rayons, catalogueVinted });
};

console.log("A. L'ICÔNE SE LIT SUR L'IDENTIFIANT DU RAYON, QUAND ELLE N'ÉTAIT QU'UN REPLI");
{
  const sans = icone({ titre: "knitted wool jumper, blue, EU M", aiObjet: "knitted jumper" });
  ok(sans.icon === "👗", `sans aucun rayon : le repli du type reste (aucun mot anglais ajouté, aucune copie lue) — ${sans.icon} (${sans.source})`);
  const a1 = icone({ titre: "knitted wool jumper, blue, EU M", aiObjet: "knitted jumper",
    edited: { vinted: { title: "The Kooples pull laine bleu", rayon_choisi: PULL_CHOISI } } });
  ok(a1.icon === "🧶", `pull 1793976905070, rayon Vinted CHOISI 267 → 🧶 (obtenu ${a1.icon}, ${a1.source})`);
  const a2 = icone({ titre: "knitted wool jumper, blue, EU M", aiObjet: "knitted jumper",
    pfParPlateforme: { vinted: { categorie_par_mot: PULL_RESOLU } } });
  ok(a2.icon === "🧶", `pull, rayon Vinted RÉSOLU 529 (« Pulls d'hiver ») → 🧶 (obtenu ${a2.icon})`);
  const a3 = icone({ titre: "knitted wool jumper, blue, EU M", aiObjet: "knitted jumper",
    edited: { depop: { rayon_choisi: { chemin: ["Homme", "Hauts", "Pulls"], id: "menswear/tops/jumpers" } } } });
  ok(a3.icon === "🧶", `pull, rayon Depop choisi « menswear/tops/jumpers » (identifiant) → 🧶 (obtenu ${a3.icon})`);
  const a4 = icone({ titre: "long herringbone coat, black and white, size 48", aiObjet: "long herringbone coat",
    pfParPlateforme: { vinted: { categorie_par_mot: MANTEAU_VINTED }, beebs: { categorie_par_mot: { chemin: MANTEAU_BEEBS } } } });
  ok(a4.icon === "🧥", `manteau 1793976405140, rayon Vinted « … › Pardessus et manteaux longs » (avant Beebs) → 🧥 (obtenu ${a4.icon})`);
  // Pantalon 1793477172219 : son rayon n'a pas été tracé ; la feuille Vinted « Jogging » (1821) et
  // l'identifiant Depop « menswear/bottoms/joggers-tracksuits » sont ceux de l'arbre pour un pantalon de survêtement.
  const a5 = icone({ titre: "London blue track trousers with red trim, size 16",
    pfParPlateforme: { vinted: { categorie_par_mot: { chemin: ["Hommes", "Vêtements", "Pantalons", "Jogging"], id: "1821" } } } });
  ok(a5.icon === "👖", `pantalon 1793477172219, rayon « Hommes › Vêtements › Pantalons › … » → 👖 (obtenu ${a5.icon})`);
  const a6 = icone({ titre: "London blue track trousers with red trim, size 16",
    edited: { depop: { rayon_choisi: { chemin: ["Homme", "Bas", "Joggings"], id: "menswear/bottoms/joggers-tracksuits" } } } });
  ok(a6.icon === "👖", `pantalon, rayon Depop « menswear/bottoms/joggers-tracksuits » → 👖 (obtenu ${a6.icon})`);
  // ⛔ Ce qui ne bouge pas : un mot du titre, l'icône de l'IA. Seul le REPLI cède.
  const n1 = icone({ titre: "Robe Zara beige taille S", edited: { vinted: { rayon_choisi: PULL_CHOISI } } });
  ok(n1.icon === "👗" && n1.source === "mot_cle", `un mot du TITRE n'est jamais remplacé par un rayon (« Robe Zara » reste 👗, ${n1.source})`);
  const n2 = icone({ titre: "knitted wool jumper, blue, EU M", aiIcon: "🧥", edited: { vinted: { rayon_choisi: PULL_CHOISI } } });
  ok(n2.icon === "🧥" && n2.source === "ia", `l'icône de l'IA n'est pas un repli : inchangée (${n2.icon}, ${n2.source})`);
  const n3 = icone({ titre: "Pull col roulé laine", edited: { vinted: { rayon_choisi: PULL_CHOISI } } });
  ok(n3.icon === "🧶" && n3.source === "mot_cle", "une fiche française nommée : inchangée");
  // Un nœud partagé par deux icônes ne dit rien : jamais une icône devinée.
  const n4 = icone({ titre: "knitted wool jumper", pfParPlateforme: { leboncoin: { categorie_par_mot: { chemin: ["Mode", "Vêtements"] } } } });
  ok(n4.icon === "👗", `« Mode › Vêtements » (Leboncoin) vaut pour toutes les icônes de vêtements : rien n'est déduit (${n4.icon})`);
  // Hors de la mode, seule la feuille EXACTE dit l'icône (un groupe y range des objets différents) ; dans la mode,
  // une icône de spécialité (⛸️, patins) ne se lit que sur sa feuille.
  let iconeDuRayon = () => null;
  try { ({ iconeDuRayon } = await import("../src/utils/iconeDeLaCategorie.js")); } catch { /* absent */ }
  ok(iconeDuRayon("vinted", { chemin: ["Maison", "Outils et bricolage", "Outils de mesure", "Caméras thermiques"] }) === null,
    "« Outils de mesure › Caméras thermiques » ne devient pas 📏 (mètre ruban) : hors mode, feuille exacte seulement");
  ok(iconeDuRayon("vinted", { chemin: ["Maison", "Outils et bricolage", "Outils de mesure", "Mètres rubans"] }) === "📏",
    "« … › Mètres rubans » (la feuille de 📏) → 📏");
  ok(iconeDuRayon("vinted", { chemin: ["Femmes", "Chaussures", "Chaussures de sport", "Chaussures de running"] }) === null,
    "« Chaussures de sport › running » ne devient pas ⛸️ (patins) — spécialité, feuille exacte seulement");
  ok(iconeDuRayon("vinted", { chemin: ["Femmes", "Chaussures", "Chaussures de sport", "Patins à roulettes et rollers"] }) === "⛸️",
    "« … › Patins à roulettes et rollers » → ⛸️");
  // Un rayon qui DÉPEND de l'icône (famille jeu vidéo) ne la décide pas en retour.
  const n5 = icone({ titre: "objet", categorie: "High-Tech", pfParPlateforme: { vinted: { categorie_par_mot: { chemin: ["Électronique", "Jeux vidéo et consoles", "Jeux vidéo"], id: "3026", regle: "jeux_video_jeu" } } } });
  ok(n5.icon === "📱", `un rayon posé PAR l'icône (règle jeux_video_*) n'est pas lu (${n5.icon})`);
}

console.log("B. LA GARDE DE GENRE JUGE SUR LE RAYON QUI PART");
{
  const genreBloque = genreAChoisir.genreBloque;
  ok(typeof genreBloque === "function", "genreAChoisir.genreBloque existe (fonction pure, lue par l'écran)");
  if (typeof genreBloque === "function") {
    const vinted = { plateforme: "vinted", requis: vintedGenreRequired, cheminDe: getVintedCategoryPath };
    const beebs = { plateforme: "beebs", requis: beebsGenreRequired, cheminDe: getBeebsCategoryPath };
    ok(genreBloque({ ...vinted, genre: "Homme", rayon: { chemin: MANTEAU_VINTED.chemin }, icone: "👗" }) === false,
      "manteau, rayon Vinted « Hommes › … » + genre Homme → aucune question (19:57:27 : question [Femme, Fille])");
    ok(genreBloque({ ...beebs, genre: "Homme", rayon: { chemin: MANTEAU_BEEBS }, icone: "👗" }) === false,
      "rayon Beebs « Mode › Homme › … » + genre Homme → aucune question (20:19:35 : question [Femme, Fille, Bébé])");
    ok(genreBloque({ ...vinted, genre: "Homme", rayon: { chemin: ["Maison", "Décoration", "Bougies"] }, icone: "👗" }) === false,
      "un rayon sans public (Maison) : le genre ne décide rien, aucune question");
    ok(genreBloque({ ...vinted, genre: "Homme", rayon: null, icone: "👗" }) === true,
      "SANS rayon, une icône NOMMÉE (« Robe … » au titre) juge, comme avant (robe + Homme → la question)");
    ok(genreBloque({ ...vinted, genre: "Homme", rayon: null, icone: "👗", iconeRepli: true }) === false,
      "SANS rayon, une icône de REPLI (pull 1793976905070, 12/11 19:50:04 : rayon inconnu, 👗 = défaut « Mode ») ne juge pas : c'est le rayon qui se demande");
    ok(genreBloque({ ...vinted, genre: "Homme", rayon: { chemin: ["Femmes", "Vêtements", "Robes", "Midi"] }, icone: "👗" }) === true,
      "rayon RÉSOLU qui contredit le genre : l'icône juge, comme avant");
    ok(genreBloque({ ...vinted, genre: "Femme", rayon: { chemin: PULL_CHOISI.chemin, choisi: true }, icone: "👗" }) === false,
      "rayon CHOISI qui contredit le genre : pas de question, le genre s'aligne (point C)");
    ok(genreBloque({ ...vinted, genre: "Mixte", rayon: null, icone: "👗" }) === false, "Mixte : jamais bloqué (inchangé)");
  }
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/const vintedGenreBlocked = useMemo\(\(\) => \{[\s\S]{0,600}?genreBloque\(\{[^}]*rayon: rayonsParPf\?\.vinted/.test(lps),
    "l'écran : la garde Vinted lit le rayon qui part (rayonsParPf.vinted)");
  ok(/const beebsGenreBlocked = useMemo\(\(\) => \{[\s\S]{0,600}?genreBloque\(\{[^}]*rayon: rayonsParPf\?\.beebs/.test(lps),
    "l'écran : la garde Beebs lit le rayon qui part (rayonsParPf.beebs)");
}

console.log("C. UN RAYON CHOISI ALIGNE LE GENRE DE SA PLATEFORME");
{
  const v = rayonPublication.appliquerRayonChoisi({ genre: "Femme", categoryPath: ["Femmes", "Vêtements", "Robes", "Midi"] }, "vinted", PULL_CHOISI);
  ok(v.genre === "Homme", `tâche e446c2d0 : rayon choisi « Hommes › … › Pulls » + genre Femme → genre Homme (obtenu ${v.genre})`);
  ok(v.genre_aligne_sur_rayon?.avant === "Femme", "la trace dit le genre d'avant (genre_aligne_sur_rayon)");
  const b = rayonPublication.appliquerRayonChoisi({ genre: "Femme" }, "beebs", { chemin: MANTEAU_BEEBS });
  ok(b.genre === "Homme", `Beebs « Mode › Homme › … » choisi + genre Femme → Homme (obtenu ${b.genre})`);
  const m = rayonPublication.appliquerRayonChoisi({ genre: "Femme" }, "vinted", { chemin: ["Maison", "Décoration", "Bougies"], id: "1" });
  ok(m.genre === "Femme" && !m.genre_aligne_sur_rayon, "rayon sans public : le genre ne bouge pas");
  const f = rayonPublication.appliquerRayonChoisi({ genre: "Fille" }, "vinted", { chemin: ["Enfants", "Vêtements pour filles", "Robes", "Robes courtes"], id: "1" });
  ok(f.genre === "Fille" && !f.genre_aligne_sur_rayon, "genre cohérent : intact");
  const ecran = typeof rayonPublication.genreAligneSurSonRayon === "function"
    ? rayonPublication.genreAligneSurSonRayon({ vinted: { platform_fields: { genre: "Femme" }, rayon_choisi: PULL_CHOISI } }, "vinted") : null;
  ok(ecran?.vinted?.platform_fields?.genre === "Homme", "à l'écran aussi : choisir le rayon aligne le genre de la copie (genreAligneSurSonRayon)");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/const choisirRayon = [\s\S]{0,400}?genreAligneSurSonRayon\(/.test(lps), "l'écran l'appelle au choix du rayon (choisirRayon)");
}

console.log("D. eBay SUIT L'ICÔNE DU RAYON");
{
  const a1 = icone({ titre: "knitted wool jumper, blue, EU M", aiObjet: "knitted jumper",
    edited: { vinted: { rayon_choisi: PULL_CHOISI } } });
  const ebay = getEbayCategoryId(a1.icon, "Homme");
  ok(String(ebay) === "11484", `pull d'homme → eBay 11484 « Pulls, cardigans » (obtenu ${ebay}) — jamais 63861 « Robes »`);
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  // Les APPELS (la définition, qui porte « = null », n'en est pas un).
  const appels = (lps.match(/resolveArticleIcon(?:Detail)?\(\{ initialListing, edited, pf[^}]*\}\)/g) ?? []).filter((a) => !/ = null/.test(a));
  const sansRayons = appels.filter((a) => !/rayons: rayonsIcone/.test(a));
  // + l'icône de l'article (articleIcon), écrite sur plusieurs lignes.
  const articleIcon = /const articleIcon = useMemo\(\(\) => \{[\s\S]{0,300}?aiIcon: activeAiIcon,\s*rayons: rayonsIcone,\s*catalogueVinted: catalogueVintedChemin,/.test(lps);
  ok(appels.length >= 7 && sansRayons.length === 0 && articleIcon,
    `l'écran passe les rayons à CHAQUE calcul d'icône (${appels.length - sansRayons.length}/${appels.length} + articleIcon ${articleIcon})`, sansRayons.join("\n      "));
  const rp = lire("src/utils/resolutionPublication.js");
  ok(/const detIcone = resolveArticleIconDetail\(\{[^}]*rayons: rayonsIcone[^}]*catalogueVinted[^}]*\}\);/.test(rp),
    "la publication aussi (resolutionPublication, l'icône qui range les quatre plateformes)");
}

console.log("");
console.log(`${reussis} vert(s), ${echecs} rouge(s)`);
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ l'icône et le genre d'une fiche anglaise se lisent sur le rayon, jamais sur un mot");
