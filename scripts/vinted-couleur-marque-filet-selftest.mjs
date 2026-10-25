// Autotest : VINTED, À LA PUBLICATION — LA COULEUR NE BLOQUE JAMAIS, L'ABSENCE DE
// MARQUE NE SE DEMANDE PAS, UNE RÉPONSE « MARQUE » N'EST JAMAIS REDEMANDÉE
// (filet serveur de get-pending-jobs, 11/10/2026 soir, Nico).
//
//     npm run selftest:vinted-couleur-marque-filet
//
// Cas réels : jakefawright (figurine, abandon sur « Couleur »), lucyburaux988
// (bijoux sans marque : la question « Marque » à chaque article), les
// baskets de jakefawright (« Black », couleur de Lens en anglais, jamais
// posée sur le formulaire). Sans réseau.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const F = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/vinted-couleur-marque-filet.js")).href);
const { VINTED_COLORS } = await import(pathToFileURL(join(ROOT, "src/utils/vintedColors.js")).href);
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };

console.log("1. couleur : jamais une question");
const fig = F.couleursVintedSansQuestion({ pf: {}, attrs: {} });
ok(fig.colors.length === 1 && fig.colors[0] === "Multicolore" && fig.source === "repli", "figurine sans couleur nulle part : « Multicolore », aucune question");
ok(VINTED_COLORS.includes(F.COULEUR_REPLI_VINTED), "le repli est un libellé de la palette Vinted");
ok(F.couleursVintedSansQuestion({ pf: { couleur: "Bleu marine" } }).colors.join() === "Marine", "une couleur de la copie part, ramenée à la palette (« Bleu marine » → « Marine »)");
const fiche = F.couleursVintedSansQuestion({ pf: {}, attrs: { couleur: { v: "Rouge", source: "lens" } } });
ok(fiche.colors.join() === "Rouge" && fiche.source === "fiche", "la couleur de la FICHE (Lens compris : la publication a droit à l'IA) est reprise");
ok(F.couleursVintedSansQuestion({ pf: {}, attrs: { couleur: "Vert" } }).colors.join() === "Vert", "forme ancienne de l'attribut (chaîne nue) lue");
const black = F.couleursVintedSansQuestion({ pf: { couleur: "Black" } });
ok(black.colors.join() === "Noir" && black.source === "copie", "« Black » (Lens en anglais) → « Noir » : la couleur atteint enfin le formulaire");
ok(F.couleursVintedSansQuestion({ pf: { couleur: "Burgundy" } }).colors.join() === "Bordeaux", "« Burgundy » → « Bordeaux »");
ok(F.couleursVintedSansQuestion({ pf: { couleur: "zzz" }, attrs: { couleur: { v: "Jaune" } } }).colors.join() === "Jaune", "copie illisible : la fiche tranche");

console.log("2. marque");
ok(F.marqueVintedSansQuestion({ pf: {}, attrs: {}, marqueColonne: null })?.marque === "Sans marque", "bijou SANS AUCUNE marque (lucyburaux988) : « Sans marque », aucune question");
ok(F.marqueVintedSansQuestion({ pf: {}, attrs: { marque: { v: "Pandora", source: "lens" } } }) === null, "la fiche porte une marque : jamais « Sans marque » en silence");
ok(F.marqueVintedSansQuestion({ pf: {}, attrs: {}, marqueColonne: "Zara" }) === null, "marque dans la colonne de la fiche : idem");
ok(F.marqueVintedSansQuestion({ pf: { marque: "Nike" }, attrs: {} }) === null, "une marque déjà sur la copie : on n'y touche pas");
const rep = { marque_vinted: { v: "Sans marque", de: "W WLOERINS", source: "manuel", at: "2026-10-10T16:20:00Z" } };
ok(F.marqueVintedSansQuestion({ pf: { marque: "W WLOERINS" }, attrs: rep })?.marque === "Sans marque", "réponse déjà donnée pour CET article (« W WLOERINS » → « Sans marque ») : jamais redemandée");
ok(F.marqueVintedSansQuestion({ pf: { marque: "w wloerins " }, attrs: rep })?.source === "reponse_article", "même marque écrite autrement : la réponse vaut");
ok(F.marqueVintedSansQuestion({ pf: { marque: "Nike" }, attrs: rep }) === null, "une AUTRE marque sur la copie : la réponse ne la remplace pas");
ok(F.marqueVintedSansQuestion({ pf: {}, attrs: { marque_vinted: { v: "Swarovski", de: "Swaro" } } })?.marque === "Swarovski", "copie vide : la réponse de l'article vaut");

console.log("3. câblage get-pending-jobs (publication Vinted seulement)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
const i = gpj.indexOf("UN DÉPÔT VINTED SANS COULEUR OU SANS MARQUE NE PART PAS AU REFUS");
const bloc = gpj.slice(i, gpj.indexOf("PEGI (VINTED « JEUX ») ET ÂGE (BEEBS)", i));
ok(i > 0 && /couleursVintedSansQuestion\(\{ pf, attrs: fiche\?\.attributs \?\? null \}\)/.test(bloc) && /pf\.colors = c\.colors;/.test(bloc),
  "le filet pose la couleur dans fields.colors (ce que lit vinted.js)");
ok(/const couleurManque = false; \/\/ jamais une question/.test(bloc) && !/field_key: "color"[^\n]*couleurManque/.test(bloc.replace(/if \(couleurManque\)[^\n]*\n/, "")),
  "plus aucune question « Couleur »");
ok(/marqueVintedSansQuestion\(\{ pf, attrs: fiche\?\.attributs \?\? null, marqueColonne: fiche\?\.marque \?\? null \}\)/.test(bloc), "fiche sans marque : « Sans marque » avant la question");
ok(/if \(j\.platform !== "vinted" \|\| \(j\.action \?\? "publish"\) !== "publish"\) continue;/.test(bloc), "publication seulement : la republication rejoue son annonce (pas d'IA)");
const iF = gpj.indexOf("MARQUE ET COULEUR VINTED DEPUIS LA FICHE");
const blocF = gpj.slice(iF, gpj.indexOf("L'ABSENCE DE MARQUE, TRADUITE POUR CHAQUE PLATEFORME", iF));
ok(/repArticle\?\.source === "reponse_article"/.test(blocF) && /\.select\("id, attributs, marque(?:, titre, description)?"\)/.test(blocF), "la réponse de l'article (marque_vinted) est appliquée depuis la fiche");
ok(/import \{ couleursVintedSansQuestion, marqueVintedSansQuestion[^}]*\} from "\.\.\/_shared\/vinted-couleur-marque-filet\.js";/.test(gpj), "import du filet");

// ── 4. (25/10, audit N9) LA REPUBLICATION : jobs 6ff45122 / 775186a3 (compte 40e1122e, « Nerf élite ») ──
console.log("4. republication Vinted sans couleur : jamais une question, jamais par-dessus la copie, sans IA");
const nerf = (pf = {}) => ({ capture_id: "16469", republish_step: "captured",
  republish_snapshot: { capture_id: "16469", couleurs: [], titre: "Nerf élite showckwave + 22balles", categoryPath: ["Enfants", "Jeux et jouets", "Jeux de sport et de plein air"] }, ...pf });
const d1 = F.couleurRepublicationAPoser(nerf());
ok(d1?.action === "poser" && d1.titre === "Nerf élite showckwave + 22balles", "6ff45122 : annonce capturée SANS couleur, rayon qui en exige une → la couleur est posée par le serveur");
const c1 = F.couleurRepublicationSansQuestion({ attrs: null, couleursDepot: null, titre: d1.titre });
ok(c1.couleur === "Multicolore" && c1.source === "repli", "rien sur la fiche, ni au dépôt, ni dans le titre → « Multicolore » (la question « Couleur » ne part plus)");
ok(F.couleurRepublicationSansQuestion({ attrs: { couleur: { v: "Bleu", source: "manuel" } }, couleursDepot: ["Rouge"], titre: "Pull vert" }).couleur === "Bleu", "1. la couleur de la fiche (source du vendeur) d'abord");
ok(F.couleurRepublicationSansQuestion({ attrs: { couleur: { v: "Black", source: "lens" } }, couleursDepot: ["Rouge"] }).source === "depot_origine",
  "⛔ sans IA : une couleur de fiche venue de Lens n'est pas reprise — le dépôt d'origine passe avant");
ok(F.couleurRepublicationSansQuestion({ attrs: { couleur: "Vert" } }).couleur === "Vert", "forme ancienne (chaîne nue) de la fiche lue");
ok(F.couleurRepublicationSansQuestion({ couleursDepot: ["Bleu marine"] }).couleur === "Marine", "2. le dépôt d'origine, ramené à la palette");
ok(F.couleurRepublicationSansQuestion({ titre: "Pull bleu clair et blanc" }).couleur === "Bleu clair" && F.couleurRepublicationSansQuestion({ titre: "Vase CRÈME" }).source === "titre",
  "3. un mot du titre de la palette, le plus long d'abord (« Bleu clair » avant « Bleu »), casse et accents ignorés");
ok(F.couleurDuTitreVinted("Bottes Cosmoparis noires") === null && F.couleurDuTitreVinted("Montre dorée") === null, "… en mots entiers seulement (« noires », « dorée » : rien de deviné)");
ok(F.couleurRepublicationAPoser(nerf({ republish_snapshot: { ...nerf().republish_snapshot, couleurs: ["Bleu"] } })) === null,
  "⛔ l'annonce capturée porte une couleur : rien n'est posé (vinted.js l'écraserait)");
ok(F.couleurRepublicationAPoser(nerf({ vintedAspects: { color: "Bleu" }, needsUserResolved: { "vintedAspects.color": "Bleu" } })) === null,
  "⛔ une réponse de la personne (vintedAspects.color) n'est jamais remplacée");
ok(F.couleurRepublicationAPoser(nerf({ republish_snapshot: { ...nerf().republish_snapshot, categoryPath: ["Loisirs et collections", "Cartes à collectionner", "Cartes à collectionner à l'unité"] } })) === null,
  "rayon mesuré sans champ Couleur (cartes à collectionner) : rien à poser");
ok(F.couleurRepublicationAPoser(nerf({ capture_id: "17000" })) === null, "copie d'une AUTRE capture que celle du job : rien (on ne juge pas sur une copie périmée)");
ok(F.couleurRepublicationAPoser(nerf({ republish_snapshot: { ...nerf().republish_snapshot, categoryPath: ["Bambini", "Giochi e giocattoli"] } })) === null,
  "⛔ page Vinted non française (rayon « Bambini ») : rien — sa palette porte d'autres mots, l'extension la lit elle-même");
const posee = nerf({ vintedAspects: { color: "Multicolore" }, couleur_republication_sans_question: { couleur: "Multicolore", source: "repli" } });
ok(F.couleurRepublicationAPoser(posee) === null, "déjà posée à un service précédent : rien ne change (aucune réécriture)");
ok(F.couleurRepublicationAPoser({ ...posee, republish_snapshot: { ...posee.republish_snapshot, couleurs: ["Rouge"] } })?.action === "retirer",
  "une capture plus récente porte une couleur : celle posée par FillSell est retirée");
ok(F.couleurRepublicationAPoser({ ...posee, needsUserResolved: { "vintedAspects.color": "Multicolore" }, republish_snapshot: { ...posee.republish_snapshot, couleurs: ["Rouge"] } }) === null,
  "… jamais une réponse de la personne");
const iR = gpj.indexOf("LA COULEUR D'UNE REPUBLICATION VINTED QUI N'EN PORTE PAS NE SE DEMANDE PLUS");
const blocR = gpj.slice(iR, gpj.indexOf("TAILLE VINTED À LA **PUBLICATION**", iR));
ok(iR > 0 && /couleurRepublicationAPoser\(pfC\)/.test(blocR) && /pfC\["vintedAspects"\] = \{ \.\.\.va, color: c\.couleur \};/.test(blocR),
  "get-pending-jobs : posée dans vintedAspects.color (le canal que vinted.js lit) aux étapes captured / deleted");
ok(/if \(!includeProcessing && !includeNeedsUser\) \{/.test(blocR) && /lireParLots\(/.test(blocR) && !/generate-listing|resolve_couleur|couleur-ia/.test(blocR),
  "… au poll d'exécution, lectures par lots, sans IA");
const vjs = lire("chrome-extension/content-scripts/vinted.js");
ok(/const _color = String\(_va\.color \?\? ""\)\.trim\(\);\s*if \(_color\) \{\s*fields\.colors = \[_color\];/.test(vjs), "vinted.js : vintedAspects.color devient fields.colors (d'où « jamais par-dessus la copie »)");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
