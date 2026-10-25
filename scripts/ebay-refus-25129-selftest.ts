import assert from "node:assert/strict";
import { lireRefus25129, type ErreurEbay } from "../supabase/functions/_shared/ebay-publication.ts";

// Refus 25129 réels du 30/09 (patrick.giry07) : l'aspect est en « 3 », la
// valeur en « 4 », « 2 » vaut « 500 ».
const refus30_09 = (valeur: string): ErreurEbay => ({
  errorId: 25129,
  message: "The product aspects for this category no longer support custom values for Taille. Your listing was not published.",
  params: [
    { name: "0", value: "Saisissez une valeur valide pour Taille." },
    { name: "1", value: `${valeur} n'est pas une valeur valide pour Taille. Sélectionnez une valeur parmi les options disponibles.` },
    { name: "2", value: "500" },
    { name: "3", value: "Taille" },
    { name: "4", value: valeur },
  ],
});
const aspects = ["Marque", "Département", "Taille", "Couleur", "Type", "Style"];

for (const v of ["38", "17-1/2", "33/32"]) {
  assert.deepEqual(lireRefus25129(refus30_09(v), aspects), { nomAspect: "Taille", valeurRefusee: v }, `30/09 ${v}`);
}

// Format relevé le 06/09 (Adidas) : aspect en « 2 », valeur en « 3 ».
assert.deepEqual(
  lireRefus25129({ errorId: 25129, message: "", params: [{ name: "2", value: "Taille" }, { name: "3", value: "T-shirt" }] }, aspects),
  { nomAspect: "Taille", valeurRefusee: "T-shirt" },
);

// Aucun nom d'aspect reconnu → rien (le worker garde son rejeu unique puis le refus tel quel).
assert.deepEqual(lireRefus25129(refus30_09("38"), ["Marque"]), { nomAspect: "", valeurRefusee: "" });
// Catalogue illisible → rien.
assert.deepEqual(lireRefus25129(refus30_09("38"), []), { nomAspect: "", valeurRefusee: "" });
// Seul le message anglais nomme l'aspect.
assert.deepEqual(
  lireRefus25129({ errorId: 25129, message: "The product aspects for this category no longer support custom values for Taille. Your listing was not published.", params: [] }, aspects),
  { nomAspect: "Taille", valeurRefusee: "" },
);

console.log("OK — refus 25129 : aspect et valeur lus par leur sens (formats 06/09 et 30/09)");

// ═══════════════════════════════════════════════════════════════════════════
// (25/10, N5) LES REFUS 25129 QUI N'AURAIENT PAS DÛ PARTIR — la taille assemblée AVANT tout appel eBay
// ═══════════════════════════════════════════════════════════════════════════
// Jobs 98f71143, 1ff48d68, 8d831cf5, c65b3e36, 12854dbb (19/10 → 24/10) : ebayAspects.Taille portait la
// réponse de l'IA (« Classic Fit », « Col rond », « Jupe courte », « Veste de ski »), lue AVANT pf.taille et
// envoyée telle quelle (Taxonomy : FREE_TEXT) — refus 25129, puis question. Listes RÉELLES :
// scripts/fixtures/ebay-tailles-listes-2026-10-25.json. Ordre : la personne, la fiche, puis la liste.
{
  const { assemblerAspects, remplirAspects } = await import("../supabase/functions/_shared/ebay-publication.ts");
  const LISTES = JSON.parse(Deno.readTextFileSync(new URL("./fixtures/ebay-tailles-listes-2026-10-25.json", import.meta.url))).categories as Record<string, { mode: string; valeurs: string[] }>;
  const asp = (c: string, mode = "FREE_TEXT") => [{ name: "Taille", required: true, mode, allowedValues: LISTES[c].valeurs }];
  const taille = (pf: Record<string, unknown>, c: string, mode = "FREE_TEXT", textes: string[] = []) => {
    const r = assemblerAspects(pf as never, asp(c, mode) as never, textes);
    return { v: r.aspects["Taille"]?.[0] ?? null, manque: r.manquants.includes("Taille"), source: r.sources["Taille"] ?? null };
  };
  let n = 0;
  const vu = (c: boolean, quoi: string, detail: unknown = "") => { n++; assert.ok(c, `${quoi} ${detail ? JSON.stringify(detail) : ""}`); };
  for (const mode of ["FREE_TEXT", "SELECTION_ONLY"]) {
    // La fiche portait la bonne taille : elle part, sans 25129.
    const a = taille({ taille: "M", ebayAspects: { "Département": "Homme", Taille: "Classic Fit", Type: "Polo" } }, "185101", mode);
    vu(a.v === "M" && a.source === "standard", `98f71143 (${mode}) : « M » de la fiche, pas « Classic Fit »`, a);
    vu(taille({ taille: "M", ebayAspects: { Taille: "Col rond" } }, "11484", mode).v === "M", `1ff48d68 (${mode}) : « M », pas « Col rond »`);
    vu(taille({ taille: "S", ebayAspects: { "Département": "Femme", Taille: "Jupe courte" } }, "63864", mode).v === "S", `8d831cf5 (${mode}) : « S », pas « Jupe courte »`);
    // Fiche sans taille : la question, AVANT tout appel eBay (avant : « Veste de ski » envoyée, refus 25129).
    const c = taille({ taille: "", ebayAspects: { Taille: "Veste de ski" } }, "57988", mode);
    vu(c.v === null && c.manque, `c65b3e36 (${mode}) : « Veste de ski » jamais envoyée — manquant, la question part`, c);
  }
  // 12854dbb : « Unique » de la fiche, liste « Costumes » sans taille unique — la règle d'aujourd'hui.
  vu(taille({ taille: "Unique" }, "3001", "FREE_TEXT").v === "Unique", "12854dbb : la fiche hors liste en texte libre garde la règle d'aujourd'hui (envoyée telle quelle)");
  vu(taille({ taille: "Unique" }, "3001", "SELECTION_ONLY").manque, "12854dbb : liste fermée → manquant (la question)");
  vu(taille({ taille: "Unique", ebayAspects: { Taille: "48" }, needsUserResolved: { "ebayAspects.Taille": "48" } }, "3001", "SELECTION_ONLY").v === "48", "12854dbb : la réponse de la personne (« 48 ») passe devant la fiche");
  // L'ordre : la personne, la fiche, puis une autre valeur du job (IA, app) seulement si la liste l'écrit.
  vu(taille({ taille: "M", ebayAspects: { Taille: "L" }, needsUserResolved: { "ebayAspects.Taille": "L" } }, "11484").v === "L", "la personne (« L ») passe devant la fiche (« M »)");
  vu(taille({ taille: "M", ebayAspects: { Taille: "L" } }, "11484").v === "M", "la fiche (« M ») passe devant une valeur non tranchée (« L »)");
  vu(taille({ ebayAspects: { Taille: "L" } }, "11484").v === "L", "fiche vide : une valeur du job DANS la liste est retenue");
  vu(taille({ ebayAspects: { Taille: "XXL" } }, "11484").v === "2XL", "fiche vide : « XXL » → « 2XL » (règle des tailles)");
  vu(taille({ ebayAspects: { Taille: "Taille unique" } }, "57885", "FREE_TEXT", ["Gants de ski enfant noir"]).manque, "« Taille unique » que ni la fiche ni le texte ne disent : manquant");
  vu(taille({ ebayAspects: { Taille: "Taille unique" } }, "57885", "FREE_TEXT", ["Bonnet noir taille unique"]).v === "Taille unique", "« Taille unique » que le titre dit : retenue");
  // La fiche passe par la règle des tailles QUEL QUE SOIT LE MODE (avant : liste fermée seulement).
  vu(taille({ taille: "W28 L32", ebayAspects: { "Département": "Femme" } }, "11554", "FREE_TEXT").v === "38", "« W28 L32 » (fiche) → « 38 » en texte libre aussi");
  // « EU 39 » passe (rejeu du 01/10) : fiche ou personne hors liste, en texte libre.
  vu(taille({ taille: "EU 39" }, "11554", "FREE_TEXT").v === "EU 39", "fiche « EU 39 » hors liste en texte libre : envoyée telle quelle (comme hier)");
  vu(taille({ ebayAspects: { Taille: "EU 39" }, needsUserResolved: { "ebayAspects.Taille": "EU 39" } }, "11554", "FREE_TEXT").v === "EU 39", "réponse « EU 39 » de la personne en texte libre : telle quelle (comme hier)");
  vu(taille({ ebayAspects: { Taille: "EU 42" } }, "63861", "FREE_TEXT").v === "42", "une valeur non tranchée « EU 42 » : l'entrée « 42 » de la liste");
  vu(taille({ ebayAspects: { Taille: "Classic Fit" }, needsUserResolved: { "ebayAspects.Taille": "Classic Fit" } }, "185101", "FREE_TEXT").v === "Classic Fit", "la personne qui écrit hors liste en texte libre : la règle d'aujourd'hui");
  // Un aspect qui n'est pas une taille : inchangé.
  const autre = assemblerAspects({ ebayAspects: { "Type de taille": "Régulière" } } as never, [{ name: "Type de taille", required: true, mode: "FREE_TEXT", allowedValues: ["Normale", "Grande taille"] }] as never);
  vu(autre.aspects["Type de taille"]?.[0] === "Régulière", "« Type de taille » hors liste en texte libre : envoyé tel quel (inchangé)");

  // remplirAspects (voie API) : Anthropic simulé — jamais de 2e passe « libre » sur une taille.
  let appels = 0;
  const reponses: Array<Record<string, unknown>> = [];
  const fetchAvant = globalThis.fetch;
  globalThis.fetch = (async () => {
    appels++;
    return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify({ aspects: reponses.shift() ?? {} }) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200, headers: { "Content-Type": "application/json" } });
  }) as typeof fetch;
  try {
    reponses.push({ Taille: null }, { Taille: "Veste de ski" });
    const rem = await remplirAspects({ ebayAspects: {} } as never, asp("185079") as never, { titre: "Veste de ski Dare2B Morgane noir et vert" }, "test");
    vu(appels === 1 && rem.manquants.includes("Taille") && !rem.aspects["Taille"], "remplirAspects : une seule question à l'IA, la taille reste à demander (avec sa liste)", { appels, aspects: rem.aspects });
    appels = 0;
    const rem2 = await remplirAspects({ taille: "M", ebayAspects: { Taille: "Classic Fit" } } as never, asp("185101") as never, { titre: "Polo Ralph Lauren Classic Fit bleu ciel" }, "test");
    vu(appels === 0 && rem2.aspects["Taille"]?.[0] === "M" && !rem2.manquants.length, "remplirAspects : la taille de la fiche suffit, aucun appel IA", { appels, aspects: rem2.aspects });
    appels = 0;
    reponses.push({ Taille: "Veste de ski" });
    const rem3 = await remplirAspects({ ebayAspects: {} } as never, asp("185079") as never, { titre: "Veste de ski Dare2B" }, "test");
    vu(rem3.manquants.includes("Taille") && rem3.ia?.refuses.some((r) => r.name === "Taille" && r.motif === "taille hors de la liste eBay") === true, "remplirAspects : « Veste de ski » de l'IA refusée, motif tracé", rem3.ia);
  } finally {
    globalThis.fetch = fetchAvant;
  }
  // Le worker : la question d'une taille impose la liste (entière), le changement de rayon ne « lit » jamais une taille.
  const W = Deno.readTextFileSync(new URL("../supabase/functions/ebay-api-worker/index.ts", import.meta.url)).replace(/\r\n/g, "\n");
  vu(/const ferme = catAspect\?\.mode === "SELECTION_ONLY" \|\| \(estAspectDeTaille\(premier\) && nbListe > 0 && nbListe <= 200\);/.test(W), "worker : la question d'une taille est à liste fermée");
  vu(/if \(estAspectDeTaille\(a\.name\) && a\.allowedValues\.length\) \{\s*const entree = valeurDeListeCorrespondante\(v\.valeur, a\.allowedValues\);/.test(W), "worker (changement de rayon) : une taille = une entrée de la liste");
  // La réparation par le circuit (reviser_annonce, mode taille + aspect_en_ligne) : relue, sauvegardée, invertible.
  const rev = W.slice(W.indexOf("async function reviserAnnonce("), W.indexOf("// ── Le rayon d'un livre : la maison des livres"));
  vu(/const enLigne = typeof body\.aspect_en_ligne === "string" \? body\.aspect_en_ligne : null;/.test(rev)
    && /const lu = await lireAnnonceEntiere\(env, token, offerId, sku, listingId\);/.test(rev)
    && /String\(tailleLue\[0\]\) !== enLigne\) return laisser\("taille_en_ligne_differente"/.test(rev), "révision de taille : l'annonce relue en entier, la Taille en ligne attendue");
  vu(/if \(dryRun\) \{[\s\S]{0,200}sauvegarde: \{ offer_id: offerId, sku, offre: lu\.offre, article: lu\.article, browse: lu\.browse, empreinte \}/.test(rev)
    && /TABLE_SAUVEGARDE_RE\.test\(table\) \|\| String\(body\.empreinte_attendue \?\? ""\) !== empreinte/.test(rev), "révision de taille : sauvegarde rendue à blanc, écriture sous table et empreinte (inverse : restaurer)");
  console.log(`OK — (25/10, N5) la taille assemblée avant tout appel eBay : ${n} contrôles`);
}
