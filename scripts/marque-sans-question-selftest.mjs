// ═══════════════════════════════════════════════════════════════════════════
// LA QUESTION « MARQUE » — SELFTEST (11/10/2026, point 10, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas rejoué : lucyburaux988 (10/10, 17:16 → 18:20), cinq parures publiées
// vers Vinted — cinq questions « Marque » alors qu'AUCUNE marque n'existait
// (Lens : marque nulle, « Parure sans marque identifiable », « sans marque
// visible » ; rédaction : marque null). Réponse : « Sans marque » 4 fois sur 5.
// Les « 20 questions » du journal étaient 5 affichages × 4 lignes (rayon
// synthétique + question partagée, « affiche » puis « complete »).
// Ce contrôle exécute le code livré et tombe si la règle disparaît :
//   1. AUCUNE marque nulle part → « Sans marque » sur chaque copie, sans
//      question, rien sur la fiche ;
//   2. une lecture partielle d'étiquette dans les notes de Lens → la question
//      reste ; une marque sur la fiche, chez Lens, ou tapée par la personne
//      (même une lettre) → rien n'est touché ;
//   3. marque du catalogue → passe, sans question ; marque hors catalogue →
//      la question de l'extension reste (jamais une autre marque en silence) ;
//   4. la réponse « marque hors catalogue » vaut pour l'ARTICLE :
//      attributs.marque_vinted { v, de, source: 'manuel', at } — la copie
//      Vinted qui porte `de` reçoit `v`, jamais une autre plateforme ;
//   5. le câblage : les trois arrivées des copies, StockTab, le commentaire du
//      24/09 remplacé, la télémétrie « 1 ligne = 1 affichage ».
//
//   node --import ./scripts/loader-ext.mjs scripts/marque-sans-question-selftest.mjs
import { readFileSync, existsSync } from "node:fs";
import {
  sansMarqueDOffice, appliquerMarqueVintedArticle, attributMarqueVinted, lectureMarquePartielle,
  comblerMarquesVides, marqueDeLaFiche,
} from "../src/publication/moteur/reponsesPartagees.js";
import { NO_BRAND_VALUE, SHARED_PROPAGATION } from "../src/publication/moteur/champsPartages.js";

let ko = 0; let n = 0;
const ok = (c, quoi, vu) => { n++; if (!c) { ko++; console.log(`  ✗ ${quoi}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); } else console.log(`  ✓ ${quoi}`); };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// La chaîne d'arrivée des copies, EXACTEMENT comme comblerMarqueFiche (ListingPreviewScreen).
const arrivee = (copies, initialListing) => sansMarqueDOffice(
  appliquerMarqueVintedArticle(comblerMarquesVides(copies, marqueDeLaFiche(initialListing)).edited, initialListing?.attributs).edited,
  { fiche: initialListing, notesLens: initialListing?.notes ?? null },
).edited;
const copiesVides = () => Object.fromEntries(["vinted", "beebs", "leboncoin", "ebay", "depop"].map((p) => [p, { title: "Parure", platform_fields: { marque: null, etat: "Neuf avec étiquette" } }]));

console.log("1. Cas lucyburaux988 rejoué : aucune marque nulle part → « Sans marque », sans question :");
{
  // Le résultat de Lens EST l'initialListing du parcours Lens (LensTab).
  const lens = { titre: "Parure bijoux papillon rouge et argent - collier, boucles d'oreilles, bague", marque: null, notes: "Parure sans marque identifiable", couleur: "Rouge" };
  const e = arrivee(copiesVides(), lens);
  const marques = Object.fromEntries(Object.entries(e).map(([p, c]) => [p, c.platform_fields.marque]));
  ok(Object.values(marques).every((m) => m === NO_BRAND_VALUE) && NO_BRAND_VALUE === "Sans marque", "les 5 copies (Vinted, Beebs, Leboncoin, eBay, Depop) arrivent en « Sans marque » — la valeur exacte du bouton", marques);
  ok(SHARED_PROPAGATION.marque.filter((p) => e[p]).length === 5 && SHARED_PROPAGATION.marque.filter((p) => e[p]).every((p) => e[p].platform_fields.marque === NO_BRAND_VALUE), "les plateformes que la réponse « Sans marque » aurait atteintes (SHARED_PROPAGATION.marque), toutes");
  const lens2 = { ...lens, notes: "Parure complète, sans marque visible. Une photo de l'étiquette trancherait." };
  ok(arrivee(copiesVides(), lens2).vinted.platform_fields.marque === NO_BRAND_VALUE, "« sans marque visible » n'est pas une lecture : « Sans marque »");
  ok(lens.marque === null && !("attributs" in lens), "rien n'est écrit sur la fiche (l'entrée n'est pas modifiée)");
  const r = sansMarqueDOffice(copiesVides(), { fiche: { marque: null } });
  ok(r.posees.length === 5, "posées sur les 5 copies présentes", r.posees);
  // La question partagée « Marque » se juge sur les copies : plus rien à demander.
  ok(Object.values(e).every((c) => String(c.platform_fields.marque).trim().length > 1), "chaque copie porte une marque utilisable : la question ne se pose pas");
}

console.log("2. Une lecture partielle, une marque quelque part → on ne touche à rien :");
{
  const partielles = [
    "texte partiellement lisible sur l'étiquette : \"Bo…\"",
    "Texte lisible sur l'objet : \"ATELIER\"",
    "lettres de l'étiquette : B-O-N-O-B-O",
    "texte lu sur l'étiquette : \"W WLOERINS\" — marque introuvable",
    "partly legible text on the label: \"Ni…\"",
    "label letters: Z-A-R",
  ];
  const ratees = partielles.filter((t) => !lectureMarquePartielle(t));
  ok(!ratees.length, "les lectures partielles de Lens (FR et EN) sont reconnues", ratees);
  const pasLecture = ["Parure sans marque identifiable", "sans marque visible", "aucun texte lisible sur l'objet", "no legible text on the item", ""];
  const fausses = pasLecture.filter((t) => lectureMarquePartielle(t));
  ok(!fausses.length, "« aucun texte lisible », « sans marque visible » ne sont pas des lectures", fausses);
  const avecLecture = arrivee(copiesVides(), { marque: null, notes: partielles[0] });
  ok(avecLecture.vinted.platform_fields.marque === null, "lecture partielle → la copie reste vide : la question « Marque » reste");
  const ficheMarque = arrivee(copiesVides(), { marque: "Bonobo" });
  ok(Object.values(ficheMarque).every((c) => c.platform_fields.marque === "Bonobo"), "marque sur la fiche → elle est reprise, jamais « Sans marque »");
  const attr = arrivee(copiesVides(), { marque: null, attributs: { marque: { v: "Levi's", source: "releve_vinted" } } });
  ok(attr.vinted.platform_fields.marque === "Levi's", "marque dans les attributs de la fiche → reprise");
  const tapee = copiesVides(); tapee.vinted.platform_fields.marque = "Cousu main Lou";
  const t2 = arrivee(tapee, { marque: null });
  ok(t2.vinted.platform_fields.marque === "Cousu main Lou" && t2.ebay.platform_fields.marque === null, "marque tapée par la personne → jamais touchée, jamais « Sans marque » ailleurs");
  const lettre = copiesVides(); lettre.vinted.platform_fields.marque = "B";
  ok(arrivee(lettre, { marque: null }).ebay.platform_fields.marque === null, "une lettre tapée (frappe en cours d'un brouillon) : prudence, rien n'est posé");
  ok(sansMarqueDOffice(copiesVides(), { fiche: { marque: null }, lensMarque: "Nike" }).posees.length === 0, "marque lue par Lens → rien");
  const aspect = copiesVides(); aspect.vinted.platform_fields.vintedAspects = { brand: "Zara" };
  ok(sansMarqueDOffice(aspect, { fiche: null }).posees.length === 0, "marque portée par vintedAspects.brand → rien");
  const vide = {};
  ok(sansMarqueDOffice(vide, { fiche: null }).edited === vide, "aucune copie : rien (aucun rendu de plus)");
}

console.log("3. Marque du catalogue : passe ; marque hors catalogue : la question de l'extension reste :");
{
  const nike = arrivee(copiesVides(), { marque: "Nike" });
  ok(nike.vinted.platform_fields.marque === "Nike", "marque du catalogue reconnue → posée, aucune question côté app");
  const w = arrivee(copiesVides(), { titre: "Parure bijoux collier", marque: "W WLOERINS", notes: "texte lu sur l'étiquette : \"W WLOERINS\"" });
  ok(w.vinted.platform_fields.marque === "W WLOERINS", "marque hors catalogue Vinted → la copie garde LA marque (jamais une autre en silence)");
  const vinted = lire("chrome-extension/content-scripts/vinted.js");
  ok(/raison: "marque_hors_catalogue", demandee,/.test(vinted), "l'extension pose toujours la question « marque hors catalogue » au dépôt");
  const comp = lire("src/annonces/QuestionMarque.jsx");
  ok(/ligne\('Sans marque', true\)/.test(comp) && /ne connaît pas la marque/.test(comp), "la question : le pourquoi, « Sans marque » ou une marque de la liste");
  ok(/Ton choix vaut pour cet article/.test(comp), "… et elle dit que le choix vaut pour l'article");
}

console.log("4. La réponse « marque hors catalogue » vaut pour l'ARTICLE (attributs.marque_vinted) :");
{
  const at = new Date("2026-10-11T12:00:00Z");
  const sm = attributMarqueVinted({ choix: "Sans marque", demandee: "W WLOERINS", maintenant: at });
  ok(JSON.stringify(sm) === JSON.stringify({ v: "Sans marque", de: "W WLOERINS", source: "manuel", at: "2026-10-11T12:00:00.000Z" }), "contrat : { v, de, source: 'manuel', at } — « Sans marque » compris", sm);
  ok(attributMarqueVinted({ choix: "  ", demandee: "X" }) === null, "aucun choix → rien");
  // La publication Vinted SUIVANTE du même article : la copie arrive avec la marque de la fiche.
  const fiche = { marque: "W WLOERINS", attributs: { marque_vinted: sm } };
  const e = arrivee(copiesVides(), fiche);
  ok(e.vinted.platform_fields.marque === "Sans marque", "la copie Vinted (marque de la fiche = « de ») reçoit « Sans marque » : la question ne revient pas", e.vinted.platform_fields.marque);
  ok(e.beebs.platform_fields.marque === "W WLOERINS" && e.ebay.platform_fields.marque === "W WLOERINS", "les autres plateformes gardent la marque de l'article");
  const choix = { marque: "Bonobo", attributs: { marque_vinted: { v: "Bonobo Jeans", de: "bonobo", source: "manuel" } } };
  ok(arrivee(copiesVides(), choix).vinted.platform_fields.marque === "Bonobo Jeans", "une marque du catalogue choisie : reprise (comparaison sans casse ni accents)");
  const autre = copiesVides(); autre.vinted.platform_fields.marque = "Levi's";
  ok(appliquerMarqueVintedArticle(autre, choix.attributs).edited === autre, "une copie Vinted qui porte une AUTRE marque n'est jamais touchée");
  const viaAspect = { vinted: { platform_fields: { marque: "", vintedAspects: { brand: "BONOBO" } } } };
  const va = appliquerMarqueVintedArticle(viaAspect, choix.attributs).edited.vinted.platform_fields;
  ok(va.marque === "Bonobo Jeans" && va.vintedAspects.brand === "Bonobo Jeans", "la marque lue dans vintedAspects.brand est remplacée elle aussi");
  ok(appliquerMarqueVintedArticle(copiesVides(), null).appliquee === null, "pas de réponse rangée → rien");
  // La même règle que le filet serveur (get-pending-jobs), quand il est là.
  const filet = new URL("../supabase/functions/_shared/vinted-couleur-marque-filet.js", import.meta.url);
  if (existsSync(filet)) {
    const { marqueVintedSansQuestion } = await import(filet.href);
    const cas = [
      [{ marque: "W WLOERINS" }, { marque_vinted: sm }],
      [{ marque: "" }, { marque_vinted: sm }],
      [{ marque: "Levi's" }, { marque_vinted: sm }],
      [{ marque: "Bonobo" }, choix.attributs],
    ];
    const ecarts = cas.filter(([pf, attrs]) => {
      const app = appliquerMarqueVintedArticle({ vinted: { platform_fields: { ...pf } } }, attrs).edited.vinted.platform_fields.marque;
      const srv = marqueVintedSansQuestion({ pf: { ...pf }, attrs, marqueColonne: "W WLOERINS" });
      return (srv?.source === "reponse_article" ? srv.marque : pf.marque) !== app;
    });
    ok(!ecarts.length, "même contrat que le filet serveur (marqueVintedSansQuestion, réponse de l'article)", ecarts);
  } else console.log("  · (filet serveur absent du dépôt : comparaison sautée)");
}

console.log("5. Le câblage :");
{
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/const comblerMarqueFiche = \(copies\) => comblerPoidsFiche\(sansMarqueDOffice\(\n\s*appliquerMarqueVintedArticle\(comblerMarquesVides\(copies, marqueDeLaFiche\(initialListing\)\)\.edited, initialListing\?\.attributs\)\.edited,\n\s*\{ fiche: initialListing, notesLens: initialListing\?\.notes \?\? null \},\n\s*\)\.edited\);/.test(lps),
    "comblerMarqueFiche : marque de la fiche, puis réponse de l'article, puis « Sans marque » d'office");
  ok(/useState\(\(\) => comblerMarqueFiche\(draft\?\.edited \?\? \{\}\)\)/.test(lps)
    && /setEdited\(comblerMarqueFiche\(f\.edited\)\)/.test(lps)
    && /Object\.assign\(initialEdited, comblerMarqueFiche\(initialEdited\)\)/.test(lps), "aux trois arrivées (brouillon, fiche rouverte, rédaction) — jamais pendant une frappe");
  ok(/RÈGLE DU 24\/09 REMPLACÉE LE 11\/10/.test(lps), "le commentaire du 24/09 dit la règle du 11/10");
  ok(/const partageEnQuestion = \(gp, sk\) => Boolean\(sk\)/.test(lps)
    && /if \(partageEnQuestion\(gp, genericFieldToSharedKey\(gp, a\.key\)\)\) continue;/.test(lps)
    && /if \(partageEnQuestion\("ebay", a\.sharedKey\)\) continue;/.test(lps), "télémétrie : l'aspect dont le champ partagé est déjà en question n'est pas journalisé (1 ligne = 1 affichage)");
  const regles = lire("src/publication/moteur/regles.js");
  ok(/if \(sk && sharedRendered\.has\(sk\) && \(SHARED_PROPAGATION\[sk\] \?\? \[\]\)\.includes\(gp\)/.test(regles), "… même règle que l'encart (questionsAPoser)");
  const stock = lire("src/tabs/StockTab.jsx");
  ok(/if \(!sansValeur && questionMarque && job\.platform === "vinted" && job\.inventaire_id != null\) \{\n\s*const marqueVinted = attributMarqueVinted\(\{ choix: v, demandee: marqueDemandee\(job, f\) \}\);/.test(stock), "StockTab : la réponse est rangée sur l'article (Vinted, question « marque hors catalogue »)");
  ok(/await supabase\.from\("inventaire"\)\.update\(\{ attributs: \{ marque_vinted: marqueVinted \} \}\)\.eq\("id", job\.inventaire_id\);/.test(stock), "… par le trigger de fusion (inventaire_attributs_fusion, rang « manuel »)");
  ok(/if \(!sansValeur && job\.inventaire_id != null && !questionMarque\) \{/.test(stock), "la MARQUE de la fiche n'est toujours pas réécrite par cette question");
  const listes = lire("src/publication/moteur/listes.js");
  ok(/REMPLACÉE LE 11\/10/.test(listes), "listes.js : la règle « dans le doute, on demande » dit son remplacement");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n} contrôles` : `\n✓ question « Marque » : ${n} contrôles verts — aucune marque → « Sans marque » sans question ; la réponse vaut pour l'article`);
process.exit(ko ? 1 : 0);
