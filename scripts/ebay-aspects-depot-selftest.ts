// ═══════════════════════════════════════════════════════════════════════════
// eBay (VOIE EXTENSION) — UN ASPECT OBLIGATOIRE VIDE AU DÉPÔT SE DÉDUIT AVANT
// D'ÊTRE DEMANDÉ — SELFTEST « VERROU » (16/11/2026, lot du matin, point 1)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur : lizzaa (d5531b8e), lot eBay du 15/11 23:07, 7 jobs en
// « À compléter » pour « Type », « Type, Couleur » (verres, rayon 259119) et
// « Département » (montre à gousset, 3937) — alors que le titre donne
// « Verre à shot » et « Transparent ». Rouge sur le code d'avant (le module
// _shared/ebay-aspects-depot.ts n'existait pas, update-job-status ne déduisait
// rien), vert après. Sans réseau : Anthropic simulé.
//   deno run --allow-read scripts/ebay-aspects-depot-selftest.ts
let echecs = 0;
const ok = (cond: boolean, quoi: string, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};

let mod: typeof import("../supabase/functions/_shared/ebay-aspects-depot.ts") | null = null;
try {
  mod = await import("../supabase/functions/_shared/ebay-aspects-depot.ts");
} catch (e) {
  ok(false, "le module _shared/ebay-aspects-depot.ts existe", String((e as Error)?.message ?? e).slice(0, 160));
}

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
const rejouer = (reponses: Array<Record<string, unknown>>) => { appels = []; file = [...reponses]; };

// Listes RÉELLES (ebay_item_aspects, relues le 16/11).
const TYPE_259119 = ["Bol à punch", "Carafe", "Chope à bière", "Coupe", "Gobelet", "Mug", "Pichet", "Verre à bière", "Verre à cocktail",
  "Verre à shot", "Verre à vin blanc", "Verre à vin rouge", "Verre à vin sans pied", "Verre de whisky", "Verre sans pied", "Verre tulipe"];
const COULEUR = ["Argenté", "Beige", "Blanc", "Bleu", "Doré", "Gris", "Jaune", "Marron", "Multicouleur", "Noir", "Orange", "Rose", "Rouge", "Transparent", "Vert", "Violet"];
const CAT_259119 = [
  { name: "Type", required: true, mode: "FREE_TEXT", allowedValues: TYPE_259119 },
  { name: "Marque", required: true, mode: "FREE_TEXT", allowedValues: ["- Sans marque/Générique -", "Absolut"] },
  { name: "Couleur", required: true, mode: "FREE_TEXT", allowedValues: COULEUR },
];
const CAT_3937 = [
  { name: "Type", required: true, mode: "FREE_TEXT", allowedValues: ["Montre de poche"] },
  { name: "Marque", required: true, mode: "FREE_TEXT", allowedValues: ["- Sans marque/Générique -"] },
  { name: "Département", required: true, mode: "FREE_TEXT", allowedValues: ["Homme", "Femme", "Garçon", "Fille", "Adolescents", "Adulte unisexe", "Enfant unisexe"] },
];
// Messages RÉELS de l'extension (jobs 36d050fe et bf38369d, 15/11 23:08).
const BRUT_SHOT = "LIVE : aspect(s) obligatoire(s) eBay vide(s) sur le formulaire : Type, Couleur — publication NON tentée (refus eBay garanti). Compléter le champ dans l'app (badge « À compléter » du Stock) ; le job repartira ensuite automatiquement. Détail du remplissage : marque: …";
const BRUT_GOUSSET = "LIVE : aspect(s) obligatoire(s) eBay vide(s) sur le formulaire : Département — publication NON tentée (refus eBay garanti). Compléter le champ dans l'app";
const nuf = (k: string) => ({ platform: "ebay", field_key: k, field_label: k, target: { root: "ebayAspects", key: k } });
const PF_SHOT = { marque: "Sans marque", couleur: "", colors: [], genre: "", ebayCategoryId: "259119", needsUserField: nuf("Type"), ebayAspects: {} };
const JOB_SHOT = { platform: "ebay", voie: "extension", title: "Set de verres à shot vintage", description: "Set de 6 verres à shot en verre transparent, vintage, bon état." };

if (mod) {
  const { aspectsSignalesVides, refusAspectsDepot, completerAspectsAuDepot, contexteDuJobDepot, messageAspectsRestants, MARQUE_ASPECTS_DEPOT } = mod;

  console.log("\n1. Les aspects signalés vides par l'extension (message réel)");
  ok(JSON.stringify(aspectsSignalesVides(BRUT_SHOT, PF_SHOT)) === JSON.stringify(["Type", "Couleur"]), "« Type, Couleur » lus, sans doublon avec needsUserField", JSON.stringify(aspectsSignalesVides(BRUT_SHOT, PF_SHOT)));
  ok(JSON.stringify(aspectsSignalesVides(BRUT_GOUSSET, { needsUserField: nuf("Département") })) === JSON.stringify(["Département"]), "« Département » lu");
  ok(!aspectsSignalesVides("… sur le formulaire : Marque, Type — publication NON tentée", { needsUserField: nuf("Marque") }).includes("Marque"), "la Marque n'en fait jamais partie (sa règle)");
  ok(aspectsSignalesVides("Élément introuvable", { needsUserField: { platform: "vinted", field_key: "Taille" } }).length === 0, "rien hors eBay");

  console.log("\n2. Qui reçoit la règle");
  ok(refusAspectsDepot(JOB_SHOT, PF_SHOT, ["Type", "Couleur"]) === null, "voie extension, rayon connu → la règle s'applique");
  ok(refusAspectsDepot({ ...JOB_SHOT, voie: "api" }, PF_SHOT, ["Type"]) === "voie_api", "voie API : elle a déjà sa règle (ebay-api-worker)");
  ok(refusAspectsDepot({ ...JOB_SHOT, platform: "vinted" }, PF_SHOT, ["Type"]) === "pas_ebay", "jamais hors eBay");
  ok(refusAspectsDepot(JOB_SHOT, { ...PF_SHOT, ebayCategoryId: "" }, ["Type"]) === "rayon_inconnu", "rayon inconnu → rien");
  ok(refusAspectsDepot(JOB_SHOT, { ...PF_SHOT, [MARQUE_ASPECTS_DEPOT]: { categorie: "259119" } }, ["Type"]) === "deja_fait_pour_ce_rayon", "une fois par job ET par rayon (jamais de boucle)");
  ok(refusAspectsDepot(JOB_SHOT, { ...PF_SHOT, [MARQUE_ASPECTS_DEPOT]: { categorie: "20696" } }, ["Type"]) === null, "rayon changé → la règle repart pour le nouveau rayon");

  console.log("\n3. Lizzaa, verres à shot : Type et Couleur déduits → le job repart (règle réelle remplirAspects, IA simulée)");
  rejouer([{ Type: "Verre à shot", Couleur: "Transparent" }]);
  {
    const r = await completerAspectsAuDepot({ pf: PF_SHOT, catalogue: CAT_259119, signales: ["Type", "Couleur"], contexte: contexteDuJobDepot(JOB_SHOT, PF_SHOT), apiKey: "test" });
    ok(r.poses.Type === "Verre à shot" && r.poses.Couleur === "Transparent", "Type « Verre à shot », Couleur « Transparent »", JSON.stringify(r.poses));
    ok(r.restants.length === 0, "rien ne reste à demander", JSON.stringify(r.restants));
    ok(appels.length >= 1 && appels[0].includes("Set de verres à shot"), "l'IA a reçu le titre de l'article");
    ok(!appels.some((a) => /Absolut/.test(a)), "la liste des marques n'est jamais donnée à l'IA (doctrine marques fantômes)");
  }

  console.log("\n4. Jamais par-dessus une valeur du job");
  rejouer([{ Type: "Mug", Couleur: "Bleu" }]);
  {
    const pf = { ...PF_SHOT, ebayAspects: { Type: "Verre tulipe" } };
    const r = await completerAspectsAuDepot({ pf, catalogue: CAT_259119, signales: ["Type", "Couleur"], contexte: contexteDuJobDepot(JOB_SHOT, pf), apiKey: "test" });
    ok(r.poses.Type === undefined, "« Type » déjà sur le job (refusé par le formulaire) : non recouvert", JSON.stringify(r.poses));
    ok(r.restants.includes("Type"), "il reste à demander, tel quel");
  }

  console.log("\n5. Rien de déductible → la question reste (jamais une valeur inventée)");
  rejouer([{}]);
  {
    const pf = { ...PF_SHOT, needsUserField: nuf("Département"), ebayCategoryId: "3937" };
    const job = { ...JOB_SHOT, title: "Montre à gousset en métal doré.", description: "Montre à gousset, mécanisme à remonter." };
    const r = await completerAspectsAuDepot({ pf, catalogue: CAT_3937, signales: ["Département"], contexte: contexteDuJobDepot(job, pf), apiKey: "test" });
    ok(Object.keys(r.poses).length === 0 && r.restants[0] === "Département", "Département non déduit : il reste demandé", JSON.stringify(r));
    const msg = messageAspectsRestants(["Département"], {});
    ok(/Département/.test(msg) && !/LIVE|NON tentée|ebayAspects/.test(msg), "le message nomme le champ, sans vocabulaire de développeur", msg);
  }

  console.log("\n6. Le genre de la fiche donne le Département sans IA (règle de la voie API)");
  rejouer([]);
  {
    const pf = { ...PF_SHOT, genre: "Homme", needsUserField: nuf("Département"), ebayCategoryId: "3937" };
    const r = await completerAspectsAuDepot({ pf, catalogue: CAT_3937, signales: ["Département"], contexte: contexteDuJobDepot(JOB_SHOT, pf), apiKey: "" });
    ok(r.poses["Département"] === "Homme" && r.sources["Département"] === "genre", "genre Homme → Département « Homme »", JSON.stringify(r));
  }

  console.log("\n7. Un aspect exigé par le FORMULAIRE mais absent du référentiel est demandé quand même (texte libre)");
  rejouer([{ Hauteur: "12 cm" }]);
  {
    const job = { ...JOB_SHOT, title: "Verre à shot hauteur 12 cm", description: "Hauteur : 12 cm." };
    const r = await completerAspectsAuDepot({ pf: PF_SHOT, catalogue: CAT_259119, signales: ["Hauteur"], contexte: contexteDuJobDepot(job, PF_SHOT), apiKey: "test" });
    ok(r.poses.Hauteur === "12 cm", "Hauteur « 12 cm » (lue dans le texte)", JSON.stringify(r));
  }
}

console.log("\n8. update-job-status applique la règle (câblage)");
{
  const src = await Deno.readTextFile(new URL("../supabase/functions/update-job-status/index.ts", import.meta.url));
  ok(/from "\.\.\/_shared\/ebay-aspects-depot\.ts"/.test(src), "update-job-status importe _shared/ebay-aspects-depot.ts");
  ok(/completerAspectsAuDepot\(\{/.test(src), "update-job-status appelle completerAspectsAuDepot");
  ok(/if \(pfAspectsDepot\) patch\.platform_fields = pfAspectsDepot;/.test(src), "le résultat part dans le patch du job");
  ok(/erreurEffaceeParAspectsDepot\)/.test(src), "tout déduit → l'erreur est effacée (le job repart sans message)");
  const i = src.indexOf("let pfAspectsDepot");
  const j = src.indexOf("let pfMarqueGenerique");
  ok(i > j && j > 0, "la règle passe APRÈS la Marque (sa règle à elle d'abord)");
}

console.log("\n9. (1.3) « Montant de refus automatique » : les offres du compte, nommées dès le premier refus (jamais cinq essais à l'aveugle)");
{
  const { classerEchec } = await import("../supabase/functions/_shared/pas-de-rouge.js");
  // Texte RÉEL du job adb7cfe5 (lizzaa, « Assiette vintage (1960-70) », 1,20 €).
  const brut = "Publication eBay bloquée : le clic « Mettre en vente » n'a produit aucune requête, et la soumission directe du brouillon a été REFUSÉE par eBay — éléments manquants dans le brouillon : Montant de refus automatique. Aucune annonce n'a été créée. Le brouillon est conservé dans « Vendre > Brouillons » sur ebay.fr.";
  const pf = { ebay_api_publish: { manquants: ["Montant de refus automatique"] } };
  // deno-lint-ignore no-explicit-any
  const r = classerEchec({ platform: "ebay", action: "publish", brut, reecrit: "", essais: 0, reprises: 0, pf } as any) as any;
  ok(r.statut === "needs_user" && r.motif === "ebay_offres_compte" && !r.dansMinutes, "needs_user, motif ebay_offres_compte, aucune reprise", JSON.stringify({ s: r.statut, m: r.motif, d: r.dansMinutes }));
  ok(/« Montant de refus automatique »/.test(r.message) && /préférences/.test(r.message) && !/On ne sait pas/.test(r.message), "le manquant et son origine sont nommés", String(r.message));
  ok(/ne le règle jamais à ta place/.test(r.message), "FillSell ne fixe jamais ce montant à la place de la personne");
  // deno-lint-ignore no-explicit-any
  const ret = classerEchec({ platform: "ebay", action: "publish", brut: "… éléments manquants dans le brouillon : Conditions des retours nationaux.", reecrit: "", essais: 0, reprises: 0, pf: {} } as any) as any;
  ok(ret.motif !== "ebay_offres_compte", "les retours gardent leur règle (non-régression)", String(ret.motif));
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) Deno.exit(1);
