// ═══════════════════════════════════════════════════════════════════════════
// LES DÉFAUTS DE FOND DU LOT DE NICO (26/10 nuit, point 1) — `npm run selftest:lot-defauts-2610`
// ═══════════════════════════════════════════════════════════════════════════
// Le lot « Publier 32 articles » de Nico (25/10, 20:59) a affiché 11 questions bloquantes. Quatre défauts de fond,
// corrigés à la RÈGLE (tous les comptes) et vérifiés ici sur le code LIVRÉ :
//   1. le livre « EAT » : l'ISBN était écrit sur la FICHE (« ISBN 9782981413604 ») mais la copie réécrite le masquait,
//      puis la question « Oui, confirmer » (fausse liste à une valeur) aurait publié sans ISBN ;
//   2. la montre G-Shock : Beebs (et Vinted) demandent une « Taille » = diamètre du boîtier ; l'IA en posait une au
//      hasard dans un canal que beebs.js ne lit pas → diamètre écrit, sinon « Taille unique » ;
//   3. le robot aspirateur : aucun rayon Beebs candidat → « Pas sur Beebs » en un geste, jamais un champ vide ;
//   4. le téléphone Samsung : le menu « Modèle » ne proposait que des iPhone (relevé Apple sans sa marque).
// Plus : les titres entiers (champ de 2 lignes), et l'ISBN lu de la même façon côté serveur.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const RACINE = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => readFileSync(join(RACINE, p), "utf8").replace(/\r\n/g, "\n");
const imp = (p) => import(pathToFileURL(join(RACINE, p)).href);
const C = await imp("supabase/functions/_shared/champs-requis-auto.js");
const I = await imp("supabase/functions/_shared/isbn.js");
const X = await imp("supabase/functions/_shared/vinted-exigences.js");
const R = await imp("src/publication/moteur/regles.js");
const L = await imp("src/publication/moteur/listes.js");
let verts = 0, rouges = 0;
const ok = (c, msg, d = "") => { if (c) { verts++; console.log(`  ok   ${msg}`); } else { rouges++; console.log(`  RATÉ ${msg}${d ? `  ← ${d}` : ""}`); } };

console.log("1. Le livre « EAT » : l'ISBN de la FICHE, jamais masqué par la copie ; la ligne ISBN n'est pas une liste à une valeur");
const ficheEat = "Livre de Gilles Lartigot intitulé « EAT - Chroniques d'un fauve dans la jungle alimentaire ». ISBN 9782981413604. Très bon état.";
const copieEat = "Livre « EAT » de Gilles Lartigot, chroniques sur l'alimentation. Très bon état, envoi soigné.";
ok(I.resoudreIsbn({ description: copieEat }) === null, "la copie seule ne dit pas l'ISBN (c'était la seule lue)");
const eat = I.resoudreIsbn({ description: [ficheEat, copieEat], titre: ["EAT - Chroniques d'un fauve dans la jungle alimentaire de Gilles Lartigot"] });
ok(eat?.isbn13 === "9782981413604" && eat?.source === "description", "fiche + copie : ISBN 9782981413604 trouvé (la question disparaît)", JSON.stringify(eat));
ok(I.resoudreIsbn({ description: ["ISBN 9782981413604", "ISBN 978-2-253-17415-8"] }) === null, "deux ISBN valides différents d'un texte à l'autre → rien (la question)");
ok(I.resoudreIsbn({ description: ["ISBN 9782981413604", "isbn : 978-2981413604"] })?.isbn13 === "9782981413604", "le même ISBN écrit deux fois → posé");
ok(I.resoudreIsbn({ description: "ISBN 2-902634-36-6" })?.isbn13 === "9782902634361", "une chaîne seule marche toujours (appelants d'avant)");
ok(I.resoudreIsbn({ reponse: "9782253174158", description: ["ISBN 9782981413604"] })?.source === "reponse", "la réponse de la personne passe toujours devant");
const q = R.questionsAPoser({ genericRequiredStatus: {}, genericFieldToSharedKey: () => null, SHARED_PROPAGATION: {}, peutDecocher: true });
ok(q.genSeule({ a: { key: "isbn", state: "missing", allowedValues: [X.ISBN_ABSENT] } }) === false, "la ligne ISBN (« Ce livre n'a pas d'ISBN » posé par notre code) n'est PLUS « la seule valeur acceptée »");
ok(q.genSeule({ a: { key: "condition", state: "missing", allowedValues: ["Neuf avec étiquette"] } }) === true, "une vraie liste à une valeur (Medik8, « Neuf avec étiquette ») garde sa confirmation");
const bloc = lire("src/publication/BlocQuestions.jsx");
ok(/gp === "vinted" && a\.key === "isbn"[\s\S]{0,400}ISBN_ABSENT/.test(bloc), "la ligne ISBN garde sa vraie question : le numéro se tape, ou « Ce livre n'a pas d'ISBN » en un geste");
const lps = lire("src/components/ListingPreviewScreen.jsx");
ok(/const descriptions = \[initialListing\?\.description, copie\.description\]/.test(lps) && /resoudreIsbn\(\{ article: isbnFiche, description: descriptions, titre: titres \}\)/.test(lps), "l'écran Publier lit la fiche PUIS la copie");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(/description: \[snap\?\.description, j\.description\]/.test(gpj) && /description: \[fiche\?\.description, pf\.description\]/.test(gpj), "le serveur (get-pending-jobs) lit tous les textes, l'origine d'abord");

console.log("\n2. Les montres : la « Taille » est le diamètre du boîtier — écrit, sinon « Taille unique »");
const BEEBS = ["Jusqu'à 30 mm", "31 mm - 38 mm", "39 mm - 42 mm", "43 mm - 46 mm", "47 mm et plus", "Taille unique"];
const VINTED = ["Jusqu'à 30 mm", "30–38 mm", "39–42 mm", "43–46 mm", "47 mm et plus", "Taille unique"];
const gshock = "Montre Casio G-Shock modèle GA-2100 avec boîtier octogonal en résine noire. Affichage analogique-numérique.";
const v = (r) => r?.valeur ?? (r?.doute ? "doute" : null);
ok(v(C.tailleMontreAuto({ chemin: "Mode > Homme > Accessoires (homme) > Montres (homme)", textes: [gshock], allowedValues: BEEBS })) === "Taille unique", "la G-Shock de Nico (Beebs) : aucun diamètre écrit → « Taille unique », sans question");
ok(v(C.tailleMontreAuto({ chemin: "Hommes > Accessoires > Montres", textes: [gshock], allowedValues: VINTED })) === "Taille unique", "la même sur Vinted → « Taille unique »");
ok(v(C.tailleMontreAuto({ chemin: "Hommes > Accessoires > Montres", textes: ["Boîtier de 42 mm, bracelet 20 mm"], allowedValues: VINTED })) === "39–42 mm", "« boîtier de 42 mm » → 39–42 mm (le bracelet de 20 mm ne compte pas)");
ok(v(C.tailleMontreAuto({ chemin: "Mode > Femme > Accessoires (femme) > Montres (femme)", textes: ["Montre 45,4 mm de diamètre"], allowedValues: BEEBS })) === "43 mm - 46 mm", "« 45,4 mm de diamètre » → 43 mm - 46 mm (Beebs)");
ok(v(C.tailleMontreAuto({ chemin: "Hommes > Accessoires > Montres", textes: ["cadran 38.5mm"], allowedValues: VINTED })) === "30–38 mm", "« cadran 38.5mm » → 30–38 mm");
ok(v(C.tailleMontreAuto({ chemin: "Hommes > Accessoires > Montres", textes: ["boîtier 40 mm, cadran 36 mm"], allowedValues: VINTED })) === "doute", "deux diamètres différents → la question");
ok(v(C.tailleMontreAuto({ chemin: "Hommes > Accessoires > Montres", textes: ["bracelet 20 mm"], allowedValues: VINTED })) === "Taille unique", "« bracelet 20 mm » seul n'est pas un boîtier → « Taille unique »");
ok(C.tailleMontreAuto({ chemin: "Femmes > Vêtements > Robes", textes: ["boîtier 40 mm"], allowedValues: VINTED }) === null, "hors montres : la règle ne joue pas");
ok(C.tailleMontreAuto({ chemin: "Hommes > Accessoires > Montres", textes: ["boitier 40mm"], allowedValues: ["S", "M"] }) === null, "une autre grille que les diamètres : la règle ne joue pas");
// (26/10 nuit, point 11) + les sources de la bague, après celles de la montre.
ok(/tailleMontreAuto\(\{ chemin: cheminListe, textes, allowedValues \}\)/.test(lps) && /"diametre_ecrit", "montre_sans_diametre"(, "bague_du_texte", "bague_ajustable")?\]/.test(lps), "branchée dans l'écran Publier, posée sur la copie (champ dédié « taille »)");
ok(/const askable = missing\.filter\(a => !\(estChampTaille\(gp, a\.key\) \|\| a\.dedicatedTarget === "taille"\)\)/.test(lps), "une TAILLE ne part jamais à l'IA, même avec un champ dédié (« 39 mm - 42 mm », « 22,6 mm » sans source)");
ok(/\(a\.allowedValues\?\.length \?\? 0\) !== 1 && !a\.deduit\)/.test(lps), "une ligne déjà déduite d'une source fiable ne part pas à l'IA");
ok(/const generic = platform === "beebs" && !canalGeneriquePose\(platform, key\) \? "" : /.test(lps), "Beebs : une valeur dans un canal que beebs.js saute n'est pas une valeur (plus deux verdicts contraires)");

console.log("\n3. Le robot aspirateur : aucun rayon Beebs candidat → « Pas sur Beebs » en un geste");
const carte = lire("src/components/CarteRayon.jsx");
ok(/onPasSurPlateforme = null/.test(carte) && /aucunCandidat: \(pf, objet\)/.test(carte), "la carte rayon connaît l'issue « Pas sur <plateforme> » et dit qu'aucun rayon ne correspond");
ok(/candidatsEnPuces = questionOuverte \? \(suggestions \?\? \[\]\)[\s\S]{0,120}\.slice\(0, 3\)/.test(carte), "avec des candidats : les 3 premiers en puces (un geste)");
ok(/const ouvertParDefaut = questionOuverte && candidatsEnPuces\.length === 0 && !onPasSurPlateforme/.test(carte), "la recherche vide ne s'ouvre plus d'office quand une réponse en un geste existe");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/onPasSurPlateforme=\{\(\) => \(plateformes\.length > 1 \? sansPlateforme\(id, p\) : retirerDuLot\(id\)\)\}/.test(lot), "le lot branche « Pas sur Beebs », même pour un article qui n'a que Beebs");

console.log("\n4. Le téléphone Samsung : jamais les modèles d'une autre marque");
const IPHONES = ["iPhone 11", "iPhone 12", "iPhone 13"];
ok(L.modelesVintedPourLaMarque("vinted", "model", IPHONES, "Samsung").length === 0, "Samsung : les iPhone ne sont plus proposés (le modèle se tape)");
ok(L.modelesVintedPourLaMarque("vinted", "model", IPHONES, "Apple").length === 3, "Apple : la liste reste");
ok(L.modelesVintedPourLaMarque("vinted", "model", ["AirPods Pro", "AirPods Max"], "Sony").length === 0, "les AirPods ne se proposent pas à un casque Sony");
ok(L.modelesVintedPourLaMarque("vinted", "model", ["Galaxy S21", "iPhone 12"], "Samsung").length === 2, "une liste qui n'est pas que d'Apple : inchangée");
ok(L.modelesVintedPourLaMarque("vinted", "size", IPHONES, "Samsung").length === 3 && L.modelesVintedPourLaMarque("beebs", "model", IPHONES, "Samsung").length === 3, "les autres champs et plateformes : inchangés");
ok(/const allowedValues = modelesVintedPourLaMarque\(platform, key, allowedValuesCatalogue, pf\.marque \|\| initialListing\?\.marque \|\| ""\)/.test(lps), "branché dans l'écran Publier, avec la marque de la copie ou de la fiche");

console.log("\n5. Les titres se lisent entiers");
ok(/<textarea className="fsn-textarea" rows=\{2\}[\s\S]{0,200}defaultValue=\{titreQuiPart\}/.test(lot), "le titre du texte qui part : un champ de 2 lignes, plus un champ d'une ligne qui le coupe");
ok(/ev\.target\.value\.replace\(\/\\s\*\\n\+\\s\*\/g, " "\)/.test(lot), "jamais de retour à la ligne dans la valeur du titre");

console.log(`\n${verts} vert(s), ${rouges} rouge(s)`);
process.exit(rouges ? 1 : 0);
