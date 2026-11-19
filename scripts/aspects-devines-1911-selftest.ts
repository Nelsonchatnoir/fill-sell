// ═══════════════════════════════════════════════════════════════════════════
// « ZÉRO FRICTION » — CE QUI SE DEVINE EST REMPLI, DANS LA LISTE, MARQUÉ « DEVINÉ » — VERROU (19/11/2026 soir)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico (19/11) : tout ce qui se devine est rempli, avec la valeur la plus probable de la LISTE de la
// plateforme, marquée « devinée » ; on ne demande que l'impossible ; jamais une information fausse.
// Cas (compte de Nico, lot du 19/11 13:25, usage_logs ebay_aspects_ia / champ_requis_bloquant) :
//   · veste polaire (photo) titrée « Veste noir et gris », 63862 : « Matière doublure externe » demandée (le texte
//     n'en dit rien ; la liste eBay de 101 matières n'était pas envoyée), « Style » posé à « Veste noir et gris »
//     (le titre recopié : FAUX) ;
//   · 30 jours : 41 copies eBay parties avec une « Matière doublure externe » hors liste (« bordeaux », « noire »,
//     « Coupe-vent », « Épaisse », « Doublure chaude »…) — des valeurs fausses ;
//   · « Pour qui ? » (Vinted) demandé pour des boutons de manchette ;
//   · un titre qui ne nomme aucun produit : l'objet n'était jamais demandé aux photos.
// Ce que ce verrou garantit (Anthropic simulé, aucun réseau) :
//   A. une MATIÈRE à liste connue est une liste fermée pour l'IA (première passe, groupée) : « Gris » refusé ;
//   B. la seconde passe ne pose jamais une matière, ni une valeur qui porte une couleur (« Veste noir et gris ») ;
//   C. la passe « devinée » (_shared/aspect-devine.ts) : une entrée de la liste seulement, jamais « Autre », jamais
//      un aspect d'identité, de taille, de mesure, d'âge, d'état ; les photos jointes ; la trace « devinees » ;
//   D. l'objet nommé par les photos (_shared/objet-par-les-photos.ts) quand le texte n'en nomme aucun ;
//   E. la voie API (remplirAspects) devine aussi ce qui reste vide ;
//   F. generate-listing branche les trois (eBay, canal générique, objet).
//
//   deno run --allow-read --allow-env scripts/aspects-devines-1911-selftest.ts
let echecs = 0;
const ok = (cond: boolean, quoi: string, detail = "") => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}${cond || !detail ? "" : `   ← ${detail}`}`);
  if (!cond) echecs++;
};

// ── Anthropic simulé : la réponse dépend de la consigne (devinée / seconde passe / première passe / objet) ──
type Repondeur = (systeme: string, message: string, corps: Record<string, unknown>) => Record<string, unknown>;
let appels: Array<{ systeme: string; message: string; corps: Record<string, unknown> }> = [];
let repondre: Repondeur = () => ({});
globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
  const corps = JSON.parse(String(init?.body ?? "{}"));
  const contenu = corps?.messages?.[0]?.content;
  const message = typeof contenu === "string" ? contenu : JSON.stringify(contenu);
  const systeme = String(corps?.system ?? "");
  appels.push({ systeme, message, corps });
  const reponse = repondre(systeme, message, corps);
  return new Response(JSON.stringify({
    content: [{ type: "text", text: JSON.stringify(reponse) }],
    usage: { input_tokens: 10, output_tokens: 5 },
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}) as typeof fetch;
const OPTS = { apiKey: "test" };
const estDevinee = (s: string) => /PLUS PROBABLE/.test(s);

// Listes RÉELLES (ebay_item_aspects, relues le 19/11).
const MATIERE_63862 = ["100% cachemire", "100 % laine", "100 % soie", "Acétate", "Acier inoxydable", "Acrylique", "Alpaga", "Coton",
  "Coton mixte", "Cuir", "Daim", "Élasthanne", "Fausse fourrure", "Laine", "Lin", "Nylon", "Polyamide", "Polyester", "Soie", "Viscose"];
const STYLE_63862 = ["3 en 1", "Anorak", "Bermuda", "Bombers", "Caban", "College", "Coupe vent", "Doudoune", "Imperméable",
  "Kimono", "Manteau basique", "Matelassé", "Moto", "Pardessus", "Parka", "Trench", "Veste militaire"];
const TYPE_63862 = ["Blazer", "Cap", "Coatigan", "Gilet", "Manteau", "Poncho", "Veste"];
const DEPARTEMENT = ["Femme", "Homme", "Adolescents", "Bébé et tout-petit (unisexe)", "Garçon", "Fille", "Adulte unisexe"];
const VESTE = { titre: "TEST FillSell 31/10 lot H — Veste noir et gris taille M — ne pas acheter", description: "Annonce de test FillSell.", couleur: "Noir", genre: "Homme" };

const IA = await import("../supabase/functions/_shared/ebay-aspects-ia.ts");

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nA. Une matière à liste connue : liste fermée pour l'IA");
{
  appels = []; repondre = () => ({ aspects: { "Matière doublure externe": "Gris" } });
  const r = await IA.resoudreAspectsIA([{ name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: MATIERE_63862 }], VESTE, OPTS);
  ok(!r.aspects["Matière doublure externe"], "« Gris » (une couleur) n'est jamais une matière", JSON.stringify(r.aspects));
  ok(r.refuses.some((x) => x.name === "Matière doublure externe"), "refus tracé", JSON.stringify(r.refuses));
  ok(/LISTE FERMÉE/.test(appels[0]?.message ?? "") && /Polyester/.test(appels[0]?.message ?? ""), "la liste est donnée comme liste fermée", (appels[0]?.message ?? "").slice(0, 200));
  appels = []; repondre = () => ({ aspects: { "Matière doublure externe": "polyester" } });
  const r2 = await IA.resoudreAspectsIA([{ name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: MATIERE_63862 }], VESTE, OPTS);
  ok(r2.aspects["Matière doublure externe"] === "Polyester", "une entrée de la liste est recopiée telle que la liste l'écrit", JSON.stringify(r2.aspects));
  appels = []; repondre = () => ({ aspects: { "Matière": "Coton bio" } });
  const r3 = await IA.resoudreAspectsIA([{ name: "Matière", mode: "FREE_TEXT", allowedValues: [] }], { titre: "Housse coussin coton bio" }, OPTS);
  ok(r3.aspects["Matière"] === "Coton bio", "sans liste (Beebs, Leboncoin : vocabulaire ouvert) : comportement d'avant", JSON.stringify(r3.aspects));
  appels = []; repondre = () => ({ aspects: { "Matière doublure externe": "Polaire" } });
  const g = await IA.completerAspectsIAGroupe([{ name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: MATIERE_63862 }], { titre: "Veste polaire noire" }, OPTS);
  ok(!g.aspects["Matière doublure externe"], "question groupée : « Polaire » (hors liste) n'est pas une matière de la liste", JSON.stringify(g.aspects));
}

console.log("\nB. La seconde passe : jamais une matière, jamais une valeur qui porte une couleur");
{
  appels = [];
  repondre = (s, m) => {
    if (/RECOPIÉ du titre/.test(m) && /"Style"/.test(m)) return { aspects: { Style: "Veste noir et gris" } };
    return { aspects: { Type: "Veste" } };
  };
  const r = await IA.completerAspectsIA([
    { name: "Type", mode: "FREE_TEXT", allowedValues: TYPE_63862 },
    { name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63862 },
    { name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: MATIERE_63862 },
  ], VESTE, OPTS);
  ok(r.aspects.Type === "Veste", "« Type » de la première passe gardé", JSON.stringify(r.aspects));
  ok(!r.aspects.Style, "« Veste noir et gris » (le titre recopié, une couleur) n'est pas un Style", JSON.stringify(r.aspects));
  ok(r.refuses.some((x) => x.name === "Style"), "refus tracé", JSON.stringify(r.refuses));
  ok(!appels.some((a) => /RECOPIÉ du titre/.test(a.message) && /Matière doublure externe/.test(a.message)), "aucune seconde passe sur la matière");
  ok(IA.valeurPorteUneCouleur("Veste noir et gris") && IA.valeurPorteUneCouleur("Filet gris clair") && !IA.valeurPorteUneCouleur("Polaire")
    && !IA.valeurPorteUneCouleur("Bordeaux"), "valeurPorteUneCouleur : couleurs sans ambiguïté seulement");
  appels = []; repondre = (s, m) => (/RECOPIÉ du titre/.test(m) ? { aspects: { Style: "Polaire" } } : { aspects: { Type: "Veste" } });
  const p = await IA.completerAspectsIA([{ name: "Type", mode: "FREE_TEXT", allowedValues: TYPE_63862 }, { name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63862 }],
    { titre: "Veste polaire Champion | Full zip", couleur: "Rose" }, OPTS);
  ok(p.aspects.Style === "Polaire", "le cas Manon (10/10) ne change pas : « Polaire » lu dans le titre", JSON.stringify(p.aspects));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nC. La passe « devinée » (_shared/aspect-devine.ts)");
let DV: typeof import("../supabase/functions/_shared/aspect-devine.ts") | null = null;
try { DV = await import("../supabase/functions/_shared/aspect-devine.ts"); } catch (e) { ok(false, "module aspect-devine.ts présent", String((e as Error)?.message ?? e).slice(0, 120)); }
if (DV) {
  const d = (name: string, allowedValues: string[], key?: string) => DV!.aspectDevinable({ name, allowedValues, key }).ok;
  ok(d("Matière doublure externe", MATIERE_63862), "matière : devinable");
  ok(d("Style", STYLE_63862) && d("Département", DEPARTEMENT) && d("Longueur de la robe", ["Au genou", "Midi", "Asymétrique"]), "style, département, longueur de robe (des mots) : devinables");
  ok(d("Pour qui ?", ["Femmes", "Hommes", "Filles", "Garçons"], "accessory_department"), "« Pour qui ? » Vinted : devinable");
  ok(!d("Marque", ["Nike", "Adidas"]) && !d("Modèle", ["A", "B"]) && !d("Jeu", ["Pokémon JCC", "Magic"]) && !d("Nom du jeu vidéo", ["FIFA 23", "Mario"]),
    "marque, modèle, jeu, nom : jamais devinés (identité)");
  ok(!d("Taille", ["S", "M", "L"]) && !d("Pointure EU", ["40", "41"]) && !d("Type de taille", ["Normale", "Grande taille"]), "taille, pointure, type de taille : jamais");
  ok(!d("Longueur", ["30 cm", "35 cm", "40 cm"]) && !d("Hauteur", ["20 cm", "25 cm"]) && !d("Capacité de stockage", ["64 Go", "128 Go"]), "mesures et capacités : jamais");
  ok(!d("Âge", ["0-3 mois", "3-6 mois"]) && !d("État", ["Neuf", "Bon état"]) && !d("Format", ["DVD", "Blu-ray"]) && !d("Connectivité Internet", ["Wi-Fi", "Non applicable"]),
    "âge, état, format, connectivité : jamais");
  ok(!d("Style", ["Autre"]) && !d("Style", ["Parka"]), "une liste sans deux vraies options : rien à deviner");

  const comp = DV.completerListesDuCatalogue(
    [{ name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: [] }, { name: "Marque", mode: "FREE_TEXT", allowedValues: [] }, { name: "Style", mode: "FREE_TEXT", allowedValues: ["Parka"] }],
    [{ name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: MATIERE_63862 }, { name: "Marque", mode: "FREE_TEXT", allowedValues: ["Nike"] }, { name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63862 }],
  );
  ok(comp[0].allowedValues.length === MATIERE_63862.length, "la liste vide est complétée par le catalogue eBay");
  ok(comp[1].allowedValues.length === 0, "jamais la liste des marques (doctrine des marques fantômes)");
  ok(comp[2].allowedValues.length === 1, "une liste envoyée par l'app n'est jamais remplacée");

  appels = [];
  repondre = () => ({ aspects: { "Matière doublure externe": "polyester", Style: "Polaire", "Département": "Homme", Couleur: "Autre", Jeu: "Pokémon JCC" } });
  const img = { type: "base64", media_type: "image/jpeg", data: "AAAA" };
  const r = await DV.devinerAspectsDansLaListe([
    { name: "Matière doublure externe", mode: "FREE_TEXT", allowedValues: MATIERE_63862 },
    { name: "Style", mode: "FREE_TEXT", allowedValues: STYLE_63862 },
    { name: "Département", mode: "SELECTION_ONLY", allowedValues: DEPARTEMENT },
    { name: "Couleur", mode: "FREE_TEXT", allowedValues: ["Noir", "Gris", "Autre"] },
    { name: "Jeu", mode: "FREE_TEXT", allowedValues: ["Pokémon JCC", "Magic"] },
  ], VESTE, { ...OPTS, images: [img] });
  ok(appels.length === 1, "UN appel pour tous les aspects à deviner", String(appels.length));
  ok(estDevinee(appels[0]?.systeme ?? ""), "consigne : la valeur la plus probable de la liste");
  ok(!/"Jeu"/.test(appels[0]?.message ?? ""), "« Jeu » (identité) jamais demandé");
  ok(/"type":"image"/.test(appels[0]?.message ?? ""), "les photos sont jointes");
  ok(r.aspects["Matière doublure externe"] === "Polyester" && r.aspects["Département"] === "Homme", "entrées de la liste posées (forme de la liste)", JSON.stringify(r.aspects));
  ok(!r.aspects.Style && r.refuses.some((x) => x.name === "Style"), "« Polaire » hors de la liste : refusé, la question reste", JSON.stringify(r.refuses));
  ok(!r.aspects.Couleur, "« Autre » n'est jamais une valeur devinée");
  ok(JSON.stringify(r.devinees.sort()) === JSON.stringify(["Département", "Matière doublure externe"]), "trace : devinees", JSON.stringify(r.devinees));
  appels = [];
  const vide = await DV.devinerAspectsDansLaListe([{ name: "Marque", mode: "FREE_TEXT", allowedValues: ["Nike", "Adidas"] }], VESTE, OPTS);
  ok(appels.length === 0 && !Object.keys(vide.aspects).length, "rien de devinable : aucun appel");
  appels = []; repondre = () => ({ aspects: { "Pour qui ?": "Hommes" } });
  const pq = await DV.devinerAspectsDansLaListe([{ name: "Pour qui ?", mode: "SELECTION_ONLY", allowedValues: ["Femmes", "Hommes", "Filles", "Garçons"], key: "accessory_department" }],
    { titre: "TEST FillSell 999 ne pas acheter - boutons de manchette argentés" }, OPTS);
  ok(pq.aspects["Pour qui ?"] === "Hommes", "boutons de manchette → « Hommes » deviné", JSON.stringify(pq.aspects));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nD. L'objet nommé par les photos (_shared/objet-par-les-photos.ts)");
let OB: typeof import("../supabase/functions/_shared/objet-par-les-photos.ts") | null = null;
try { OB = await import("../supabase/functions/_shared/objet-par-les-photos.ts"); } catch (e) { ok(false, "module objet-par-les-photos.ts présent", String((e as Error)?.message ?? e).slice(0, 120)); }
if (OB) {
  ok(OB.objetValide("28/10") === null && OB.objetValide("article de test") === null && OB.objetValide("test") === null, "« 28/10 », « article de test » : pas un objet");
  ok(OB.objetValide("Veste polaire") === "veste polaire", "« veste polaire » : un objet");
  appels = []; repondre = () => ({ objet: "veste polaire", icon: "🧥" });
  const img = { type: "base64", media_type: "image/jpeg", data: "AAAA" };
  const r = await OB.objetParLesPhotos({ images: [img], contexte: "Article: TEST FillSell 30/10 — fiche d'essai abandonnée", menuIcones: "🧥 = manteau, veste", icones: new Set(["🧥"]) }, OPTS);
  ok(r.objet === "veste polaire" && r.icon === "🧥", "les photos nomment l'objet", JSON.stringify(r));
  ok(/"type":"image"/.test(appels[0]?.message ?? ""), "les photos partent avec la question");
  appels = [];
  const s = await OB.objetParLesPhotos({ images: [], contexte: "x", menuIcones: "", icones: new Set() }, OPTS);
  ok(appels.length === 0 && s.objet === null, "sans photo : aucun appel");
  appels = []; repondre = () => ({ objet: "28/10", icon: "🃏" });
  const f = await OB.objetParLesPhotos({ images: [img], contexte: "x", menuIcones: "🧥", icones: new Set(["🧥"]) }, OPTS);
  ok(f.objet === null && f.icon === null, "une réponse hors règle (chiffres, icône hors liste) : rien", JSON.stringify(f));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nE. La voie API (remplirAspects) devine aussi ce qui reste vide");
{
  const { remplirAspects } = await import("../supabase/functions/_shared/ebay-publication.ts");
  appels = [];
  repondre = (s) => (estDevinee(s) ? { aspects: { "Matière doublure externe": "Polyester" } } : { aspects: { "Matière doublure externe": "Gris" } });
  const catalogue = [
    { name: "Matière doublure externe", required: true, mode: "FREE_TEXT", allowedValues: MATIERE_63862 },
  ];
  // deno-lint-ignore no-explicit-any
  const r = await remplirAspects({} as any, catalogue as any, { titre: "Veste polaire noire zippée", description: "Veste polaire, très chaude." }, "test");
  const v = (r.aspects["Matière doublure externe"] ?? [])[0];
  ok(v === "Polyester", "« Gris » refusé, « Polyester » deviné dans la liste", JSON.stringify(r.aspects));
  ok(Array.isArray(r.ia?.devinees) && r.ia!.devinees!.includes("Matière doublure externe"), "trace : ia.devinees", JSON.stringify(r.ia));
  ok(!r.manquants.includes("Matière doublure externe"), "plus de question sur la matière", JSON.stringify(r.manquants));
}

// ═══════════════════════════════════════════════════════════════════════════
console.log("\nF. generate-listing branche la règle (eBay, canal générique, objet)");
{
  const src = await Deno.readTextFile(new URL("../supabase/functions/generate-listing/index.ts", import.meta.url));
  ok(/import \{[^}]*devinerAspectsDansLaListe[^}]*\} from "\.\.\/_shared\/aspect-devine\.ts"/.test(src), "aspect-devine.ts importé");
  ok(/from\("ebay_item_aspects"\)/.test(src) && /completerListesDuCatalogue\(/.test(src), "eBay : listes complétées depuis ebay_item_aspects");
  ok((src.match(/await devinerAspectsDansLaListe\(/g) ?? []).length >= 2, "eBay ET canal générique : la passe devinée");
  ok(/devinees/.test(src.slice(src.indexOf('feature: "ebay_aspects_ia"'), src.indexOf('feature: "ebay_aspects_ia"') + 900)), "mesure : devinees dans ebay_aspects_ia");
  ok(/objetParLesPhotos\(/.test(src), "l'objet est demandé aux photos quand le texte n'en nomme aucun");
}

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ tout est vert");
if (echecs) Deno.exit(1);
