// ═══════════════════════════════════════════════════════════════════════════
// LA COULEUR NE BLOQUE JAMAIS — SELFTEST (11/10/2026, point 9, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « La couleur ne fait pas vendre, les gens la voient sur la photo. »
// Cas rejoué : jakefawright, 10/10 23:33 → 23:34, inventaire 1791662902637
// (« Smallest spicy mcnuggat shaped like heart or nose », relevé eBay, aucune
// couleur), rayon Vinted « Enfants > Jeux et jouets > Figurines et accessoires
// > Figurines » dont le catalogue ne portait que 20 couleurs (doublées, sans
// Marron ni Doré ni Multicolore) → question « Couleur » → ABANDON.
// Ce contrôle exécute le code livré et tombe si la règle disparaît :
//   1. la palette Vinted ENTIÈRE (29) sur toute ligne `color` (point b) ;
//   2. l'anglais de Lens et les codes Vinted traduits (point c, vintedColors.js) ;
//   3. les besoins : couleur exigée ET vide, jamais une copie retouchée à la main ;
//   4. le cas jakefawright : couleur posée (IA photo, sinon « Multicolore »),
//      AUCUNE question, rien sur la fiche ;
//   5. une couleur présente n'est jamais écrasée ; une couleur connue (fiche,
//      Lens « Black ») est ramenée à la palette sans IA ;
//   6. eBay : la correspondance vers SA liste, le repli « Multicouleur » ;
//   7. le serveur (generate-listing resolve_couleur, _shared/couleur-ia.ts) :
//      Haiku 4.5, photos, réponse CONTRÔLÉE (hors liste = refus), délai borné,
//      usage_logs « couleur_auto » ; resolve_aspects inchangé ;
//   8. le câblage du moteur (stepper ET lot) : après la passe texte, UN appel
//      par article, compté dans iaGeneriqueEnVol, « affiche » seulement si la
//      question reste, le lot attend ;
//   9. la republication n'entre pas ici.
//
//   node --import ./scripts/loader-ext.mjs scripts/couleur-auto-selftest.mjs
import { readFileSync } from "node:fs";
import {
  avecPaletteVintedComplete, couleursExigeesVides, couleurConnue, couleurPourPlateforme, repliCouleur,
  listePourIa, posesCouleur, reponseCouleurControlee, estChampCouleur, couleurAutoEnAttente,
  photosPourCouleur, COULEUR_REPLI, DELAI_COULEUR_IA_MS,
} from "../src/publication/moteur/couleurAuto.js";
import { VINTED_COLORS, normalizeVintedColors } from "../src/utils/vintedColors.js";
import { genericFieldToSharedKey, canalGeneriquePose } from "../src/publication/moteur/champsPartages.js";
import { jugerValeurContreListe } from "../src/publication/moteur/listes.js";

let ko = 0; let n = 0;
const ok = (c, quoi, vu) => { n++; if (!c) { ko++; console.log(`  ✗ ${quoi}${vu !== undefined ? ` — vu : ${JSON.stringify(vu)}` : ""}`); } else console.log(`  ✓ ${quoi}`); };
const lire = (p) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

// Le relevé RÉEL du rayon de la figurine (platform_category_aspects, relu le 11/10).
const RAYON_JAKE = "Enfants > Jeux et jouets > Figurines et accessoires > Figurines";
const COLOR_JAKE = ["Noir", "Noir", "Gris", "Gris", "Blanc", "Blanc", "Crème", "Crème", "Beige", "Beige", "Abricot", "Abricot",
  "Orange", "Orange", "Corail", "Corail", "Rouge", "Rouge", "Bordeaux", "Bordeaux", "Fuchsia", "Fuchsia", "Rose", "Rose",
  "Violet", "Violet", "Lila", "Lila", "Bleu clair", "Bleu clair", "Bleu", "Bleu", "Marine", "Marine", "Turquoise", "Turquoise",
  "Menthe", "Menthe", "Vert", "Vert"];
// La liste « Couleur » eBay la plus courante (78 rayons exigés, ebay_item_aspects, 11/10).
const COULEUR_EBAY = ["Argenté", "Beige", "Blanc", "Bleu", "Doré", "Gris", "Ivoire", "Jaune", "Marron", "Multicouleur", "Noir", "Orange", "Rose", "Rouge", "Transparent", "Vert", "Violet"];

console.log("1. La palette Vinted ENTIÈRE, jamais le relevé tronqué (point b) :");
{
  ok(new Set(COLOR_JAKE).size === 20 && !COLOR_JAKE.includes("Marron") && !COLOR_JAKE.includes("Doré"), "le relevé du rayon de la figurine : 20 couleurs, ni Marron ni Doré (le défaut d'origine)");
  const rows = avecPaletteVintedComplete("vinted", [
    { field_key: "color", required: true, allowed_values: COLOR_JAKE },
    { field_key: "size", required: true, allowed_values: ["XS", "S"] },
  ]);
  ok(JSON.stringify(rows[0].allowed_values) === JSON.stringify(VINTED_COLORS) && rows[0].allowed_values.length === 29, "ligne color → les 29 libellés, dans l'ordre du panneau Vinted");
  ok(JSON.stringify(rows[1].allowed_values) === JSON.stringify(["XS", "S"]), "les autres lignes ne bougent pas");
  const lbc = [{ field_key: "color", allowed_values: ["Rouge"] }];
  ok(avecPaletteVintedComplete("leboncoin", lbc) === lbc, "hors Vinted : rien ne change");
}

console.log("2. L'anglais de Lens et les codes Vinted, ramenés à la palette (point c) :");
{
  const ANGLAIS_29 = {
    Black: "Noir", Grey: "Gris", Gray: "Gris", White: "Blanc", Cream: "Crème", Beige: "Beige", Apricot: "Abricot",
    Orange: "Orange", Coral: "Corail", Red: "Rouge", Burgundy: "Bordeaux", "Hot pink": "Fuchsia", Pink: "Rose",
    Purple: "Violet", Lilac: "Lila", "Light blue": "Bleu clair", Blue: "Bleu", Navy: "Marine", Turquoise: "Turquoise",
    Mint: "Menthe", Green: "Vert", "Dark green": "Vert foncé", Khaki: "Kaki", Brown: "Marron", Mustard: "Moutarde",
    Yellow: "Jaune", Silver: "Argenté", Gold: "Doré", Multicolour: "Multicolore", Clear: "Transparence",
  };
  const faux = Object.entries(ANGLAIS_29).filter(([en, fr]) => normalizeVintedColors(en).colors[0] !== fr);
  ok(!faux.length, "les 29 couleurs de la palette ont leur nom anglais", faux);
  ok(new Set(Object.values(ANGLAIS_29)).size === 29, "… et les 29 y sont toutes");
  const releves = { GREY: "Gris", BROWN: "Marron", "LIGHT-BLUE": "Bleu clair", Lilas: "Lila", Prune: "Violet", "Heather grey": "Gris", "Navy blue": "Marine" };
  const fauxR = Object.entries(releves).filter(([a, b]) => normalizeVintedColors(a).colors[0] !== b);
  ok(!fauxR.length, "les valeurs relevées en base (color_unmapped : GREY, BROWN, Burgundy, Lilas, Prune…) se normalisent", fauxR);
  ok(JSON.stringify(normalizeVintedColors("Black and White").colors) === JSON.stringify(["Noir", "Blanc"]), "« Black and White » → Noir + Blanc");
  ok(normalizeVintedColors("Taupe").colors.length === 0 && normalizeVintedColors("Taupe").unmapped === "Taupe", "jamais « au plus proche » : Taupe reste hors palette");
  const v = jugerValeurContreListe({ platform: "vinted", key: "color", value: "Black", allowedValues: VINTED_COLORS });
  ok(v.dans === true && v.valeurListe === "Noir", "le moteur juge « Black » comme la valeur qui partira (Noir), plus jamais « hors liste »", v);
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  ok(/from "\.\.\/\.\.\/\.\.\/src\/utils\/vintedColors\.js"/.test(gpj), "le serveur (get-pending-jobs) importe la MÊME table");
}

console.log("3. Les besoins : couleur exigée ET vide — jamais une copie retouchée :");
{
  const gen = (state) => ({ vinted: [{ key: "color", state, allowedValues: VINTED_COLORS }, { key: "size", state: "missing" }] });
  const b = couleursExigeesVides({ genericRequiredStatus: gen("missing"), categories: { vinted: RAYON_JAKE } });
  ok(b.length === 1 && b[0].platform === "vinted" && b[0].liste.length === 29 && b[0].cle === `vinted|${RAYON_JAKE}|color`, "Vinted color manquante → un besoin, palette entière, clé (plateforme, rayon, champ)", b);
  ok(couleursExigeesVides({ genericRequiredStatus: gen("ok") }).length === 0, "couleur présente → aucun besoin (jamais par-dessus)");
  ok(couleursExigeesVides({ genericRequiredStatus: gen("invalid") }).length === 0, "couleur présente hors palette → aucun besoin (jamais écrasée)");
  ok(couleursExigeesVides({ genericRequiredStatus: gen("missing"), verrous: { vinted: new Set(["couleur"]) } }).length === 0, "couleur vidée à la main (verrou) → la personne garde la main");
  const eb = couleursExigeesVides({ ebayRequiredStatus: [
    { name: "Couleur", state: "missing", allowedValues: COULEUR_EBAY, mode: "FREE_TEXT" },
    { name: "Marque", state: "missing", allowedValues: [] },
    { name: "Couleur de la monture", state: "ok", allowedValues: [] },
  ], categories: { ebay: "63862" } });
  ok(eb.length === 1 && eb[0].key === "Couleur" && eb[0].cle === "ebay|63862|Couleur", "eBay : l'aspect « Couleur » manquant seul", eb);
}

console.log("4. Cas jakefawright rejoué : la figurine part avec une couleur, sans question :");
{
  const copies = { vinted: { title: "Smallest spicy mcnuggat shaped like heart or nose", platform_fields: { marque: "McDonald's", etat: "Neuf sans étiquette" } },
    beebs: { platform_fields: { marque: "McDonald's" } } };
  const fiche = { etat: { v: "New", source: "releve_ebay" } };
  const besoins = couleursExigeesVides({ genericRequiredStatus: { vinted: [{ key: "color", state: "missing" }] }, categories: { vinted: RAYON_JAKE } });
  const connue = couleurConnue({ copies, partagee: "", ficheAttributs: fiche, lens: null });
  ok(connue === null, "aucune couleur connue nulle part (copies, fiche, Lens) → l'IA est appelée");
  const liste = listePourIa(besoins);
  ok(liste.length === 29 && liste.includes("Marron") && liste.includes("Doré"), "l'IA reçoit la palette ENTIÈRE (Marron, Doré y sont)");
  // L'IA (photo) répond « marron » : contrôlée, écrite comme la liste.
  const rep = reponseCouleurControlee({ couleur: "marron", source: "photo" }, liste);
  ok(rep?.valeur === "Marron" && rep.source === "photo", "réponse contrôlée : l'entrée de la liste, recopiée telle quelle", rep);
  const poses = posesCouleur({ besoins, connue, reponseIa: rep });
  ok(poses.length === 1 && poses[0].valeur === "Marron" && poses[0].source === "photo", "Vinted reçoit « Marron », source photo", poses);
  // Sans réponse (pas de photo, erreur, > 6 s, hors liste) : « Multicolore », jamais une question.
  const repli = posesCouleur({ besoins, connue: null, reponseIa: null });
  ok(repli[0].valeur === COULEUR_REPLI && COULEUR_REPLI === "Multicolore" && repli[0].source === "repli", "l'IA échoue → « Multicolore », source repli");
  ok(reponseCouleurControlee({ couleur: "Caramel", source: "photo" }, liste) === null, "hors liste = refus (→ repli), jamais posé");
  ok(DELAI_COULEUR_IA_MS === 6000, "délai de l'appel : 6 s");
  // La valeur posée vit dans vintedAspects.color : le canal que l'extension lit
  // (fields.colors = [vintedAspects.color]) ET que la garde des questions compte.
  ok(genericFieldToSharedKey("vinted", "color") === "couleur" && canalGeneriquePose("vinted", "color") === true,
    "vintedAspects.color compte pour la question partagée « Couleur » : elle ne se pose plus");
  ok(VINTED_COLORS.includes(poses[0].valeur) && VINTED_COLORS.includes(repli[0].valeur), "toute valeur posée pour Vinted est un libellé EXACT de la palette");
  const vinted = lire("chrome-extension/content-scripts/vinted.js");
  ok(/const _color = String\(_va\.color \?\? ""\)\.trim\(\);\s*if \(_color\) \{\s*fields\.colors = \[_color\];/.test(vinted), "l'extension prend vintedAspects.color comme couleur de l'annonce");
}

console.log("5. Une couleur présente n'est jamais écrasée ; une couleur connue se traduit sans IA :");
{
  const besoinsV = [{ platform: "vinted", key: "color", cle: "v", liste: [...VINTED_COLORS], mode: null }];
  const lens = couleurConnue({ copies: {}, partagee: "", ficheAttributs: null, lens: "Black" });
  ok(lens?.canon === "Noir" && lens.source === "lens" && lens.de === "Black", "Lens « Black » (compte anglais) → Noir, source lens", lens);
  ok(posesCouleur({ besoins: besoinsV, connue: lens })[0].valeur === "Noir", "… posé sans appel IA");
  const fiche = couleurConnue({ copies: {}, ficheAttributs: { couleur: { v: "Burgundy", source: "releve_ebay" } } });
  ok(fiche?.canon === "Bordeaux" && fiche.source === "fiche", "fiche « Burgundy » → Bordeaux", fiche);
  const copie = couleurConnue({ copies: { beebs: { platform_fields: { couleur: "Bleu marine" } } }, ficheAttributs: { couleur: { v: "Rouge" } } });
  ok(copie?.canon === "Marine" && copie.source === "copie", "la couleur d'une autre copie passe avant la fiche", copie);
  ok(couleurConnue({ copies: { vinted: { platform_fields: { couleur: "B" } } } }) === null, "une lettre n'est pas une couleur");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/\/\/ Jamais par-dessus une couleur arrivée entre-temps \(saisie, IA texte\)\.\n\s*const deja = p === "vinted"\n\s*\? String\(pf\.couleur \|\| pf\.colors\?\.\[0\] \|\| pf\.vintedAspects\?\.color \|\| ""\)\.trim\(\)/.test(lps),
    "à la pose, une valeur arrivée entre-temps (copie, saisie, passe texte) garde la main");
  ok(/if \(deja\) continue;/.test(lps.slice(lps.indexOf("const couleurIaRef"))), "… et la pose est sautée");
}

console.log("6. eBay : la valeur de SA liste, le repli « Multicouleur » :");
{
  const b = { platform: "ebay", key: "Couleur", cle: "e", liste: COULEUR_EBAY, mode: "FREE_TEXT" };
  const cas = { Marine: "Bleu", Bordeaux: "Rouge", Crème: "Ivoire", Kaki: "Vert", Transparence: "Transparent", Multicolore: "Multicouleur", Noir: "Noir", Lila: "Violet", Moutarde: "Jaune" };
  const faux = Object.entries(cas).filter(([c, e]) => couleurPourPlateforme(c, b) !== e);
  ok(!faux.length, "chaque couleur de la palette → l'entrée eBay qui la dit", faux.map(([c]) => [c, couleurPourPlateforme(c, b)]));
  ok(repliCouleur(b) === "Multicouleur", "repli eBay : l'entrée « multi » de sa liste");
  ok(repliCouleur({ ...b, liste: ["Noir", "Multicolore"] }) === "Multicolore", "… quelle que soit son orthographe");
  ok(couleurPourPlateforme("Corail", { ...b, liste: ["Noir"] }) === "Corail", "liste libre (FREE_TEXT) sans correspondance : le libellé tel quel");
  ok(couleurPourPlateforme("Corail", { ...b, liste: ["Noir"], mode: "SELECTION_ONLY" }) === null, "liste fermée sans correspondance : rien d'inventé");
  // UN appel par article : la réponse (palette Vinted) sert aussi à eBay.
  const besoins = [{ platform: "vinted", key: "color", cle: "v", liste: [...VINTED_COLORS] }, b];
  const rep = reponseCouleurControlee({ couleur: "Marine", source: "texte" }, listePourIa(besoins));
  const p = posesCouleur({ besoins, reponseIa: rep });
  ok(p[0].valeur === "Marine" && p[1].valeur === "Bleu" && p.every((x) => x.source === "texte"), "une réponse, deux plateformes : Vinted « Marine », eBay « Bleu »", p);
  const seulEbay = listePourIa([b]);
  ok(JSON.stringify(seulEbay) === JSON.stringify(COULEUR_EBAY), "eBay seul : l'IA reçoit la liste eBay");
}

console.log("7. Le serveur — generate-listing resolve_couleur (_shared/couleur-ia.ts) :");
{
  globalThis.Deno = globalThis.Deno ?? { env: { get: (k) => (k === "SUPABASE_URL" ? "https://tojihnuawsoohlolangc.supabase.co" : undefined) } };
  const ia = await import("../supabase/functions/_shared/couleur-ia.ts");
  ok(ia.MODELE_COULEUR === "claude-haiku-4-5-20251001", "modèle : Haiku 4.5 (l'identifiant du dépôt)");
  ok(JSON.stringify(ia.controlerReponseCouleur('{"couleur":"vert","source":"photo"}', ["Noir", "Vert"])) === JSON.stringify({ couleur: "Vert", source: "photo" }), "réponse contrôlée et recopiée (casse)");
  ok(ia.controlerReponseCouleur('{"couleur":"Turquoise"}', ["Noir", "Vert"]).motif === "hors_liste", "hors liste → refus");
  ok(ia.controlerReponseCouleur("je pense noir", ["Noir"]).motif === "illisible", "pas de JSON → refus");
  ok(JSON.stringify(ia.listeCouleurPropre(["Noir", " noir ", "", 3, "Vert"])) === JSON.stringify(["Noir", "Vert"]), "liste reçue nettoyée (doublons, vides)");
  // Un appel réel simulé : la requête, puis la réponse.
  const fetchAvant = globalThis.fetch;
  let corps = null;
  globalThis.fetch = async (url, init) => {
    if (String(url).includes("api.anthropic.com")) {
      corps = JSON.parse(init.body);
      return new Response(JSON.stringify({ content: [{ type: "text", text: '{"couleur":"Marron","source":"photo"}' }], usage: { input_tokens: 3400, output_tokens: 14 } }), { status: 200 });
    }
    if (String(url).includes("images1.vinted.net")) return new Response(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]), { status: 200, headers: { "content-type": "image/jpeg" } });
    return new Response("", { status: 404 });
  };
  try {
    const prep = await ia.photosPourCouleurIA(["https://images1.vinted.net/t/xyz/f800/1.jpeg", "data:x", "https://images1.vinted.net/t/xyz/f800/2.jpeg", "https://images1.vinted.net/3.jpeg"], "https://tojihnuawsoohlolangc.supabase.co");
    ok(prep.sources.length === 2 && prep.sources.every((s) => s.type === "base64" && s.media_type === "image/jpeg"), "photos d'un CDN de plateforme : 2 au plus, téléchargées en base64", prep.sources.map((s) => s.type));
    let usage = null;
    const r = await ia.resoudreCouleurIA({ liste: VINTED_COLORS, images: prep.sources, titre: "Smallest spicy mcnuggat", description: "odd shaped" }, { apiKey: "k", onUsage: (d) => { usage = d.usage; } });
    ok(r.couleur === "Marron" && r.source === "photo", "réponse « Marron » (photo)", r);
    ok(corps?.model === "claude-haiku-4-5-20251001" && corps.max_tokens <= 100 && corps.temperature === 0, "requête : Haiku 4.5, sortie courte, température 0", { model: corps?.model, max: corps?.max_tokens });
    const contenu = corps?.messages?.[0]?.content ?? [];
    ok(contenu.filter((b) => b.type === "image").length === 2 && contenu.some((b) => b.type === "text" && b.text.includes("Marron | Moutarde")), "les 2 photos et la liste entière partent dans le message");
    ok(usage?.input_tokens === 3400, "l'usage est remonté (mesure du coût)");
    ok((await ia.resoudreCouleurIA({ liste: VINTED_COLORS, images: [] }, { apiKey: "k" })).motif === "sans_photo", "pas de photo → aucun appel, refus (repli)");
    // (11/10) Une URL envoyée par le client ne fait jamais sortir la fonction
    // vers n'importe quelle adresse : seuls les CDN des plateformes.
    let sortiVers = [];
    const fetchCdn = globalThis.fetch;
    globalThis.fetch = async (url, init) => { sortiVers.push(String(url)); return fetchCdn(url, init); };
    const horsListe = await ia.photosPourCouleurIA(["https://evilvinted.net/a.jpg", "https://169.254.169.254/latest/meta-data", "http://images1.vinted.net/a.jpg"], "https://tojihnuawsoohlolangc.supabase.co");
    ok(horsListe.sources.length === 0 && horsListe.ecartees === 2 && sortiVers.length === 0, "hôte hors liste (ou http) : aucune requête sortante, photo écartée", sortiVers);
    globalThis.fetch = fetchCdn;
    ok(["https://images1.vinted.net/x", "https://i.ebayimg.com/x", "https://img.leboncoin.fr/x", "https://cdn.beebs.app/x", "https://media-photos.depop.com/x"].every(ia.hotePhotoAutorise)
      && !["https://evil.com/vinted.net", "https://vinted.net.evil.com/x", "https://evilvinted.net/x"].some(ia.hotePhotoAutorise), "liste des hôtes : les CDN réels, rien d'autre");
    globalThis.fetch = (url, init) => new Promise((_, rej) => init?.signal?.addEventListener("abort", () => rej(Object.assign(new Error("abort"), { name: "AbortError" }))));
    const lent = await ia.resoudreCouleurIA({ liste: VINTED_COLORS, images: prep.sources }, { apiKey: "k", delaiMs: 50 });
    ok(lent.couleur === null && lent.motif === "delai", "appel trop lent → abandonné (délai), refus", lent);
  } finally { globalThis.fetch = fetchAvant; }
  const gl = lire("supabase/functions/generate-listing/index.ts");
  const iCouleur = gl.indexOf("if (body.resolve_couleur === true) {");
  const iAspects = gl.indexOf("if (body.resolve_aspects === true) {");
  ok(iCouleur > 0 && iCouleur < iAspects, "mode resolve_couleur À CÔTÉ de resolve_aspects (avant lui)");
  ok(/feature: "couleur_auto"/.test(gl) && /photos_envoyees: prep\.sources\.length/.test(gl) && /cost_usd: Number\(/.test(gl.slice(iCouleur, iAspects)), "usage_logs « couleur_auto » : photos, tokens, coût");
  ok(/if \(\(count \?\? 0\) >= 400\) \{/.test(gl.slice(iCouleur, iAspects)), "filet contre une boucle d'appels : 400 par compte et par 24 h, sans appel IA au-delà");
  ok(/const ia = await resoudreAspectsIA\(demandes, contexteIa, optsIa\);/.test(gl) && /(?:const ia = await completerAspectsIA\(demandes, contexteIa, optsIa\);|: await completerAspectsIA\(demandes, contexteIa, optsIa\);)/.test(gl), "resolve_aspects : resoudreAspectsIA / completerAspectsIA appelés comme avant");
  const shared = lire("supabase/functions/_shared/couleur-ia.ts");
  ok(/import \{ preparerPhotos \} from "\.\.\/lens-analysis\/images\.ts";/.test(shared), "photos de notre Storage préparées comme lens-analysis (preparerPhotos)");
  ok(!/esm\.sh|deno\.land/.test(shared), "aucun import distant neuf");
  const toml = lire("supabase/config.toml");
  const bloc = toml.slice(toml.indexOf("[functions.generate-listing]"), toml.indexOf("[functions.generate-listing]") + 200);
  ok(!/verify_jwt\s*=\s*false/.test(bloc), "generate-listing reste en verify_jwt = true (rien de changé dans config.toml)");
}

console.log("8. Le câblage du moteur (stepper ET lot — ListingPreviewScreen) :");
{
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/rows = avecPaletteVintedComplete\(platform, rows\);/.test(lps), "le catalogue des exigés porte la palette entière");
  ok(/texteEnVolPar\.current\.add\(gp\);/.test(lps) && /finally \{ texteEnVolPar\.current\.delete\(gp\); setIaGeneriqueEnVol/.test(lps), "la passe TEXTE est suivie plateforme par plateforme");
  const eff = lps.slice(lps.indexOf("const couleurIaRef = useRef"), lps.indexOf("function noterOptionDuTexte"));
  ok(/genericResolvedFor\.current\.vinted === genericCategoryKeys\?\.vinted && !texteEnVolPar\.current\.has\("vinted"\)/.test(eff), "Vinted : rien avant la fin de la passe texte");
  ok(/ebayIaFiniePour === ebayPreviewCategoryId && ebayIaEnVol === 0/.test(eff), "eBay : rien avant la fin de l'extraction IA de l'encart");
  ok(/if \(!connue && ia\.etat === "en_vol"\) return;/.test(eff) && /couleurIaRef\.current = \{ etat: "en_vol", reponse: null \};/.test(eff), "UN appel par article (la réponse sert à toutes les plateformes)");
  ok(/setIaGeneriqueEnVol\(n => n \+ 1\);[\s\S]*setIaGeneriqueEnVol\(n => Math\.max\(0, n - 1\)\);/.test(eff), "compté dans iaGeneriqueEnVol (le pilote du lot l'attend)");
  ok(/resolve_couleur: true, liste, photos: photosIa/.test(eff) && /Promise\.race\(\[supabase\.functions\.invoke\("generate-listing", \{ body: corps \}\), delai\]\)/.test(eff), "resolve_couleur avec les photos, borné à DELAI_COULEUR_IA_MS");
  ok(/if \(photosIa\.length\) \{/.test(eff), "pas de photo → aucun appel (repli)");
  ok(/\[canal\]: \{ \.\.\.\(pf\[canal\] \?\? \{\}\), \[cle\]: valeur \}/.test(eff) && /const canal = p === "vinted" \? "vintedAspects" : "ebayAspects";/.test(eff), "écrit dans le canal lu par l'extension (vintedAspects / ebayAspects)");
  ok(/couleur_auto: \{ valeur, source, \.\.\.\(de \? \{ de \} : \{\}\), le: maintenant \}/.test(eff), "trace platform_fields.couleur_auto { valeur, source, le }");
  ok(!/noteSharedOverride|setPlatformDedicatedField|noterReponseFiche|from\("inventaire"\)/.test(eff), "aucune trace de saisie, aucun verrou, RIEN écrit sur la fiche");
  ok(/if \(couleurEnAttente\) return false;/.test(lps), "le lot attend la couleur automatique (preparationAuRepos)");
  ok(/const couleurRetenue = \(x\) => couleurEnAttente && estChampCouleur\(x\);/.test(lps)
    && /if \(couleurRetenue\(\{ platform: gp, key: a\.key \}\)\) continue;/.test(lps)
    && /if \(couleurRetenue\(\{ platform: "ebay", key: a\.name, sharedKey: a\.sharedKey \}\)\) continue;/.test(lps)
    && /if \(couleurRetenue\(\{ partage: f\.key \}\)\) continue;/.test(lps), "« affiche » journalisé seulement si la question RESTE après la couleur automatique");
  ok(estChampCouleur({ platform: "vinted", key: "color" }) && estChampCouleur({ partage: "couleur" }) && estChampCouleur({ platform: "ebay", key: "Couleur" })
    && !estChampCouleur({ platform: "vinted", key: "brand" }), "estChampCouleur : color, Couleur, partage couleur — pas la marque");
  ok(couleurAutoEnAttente([{ cle: "a" }], new Set()) && !couleurAutoEnAttente([{ cle: "a" }], new Set(["a"])), "en attente tant qu'un besoin n'est pas traité");
  ok(JSON.stringify(photosPourCouleur(["https://a/1.jpg", "blob:x", "https://a/2.jpg", "https://a/3.jpg"])) === JSON.stringify(["https://a/1.jpg", "https://a/2.jpg"]), "1 à 2 photos http(s), la couverture d'abord");
}

console.log("9. La republication n'entre pas ici :");
{
  const rep = lire("src/utils/republication.js");
  ok(/rpc\('spend_coins_and_republish'/.test(rep) && !/couleurAuto|resolve_couleur/.test(rep), "republication : RPC spend_coins_and_republish, aucune couleur automatique");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(!/spend_coins_and_republish/.test(lps) && /supabase\.rpc\("spend_coins_and_publish"/.test(lps), "le moteur ne crée QUE des publications (spend_coins_and_publish)");
  const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
  const ext = lire("chrome-extension/background.js") + lire("chrome-extension/content-scripts/vinted.js");
  ok(!/resolve_couleur/.test(gpj) && !/resolve_couleur/.test(ext), "ni le serveur des tâches ni l'extension n'appellent l'IA couleur");
}

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n} contrôles` : `\n✓ couleur automatique : ${n} contrôles verts — la couleur ne bloque jamais, ne fait jamais abandonner`);
process.exit(ko ? 1 : 0);
