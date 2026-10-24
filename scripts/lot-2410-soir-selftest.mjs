// selftest:lot-2410-soir — les règles du lot du 24/10 au soir (décisions de Nico), pour tous les comptes.
//   npm run selftest:lot-2410-soir
//   1. (sos.cuisine) La gamme de jouets VTech « Switch & Go » n'est jamais la console Nintendo : icône jouet 🦸,
//      aucune famille jeu vidéo — et un vrai jeu ou une vraie console Switch le restent.
//   2. (sos.cuisine) L'état eBay est toujours rempli dans le brouillon : choisi parmi les états du rayon.
//   3. (alizeed48) Les homonymes « Taille » de Beebs reçoivent la taille de la fiche, traduite dans leur liste.
//   4. (sos.cuisine) « Alimentation » Beebs se déduit ; la question seulement au vrai doute.
//   5. (louis) « Sans marque » déclaré par le vendeur n'est jamais remplacé par une marque de l'IA.
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectObjectIconKeyword, detectType } from "../src/utils/shared.js";
import { familleJeuVideo, jeuVideoDeLArticle } from "../src/utils/jeuxVideo.js";
import { tailleHomonymeBeebs, clePositionnelleBeebs, tailleDuJob, deduireOptionDuTexte, textesDeLAnnonce } from "../src/publication/moteur/listes.js";
import { sansMarqueDeLaFiche } from "../src/publication/moteur/reponsesPartagees.js";

let n = 0;
const ok = (c, m) => { assert.ok(c, m); n++; console.log(`  ✓ ${m}`); };
console.log("lot-2410-soir-selftest");

// ── 1. « Switch & Go » ────────────────────────────────────────────────────────
const VTECH = [
  "VTech Switch & Go Dinos Rotor le Vélociraptor dinosaure transformable",
  "Super T-Rex SOS 3 en 1 VTech Switch & Go Dinos Robot dinosaures interactive",
  "vtech switch and go dinos rotor avion dinosaure interactif lumiere son",
  "Vtech switch and go transformers voiture T-Rex parlant",
];
for (const t of VTECH) {
  ok(detectObjectIconKeyword(t, "") === "🦸", `« ${t.slice(0, 48)}… » → jouet 🦸 (jamais 🎮)`);
  ok(familleJeuVideo(t, "") === null && jeuVideoDeLArticle("🎮", t, "") === null, `« ${t.slice(0, 48)}… » : aucune famille jeu vidéo`);
}
ok(detectType("VTech Switch & Go Dinos Rotor", "VTech") !== "High-Tech", "le type de la fiche n'est plus « High-Tech » sur le seul mot « switch »");
const desc = "Jouet VTech Switch & Go Dinos modèle Rotor le Vélociraptor, transformable d'un hélicoptère futuriste en vélociraptor robotisé.";
ok(detectObjectIconKeyword(VTECH[0], desc) === "🦸", "avec sa description réelle : toujours 🦸");
for (const [t, famille] of [["Mario Kart 8 Deluxe Switch", "jeu"], ["Nintendo Switch OLED blanche", "console"], ["Bravely Default II Nintendo Switch", "jeu"]]) {
  ok(detectObjectIconKeyword(t, "") === "🎮" && familleJeuVideo(t, "")?.famille === famille, `« ${t} » reste ${famille} 🎮`);
}

// ── 2. L'état eBay toujours rempli dans le brouillon (chemin Chrome) ───────────────────────────────────────────
// Mesuré le 24/10 sur un brouillon de Nico (139973) : condition=3000 → « — », condition=5000 → « Bon état ».
const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => fs.readFileSync(path.join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
const BG = lire("chrome-extension/background.js");
function extraire(source, debutMotif) {
  const debut = source.indexOf(debutMotif);
  if (debut < 0) throw new Error(`${debutMotif} introuvable`);
  let i = source.indexOf("{", source.indexOf(")", debut)); let prof = 0;
  if (debutMotif.startsWith("const ")) { i = source.indexOf("[", debut); let p = 0; for (; i < source.length; i++) { if (source[i] === "[") p++; else if (source[i] === "]") { p--; if (p === 0) break; } } return source.slice(debut, source.indexOf(";", i) + 1); }
  for (; i < source.length; i++) { if (source[i] === "{") prof++; else if (source[i] === "}") { prof--; if (prof === 0) break; } }
  return source.slice(debut, i + 1);
}
const codeEtat = [
  extraire(BG, "const EBAY_PREFERENCES_ETAT"),
  extraire(BG, "function conditionEbayDeFamille("),
  extraire(BG, "function conditionEbayParmi("),
  extraire(BG, "function conditionEbayDeLUrl("),
].join("\n");
const { conditionEbayParmi, conditionEbayDeLUrl } = new Function(`${codeEtat}\nreturn { conditionEbayParmi, conditionEbayDeLUrl };`)();
const LIVRES = ["1000", "2750", "4000", "5000", "6000", "7000"].map((id) => ({ id }));
const GENERAL = ["1000", "1500", "3000", "7000"].map((id) => ({ id }));
const VETEMENTS = ["1000", "1500", "1750", "2990", "3000", "3010"].map((id) => ({ id }));
ok(conditionEbayParmi("Bon état", LIVRES)?.id === "5000", "Jeux vidéo / Livres, « Bon état » → 5000 « Bon état » (3000 n'y existe pas)");
ok(conditionEbayParmi("Très bon état", LIVRES)?.id === "4000", "Livres, « Très bon état » → 4000");
ok(conditionEbayParmi("Satisfaisant", LIVRES)?.id === "6000", "Livres, « Satisfaisant » → 6000 « État acceptable »");
ok(conditionEbayParmi("Neuf avec étiquette", LIVRES)?.id === "1000", "Livres, neuf → 1000");
ok(conditionEbayParmi("Bon état", GENERAL)?.id === "3000" && conditionEbayParmi("Bon état", VETEMENTS)?.id === "3000",
  "là où 3000 existe, RIEN ne change (l'URL d'avant marchait)");
ok(conditionEbayParmi("Neuf sans étiquette", VETEMENTS)?.id === "1000", "neuf dans un rayon qui a 1000 : inchangé");
ok(conditionEbayParmi("Bon état", null) === null, "serveur muet : aucun choix (la famille d'avant)");
const pf = { ebayCategoryId: "139973", etat: "Bon état", ebay_condition_choix: { categorie: "139973", choisi: "5000" } };
ok(conditionEbayDeLUrl(pf) === "5000", "l'URL porte l'état choisi pour SA catégorie");
ok(conditionEbayDeLUrl({ ...pf, ebayCategoryId: "75708" }) === "3000", "catégorie changée depuis : le choix ne vaut plus, famille d'avant");
ok(conditionEbayDeLUrl({ etat: "Neuf", ebayCategoryId: "1" }) === "1000", "sans choix : la famille, comme avant");
ok(/params\.set\("condition", conditionEbayDeLUrl\(fields\)\)/.test(BG) && /if \(job\.platform === "ebay"\) await poserConditionEbay\(job, accessToken\);\n\s*const listingUrl = typeof handler\.newListingUrl/.test(BG),
  "le job eBay choisit son état AVANT de construire l'URL");
ok(/callEdgeFunction\("fetch-ebay-aspects", accessToken, \{ conditions_category: cat \}\)/.test(BG), "les états du rayon viennent du serveur (lus chez eBay)");
const FN = lire("supabase/functions/fetch-ebay-aspects/index.ts");
ok(/get_item_condition_policies\?filter=categoryIds:%7B\$\{conditionsId\}%7D/.test(FN) && /if \(!isAdmin && !refetchId && !conditionsId\)/.test(FN)
  && !/from\("ebay_item_aspects"\)[\s\S]{0,40}upsert[\s\S]{0,400}conditions_category/.test(FN),
  "fetch-ebay-aspects : chemin conditions_category, lecture seule chez eBay");

// ── 3. Les homonymes « Taille » de Beebs (pyjama d'alizeed48) ──────────────────────────────────────────────────────
// Listes RELEVÉES en base le 24/10 (platform_category_aspects).
const BONNETS = []; for (const t of [75, 80, 85, 90, 95, 100, 105, 110, 115]) for (const b of "ABCDEFGHIJKL") BONNETS.push(b === "A" ? `${t}A et AA` : `${t}${b}`);
const WOMEN_BRAS = [...BONNETS, "Autre", "XXS", "XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", "9XL"];
const COLS = Array.from({ length: 18 }, (_, i) => `${35 + i} cm`);
const SIZE_MEN_SHIRT = ["XS", "S", "M", "L", "XL", "XXL", "XXXL", "4XL", "5XL", "6XL", "7XL", "8XL", ...COLS];
const CLE_PYJAMA = "Taille [attributes.women_bras]";
const CLE_CHEMISE = "Taille [attributes.size_men_shirt]";
ok(tailleHomonymeBeebs({ key: CLE_PYJAMA, taille: "S / 36 / 8", allowedValues: WOMEN_BRAS }) === "S", "pyjama femme : « S / 36 / 8 » de la fiche → « S » (jamais un bonnet)");
ok(tailleHomonymeBeebs({ key: CLE_PYJAMA, taille: "XXL / 44", allowedValues: WOMEN_BRAS }) === "XXL", "pyjama femme : « XXL / 44 » → « XXL »");
for (const t of ["Taille unique", "38", "6-9 mois"]) {
  ok(tailleHomonymeBeebs({ key: CLE_PYJAMA, taille: t, allowedValues: WOMEN_BRAS }) === null, `pyjama femme : « ${t} » → rien de sûr, la question reste (jamais un 85B)`);
}
ok(tailleHomonymeBeebs({ key: CLE_CHEMISE, taille: "M / 38 / 10", allowedValues: SIZE_MEN_SHIRT }) === "M", "chemise homme : « M / 38 / 10 » → « M »");
ok(tailleHomonymeBeebs({ key: CLE_CHEMISE, taille: "40", allowedValues: SIZE_MEN_SHIRT }) === null, "chemise homme : « 40 » ne devient JAMAIS un col de 40 cm");
ok(tailleHomonymeBeebs({ key: "Taille [#2]", taille: "S", allowedValues: ["S"] }) === null && clePositionnelleBeebs("Taille [#2]") && !clePositionnelleBeebs(CLE_PYJAMA),
  "clé positionnelle « Taille [#2] » : jamais une cible");
ok(tailleHomonymeBeebs({ key: "Taille", taille: "S", allowedValues: ["S"] }) === null && tailleHomonymeBeebs({ key: "Couleur [attributes.color]", taille: "S", allowedValues: ["S"] }) === null,
  "seulement les homonymes de « Taille » / « Pointure » (la clé nue garde son chemin)");
ok(tailleDuJob({ platform: "beebs", taille: "S / 36", lignes: [{ key: "Taille", allowedValues: ["XXXS / 30", "XXS / 32", "XS / 34", "S / 36", "M / 38"] }] }) === null,
  "la clé nue « Taille » : inchangée (« S / 36 » déjà exacte)");
const LPS = lire("src/components/ListingPreviewScreen.jsx");
ok(/if \(platform === "beebs"\) rows = rows\.filter\(\(r\) => !clePositionnelleBeebs\(r\.field_key\)\);/.test(LPS), "l'écran ne pose jamais de question sur une clé positionnelle Beebs");
ok(/const th = tailleHomonymeBeebs\(\{ key, taille: pf\.taille \|\| initialListing\?\.taille, allowedValues,/.test(LPS)
  && /deduit: \{ valeur: th, source: "taille_de_la_fiche" \}/.test(LPS), "la ligne de l'homonyme : la taille de la fiche, déduite (jamais bloquante)");
ok(/const exacte = gp === "beebs"\n\s*\? tailleHomonymeBeebs\(\{ key: a\.key, taille: t, allowedValues: a\.allowedValues \?\? \[\] \}\)/.test(LPS),
  "règle des homonymes du 01/10 : Beebs traduit, les autres plateformes gardent l'égalité exacte");

// ── 4. « Alimentation » Beebs : la valeur se déduit (jouet électronique → piles), la question seulement au vrai doute ──
const ALIM = ["Avec pile", "Avec batterie", "Filaire", "Sans"];
const JE = ["Jeux, jouets et loisirs", "Jeux électroniques", "Autres jeux électroniques"];
const RC = ["Jeux, jouets et loisirs", "Véhicules", "Véhicules télécommandés"];
const MONTESSORI = ["Jeux, jouets et loisirs", "Jeux d'éveil", "Jouets d'activité et Montessori"];
const alim = (titre, description, chemin) => deduireOptionDuTexte({ platform: "beebs", key: "Alimentation", label: "Alimentation", allowedValues: ALIM,
  textes: textesDeLAnnonce({ titre, description, platformFields: {} }), cheminCategorie: chemin });
ok(alim("VTech Switch & Go Dinos Rotor le Vélociraptor dinosaure transformable", desc, JE)?.valeur === "Avec pile",
  "le cas : jouet électronique, rien d'écrit → « Avec pile », sans question (décision de Nico)");
ok(alim("Trompette VTech", "Fonctionne avec 3 piles AAA/LR03", ["Jeux, jouets et loisirs", "Jeux d'éveil", "Jouets électroniques pour bébé"])?.valeur === "Avec pile", "« 3 piles AAA » → Avec pile");
ok(alim("Pistolet", "tir rapide sans piles", JE)?.valeur === "Sans" && alim("Toupie", "fonctionne sans pile", JE)?.valeur === "Sans", "« fonctionne sans pile », « tir… sans piles » → Sans");
ok(alim("Robot", "piles non fournies", JE)?.valeur === "Avec pile" && alim("Robot", "vendu sans piles", JE)?.valeur === "Avec pile", "« piles non fournies », « vendu sans piles » → Avec pile (il en faut)");
ok(alim("Robot", "livré complet, sans piles", JE) === null, "« sans piles » seul : le doute → la question");
ok(alim("Drone", "batterie rechargeable USB", RC)?.valeur === "Avec batterie" && alim("Talkie", "avec 2 piles rechargeables", JE)?.valeur === "Avec pile",
  "batterie rechargeable → Avec batterie ; « piles rechargeables » restent des piles");
ok(alim("Camion RC King Force", "2,4 GHz système électronique", RC) === null, "véhicule télécommandé sans mot : pile OU batterie, vrai doute → la question");
ok(alim("Ma première batterie", "jouet musical", MONTESSORI) === null && alim("Spirale Little Dutch en tissu", "", MONTESSORI) === null,
  "« Ma première batterie » (l'instrument) n'est pas une batterie ; Montessori sans mot → la question");
const deux = alim("Lampe", "à piles ou sur secteur", JE);
ok(deux && deux.valeur === null && deux.candidats.length === 2, "deux alimentations dites → la question, les deux en tête");
ok(alim("Lampe", "sur secteur, chargeur fourni", JE) === null, "secteur + chargeur : doute → la question");
ok(deduireOptionDuTexte({ platform: "vinted", key: "Alimentation", label: "Alimentation", allowedValues: ALIM, textes: textesDeLAnnonce({ titre: "x" }) }) !== undefined,
  "les autres plateformes gardent le moteur générique");
const ST = lire("src/tabs/StockTab.jsx");
ok(ST.includes("cheminCategorie: job.platform_fields?.beebsCategoryPath ?? null,") && LPS.includes('cheminCategorie: typeof genericCategoryKeys?.[platform] === "string"'),
  "l'écran Publier et la question du Stock passent le rayon à la règle");

// ── 5. « Sans marque » déclaré par le vendeur n'est jamais remplacé par une marque de l'IA (louis, Leboncoin) ──────
const ficheLouis = { marque: "Sans marque", attributs: { marque: { v: "Sans marque", source: "releve_beebs" } } };
const copiesIA = {
  leboncoin: { platform_fields: { marque: "Zombicide" } },
  vinted: { platform_fields: { marque: "Zombicide", vintedAspects: { brand: "Zombicide" } } },
  ebay: { platform_fields: { marque: "Zombicide", ebayAspects: { Marque: "Zombicide" } } },
  beebs: { platform_fields: { marque: "Sans marque" } },
};
const r5 = sansMarqueDeLaFiche(copiesIA, ficheLouis);
ok(r5.edited.leboncoin.platform_fields.marque === "Sans marque" && r5.edited.vinted.platform_fields.vintedAspects.brand === "Sans marque"
  && r5.edited.ebay.platform_fields.ebayAspects.Marque === "Sans marque", "fiche « Sans marque » : chaque copie IA « Zombicide » repasse « Sans marque » (marque et aspects)");
ok(!r5.posees.includes("beebs") && r5.edited.beebs === copiesIA.beebs, "une copie déjà « Sans marque » n'est pas réécrite");
ok(sansMarqueDeLaFiche(copiesIA, { marque: "Nike" }).edited === copiesIA && sansMarqueDeLaFiche(copiesIA, { marque: "" }).edited === copiesIA,
  "une fiche avec une VRAIE marque, ou sans marque dite, ne change rien (règles d'avant)");
ok(LPS.includes("comblerMarquesVides(sansMarqueDeLaFiche(copies, initialListing).edited, marqueDeLaFiche(initialListing))"),
  "appliquée aux trois arrivées (après la rédaction), avant la marque de la fiche");

// ── 6. Bordereaux Vinted ouverts à TOUS les comptes (décision 2 de Nico) ────────────────────────────────────────────
const MIG = lire("supabase/migrations/20261024235500_bordereaux_vinted_tous_les_comptes.sql");
ok(/CREATE OR REPLACE FUNCTION public\.bordereaux_ouverts_pour\(p_user uuid DEFAULT NULL::uuid, p_platform text DEFAULT 'vinted'::text\)/.test(MIG)
  && /WHEN lower\(coalesce\(p_platform, ''\)\) <> 'vinted' THEN false/.test(MIG) && /'bordereaux_vinted_tous'/.test(MIG),
  "migration : UNE aide dit qui a les bordereaux — Vinted pour tous (interrupteur), toute autre plateforme fermée");
ok((MIG.match(/RETURN jsonb_build_object\('refuse', 'bientot'\);/g) ?? []).length === 2, "récupérer / générer hors Vinted : « bientot » (jamais un bouton qui échoue)");
ok(/RETURN jsonb_build_object\('autorise', true, 'commandes_seules', v_commandes_seules\);/.test(MIG), "hors bêta : le relevé des commandes Vinted SEULES");
const INV = lire("supabase/rollbacks/20261024235500_bordereaux_vinted_tous_les_comptes_INVERSE.sql");
ok(/DROP FUNCTION IF EXISTS public\.bordereaux_ouverts_pour\(uuid, text\);/.test(INV) && /DELETE FROM public\.coin_config WHERE key = 'bordereaux_vinted_tous';/.test(INV), "inverse prêt");
ok(BG.includes("async function releverCommandesVintedHorsBeta(token, etat)") && BG.includes("if (!aut?.autorise || aut?.commandes_seules !== true)")
  && BG.includes("const liste = commandesSeules ? null : await executerDansOngletPlateforme(platform, L.liste"),
  "extension : hors bêta, les commandes Vinted seules — aucune conversation lue sans le mot du serveur");
ok(BG.includes('rpcMessagerie("bordereaux_ouverts_pour", { p_platform: "vinted" }, token)') && BG.includes("!(bv && bv.user === userId && bv.val === true)"),
  "extension : les demandes de bordereau prises pour un compte aux bordereaux Vinted ouverts (fail-closed)");
const HOOK = lire("src/messagerie/useMessagerieBeta.js");
ok(HOOK.includes("data.bordereaux_vinted !== true") && lire("src/App.jsx").includes("messages={messagerie.beta}"),
  "app : « À expédier » hors bêta, la messagerie reste à la bêta");
const FIC = lire("supabase/functions/bordereau-fichier/index.ts");
ok(FIC.includes('admin.rpc("bordereaux_ouverts_pour", { p_user: user.id, p_platform: "vinted" })') && FIC.includes('admin.rpc("messagerie_beta", { p_user: user.id })'),
  "bordereau-fichier : les bordereaux Vinted ouverts, et la bêta tant que la base n'a pas la migration");

console.log(`lot-2410-soir-selftest : ${n} contrôles verts`);
