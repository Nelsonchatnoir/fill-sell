// ═══════════════════════════════════════════════════════════════════════════
// VERROU — lot du 21/11/2026, point 2 : l'aspect eBay que le serveur DEVINE au dépôt n'est jamais une question
// ═══════════════════════════════════════════════════════════════════════════
// Rouge avant : « Style » / « Type » (robes, pulls, hauts) posés en question à l'écran, voie API — vetis.shop
// (21/11 03:13, eBay décoché 3 s après) et alisonbertincourt (20/11 23:54, « publié sans eBay » sur « Style, Type »)
// —, alors que le serveur les remplit au dépôt (remplirAspects → IA sous la liste, puis la valeur devinée).
// Ce qu'il prouve :
//   1. la règle de l'écran (moteur/aspectAuDepot) : Style, Type, Longueur de la robe → au dépôt ; Marque, Modèle,
//      Taille, Pointure, une mesure, une liste de nombres, un champ partagé, un aspect sans liste → la question reste ;
//   2. voie extension : rien ne change ;
//   3. une ligne « au dépôt » n'est ni dans le bloc des questions (questionsAPoser) ni bloquante (aspectBloquant) ;
//   4. les motifs « jamais deviné » sont les MÊMES que ceux du serveur (aspect-devine.ts, ebay-aspects-ia.ts) ;
//   5. l'écran est branché (ebayRequiredStatus).
//   node --import ./scripts/loader-ext.mjs scripts/lot-2111-ebay-au-depot-selftest.mjs
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { aspectDevineAuDepot, ligneEbayAuDepot, MOTS_JAMAIS_DEVINES, ASPECT_TAILLE_RE, ASPECT_MESURE_RE } from "../src/publication/moteur/aspectAuDepot.js";
import { aspectBloquant, questionsAPoser } from "../src/publication/moteur/regles.js";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (f) => readFileSync(join(RACINE, f), "utf8").replace(/\r\n/g, "\n");
let verts = 0, rouges = 0;
const ok = (c, m, d = "") => { if (c) { verts++; console.log(`  ok   ${m}`); } else { rouges++; console.log(`  RATÉ ${m}${d ? `  ← ${d}` : ""}`); } };
const manque = (name, allowedValues = [], extra = {}) => ({ name, state: "missing", value: "", allowedValues, mode: "FREE_TEXT", ...extra });
const STYLE = ["Cache-cœur", "Droite", "Trapèze", "Portefeuille", "Chemise", "Autre"];
const TYPE = ["Robe", "Robe de soirée", "Robe de cocktail", "Autre"];

console.log("1. Ce que le serveur devine part au dépôt ; ce qui se lit reste une question");
for (const [nom, liste] of [["Style", STYLE], ["Type", TYPE], ["Longueur de la robe", ["Au genou", "Midi", "Longue"]], ["Longueur des manches", ["Courtes", "Longues", "Sans manches"]], ["Motif", ["Uni", "Rayé", "Fleuri"]]]) {
  ok(aspectDevineAuDepot(manque(nom, liste)).ok === true, `« ${nom} » (liste) → au dépôt`);
}
for (const [nom, liste, motif] of [
  ["Marque", ["Mango", "Zara"], "identité"], ["Modèle", ["Air Max", "Blazer"], "identité"], ["Taille", ["36", "38"], "taille"],
  ["Pointure EU", ["38", "39"], "taille"], ["Hauteur", ["10 cm", "20 cm"], "mesure"], ["Capacité de stockage", ["64 Go", "128 Go"], "capacité"],
  ["Tour de poitrine", ["80", "85"], "mesure"], ["Département", ["Femme", "Homme", "Unisexe"], "public"], ["Nom du jeu vidéo", ["Mario", "Zelda"], "identité"],
  ["État", ["Neuf", "Occasion"], "état"], ["Type", ["Autre"], "liste vide"], ["Type", [], "sans liste"],
]) {
  const r = aspectDevineAuDepot(manque(nom, liste));
  ok(r.ok === false, `« ${nom} » (${motif}) → la question reste`, JSON.stringify(r));
}
ok(aspectDevineAuDepot(manque("Couleur", ["Noir", "Blanc"], { sharedKey: "couleur" })).ok === false, "un champ partagé (couleur) → sa question commune reste");
ok(aspectDevineAuDepot(manque("Type", ["10", "20", "30", "Autre"])).ok === false, "une liste de nombres → se lit");

console.log("2. Voie extension : rien ne change");
{
  const m = manque("Style", STYLE);
  ok(ligneEbayAuDepot(m, { voieApi: false }) === m, "voie extension : la ligne est rendue telle quelle (question)");
  const l = ligneEbayAuDepot(m, { voieApi: true });
  ok(l.blocking === false && l.auDepot === true && l.state === "missing", "voie API : non bloquante, marquée auDepot");
  const okLigne = { name: "Style", state: "ok", value: "Droite", allowedValues: STYLE };
  ok(ligneEbayAuDepot(okLigne, { voieApi: true }) === okLigne, "une ligne déjà remplie : inchangée");
  const marque = manque("Marque", ["Mango"]);
  ok(ligneEbayAuDepot(marque, { voieApi: true }) === marque, "voie API, Marque : la question reste");
}

console.log("3. Une ligne « au dépôt » n'est ni une question ni un blocage");
{
  const style = ligneEbayAuDepot(manque("Style", STYLE), { voieApi: true });
  const marque = manque("Marque", ["Mango", "Zara"]);
  ok(aspectBloquant(style) === false && aspectBloquant(marque) === true, "aspectBloquant : Style non, Marque oui");
  const q = questionsAPoser({ ebayRequiredStatus: [style, marque], genericFieldToSharedKey: () => null, SHARED_PROPAGATION: {} });
  ok(q.redEbayAspects.length === 1 && q.redEbayAspects[0].name === "Marque", "questionsAPoser : seule « Marque » est posée", JSON.stringify(q.redEbayAspects.map((a) => a.name)));
}

console.log("4. Les mêmes motifs que le serveur");
{
  const dev = lire("supabase/functions/_shared/aspect-devine.ts");
  const bloc = /const JAMAIS_DEVINE_RE = new RegExp\("\^\(\?:" \+ \[([\s\S]*?)\]\.join\("\|"\)/.exec(dev)?.[1] ?? "";
  // eslint-disable-next-line no-new-func
  const serveur = bloc ? Function(`return [${bloc}];`)() : null;
  ok(Array.isArray(serveur) && JSON.stringify(serveur) === JSON.stringify(MOTS_JAMAIS_DEVINES), "JAMAIS_DEVINE_RE : identique à aspect-devine.ts");
  const ia = lire("supabase/functions/_shared/ebay-aspects-ia.ts");
  ok(ia.includes(`export const ASPECT_TAILLE_RE = ${ASPECT_TAILLE_RE.toString()};`), "ASPECT_TAILLE_RE : identique à ebay-aspects-ia.ts");
  ok(ia.includes(`export const ASPECT_MESURE_RE = ${ASPECT_MESURE_RE.toString()};`), "ASPECT_MESURE_RE : identique à ebay-aspects-ia.ts");
  ok(/vraies\.length < 2[\s\S]*liste sans deux vraies options/.test(dev) && /vraies\.filter\(\(v\) => \/\\d\/\.test\(v\)\)\.length \* 2 >= vraies\.length/.test(dev), "deux vraies options, liste de nombres : mêmes seuils");
}

console.log("5. L'écran est branché");
{
  const ecran = lire("src/components/ListingPreviewScreen.jsx");
  ok(/return ligneEbayAuDepot\(manquant, \{ voieApi: ebayVoieApiReelle \}\);/.test(ecran), "ebayRequiredStatus : la dernière ligne « missing » passe par la règle");
  ok(/cheminVintedFiche, attributsBase, ebayVoieApiReelle\]\);/.test(ecran), "… et se recalcule quand la voie change");
}

console.log(`\n${verts} vertes, ${rouges} rouges — lot du 21/11, point 2 (eBay : ce qui se devine part au dépôt).`);
if (rouges) { console.log("ROUGE"); process.exit(1); }
