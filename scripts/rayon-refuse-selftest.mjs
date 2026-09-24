// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON REFUSÉ NE PART JAMAIS — SELFTEST (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qu'il garantit, sans réseau (l'IA est simulée, les arbres sont les vrais) :
//   1. le rayon refusé n'est JAMAIS proposé à l'IA, ni reposé sur le job ;
//   2. l'IA choisit dans l'arbre réel : trouvé → rayon confirmé, source
//      « ia_descente_arbre », plus aucun drapeau « incertain » ;
//   3. rien de sûr → pas de rayon, une QUESTION (rayon_a_choisir), candidats en
//      tête, la plateforme écartée avant le débit — sur les cinq plateformes ;
//   4. une panne → attente (rayon_a_reessayer), jamais le rayon refusé ;
//   5. le choix du vendeur passe toujours (appliquerRayonChoisi lève la question) ;
//   6. le « Autres » d'une branche jamais montré à l'IA n'est pas « refusé », le
//      fourre-tout de catalogue (« Divers › Autres ») jamais proposé ;
//   7. la famille ne met de veto que quand elle vient de la fiche ;
//   8. PÉRIMÈTRE : seuls les verdicts « incoherent », « refuse_hors_famille »,
//      « descente_non_confirmee » entrent dans l'étape ; resolve-categorie
//      garde sa consigne d'avant sans `consigne: "plus_proche"`.
//
//   node --import ./scripts/loader-ext.mjs scripts/rayon-refuse-selftest.mjs
import { readFileSync } from "node:fs";
import {
  VERDICTS_REFUS, cheminsRefuses, familleVetoDe, rayonApresRefus, appliquerRayonApresRefus,
} from "../src/utils/rayonApresRefus.js";
import { appliquerRayonChoisi } from "../src/utils/rayonPublication.js";
import { plateformesSansChemin, questionsParPlateforme } from "../src/publication/moteur/regles.js";
import { resolutionARetenter } from "../src/utils/resolutionPublication.js";

let ko = 0;
const ok = (c, quoi) => { if (!c) { ko++; console.log(`  ✗ ${quoi}`); } else console.log(`  ✓ ${quoi}`); };
const src = (f) => readFileSync(new URL(`../${f}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const cle = (c) => c.join(" > ");

// L'IA simulée : elle suit une CIBLE (la candidate égale, ou le préfixe de la
// cible quand c'est une branche), sinon elle répond null. Elle note tout ce
// qu'on lui a montré.
function iaSimulee(platform, cibles = [], { panne = false } = {}) {
  const vus = [];
  const appeler = async (corps) => {
    const cands = corps?.candidats?.[platform] ?? [];
    vus.push({ consigne: corps?.consigne, fourreTout: corps?.garder_fourre_tout, chemins: cands.map((c) => cle(c.chemin)), sous: cands.map((c) => c.sous ?? null) });
    if (panne) return { data: null, injoignable: true };
    for (const cible of cibles) {
      const k = cle(cible);
      const hit = cands.find((c) => cle(c.chemin) === k) ?? cands.find((c) => k.startsWith(`${cle(c.chemin)} > `));
      if (hit) return { data: { choix: { [platform]: { chemin: hit.chemin, id: hit.id ?? null } } }, injoignable: false };
    }
    return { data: { choix: {} }, injoignable: false };
  };
  return { appeler, vus };
}

const PINCEAUX = ["Maison", "Outils et bricolage", "Outils et accessoires de peinture", "Pinceaux"];
const PEINTURES = ["Maison", "Décoration", "Décorations murales", "Peintures"];

console.log("1. Le rayon refusé n'est jamais proposé ni reposé — un tableau refusé en « Pinceaux »");
{
  const pf = {
    categoryPath: PINCEAUX, categorie_source: "hors_famille", categorie_incertaine: true,
    categorie_verification: { objet: "tableau", verdict: "incoherent", chemin_icone: PINCEAUX, source_avant: "mot_cle" },
    categorie_plausibilite: { verdict: "hors_famille", chemin_ecarte: PINCEAUX, famille_objet: "beaute", source_famille: "categorie_origine_ebay" },
  };
  const refuses = cheminsRefuses("vinted", pf);
  ok(refuses.length === 1 && cle(refuses[0]) === cle(PINCEAUX), "cheminsRefuses : le chemin de l'icône, une fois");
  const ia = iaSimulee("vinted", [PEINTURES]);
  const res = await rayonApresRefus({
    platform: "vinted", objet: "tableau", titre: "Peinture Baptême du Christ signée", refuses,
    familleVeto: familleVetoDe({ famille: "beaute", source: "categorie_origine_ebay" }), pf, appelerResolve: ia.appeler,
  });
  ok(res.issue === "trouve" && cle(res.chemin) === cle(PEINTURES), "l'IA descend jusqu'à « Peintures »");
  ok(ia.vus.every((v) => !v.chemins.includes(cle(PINCEAUX))), "« Pinceaux » n'est JAMAIS montré à l'IA");
  ok(ia.vus.every((v) => v.consigne === "plus_proche" && v.fourreTout === true), "chaque appel porte la consigne « plus proche »");
  ok(ia.vus.some((v) => v.sous.some((s) => Array.isArray(s) && s.includes("Décoration"))), "les branches montrent ce qu'elles contiennent (Maison → Décoration…)");
  appliquerRayonApresRefus("vinted", pf, res, { objet: "tableau", motSource: "ia", refuses });
  ok(cle(pf.categoryPath) === cle(PEINTURES), "le job porte « Peintures »");
  ok(pf.categorie_source === "ia_descente_arbre" && pf.categorie_par_mot?.apres_refus === true, "source ia_descente_arbre, marquée « après refus »");
  ok(pf.categorie_verification?.verdict === "rayon_apres_refus" && pf.categorie_verification?.verdict_avant === "incoherent", "verdict « rayon_apres_refus », l'ancien verdict gardé");
  ok(!pf.categorie_incertaine && !pf.lbcCategorieIncertaine, "plus aucun drapeau « incertain » (la suggestion de la plateforme ne l'écrasera pas)");
  ok(!pf.categorie_plausibilite && pf.categorie_verification?.plausibilite_refusee?.verdict === "hors_famille", "le refus de famille est gardé en trace, plus là où le worker eBay le lit");
  ok(!plateformesSansChemin([{ platform: "vinted", platform_fields: pf }]).length, "la plateforme part");
}

console.log("2. Rien de sûr → une QUESTION, et le dépôt ne part pas");
for (const platform of ["vinted", "leboncoin", "beebs", "ebay", "opla"]) {
  const refuse = platform === "leboncoin" ? ["Maison & Jardin", "Décoration"] : platform === "ebay" ? ["Maison", "Décoration d'intérieur", "Cadres"] : null;
  const pf = {
    categorie_verification: { objet: "objet", verdict: "incoherent", chemin_icone: refuse },
    ...(refuse && platform === "leboncoin" ? { lbcCategoryPath: refuse, lbcCategorieIncertaine: true, categorie_incertaine: true } : {}),
    ...(refuse && platform === "ebay" ? { ebayCategoryPath: refuse, ebayCategoryId: "79654", categorie_incertaine: true } : {}),
  };
  const refuses = cheminsRefuses(platform, pf);
  const ia = iaSimulee(platform, []);
  const res = await rayonApresRefus({ platform, objet: "objet", titre: "Objet", refuses, pf, appelerResolve: ia.appeler });
  appliquerRayonApresRefus(platform, pf, res, { objet: "objet", refuses });
  const chemin = pf.categoryPath ?? pf.lbcCategoryPath ?? pf.beebsCategoryPath ?? pf.ebayCategoryPath ?? pf.oplaCategoryPath;
  ok(res.issue === "question" && !chemin && !pf.ebayCategoryId && !pf.oplaCategoryCode && Boolean(pf.rayon_a_choisir),
    `${platform} : pas de rayon, une question`);
  ok(plateformesSansChemin([{ platform, platform_fields: pf }]).includes(platform), `${platform} : écartée avant le débit`);
  ok((pf.rayon_a_choisir?.candidats ?? []).every((c) => !refuse || cle(c.chemin) !== cle(refuse)), `${platform} : le rayon refusé n'est pas dans les candidats`);
  // Le choix du vendeur lève la question.
  const choix = { chemin: ["Un", "Rayon"], id: platform === "ebay" || platform === "opla" ? "123" : null };
  const apres = appliquerRayonChoisi(pf, platform, choix);
  ok(!apres.rayon_a_choisir && !plateformesSansChemin([{ platform, platform_fields: apres }]).includes(platform), `${platform} : le choix du vendeur passe`);
}

console.log("3. Une panne → attente, jamais le rayon refusé");
{
  const pf = { categoryPath: PINCEAUX, categorie_incertaine: true, categorie_verification: { verdict: "incoherent", chemin_icone: PINCEAUX } };
  const refuses = cheminsRefuses("vinted", pf);
  const ia = iaSimulee("vinted", [], { panne: true });
  const res = await rayonApresRefus({ platform: "vinted", objet: "tableau", titre: "Tableau", refuses, pf, appelerResolve: ia.appeler });
  appliquerRayonApresRefus("vinted", pf, res, { refuses });
  ok(res.issue === "attente" && !pf.categoryPath && Boolean(pf.rayon_a_reessayer), "chemin retiré, rayon_a_reessayer posé");
  ok(resolutionARetenter({ pfParPlateforme: { vinted: pf } }), "le clic suivant recalcule (resolutionARetenter)");
  ok(plateformesSansChemin([{ platform: "vinted", platform_fields: pf }]).includes("vinted"), "écartée avant le débit");
}

console.log("4. Le « Autres » d'une branche n'est pas « refusé » s'il n'a jamais été montré");
{
  const AUTRES = ["Enfants", "Vêtements pour filles", "Pantalons et shorts", "Autres"];
  const pf = { categoryPath: AUTRES, categorie_incertaine: true, categorie_verification: { verdict: "incoherent", chemin_icone: AUTRES } };
  const refuses = cheminsRefuses("vinted", pf);
  const connus = [{ chemin: ["Enfants", "Vêtements pour filles", "Pantalons et shorts", "Leggings"], id: null }];
  const ia = iaSimulee("vinted", [AUTRES]);
  const res = await rayonApresRefus({ platform: "vinted", objet: "pantalon jogging enfant", titre: "Pantalon jogging 12 ans", genre: "Fille", refuses, pf, appelerResolve: ia.appeler, candidatsConnus: connus });
  ok(res.issue === "trouve" && cle(res.chemin) === cle(AUTRES), "l'IA le voit, le choisit : il part");
  ok((res.non_juges ?? []).some((c) => cle(c) === cle(AUTRES)) && !(res.refuses_juges ?? []).length, "tracé « non jugé », pas « refusé »");
  // Sans voisines réelles, l'IA l'avait vu : c'est un vrai refus.
  const ia2 = iaSimulee("vinted", [AUTRES]);
  const res2 = await rayonApresRefus({ platform: "vinted", objet: "pantalon", titre: "Pantalon", genre: "Fille", refuses, pf: {}, appelerResolve: ia2.appeler, candidatsConnus: [] });
  ok(res2.issue !== "trouve" || cle(res2.chemin) !== cle(AUTRES), "montré à l'IA puis refusé : il ne repart pas");
  ok(ia2.vus.every((v) => !v.chemins.includes(cle(AUTRES))), "et il n'est plus proposé");
}

console.log("5. Le fourre-tout de catalogue n'est jamais proposé");
{
  const ia = iaSimulee("leboncoin", [["Divers", "Autres"]]);
  const res = await rayonApresRefus({ platform: "leboncoin", objet: "rangement", titre: "Rangement", refuses: [], pf: {}, appelerResolve: ia.appeler });
  ok(ia.vus.every((v) => !v.chemins.includes("Divers > Autres")), "« Divers > Autres » n'apparaît dans aucune liste");
  ok(res.issue !== "trouve" || cle(res.chemin) !== "Divers > Autres", "et ne sort jamais");
}

console.log("6. La famille : veto de la fiche, jamais d'une origine traduite");
{
  ok(familleVetoDe({ famille: "mode", source: "catalog_vinted" }) === "mode", "catalogue Vinted → veto");
  ok(familleVetoDe({ famille: "loisirs", source: "icone_famille_livres" }) === "loisirs", "icône d'autorité → veto");
  ok(familleVetoDe({ famille: "beaute", source: "categorie_origine_ebay" }) === null, "catégorie d'origine eBay → pas de veto");
  ok(familleVetoDe({ famille: null, source: null }) === null, "famille inconnue → pas de veto");
  const ia = iaSimulee("vinted", [PEINTURES]);
  const res = await rayonApresRefus({ platform: "vinted", objet: "robe", titre: "Robe", refuses: [PINCEAUX], familleVeto: "mode", pf: {}, appelerResolve: ia.appeler });
  ok(res.issue === "question" && res.motif === "hors_famille_fiche", "une feuille hors de la famille de la fiche → question");
}

console.log("7. eBay et Opla : l'identifiant voyage avec le chemin");
{
  const SCULPT = ["Maison", "Décoration d'intérieur", "Scultures, figurines"];
  const CADRES = ["Maison", "Décoration d'intérieur", "Cadres"];
  const pf = { ebayCategoryPath: CADRES, ebayCategoryId: "79654", categorie_incertaine: true, categorie_verification: { verdict: "incoherent", chemin_icone: CADRES } };
  const refuses = cheminsRefuses("ebay", pf);
  const ia = iaSimulee("ebay", [SCULPT]);
  const res = await rayonApresRefus({ platform: "ebay", objet: "sculpture", titre: "Sculpture bronze", refuses, pf, appelerResolve: ia.appeler });
  appliquerRayonApresRefus("ebay", pf, res, { refuses });
  ok(cle(pf.ebayCategoryPath ?? []) === cle(SCULPT) && pf.ebayCategoryId === "36025", "« Scultures, figurines » et son identifiant 36025");
  ok(ia.vus.every((v) => !v.chemins.includes(cle(CADRES))), "« Cadres » (refusé) jamais montré");
}

console.log("8. Périmètre : rien d'autre n'entre dans l'étape");
{
  ok([...VERDICTS_REFUS].sort().join(",") === "descente_non_confirmee,incoherent,refuse_hors_famille", "trois verdicts, et eux seuls");
  const resolution = src("src/utils/resolutionPublication.js");
  ok(/const aReprendre = rows\.filter\(\(r\) => VERDICTS_REFUS\.has\(r\.platform_fields\?\.categorie_verification\?\.verdict\)\);/.test(resolution), "resolutionPublication filtre par le verdict, et par rien d'autre");
  ok(resolution.indexOf("const aReprendre") > resolution.indexOf("══ PLAUSIBILITÉ DU CHEMIN FINAL"), "l'étape vient APRÈS tout le reste (rien d'avant ne change)");
  const fn = src("supabase/functions/resolve-categorie/index.ts");
  ok(/system: corps\.consigne === "plus_proche" \? SYSTEM_PLUS_PROCHE : SYSTEM,/.test(fn), "resolve-categorie : la consigne d'avant sauf demande explicite");
  ok(/const garderFourreTout = corps\.consigne === "plus_proche" && corps\.garder_fourre_tout === true;/.test(fn), "le fourre-tout n'est gardé QUE pour la descente « plus proche »");
  ok(/\$\{sous\.length \? ` — contient : \$\{sous\.join\(", "\)\}` : ""\}/.test(fn), "l'aperçu des branches n'apparaît que s'il est envoyé");
  ok((fn.match(/&& journaliser\)/g) ?? []).length === 2, "un rejeu n'écrit pas dans categorie_journal");
  // plateformesSansChemin : Beebs avec categorie_a_choisir SANS question reste comme avant.
  ok(!plateformesSansChemin([{ platform: "beebs", platform_fields: { categorie_a_choisir: { objet: "x" } } }]).length, "Beebs « categorie_a_choisir » (ancien chemin) : inchangé");
  ok(JSON.stringify(questionsParPlateforme({ selected: new Set(["vinted"]) })) === "{}", "questionsParPlateforme sans question de rayon : inchangé");
  ok(JSON.stringify(questionsParPlateforme({ selected: new Set(["vinted"]), rayonsAChoisir: ["vinted"] })) === JSON.stringify({ vinted: ["Rayon"] }), "avec une question de rayon : « Rayon »");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ rayon refusé : tout passe");
process.exit(ko ? 1 : 0);
