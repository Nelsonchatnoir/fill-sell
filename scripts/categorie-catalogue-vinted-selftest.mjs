// ═══════════════════════════════════════════════════════════════════════════
// VERROU — LE CATALOGUE VINTED DE LA FICHE PARLE, PAR SES IDENTIFIANTS (12/11, Nico, point 1d-iii)
// ═══════════════════════════════════════════════════════════════════════════
// Cas réels :
//   · cfdfda6f, fiche 1794492636815 « Road Top 12,3" Écran CarPlay pour BMW… » — catalogue Vinted 3789
//     (Électronique › … › GPS), mot de l'IA « autoradio » : le mot « top » du titre (une marque d'écrans auto)
//     faisait 👕 → Leboncoin « Mode › Vêtements » (jobs 828c3932, 8d031066 : categorie_icone 👕) ;
//   · cfdfda6f, fiche 1794133607021023 « Jouets musicaux en bois » — catalogue 3358 (Enfants › Jeux et jouets),
//     description « 7 instruments + sac de rangement » : « sac » → 👜, puis Leboncoin « Loisirs › Instruments de
//     musique », Univers demandé 6 fois, 5 abandons ;
//   · 48dd94f7, fiche 1793473230857005 « Cassette VHS Nikita (1990) - … / Jean Reno / Gaumont » — 3048 (VHS),
//     IA « cassette vhs » : « jean » → 👖 ;
//   · 53efea05, fiche 1794321752063003 « Paire d'assiettes anciennes anglaises Derby – … » — 3829 (Maison),
//     IA « assiette » : « derby » → 👟 → Leboncoin « Mode › Chaussures » ;
//   · « autoradio » (26 rangements À LA MAIN en « Véhicules › Équipement auto » en 14 j, compte cfdfda6f) :
//     🚗 n'avait AUCUN rayon Leboncoin.
// Décisions de Nico du 12/11 : le mot du titre cède quand le catalogue Vinted ET l'IA le contredisent ; autoradio →
// « Véhicules › Équipement auto » ; Vinted « Jeux et jouets » → Leboncoin « Jeux & Jouets » ; par IDENTIFIANTS de
// catalogue ; sans casser les autoradios déjà justes (Électronique chez Vinted, Équipement auto chez Leboncoin).
//   node --import ./scripts/loader-ext.mjs scripts/categorie-catalogue-vinted-selftest.mjs
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { getLbcCategoryPath } from "../src/utils/lbcCategories.js";
import { getVintedCategoryPath } from "../src/utils/vintedCategories.js";
import { getBeebsCategoryPath } from "../src/utils/beebsCategories.js";
import { getEbayCategoryId } from "../src/utils/ebayCategories.js";
import { familleDeChemin } from "../src/utils/familleCategorie.js";
import { FEUILLES } from "../src/utils/arbres/vintedFeuilles.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
let echecs = 0;
let reussis = 0;
const ok = (cond, titre, detail = "") => {
  if (cond) { reussis++; console.log(`  ✓ ${titre}`); return; }
  echecs++;
  console.error(`  ✗ ${titre}${detail ? `\n      ${detail}` : ""}`);
};
const lire = (rel) => fs.readFileSync(path.join(RACINE, rel), "utf8").replace(/\r\n/g, "\n");

async function outilsEcran() {
  const src = lire("src/components/ListingPreviewScreen.jsx");
  const tranche = (debut) => {
    const i = src.indexOf(debut);
    if (i < 0) throw new Error(`introuvable dans ListingPreviewScreen.jsx : ${debut}`);
    return src.slice(i, src.indexOf("\n}\n", i) + 3);
  };
  const url = (rel) => pathToFileURL(path.join(RACINE, rel)).href;
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
  const dossier = fs.mkdtempSync(path.join(os.tmpdir(), "fillsell-catalogue-vinted-"));
  const fichier = path.join(dossier, "outils-ecran.mjs");
  fs.writeFileSync(fichier, code);
  try { return await import(pathToFileURL(fichier).href); }
  finally { fs.rmSync(dossier, { recursive: true, force: true }); }
}
const { resolveArticleIconDetail } = await outilsEcran();
let feuilleLbcDuCatalogueVinted = () => null;
try { ({ feuilleLbcDuCatalogueVinted } = await import("../src/utils/vintedVersLbc.js")); } catch { /* absent : rouge attendu */ }

const PAR_ID = new Map(FEUILLES.filter((f) => f.id).map((f) => [f.id, f.chemin]));
const catalogue = (id) => ({ id: String(id), chemin: PAR_ID.get(String(id)) ?? null });
const icone = ({ titre, description = "", categorie = null, aiObjet = null, catalogId = null }) =>
  resolveArticleIconDetail({
    initialListing: { titre, description, categorie, vinted_catalog_id: catalogId },
    edited: {}, pf: {}, aiIcon: null, aiObjet,
    catalogueVinted: catalogId ? catalogue(catalogId) : null,
  });
const ROAD_TOP = "Road Top 12,3\" Écran CarPlay pour BMW Série X3 X4 G01 G02 avec EVO Autordadio";
const ROAD_TOP_DESC = "1. Avis préalable à l'achat : 12,3 pouces ultra-fin sans fil CarPlay Écran tactile pour BMW X3 X4 Série G01 G02 2018-2022 année avec EVO système.";

console.log("1. LE MOT DU TITRE CÈDE QUAND LE CATALOGUE VINTED ET L'IA LE CONTREDISENT");
{
  const r = icone({ titre: ROAD_TOP, description: ROAD_TOP_DESC, categorie: "Auto-Moto", aiObjet: "autoradio", catalogId: 3789 });
  ok(r.icon !== "👕", `Road Top (1794492636815) : plus jamais 👕 sur « top » (obtenu ${r.icon}, ${r.source})`);
  ok(JSON.stringify(getLbcCategoryPath(r.icon)) === JSON.stringify(["Véhicules", "Équipement auto"]),
    `… et Leboncoin « Véhicules › Équipement auto » (obtenu ${JSON.stringify(getLbcCategoryPath(r.icon))})`);
  const v = icone({ titre: "Cassette VHS Nikita (1990) - Luc Besson / Anne Parillaud / Jean Reno / Gaumont", categorie: "Multimédia", aiObjet: "cassette vhs", catalogId: 3048 });
  ok(v.icon === "📀", `VHS Nikita (1793473230857005) : « jean » cède → 📀 (obtenu ${v.icon})`);
  const d = icone({ titre: "Paire d'assiettes anciennes anglaises Derby – Décor Imari – Porcelaine décorative", categorie: "Maison", aiObjet: "assiette", catalogId: 3829 });
  ok(getLbcCategoryPath(d.icon)?.[0] !== "Mode", `assiettes Derby (1794321752063003) : plus en « Mode › Chaussures » (icône ${d.icon} → ${JSON.stringify(getLbcCategoryPath(d.icon))})`);
}

console.log("2. LE MOT DE LA DESCRIPTION CÈDE AU SEUL CATALOGUE (« sac » de rangement)");
{
  const j = icone({ titre: "Jouets musicaux en bois", description: "7 instruments + sac de rangement", catalogId: 3358 });
  ok(j.icon !== "👜", `Jouets musicaux (1794133607021023) : « sac » de la description écarté (obtenu ${j.icon}, ${j.source})`);
  ok(familleDeChemin("vinted", PAR_ID.get("3358")) === "loisirs", `famille du catalogue 3358 « Enfants › Jeux et jouets › … » = loisirs (obtenu ${familleDeChemin("vinted", PAR_ID.get("3358"))})`);
}

console.log("3. VINTED « JEUX ET JOUETS » → LEBONCOIN « JEUX & JOUETS », PAR IDENTIFIANT");
{
  const jj = (id) => JSON.stringify(feuilleLbcDuCatalogueVinted(id)?.chemin ?? null);
  const attendu = JSON.stringify(["Loisirs", "Jeux & Jouets"]);
  ok(jj(3358) === attendu, `3358 Jeux éducatifs (jouets musicaux) → ${jj(3358)}`);
  ok(jj(3366) === attendu, `3366 « Jouet VTech – Trompette » (parti en Instruments de musique) → ${jj(3366)}`);
  ok(jj(3468) === attendu, `3468 « Playset micro machines » (parti en Instruments de musique) → ${jj(3468)}`);
  ok(jj(1766) === attendu, `1766 Jeux/jouets musicaux et instruments → ${jj(1766)}`);
  ok(jj(3330) === "null", "3330 Déguisements : aucune correspondance (exclu)");
  ok(jj(3351) === "null", "3351 Hochets (Activités et jouets pour bébé) : aucune correspondance (exclu)");
  ok(jj(3317) === "null", "3317 Argile et pâte à modeler (Loisirs créatifs) : aucune correspondance (Leboncoin a « Loisirs créatifs »)");
  ok(jj(3789) === "null" && jj(1813) === "null" && jj(null) === "null", "hors « Jeux et jouets » (GPS, pull) : rien");
  // Parité avec l'arbre relevé : chaque feuille sous « Jeux et jouets » [id=1499] est rangée OU exclue nommément.
  const arbre = lire("docs/vinted-catalog-tree.txt").split("\n");
  const i0 = arbre.findIndex((l) => /^  Jeux et jouets  \[id=1499\]/.test(l));
  const feuilles = [];
  const exclues = new Set();
  let sousExclu = false;
  for (let i = i0 + 1; i < arbre.length && /^    /.test(arbre[i]); i++) {
    const l = arbre[i];
    if (/^    \S/.test(l)) sousExclu = /\[id=(3329|3344|3314)\]/.test(l);
    const m = l.match(/\[id=(\d+)\]\s+\[FEUILLE\]/);
    if (m) (sousExclu ? exclues : { add: (x) => feuilles.push(x) }).add(m[1]);
  }
  const manquantes = feuilles.filter((id) => jj(id) !== attendu);
  const fuites = [...exclues].filter((id) => jj(id) !== "null");
  ok(feuilles.length > 40 && !manquantes.length && !fuites.length,
    `parité avec docs/vinted-catalog-tree.txt : ${feuilles.length} feuilles rangées, ${exclues.size} exclues`, `manquantes ${manquantes} ; fuites ${fuites}`);
  const rp = lire("src/utils/resolutionPublication.js");
  ok(/feuilleLbcDuCatalogueVinted\(/.test(rp), "la publication l'applique au rayon Leboncoin (resolutionPublication)");
}

console.log("4. NON-RÉGRESSION");
{
  const top = icone({ titre: "Top case moto avec 2 casques", aiObjet: "top case" });
  ok(top.icon === "🏍️" || top.icon === "🪖", `« Top case … 2 casques » : inchangé (${top.icon})`);
  const hood = icone({ titre: "Patagonia Hoodie gris taille M", aiObjet: "sweat à capuche", catalogId: 1813 });
  ok(hood.icon === "🧶", `« Patagonia Hoodie » : 🧶 (${hood.icon})`);
  const auto = icone({ titre: "Autoradio Android CarPlay 2 DIN", categorie: "Auto-Moto", aiObjet: "autoradio", catalogId: 3789 });
  ok(auto.icon === "🚗" && JSON.stringify(getLbcCategoryPath(auto.icon)) === JSON.stringify(["Véhicules", "Équipement auto"]),
    `un autoradio déjà juste reste en « Véhicules › Équipement auto » (${auto.icon})`);
  // L'équipement auto électronique est « Électronique » chez Vinted ET « Équipement auto » chez Leboncoin : ces deux
  // familles ne se contredisent pas (rejeu 60 j : 15 publications justes, dont « Mini Dashcam Boostlab vision 360 »,
  // catalogue 3074, rangée à la main en Équipement auto — sa passe 2 « voiture » 🚗 n'est pas écartée).
  const autoIaEcran = icone({ titre: "Autoradio Android CarPlay 2 DIN", categorie: "Auto-Moto", aiObjet: "écran tactile", catalogId: 3789 });
  ok(autoIaEcran.icon === "🚗", `titre « Autoradio … », catalogue Électronique, IA « écran » : le titre garde 🚗 (${autoIaEcran.icon})`);
  // Fiche réelle cfdfda6f 1794493266097 (description relue en base le 13/11).
  const dashcam = icone({ titre: "Mini Dashcam Boostlab vision 360", description: "Marque Botslab\nMini Dashcam Voiture 4K\n Rotative 360° avec Super Condensateur\nVision Nocturne, Wi-FI Double Bande & Bluetooth, Contrôle APP", categorie: "Auto-Moto", catalogId: 3074 });
  ok(dashcam.icon === "🚗", `« Mini Dashcam … » (passe 2 « voiture ») + catalogue Électronique : 🚗 gardé (${dashcam.icon}, ${dashcam.source})`);
  const ecran = icone({ titre: "Écran tactile voiture CarPlay 10 pouces", categorie: "Auto-Moto", aiObjet: "autoradio", catalogId: 3789 });
  ok(ecran.source === "mot_cle", `« Écran … » : le titre est COMPATIBLE avec le catalogue (Électronique) — il garde la main (${ecran.icon}, ${ecran.source})`);
  const unSeul = icone({ titre: "Top noir Zara taille S", aiObjet: "assiette", catalogId: null });
  ok(unSeul.icon === "👕" && unSeul.source === "mot_cle", "l'IA SEULE contre le titre (sans catalogue) : le titre garde la main (règle du 19/09)");
  const catSeul = icone({ titre: "Top noir Zara taille S", aiObjet: "top", catalogId: 3829 });
  ok(catSeul.icon === "👕", "le catalogue SEUL contre le titre (l'IA d'accord avec le titre) : le titre garde la main");
  const mode = icone({ titre: "Top Derby noir", aiObjet: "assiette", catalogId: 1813 });
  ok(mode.source === "mot_cle" && getLbcCategoryPath(mode.icon)?.[0] === "Mode",
    `catalogue de MODE + titre de mode : rien ne cède, quoi que dise l'IA (${mode.icon}, ${mode.source})`);
  // 🚗 ne change que Leboncoin : Vinted, Beebs et eBay restent sans rayon pour 🚗 (inchangés).
  ok(!getVintedCategoryPath("🚗", "Homme", "") && !getBeebsCategoryPath("🚗", "Homme") && !getEbayCategoryId("🚗", "Homme"),
    "🚗 : Vinted, Beebs, eBay inchangés (aucun rayon tiré de l'icône — le mot de l'IA les résout)");
  ok(getLbcCategoryPath("🏍️") === null && getLbcCategoryPath("🛵") === null, "🏍️ / 🛵 (véhicules immatriculés) : toujours hors périmètre Leboncoin");
}

console.log("");
console.log(`${reussis} vert(s), ${echecs} rouge(s)`);
if (echecs) { console.error(`✗ ${echecs} échec(s)`); process.exit(1); }
console.log("✓ le catalogue Vinted de la fiche parle, par ses identifiants");
