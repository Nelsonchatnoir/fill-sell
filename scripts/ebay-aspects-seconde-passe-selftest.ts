// ═══════════════════════════════════════════════════════════════════════════
// eBay — LA SECONDE PASSE DU FORMULAIRE — SELFTEST (10/10/2026, cas Manon)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qu'il garantit, sans réseau (Anthropic simulé —
// supabase/functions/_shared/ebay-aspects-ia.ts, completerAspectsIA) :
//   1. la PREMIÈRE passe est rendue telle quelle : rien de ce qu'elle pose
//      n'est retouché, et sans aspect FREE_TEXT resté vide il n'y a qu'UN
//      appel (comportement d'avant, au caractère près) ;
//   2. le cas Manon (63862 « Manteaux, vestes », polaire) : « Style » laissé
//      vide par la première passe est posé par la seconde (« Polaire », lu
//      dans le titre) ; « Type » déjà posé n'est pas redemandé ;
//   3. la seconde passe préfère la liste : une réponse qui en est une entrée
//      est recopiée TELLE QUE LA LISTE L'ÉCRIT ;
//   4. une réponse hors liste que le texte ne porte pas est REFUSÉE (motif
//      tracé) — la question part, jamais une valeur inventée ;
//   5. jamais de seconde passe sur un SELECTION_ONLY, ni sur la Marque, ni
//      sur un aspect à défaut fixe ;
//   6. valeurLueDansLeContexte : mots entiers, singulier/pluriel, accents et
//      casse ignorés ; « pull » n'est pas « pullover » ;
//   7. generate-listing n'appelle la seconde passe QUE pour l'encart eBay
//      (mode explicite) — le canal générique Vinted/Leboncoin/Beebs garde la
//      seule première passe ;
//   8. (25/10, N5) une TAILLE est une liste fermée : jamais de seconde passe,
//      les 24 « Taille » fausses de 30 jours (« Classic Fit », « Col rond »,
//      « Veste de ski »…) refusées sur la liste réelle de leur catégorie, la
//      question groupée et remplirAspects aussi ; « Taille unique » seulement
//      quand la fiche le dit.
//
//   deno run --allow-read scripts/ebay-aspects-seconde-passe-selftest.ts
import {
  completerAspectsIA, resoudreAspectsIA, valeurLueDansLeContexte,
} from "../supabase/functions/_shared/ebay-aspects-ia.ts";

let echecs = 0;
const ok = (cond: boolean, quoi: string, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};

// ── Anthropic simulé : chaque appel rend la réponse suivante de la file ────
let appels: string[] = [];
let file: Array<Record<string, unknown>> = [];
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  const corps = JSON.parse(String(init?.body ?? "{}"));
  appels.push(String(corps?.messages?.[0]?.content ?? ""));
  const reponse = file.shift() ?? {};
  return new Response(JSON.stringify({
    content: [{ type: "text", text: JSON.stringify({ aspects: reponse }) }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
const OPTS = { apiKey: "test" };
const rejouer = (reponses: Array<Record<string, unknown>>) => { appels = []; file = [...reponses]; };

// Les listes RÉELLES de la catégorie 63862 (ebay_item_aspects, relues le 10/10).
const TYPE_63862 = ["Blazer", "Cap", "Coatigan", "Gilet", "Manteau", "Poncho", "Veste"];
const STYLE_63862 = ["3 en 1", "Anorak", "Bermuda", "Bombers", "Caban", "College", "Coupe vent", "Doudoune",
  "Imperméable", "Kimono", "Manteau basique", "Matelassé", "Moto", "Pardessus", "Parka", "Trench", "Veste militaire"];
const DEPARTEMENT = ["Femme", "Homme", "Adolescents", "Bébé et tout-petit (unisexe)", "Garçon", "Fille", "Adulte unisexe"];
const demandes63862 = () => [
  { name: "Type", mode: "FREE_TEXT", allowedValues: TYPE_63862 },
  { name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63862 },
];
const POLAIRE = { titre: "Veste polaire Champion| Taille  femme L | Full zip | Couleur Rose/ Fushia", marque: "Champion", couleur: "Rose" };

console.log("\n1. La première passe est rendue telle quelle");
rejouer([{ Type: "Veste", Style: "Parka" }]);
{
  const r = await completerAspectsIA(demandes63862(), POLAIRE, OPTS);
  ok(appels.length === 1, "tout posé à la première passe → un seul appel", String(appels.length));
  ok(r.aspects.Type === "Veste" && r.aspects.Style === "Parka", "valeurs de la première passe inchangées", JSON.stringify(r.aspects));
  ok(r.seconde_passe.length === 0, "aucune seconde passe annoncée");
  rejouer([{ Type: "Veste", Style: "Parka" }]);
  const seule = await resoudreAspectsIA(demandes63862(), POLAIRE, OPTS);
  ok(JSON.stringify(seule.aspects) === JSON.stringify(r.aspects), "même résultat que resoudreAspectsIA seule");
}
rejouer([{ Type: "Veste", Style: "Polaire zippée" }]);
{
  const r = await completerAspectsIA(demandes63862(), POLAIRE, OPTS);
  ok(appels.length === 1 && r.aspects.Style === "Polaire zippée",
    "une valeur libre rendue par la PREMIÈRE passe n'est pas rejugée (comportement d'avant)", JSON.stringify(r.aspects));
}

console.log("\n2. Cas Manon : Style laissé vide → posé par la seconde passe");
rejouer([{ Type: "Veste", Style: null }, { Style: "Polaire" }]);
{
  const r = await completerAspectsIA(demandes63862(), POLAIRE, OPTS);
  ok(appels.length === 2, "deux appels (première passe, puis seconde)", String(appels.length));
  ok(r.aspects.Type === "Veste", "Type de la première passe gardé");
  ok(r.aspects.Style === "Polaire", "Style = « Polaire », lu dans le titre", JSON.stringify(r.aspects));
  ok(JSON.stringify(r.seconde_passe) === JSON.stringify(["Style"]), "seconde_passe = [Style]", JSON.stringify(r.seconde_passe));
  ok(!/"Type"/.test(appels[1]) && /"Style"/.test(appels[1]), "la seconde passe ne redemande QUE Style", appels[1]);
  ok(/RECOPIÉ du titre/.test(appels[1]), "la seconde passe demande le mot recopié du texte");
}
// « Pull polaire L.L.Bean » : Type ET Style vides à la première passe.
rejouer([{}, { Type: "Pull polaire" }, { Style: "Polaire" }]);
{
  const pull = { titre: "Pull polaire L.L.Bean | Taille M Femme | Couleur rouge | 1/4 zip", marque: "L.L. Bean" };
  const r = await completerAspectsIA(demandes63862(), pull, OPTS);
  ok(r.aspects.Type === "Pull polaire" && r.aspects.Style === "Polaire", "Pull polaire : Type et Style lus dans le titre", JSON.stringify(r.aspects));
  // (10/10 soir, rejeu réel) demandés ENSEMBLE, Style revenait vide : un appel par aspect.
  ok(appels.length === 3 && /"Type"/.test(appels[1]) && !/"Style"/.test(appels[1]) && /"Style"/.test(appels[2]) && !/"Type"/.test(appels[2]),
    "seconde passe : UN aspect par appel (Type, puis Style)", appels.length);
}

console.log("\n3. La seconde passe préfère la liste, écrite comme la liste l'écrit");
rejouer([{ Type: "Veste" }, { Style: "manteau BASIQUE" }]);
{
  const r = await completerAspectsIA(demandes63862(), { titre: "Manteau basique noir femme" }, OPTS);
  ok(r.aspects.Style === "Manteau basique", "« manteau BASIQUE » → « Manteau basique »", JSON.stringify(r.aspects));
}

console.log("\n4. Hors liste ET absent du texte : refusé, la question part");
rejouer([{ Type: "Veste" }, { Style: "Sportswear" }]);
{
  const r = await completerAspectsIA(demandes63862(), POLAIRE, OPTS);
  ok(!("Style" in r.aspects), "« Sportswear » (inventé) n'est pas posé", JSON.stringify(r.aspects));
  ok(r.refuses.some((x) => x.name === "Style" && /absent du texte/.test(x.motif)), "refus tracé avec son motif", JSON.stringify(r.refuses));
  ok(r.seconde_passe.length === 0, "rien d'annoncé en seconde passe");
}
rejouer([{ Type: "Veste" }, { Style: "null" }]);
{
  const r = await completerAspectsIA(demandes63862(), POLAIRE, OPTS);
  ok(!("Style" in r.aspects) && r.refuses.length === 0, "« null » de la seconde passe : rien posé, rien refusé");
}

console.log("\n5. Jamais de seconde passe sur SELECTION_ONLY, Marque, défaut fixe");
rejouer([{}]);
{
  const r = await completerAspectsIA([
    { name: "Département", mode: "SELECTION_ONLY", allowedValues: DEPARTEMENT },
    { name: "Marque", mode: "FREE_TEXT", allowedValues: [] },
  ], POLAIRE, OPTS);
  ok(appels.length === 1, "Département (SELECTION_ONLY) et Marque vides → aucune seconde passe", String(appels.length));
  ok(Object.keys(r.aspects).length === 0, "rien posé");
}
rejouer([{}]);
{
  const r = await completerAspectsIA([{ name: "Numéro de pièce fabricant", mode: "FREE_TEXT", allowedValues: [] }], POLAIRE, OPTS);
  ok(appels.length === 0 && r.aspects["Numéro de pièce fabricant"] === "Ne s'applique pas", "défaut fixe MPN : aucun appel, valeur standard");
}
rejouer([{ Type: null, Style: null }]);
{
  // Contexte vide : la première passe n'appelle pas l'IA — la seconde non plus.
  const r = await completerAspectsIA(demandes63862(), {}, OPTS);
  ok(appels.length === 0 && Object.keys(r.aspects).length === 0, "contexte vide : aucun appel");
}

console.log("\n6. valeurLueDansLeContexte");
ok(valeurLueDansLeContexte("Polaire", "Veste polaire Champion | Full zip"), "« Polaire » lu dans « Veste polaire »");
ok(valeurLueDansLeContexte("Polaires", "Veste polaire"), "pluriel → singulier");
ok(valeurLueDansLeContexte("Pull polaire", "PULL POLAIRE L.L.Bean"), "casse ignorée");
ok(valeurLueDansLeContexte("Imperméable", "veste impermeable"), "accents ignorés");
ok(!valeurLueDansLeContexte("Pull", "Pullover Ralph Lauren"), "« pull » n'est pas « pullover »");
ok(!valeurLueDansLeContexte("Manteau basique", "Veste polaire Champion"), "« Manteau basique » absent du texte");
ok(!valeurLueDansLeContexte("Smart casual", "Blazer Zara bleu marine"), "valeur inventée refusée");
ok(!valeurLueDansLeContexte("", "Veste polaire"), "valeur vide jamais lue");
ok(!valeurLueDansLeContexte("de la", "Veste de la marque"), "mots vides seuls jamais lus");
ok(valeurLueDansLeContexte("Gilet", "Gilet GAP | Couleur noir | Taille M"), "« Gilet » lu dans le titre du gilet GAP");

console.log("\n7. generate-listing : la seconde passe pour l'encart eBay seulement");
{
  const src = await Deno.readTextFile(new URL("../supabase/functions/generate-listing/index.ts", import.meta.url));
  // (18/10, lot 2) Le BLOC resolve_aspects (le plafond IA nomme aussi body.resolve_aspects plus haut).
  const debutBloc = src.search(/if \(body\.resolve_aspects === true\) \{\r?\n/);
  const bloc = src.slice(debutBloc, debutBloc + 9000);
  ok(/import \{[^}]*completerAspectsIA[^}]*\} from "\.\.\/_shared\/ebay-aspects-ia\.ts"/.test(src), "completerAspectsIA importée");
  ok(/modeEbayExplicite = askAI\.some\(/.test(bloc), "mode explicite détecté sur la demande");
  ok(/if \(!modeEbayExplicite\) \{\s*const ia = await resoudreAspectsIA\(/.test(bloc), "sans mode explicite : première passe seule, comme avant");
  ok(/await completerAspectsIA\(demandes, contexteIa, optsIa\)/.test(bloc), "avec mode explicite : completerAspectsIA");
  ok(/feature: "ebay_aspects_ia"/.test(bloc), "mesure journalisée (usage_logs ebay_aspects_ia)");
}

// ═══════════════════════════════════════════════════════════════════════════
// 8. (25/10, N5) UNE TAILLE EST UNE LISTE FERMÉE — LES 24 « TAILLE » FAUSSES DE 30 JOURS
// ═══════════════════════════════════════════════════════════════════════════
// usage_logs ebay_aspects_ia du 11/10 au 24/10 : 24 « Taille » posées par la seconde passe, toutes hors de la
// liste eBay de leur catégorie (listes RÉELLES : scripts/fixtures/ebay-tailles-listes-2026-10-25.json). Titre :
// celui de l'article dans l'inventaire (relu le 25/10) ; absent, le mot de l'IA lui-même (le pire cas : il
// se « lit » dans le texte).
console.log("\n8. (25/10, N5) Une taille : liste fermée, jamais de seconde passe — les 24 valeurs fausses");
{
  const { estAspectDeTaille, tailleRetenueDansLaListe, completerAspectsIAGroupe } = await import("../supabase/functions/_shared/ebay-aspects-ia.ts");
  const LISTES = JSON.parse(await Deno.readTextFile(new URL("./fixtures/ebay-tailles-listes-2026-10-25.json", import.meta.url))).categories as Record<string, { mode: string; valeurs: string[] }>;
  const CORPUS: Array<[string, string | null, string]> = [
    ["57885", "Gants de ski enfant noir", "Gants de ski enfant"],
    ["63866", "Cardigan blanc tricot fin manches longues", "Cardigan blanc tricot fin manches longues"],
    ["63863", "Jean noir large femme coupe droite", "Jean noir large coupe droite"],
    ["57988", "Veste coupe-vent Tommy Hillfiger bleu marine blanc rouge homme", "Veste de sport"],
    ["57989", null, "Relaxed fit"],
    ["53159", "Chemise rose à rayures blanches", "Manches longues, coupe ajustée"],
    ["11484", "Pull col V noir", "col V"],
    ["63866", "Pull", "Pull col rond manches longues"],
    ["63866", "Pull", "Pull col rond manches longues"],
    ["11484", "Pull motif géométrique gris bleu - taille petit : voir mesures sur photo", "Pull"],
    ["11484", "Pull col rond bleu marine", "Col rond"],
    ["63866", "Pull sans manches col roulé gris clair avec boutons", "Pull sans manches col roulé"],
    ["11484", "Pull col V coton beige", "Pull col V"],
    ["185101", "Polo Ralph Lauren Classic Fit bleu ciel manches courtes", "Classic Fit"],
    ["11484", "Pull Weird Fish bleu turquoise tricot gaufré col rond", "Col rond"],
    ["63864", "Jupe & Other Stories velours bordeaux boutons Paris Atelier", "Jupe courte"],
    ["185079", "Veste de ski Dare2B Morgane noir et vert", "Veste de ski"],
    ["57988", null, "Coupe-vent"],
    ["185702", "Veste Adidas Originals 3 Stripes noire avec bandes latérales", "Veste de survêtement"],
    ["63866", null, "Pull vintage en lin"],
    ["57988", "Parka noire homme", "Parka"],
    ["185708", "Ensemble football Buriram United rose et noir", "Ensemble football"],
    ["57988", "Veste de ski O'Neill Firewall blanc et rouge", "Veste de ski"],
    ["53159", "Chemise Sandro blanche manches longues", "Manches longues"],
  ];
  ok(CORPUS.length === 24 && CORPUS.every(([c]) => LISTES[c]?.valeurs?.length > 0), "24 valeurs, chacune avec la liste réelle de sa catégorie");
  const taille = (c: string) => ({ name: "Taille", mode: LISTES[c].mode, allowedValues: LISTES[c].valeurs });
  let secondesAppels = 0, posees = 0, refuseesPremiere = 0;
  for (const [c, titre, mot] of CORPUS) {
    const ctx = { titre: titre ?? mot };
    // a) la première passe ne trouve rien : AUCUNE seconde passe (avant le 25/10 : le mot était posé).
    rejouer([{ Taille: null }, { Taille: mot }]);
    const r = await completerAspectsIA([taille(c)], ctx, OPTS);
    if (appels.length !== 1) secondesAppels++;
    if (r.aspects.Taille) posees++;
    // b) la première passe rend le mot : refusé, motif tracé.
    rejouer([{ Taille: mot }]);
    const r1 = await resoudreAspectsIA([taille(c)], ctx, OPTS);
    if (!r1.aspects.Taille && r1.refuses.some((x) => x.name === "Taille" && x.motif === "taille hors de la liste eBay")) refuseesPremiere++;
  }
  ok(secondesAppels === 0, "aucune seconde passe sur une taille (24/24)", `${secondesAppels} seconde(s) passe(s)`);
  ok(posees === 0, "aucune des 24 valeurs n'est posée", `${posees} posée(s)`);
  ok(refuseesPremiere === 24, "rendues par la première passe : 24 refusées, motif « taille hors de la liste eBay »", `${refuseesPremiere}/24`);
  // c) la question groupée (interrupteur ia_aspects_groupes) : même verdict.
  let groupeesPosees = 0;
  for (const [c, titre, mot] of CORPUS) {
    rejouer([{ Taille: mot }]);
    const g = await completerAspectsIAGroupe([taille(c)], { titre: titre ?? mot }, OPTS);
    if (g.aspects.Taille || g.seconde_passe.includes("Taille")) groupeesPosees++;
  }
  ok(groupeesPosees === 0, "question groupée : aucune des 24 posée", `${groupeesPosees} posée(s)`);
  // d) ce qui reste juste : une entrée de la liste, la règle des tailles, la taille unique écrite.
  const L11484 = LISTES["11484"].valeurs;
  rejouer([{ Taille: "M" }]);
  ok((await completerAspectsIA([taille("11484")], { titre: "Pull col rond bleu marine taille M" }, OPTS)).aspects.Taille === "M", "« M » (dans la liste) : posé");
  rejouer([{ Taille: "XXL" }]);
  ok((await resoudreAspectsIA([taille("11484")], { titre: "Pull XXL" }, OPTS)).aspects.Taille === "2XL", "« XXL » → « 2XL » (règle des tailles)");
  rejouer([{ Taille: "Taille unique" }]);
  const tu = await resoudreAspectsIA([taille("57885")], { titre: "Gants de ski enfant noir" }, OPTS);
  ok(!tu.aspects.Taille && tu.refuses.some((x) => /Taille unique/.test(x.motif)), "« Taille unique » que la fiche ne dit pas : refusée", JSON.stringify(tu));
  rejouer([{ Taille: "Taille unique" }]);
  ok((await resoudreAspectsIA([taille("57885")], { titre: "Bonnet noir taille unique" }, OPTS)).aspects.Taille === "Taille unique", "« Taille unique » que le titre dit : posée");
  ok("valeur" in tailleRetenueDansLaListe("Taille", "Taille unique", L11484, { taille: "Unique" }), "« Taille unique » quand la fiche dit « Unique » : retenue");
  ok(!("valeur" in tailleRetenueDansLaListe("Taille", "Taille unique", L11484, { taille: "M" })), "« Taille unique » quand la fiche dit « M » : refusée");
  ok((tailleRetenueDansLaListe("Taille", "EU 42", LISTES["63861"].valeurs) as { valeur?: string }).valeur === "42", "« EU 42 » → « 42 » (préfixe que la liste n'écrit pas, règle du 01/10)");
  // e) la consigne : liste fermée, jamais sans sa liste.
  rejouer([{}]);
  await resoudreAspectsIA([taille("185101")], { titre: "Polo Ralph Lauren Classic Fit" }, OPTS);
  ok(/"Taille" — LISTE FERMÉE \(une TAILLE\)/.test(appels[0] ?? "") && /« Classic Fit », « Col rond », « Parka » ne sont pas des tailles/.test(appels[0] ?? ""), "la question dit : liste fermée, une taille, jamais un autre mot du titre", appels[0]);
  rejouer([{ Taille: "M" }]);
  const sansListe = await resoudreAspectsIA([{ name: "Taille", mode: "FREE_TEXT", allowedValues: [] }], { titre: "Pull taille M" }, OPTS);
  ok(appels.length === 0 && !sansListe.aspects.Taille, "une taille sans sa liste n'est pas demandée (rien ne jugerait la réponse)");
  // f) le nom EXACT : « Type de taille », « Tour de taille », « Taille d'écran » ne sont pas des tailles.
  ok(["Taille", "Pointure", "Pointure EU", "Pointure UK", "Pointure US", "Pointure AU"].every(estAspectDeTaille), "Taille, Pointure, Pointure EU/UK/US/AU : des tailles");
  ok(!["Type de taille", "Tour de taille", "Taille d'écran", "Taille (cm)", "Taille du chien", "taille", "Pointure FR"].some(estAspectDeTaille), "Type de taille, Tour de taille, Taille d'écran… : jamais");
  rejouer([{ Style: null }, { Style: "Polaire" }]);
  ok((await completerAspectsIA([{ name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63862 }], POLAIRE, OPTS)).aspects.Style === "Polaire", "un aspect qui n'est pas une taille garde sa seconde passe (cas Manon)");
  // La voie API (assemblerAspects, remplirAspects) : scripts/ebay-refus-25129-selftest.ts (réseau et env simulés).
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ seconde passe eBay : tout est vert");
if (echecs) Deno.exit(1);
