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
//      seule première passe.
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
  ok(/terme EXACT/.test(appels[1]), "la seconde passe demande le terme exact du contexte");
}
// « Pull polaire L.L.Bean » : Type ET Style vides à la première passe.
rejouer([{}, { Type: "Pull polaire", Style: "Polaire" }]);
{
  const pull = { titre: "Pull polaire L.L.Bean | Taille M Femme | Couleur rouge | 1/4 zip", marque: "L.L. Bean" };
  const r = await completerAspectsIA(demandes63862(), pull, OPTS);
  ok(r.aspects.Type === "Pull polaire" && r.aspects.Style === "Polaire", "Pull polaire : Type et Style lus dans le titre", JSON.stringify(r.aspects));
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
  const bloc = src.slice(src.indexOf("body.resolve_aspects === true"), src.indexOf("body.resolve_aspects === true") + 9000);
  ok(/import \{[^}]*completerAspectsIA[^}]*\} from "\.\.\/_shared\/ebay-aspects-ia\.ts"/.test(src), "completerAspectsIA importée");
  ok(/modeEbayExplicite = askAI\.some\(/.test(bloc), "mode explicite détecté sur la demande");
  ok(/if \(!modeEbayExplicite\) \{\s*const ia = await resoudreAspectsIA\(/.test(bloc), "sans mode explicite : première passe seule, comme avant");
  ok(/await completerAspectsIA\(demandes, contexteIa, optsIa\)/.test(bloc), "avec mode explicite : completerAspectsIA");
  ok(/feature: "ebay_aspects_ia"/.test(bloc), "mesure journalisée (usage_logs ebay_aspects_ia)");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ seconde passe eBay : tout est vert");
if (echecs) Deno.exit(1);
