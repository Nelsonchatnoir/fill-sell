// `npm run selftest:depop-rayon` — LE RAYON DEPOP PAR LE MOTEUR (11/10/2026).
//
// Ce que ce test tient (aucun appel réseau : l'IA est SIMULÉE, ses réponses
// réelles du 11/10 sont rejouées ; la mesure réelle : scripts/audits/
// depop-rayons-passes.mjs et le rapport) :
//   A. le référentiel serveur (_shared/depop-feuilles.js) est celui du relevé
//      (générateur --verifier) ;
//   B. les libellés corrigés : plus jamais « Vestes » pour des débardeurs,
//      « T-shirts (Shirts) » pour des chemises, « Robe habillée » pour un
//      déguisement — et chaque correction garde l'IDENTIFIANT ;
//   C. les indices d'âge et de genre, explicites seulement (« portée 2 mois »
//      n'est pas un article d'enfant) ;
//   D. l'objet : le mot de l'IA d'abord, puis le NOM EN TÊTE du titre — le mot
//      « basket » de « Short de basket » ne prend jamais le dessus ;
//   E. les garde-fous : vêtement jamais en chaussures, chaussure jamais en
//      vêtement, enfant jamais sans indice, genre dit jamais contredit ;
//   F. le moteur de bout en bout (IA simulée) sur les 6 jobs en attente du
//      11/10 (Simon ×4, Jake ×2) : le short ne finit plus en Enfants ›
//      Chaussures › Baskets, les baskets de Jake plus en Femme › Robes ;
//      un choix faux de l'IA devient une QUESTION, jamais un rayon ;
//   G. la question « Rayon Depop » : choix fermés en français, réduits à la
//      famille de l'objet, et la réponse se traduit en identifiant ;
//   H. un job ne part qu'avec un rayon du moteur ou de la personne
//      (rayonDepopAJour), et appliquerRayonDepop pose ce qui en dépend ;
//   I. le câblage : resolve-categorie accepte Depop ; l'app n'utilise plus la
//      table icône → rayon ; get-pending-jobs retient ; handler-watch recalcule.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  libellesRayonDepop, texteRayonDepop, idDepuisReponseRayonDepop, indicesAgeGenre, familleObjetDepop, departementsDepop,
  candidatsRayonDepop, jugerRayonDepop, questionRayonDepop, resoudreRayonDepop, rayonDepopAJour, reponseRayonDepop,
  traceRayonDepop, VERSION_RAYON_DEPOP, SOURCE_RAYON_DEPOP,
} from "../supabase/functions/_shared/depop-rayon.js";
import { appliquerRayonDepop, champsDepop } from "../src/utils/depopPublication.js";
import { horsModeDepop } from "../src/utils/depopCategories.js";

const RACINE = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(path.join(RACINE, p), "utf8").split("\r\n").join("\n");
let ko = 0, n = 0;
const dit = (nom, c, detail) => { n++; if (!c) ko++; console.log(`  ${c ? "ok  " : "❌  "} ${nom}${c || detail === undefined ? "" : `  → ${detail}`}`); };

console.log("\nA. LE RÉFÉRENTIEL SERVEUR EST CELUI DU RELEVÉ");
{
  let ok = true;
  try { execFileSync(process.execPath, [path.join(RACINE, "scripts/gen-depop-feuilles-serveur.mjs"), "--verifier"], { stdio: "pipe" }); } catch { ok = false; }
  dit("_shared/depop-feuilles.js à jour (générateur --verifier)", ok);
}

console.log("\nB. LES LIBELLÉS CORRIGÉS, L'IDENTIFIANT INTACT");
{
  dit("débardeurs : « Débardeurs et caracos », pas « Vestes »", texteRayonDepop("womenswear/tops/vests-tanks-camis") === "Femme › Hauts › Débardeurs et caracos");
  dit("chemises : « Chemises », pas « T-shirts (Shirts) »", texteRayonDepop("menswear/tops/shirts") === "Homme › Hauts › Chemises");
  dit("déguisement : « Déguisements », pas « Robe habillée »", texteRayonDepop("kidswear/fancy-dress/fancy-dress") === "Enfants › Déguisements › Déguisements");
  dit("escarpins : « Escarpins », pas « Courts »", texteRayonDepop("womenswear/footwear/courts") === "Femme › Chaussures › Escarpins");
  dit("maison : « Maison », pas « Accueil »", libellesRayonDepop("everything-else/home/furniture")?.[1] === "Maison");
  dit("un « Autre » reste « Autre » (le fourre-tout est écarté par resolve-categorie)", libellesRayonDepop("menswear/tops/other-tops")?.[2] === "Autre");
  dit("feuille inconnue : null", libellesRayonDepop("menswear/tops/inconnu") === null);
  dit("réponse → identifiant (aller-retour exact)", idDepuisReponseRayonDepop("Enfants › Bas › Shorts") === "kidswear/bottoms/shorts" && idDepuisReponseRayonDepop("Enfants › Bas › Short") === null);
  const tous = candidatsRayonDepop(["menswear", "womenswear", "kidswear", "everything-else"]);
  const textes = tous.map((c) => c.chemin.join(" › "));
  dit("aucun libellé en double parmi les feuilles proposées (hors « Autre »)", new Set(textes.filter((t) => !/ › Autre$/.test(t))).size === textes.filter((t) => !/ › Autre$/.test(t)).length, textes.filter((t, i) => textes.indexOf(t) !== i && !/ › Autre$/.test(t)).slice(0, 5).join(" | "));
  dit("seules les feuilles OFFICIELLES sont proposées (Homme › Hauts › Blouses : non)", !tous.some((c) => c.id === "menswear/tops/blouses"));
}

console.log("\nC. ÂGE ET GENRE : DES INDICES EXPLICITES");
{
  const short = indicesAgeGenre({ titre: "Short de basket Jordan noir, bleu et blanc - Taille M Enfant (10-12 ans / 140-152 cm)", description: "pour enfant" });
  dit("« Enfant », « 10-12 ans », « 140-152 cm » : enfant", short.enfant.length >= 3, JSON.stringify(short));
  dit("« portée 2 mois » n'est pas un âge", indicesAgeGenre({ titre: "Robe portée 2 mois Zara" }).enfant.length === 0);
  dit("« achetée il y a 3 mois » (description) n'est pas un âge", indicesAgeGenre({ titre: "Robe noire", description: "achetée il y a 3 mois" }).enfant.length === 0);
  dit("« Woman size 39 trainers » : femme", indicesAgeGenre({ titre: "Woman size 39 trainers new" }).femme.length === 1);
  dit("« woman » n'est pas « man »", indicesAgeGenre({ titre: "Woman size 39 trainers new" }).homme.length === 0);
  dit("genre de la fiche « Garçon » : enfant", indicesAgeGenre({ titre: "Pull", genre: "Garçon" }).enfant.length === 1);
  dit("catégorie d'origine « Hommes › … » : homme", indicesAgeGenre({ titre: "Short", origine: ["Hommes", "Vêtements", "Shorts"] }).homme.length === 1);
  const lot = indicesAgeGenre({ titre: "Lot de 2 T-shirts - Taille S (Enfant XL / S Homme)" });
  dit("lot mixte : enfant ET homme", lot.enfant.length > 0 && lot.homme.length > 0);
  dit("sans indice : Enfants n'est pas proposé à l'IA", !departementsDepop(indicesAgeGenre({ titre: "Sweat Nike gris" }), { horsMode: false }).includes("kidswear"));
  dit("enfant seul : Enfants seulement", departementsDepop(short, { horsMode: false }).join() === "kidswear");
  dit("lot mixte : Enfants et Homme", departementsDepop(lot, { horsMode: false }).join() === "kidswear,menswear");
  dit("hors mode : Tout le reste seulement", departementsDepop(short, { horsMode: true }).join() === "everything-else");
  dit("icône hors mode (🏀) → horsMode true ; 👟 → false ; inconnue → null", horsModeDepop("🏀") === true && horsModeDepop("👟") === false && horsModeDepop("zz") === null, `${horsModeDepop("🏀")} ${horsModeDepop("👟")} ${horsModeDepop("zz")}`);
}

console.log("\nD. L'OBJET : LE NOM EN TÊTE, JAMAIS UN MOT PLUS LOIN");
{
  const f = (titre, objet = "") => familleObjetDepop({ titre, objet });
  dit("« Short de basket Jordan » : vêtement (short)", f("Short de basket Jordan").famille === "vetement" && f("Short de basket Jordan").mot === "short");
  dit("« Maillot de basket Lakers » : vêtement", f("Maillot de basket Lakers").famille === "vetement");
  dit("« Baskets Nike Air Max » : chaussure", f("Baskets Nike Air Max").famille === "chaussure");
  dit("« Woman size 39 trainers new » : chaussure", f("Woman size 39 trainers new").famille === "chaussure");
  dit("« Chaussettes Nike » : vêtement (pas une chaussure)", f("Chaussettes Nike lot de 3").famille === "vetement");
  dit("« Sac à main Longchamp » : accessoire", f("Sac à main Longchamp").famille === "accessoire");
  dit("le mot de l'IA passe AVANT le titre (« short » sur « Basket ball short »)", f("Basket ball short Nike", "short").famille === "vetement");
  dit("rien de reconnu : null (aucun garde-fou ne juge)", f("Peluche Pikachu").famille === null);
}

console.log("\nE. LES GARDE-FOUS");
{
  const ctx = (titre, deps, extra = {}) => ({ indices: indicesAgeGenre({ titre, ...extra }), famille: familleObjetDepop({ titre }), departements: deps });
  const shortKid = ctx("Short de basket Jordan - Taille M Enfant (10-12 ans)", ["kidswear"]);
  dit("short d'enfant en Enfants › Chaussures › Baskets : REFUSÉ (vêtement en chaussures)", jugerRayonDepop("kidswear/footwear/trainers", shortKid).motif === "vetement_en_chaussures");
  dit("short d'enfant en Enfants › Bas › Shorts : accepté", jugerRayonDepop("kidswear/bottoms/shorts", shortKid).ok === true);
  dit("baskets en Femme › Robes : REFUSÉ (chaussure en vêtement)", jugerRayonDepop("womenswear/dresses/dresses", ctx("Woman size 39 trainers new", ["womenswear"])).motif === "chaussure_en_vetement");
  dit("baskets en Femme › Chaussures › Baskets : accepté", jugerRayonDepop("womenswear/footwear/trainers", ctx("Woman size 39 trainers new", ["womenswear"])).ok === true);
  dit("sweat adulte en Enfants : REFUSÉ (aucun indice enfant)", jugerRayonDepop("kidswear/tops/sweatshirts", ctx("Sweat Nike gris", ["menswear", "womenswear", "kidswear"])).motif === "enfant_sans_indice");
  dit("pyjama « 6 mois » en Homme : REFUSÉ (article d'enfant en adulte)", jugerRayonDepop("menswear/nightwear/pajamas", ctx("Pyjama 6 mois", ["kidswear", "menswear"])).motif === "adulte_pour_enfant");
  dit("article « femme » en Homme : REFUSÉ (genre contraire)", jugerRayonDepop("menswear/tops/tshirts", ctx("T-shirt femme", ["menswear", "womenswear"])).motif === "genre_contraire");
  dit("département non proposé : REFUSÉ", jugerRayonDepop("womenswear/tops/tshirts", ctx("T-shirt homme", ["menswear"])).motif === "departement_non_propose");
  dit("ballon de basket en Sports de ballon : accepté (une chaussure ne juge que les rayons de vêtements)", jugerRayonDepop("everything-else/sports-equipment-accesories/ball-sports", ctx("Ballon de basket Spalding", ["everything-else"])).ok === true);
}

console.log("\nF. LE MOTEUR DE BOUT EN BOUT (IA SIMULÉE) — LES 6 JOBS DU 11/10");
{
  // Réponses de resolve-categorie relevées à blanc le 11/10 (v14, rejeu) ;
  // le moteur doit retrouver la CLÉ dans la liste qu'il a envoyée.
  const iaQuiChoisit = (id) => async (corps) => {
    const liste = corps.candidats?.depop ?? [];
    const c = liste.find((x) => x.id === id);
    return c ? { choix: { depop: { id: c.id, chemin: c.chemin, source: "arbre" } } } : { choix: {} };
  };
  const SIX = [
    { n: "Simon c30d08eb (short)", ctx: { titre: "Short de basket Jordan noir, bleu et blanc - Taille M Enfant (10-12 ans / 140-152 cm)", description: "Je vends ce short de sport / basket de la marque Jordan (Nike) pour enfant", taille: "M", horsMode: false, origine: ["Hommes", "Vêtements", "Vêtements de sport et accessoires", "Shorts"] }, ia: "kidswear/bottoms/shorts" },
    { n: "Simon c04cd76a (sweat)", ctx: { titre: "Sweat Nike bleu / gris - Taille S", description: "sweat à col rond de la marque Nike pour homme", taille: "S", horsMode: false }, ia: "menswear/tops/sweatshirts" },
    { n: "Simon d088073e (sweat à capuche)", ctx: { titre: "Sweat à capuche Carhartt WIP gris - Taille M", description: "sweat à capuche (hoodie) pour homme", taille: "M", horsMode: false }, ia: "menswear/tops/hoodies" },
    { n: "Simon f441eebf (lot de t-shirts)", ctx: { titre: "Lot de 2 T-shirts de sport Nike & Under Armour - Taille S (Enfant XL / S Homme)", description: "lot de 2 t-shirts", taille: "S", horsMode: false }, ia: "menswear/tops/tshirts" },
    { n: "Jake afc6f4d6 (baskets)", ctx: { titre: "Woman size 39 trainers new", description: "Burgundy mesh trainers with white sole", taille: "39", horsMode: false }, ia: "womenswear/footwear/trainers" },
    { n: "Jake 6002227e (baskets)", ctx: { titre: "Womans new size 38 trainers", description: "Women's knit trainers", taille: "38", horsMode: false }, ia: "womenswear/footwear/trainers" },
  ];
  for (const c of SIX) {
    const r = await resoudreRayonDepop(c.ctx, iaQuiChoisit(c.ia));
    dit(`${c.n} → ${texteRayonDepop(c.ia)}`, r.id === c.ia, JSON.stringify({ id: r.id, motif: r.motif, detail: r.detail }));
  }
  // L'ancien rayon faux, s'il revenait de l'IA : jamais posé, une question.
  const r1 = await resoudreRayonDepop(SIX[0].ctx, iaQuiChoisit("kidswear/footwear/trainers"));
  dit("l'IA choisirait Enfants › Chaussures › Baskets pour le short : QUESTION, rien n'est posé", !r1.id && r1.motif === "vetement_en_chaussures" && r1.question?.field_key === "depopCategorie");
  const r2 = await resoudreRayonDepop(SIX[4].ctx, iaQuiChoisit("womenswear/dresses/dresses"));
  dit("l'IA choisirait Femme › Robes pour les baskets : QUESTION", !r2.id && r2.motif === "chaussure_en_vetement");
  const r3 = await resoudreRayonDepop(SIX[1].ctx, async () => ({ choix: {} }));
  dit("l'IA répond « aucune » : QUESTION", !r3.id && r3.motif === "ia_aucune");
  const r4 = await resoudreRayonDepop(SIX[1].ctx, async () => { throw new Error("réseau"); });
  dit("IA injoignable : QUESTION marquée iaIndisponible (le serveur réessaie)", !r4.id && r4.iaIndisponible === true);
  // Les départements envoyés : Enfants seulement avec un indice, la liste bornée.
  let envoyes = null;
  await resoudreRayonDepop(SIX[1].ctx, async (corps) => { envoyes = corps; return { choix: {} }; });
  dit("sweat sans indice enfant : aucune feuille Enfants envoyée", envoyes && !envoyes.candidats.depop.some((c) => c.id.startsWith("kidswear/")));
  dit("liste envoyée bornée (≤ 250) et max_candidats couvrant la liste", envoyes.candidats.depop.length <= 250 && envoyes.max_candidats >= envoyes.candidats.depop.length);
  dit("les indices voyagent vers l'IA (genre dit, objet)", envoyes.attributs["genre dit"] === "homme" && envoyes.attributs.objet === "sweat");
}

console.log("\nG. LA QUESTION « RAYON DEPOP »");
{
  const q = questionRayonDepop({ departements: ["kidswear"], famille: familleObjetDepop({ titre: "Short de basket Jordan" }) });
  dit("champ « Rayon Depop », select, cible depopCategorie", q.field_label === "Rayon Depop" && q.input_type === "select" && q.target?.key === "depopCategorie");
  dit("choix en français, réduits aux vêtements (aucune chaussure)", q.allowed_values.length > 10 && !q.allowed_values.some((v) => / › Chaussures › /.test(v)), q.allowed_values.slice(0, 4).join(" | "));
  dit("« Enfants › Bas › Shorts » est proposé", q.allowed_values.includes("Enfants › Bas › Shorts"));
  dit("les « Autre » en dernier", q.allowed_values.findIndex((v) => / › Autre$/.test(v)) === -1 || q.allowed_values.slice(q.allowed_values.findIndex((v) => / › Autre$/.test(v))).every((v) => / › Autre$/.test(v)));
  dit("chaque choix se traduit en identifiant", q.allowed_values.every((v) => idDepuisReponseRayonDepop(v) != null));
}

console.log("\nH. UN JOB NE PART QU'AVEC UN RAYON DU MOTEUR OU DE LA PERSONNE");
{
  dit("ancien job (catalog_vinted, sans trace) : NON", rayonDepopAJour({ depopCategoryPath: ["kidswear", "footwear", "trainers"], categorie_source: "catalog_vinted" }) === false);
  dit("trace du moteur, même identifiant : OUI", rayonDepopAJour({ depopCategoryPath: ["kidswear", "bottoms", "shorts"], depop_rayon: { version: VERSION_RAYON_DEPOP, id: "kidswear/bottoms/shorts" } }) === true);
  dit("trace du moteur, identifiant DIFFÉRENT du chemin : NON", rayonDepopAJour({ depopCategoryPath: ["kidswear", "footwear", "trainers"], depop_rayon: { version: VERSION_RAYON_DEPOP, id: "kidswear/bottoms/shorts" } }) === false);
  dit("choix humain (carte Rayon) : OUI", rayonDepopAJour({ depopCategoryPath: ["menswear", "tops", "tshirts"], categorie_source: "choix_humain" }) === true);
  dit("feuille inconnue : NON, même choisie", rayonDepopAJour({ depopCategoryPath: ["menswear", "tops", "inconnu"], categorie_source: "choix_humain" }) === false);
  dit("réponse à la question lue", reponseRayonDepop({ depopCategorie: "Enfants › Bas › Shorts" }) === "kidswear/bottoms/shorts");
  const pf = { taille: "M", genre: "Garçon", etat: "Très bon état", depopCategoryPath: ["kidswear", "footwear", "trainers"], needsUserField: { field_key: "depopCategorie" } };
  const a = appliquerRayonDepop(pf, "kidswear/bottoms/shorts", { source: "personne", par: "selftest" });
  dit("appliquer (personne) : chemin, identifiant, libellés corrigés, choix humain", a.depopCategoryPath.join("/") === "kidswear/bottoms/shorts" && a.depopCategoryId === "kidswear/bottoms/shorts" && a.depopCategoryLibelles.join(" › ") === "Enfants › Bas › Shorts" && a.categorie_source === "choix_humain" && rayonDepopAJour(a));
  dit("appliquer : genre enfant posé (Garçon → male), question retirée", a.depopGenre === "male" && !a.needsUserField);
  const b = appliquerRayonDepop({ taille: "S" }, "menswear/tops/hoodies", { source: "ia", trace: traceRayonDepop({ id: "menswear/tops/hoodies", source: "ia", indices: { enfant: [], homme: ["x"], femme: [] }, famille: { famille: "vetement", mot: "sweat" }, departements: ["menswear"] }, { par: "selftest" }), par: "selftest" });
  dit("appliquer (moteur) : source moteur_depop_v2, trace à jour", b.categorie_source === SOURCE_RAYON_DEPOP && rayonDepopAJour(b) && b.depop_rayon.par === "selftest");
  dit("appliquer : identifiant illisible → null", appliquerRayonDepop({}, "pas-un-id", { source: "ia", par: "x" }) === null);
  const c1 = champsDepop({ icon: "👟", genre: "Fille", pf: { etat: "Très bon état" }, rayonParMoteur: true, categorieId: "kidswear/bottoms/shorts" });
  dit("champsDepop (moteur) : le rayon du moteur, jamais celui de l'icône 👟", c1.champs.depopCategoryId === "kidswear/bottoms/shorts" && c1.champs.depopGenre === "female");
  const c2 = champsDepop({ icon: "👟", genre: "Fille", pf: { etat: "Très bon état" }, rayonParMoteur: true, categorieId: null });
  dit("champsDepop (moteur, aucun rayon) : aucun rayon, « rayon » manque", !c2.champs.depopCategoryId && c2.manques.includes("rayon"));
}

console.log("\nI. LE CÂBLAGE");
{
  const rc = lire("supabase/functions/resolve-categorie/index.ts");
  dit("resolve-categorie accepte « depop »", /const PLATEFORMES = \["vinted", "leboncoin", "beebs", "ebay", "opla", "depop"\] as const;/.test(rc));
  const res = lire("src/utils/resolutionPublication.js");
  dit("l'app passe par le moteur (resoudreRayonDepop, rayonParMoteur: true)", res.includes("resoudreRayonDepop(") && res.includes("rayonParMoteur: true"));
  dit("l'app appelle resolve-categorie À PART pour Depop (la question des autres plateformes ne change pas)", /supabase\.functions\.invoke\("resolve-categorie", \{ body: corps \}\)/.test(res));
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  dit("get-pending-jobs : une publication Depop sans rayon du moteur n'est jamais servie", gpj.includes("if (rayonDepopAJour(pfR)) continue;") && gpj.includes("aRetenir.add(String(j.id));"));
  const hw = lire("supabase/functions/handler-watch/index.ts");
  dit("handler-watch : le rayon recalculé avant tout départ (borné à 10, question en cas de doute)", hw.includes("resoudreRayonDepop(") && hw.includes(".slice(0, 10);") && hw.includes('pfQ.needs_user_source = "rayon_depop";'));
  const carte = lire("src/components/CarteRayon.jsx");
  dit("le choix à la main montre les libellés corrigés", carte.includes("libellesRayonDepop(f.id)"));
}

console.log(ko ? `\n❌ depop-rayon : ${ko} rouge(s) sur ${n}` : `\n✓ depop-rayon : ${n} contrôles verts`);
process.exit(ko ? 1 : 0);
