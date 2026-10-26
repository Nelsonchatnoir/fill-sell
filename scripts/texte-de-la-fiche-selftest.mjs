// Autotest : LE TEXTE QUI PART EST CELUI DE LA FICHE (04/10/2026, Louis —
// 13 « Rangement … » partis sur Leboncoin avec une description périmée).
//
//     node --import ./scripts/loader-ext.mjs scripts/texte-de-la-fiche-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. le texte « du vendeur » de la fiche : relevé, dressing, marqueurs
//      vinted / manuel / releve_* — jamais un brouillon Lens non touché ;
//   2. le cas réel de Louis : copie enregistrée à 154 caractères, fiche à 315
//      → la fiche l'emporte, sur TOUTES les cartes, mise en conformité ;
//   3. une retouche à la main pendant la publication n'est jamais défaite par
//      la fiche relue, et elle est écrite sur la fiche (marqueur manuel) ;
//   4. l'écran est câblé : réouverture, envoi (jobs construits depuis le texte
//      relu), retouche notée, repli « version en ligne » coupé sur un texte
//      du vendeur.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);

let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const T = await charger("src/publication/texteDeLaFiche.js");
const V = await charger("src/utils/valeursGenerales.js");

console.log("1. le texte du vendeur");
const ANCIEN = "Rangement noir et rose pour 12 pots. Très bon état, peu servi. Envoi soigné.";
const RECENT = "Rangement noir et rose pour 12 pots à épices, 30 × 20 cm, plastique rigide. Très bon état, peu servi, lavé. Idéal cuisine ou salle de bain. Envoi soigné sous 48 h, colis protégé. N'hésitez pas à me faire une offre groupée avec mes autres rangements (noir et bleu, noir et vert…).";
const louis = { titre: "Rangement Noir et Rose pour 12 pots", description: RECENT, origine: "releve_beebs", attributs: {} };
ok(T.texteDuVendeurDe(louis).description === RECENT, "article relevé (releve_beebs) : sa description est celle du vendeur");
ok(T.texteDuVendeurDe({ ...louis, origine: "vinted_sync" }).description === RECENT, "article du dressing : idem");
ok(T.texteDuVendeurDe({ ...louis, origine: "lens", attributs: { description_source: { v: "manuel", at: "x" } } }).description === RECENT, "marqueur manuel : idem");
ok(T.texteDuVendeurDe({ ...louis, origine: "lens", attributs: { description_source: { v: "releve_leboncoin" } } }).description === RECENT, "marqueur releve_* : idem");
ok(T.texteDuVendeurDe({ ...louis, origine: "lens", attributs: { description_source: { v: "lens" } } }).description === "", "brouillon Lens non touché : PAS imposé (l'IA le rédige, comme avant)");
ok(T.texteDuVendeurDe({ ...louis, description: "Rangement" }).description === "", "un seul mot : pas un texte");
ok(T.texteDuVendeurDe(null).titre === "", "pas de ligne : rien");

console.log("2. le cas de Louis (copie à 154 caractères, fiche à 315)");
const generalesCopie = { titre: louis.titre, description: ANCIEN, etat: "Très bon état" };
const patch = T.champsAReprendreDeLaFiche(T.texteDuVendeurDe(louis), generalesCopie);
ok(patch.description === RECENT && !("titre" in patch), "la description est reprise de la fiche, le titre (identique) ne bouge pas");
const carte = (description) => ({ title: louis.titre, description, platform_fields: {}, price: 12 });
const edited = { leboncoin: carte(ANCIEN), vinted: carte(ANCIEN), beebs: carte(ANCIEN) };
const dissociees = V.dissociationsVides();
dissociees.description.add("beebs"); // exception posée sur l'ANCIEN texte
const apres = V.appliquerGenerale(edited, { champ: "description", valeur: patch.description, plateformes: Object.keys(edited), dissociees: V.dissociationsVides() });
ok(["leboncoin", "vinted", "beebs"].every((p) => apres[p].description.startsWith("Rangement noir et rose pour 12 pots à épices")),
  "réouverture : TOUTES les cartes reçoivent le texte de la fiche (l'exception sur l'ancien texte ne tient plus)");
ok(apres.leboncoin.description === V.valeurPourPlateforme("description", RECENT, "leboncoin").valeur, "Leboncoin : le texte de la fiche, mis en conformité");
const egal = T.champsAReprendreDeLaFiche(T.texteDuVendeurDe(louis), { ...generalesCopie, description: RECENT + "\n" });
ok(!Object.keys(egal).length, "fiche et texte général identiques (aux blancs près) : rien ne bouge");

console.log("3. la retouche à la main");
const retouche = "Mon texte, retouché à l'instant dans le stepper.";
const p2 = T.champsAReprendreDeLaFiche(T.texteDuVendeurDe(louis), { ...generalesCopie, description: retouche }, new Set(["description"]));
ok(!("description" in p2), "envoi : la fiche relue ne défait pas une retouche de cette publication");
const ecrit = T.retoucheAEcrire(louis, { ...generalesCopie, description: retouche }, new Set(["description"]), "2026-10-04T22:40:00Z");
ok(ecrit?.description === retouche && ecrit.attributs.description_source.v === "manuel" && !("titre" in ecrit), "la retouche est écrite sur la fiche, marqueur manuel, et rien d'autre");
ok(T.retoucheAEcrire(louis, { ...generalesCopie, description: "  " }, new Set(["description"])) === null, "⛔ un texte général vidé n'efface jamais la fiche");
ok(T.retoucheAEcrire(louis, { ...generalesCopie, description: RECENT }, new Set(["description"])) === null, "retouche égale à la fiche : rien à écrire");
ok(T.retoucheAEcrire(louis, { ...generalesCopie, description: retouche }, new Set()) === null, "sans geste de la personne : rien n'est écrit sur la fiche");

console.log("4. câblage de l'écran");
const ecran = lire("src/components/ListingPreviewScreen.jsx");
ok(/select\("prix_achat,prix_achat_inconnu,attributs,titre,description,origine"\)/.test(ecran)
  && /champsAReprendreDeLaFiche\(texteDuVendeurDe\(art\), generalesRef\.current \?\? data\.fiche\.generales \?\? \{\}, \[\.\.\.retouchesMainRef\.current\]\)/.test(ecran), "réouverture : la fiche relue est comparée au texte AFFICHÉ (26/10, étape 6), une retouche de l'écran reste");
ok(/const generalesRef = useRef\(generales\);\r?\n\s*generalesRef\.current = generales;/.test(ecran), "le texte général courant est tenu à chaque rendu (generalesRef)");
ok(/const base = attributsBase && typeof attributsBase === "object" \? attributsBase\r?\n\s*: \(initialListing\?\.attributs/.test(ecran), "attributV : les attributs de l'article du Stock tant que la ligne n'est pas relue");
ok(/attributs: attributsBase \?\? initialListing\?\.attributs \?\? null,/.test(ecran), "version en ligne : le texte du vendeur se reconnaît dès l'ouverture (marqueur de l'article du Stock)");
ok(/\.select\("titre,description,origine,attributs"\)\.eq\("id", idFiche\)/.test(ecran) && /edited: editedEnvoi, price/.test(ecran),
  "envoi : la fiche est relue et les jobs sont construits depuis ce texte");
ok(ecran.indexOf("retoucheAEcrire(ligneFiche") < ecran.indexOf("const construction = construireJobs("), "envoi : la retouche est écrite sur la fiche AVANT les jobs");
ok(/onValeurGenerale: retoucherValeurGenerale/.test(ecran) && /onValeurGenerale=\{retoucherValeurGenerale\}/.test(ecran)
  && /poserValeurGenerale: retoucherValeurGenerale/.test(ecran), "stepper, nouvelle peau et lot : la saisie de la personne est notée comme retouche");
ok(/if \(duVendeur\[champ\]\) continue; \/\/ le texte du vendeur sur la fiche fait foi/.test(ecran), "repli « version en ligne la plus récente » coupé sur un texte du vendeur");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/m\.poserValeurGenerale\?\.\("description", ev\.target\.value\)/.test(lot), "lot : le texte relu passe par la retouche de l'écran");

console.log("5. (26/10, étape 6) Le texte qui n'est pas celui du vendeur ne reste jamais à l'écran — fiche 1791299785299, 02:45");
{
  // Rejoue la préparation du lot : (1) la copie enregistrée = le texte du vendeur ; (2) la version en ligne d'une autre
  // plateforme (Beebs) est posée par l'effet « version en ligne » ; (3) le filet de réouverture relit la fiche.
  const WWE = "TEST FillSell, ne pas acheter.\n\nJe vends WWE 2K20 sur PlayStation 4 (PS4), carte promotionnelle.";
  const BEEBS = "Call of Duty Modern Warfare pour PlayStation 4, version française PAL FR.\n#activision #callofduty #ps4 #jeuvidéo";
  const attributs = { description_source: { v: "manuel", source: "manuel", at: "2026-10-26T01:38:39Z" } };
  const article = { titre: "TEST FillSell ne pas acheter - Call of Duty PS4", description: WWE, origine: null, attributs };
  const effet = (generales, attrs) => {
    const duVendeur = T.texteDuVendeurDe({ ...article, attributs: attrs });
    const manuel = String(attrs?.description_source?.v ?? "").toLowerCase() === "manuel";
    if (manuel || duVendeur.description) return generales;
    return { ...generales, description: BEEBS };
  };
  const enregistree = { titre: article.titre, description: WWE };
  const avant = effet(enregistree, null);
  ok(avant.description === BEEBS, "code d'avant : sans les attributs de la ligne (pas encore relue), le texte Beebs remplaçait celui du vendeur");
  ok(T.champsAReprendreDeLaFiche(T.texteDuVendeurDe(article), enregistree).description === undefined, "code d'avant : le filet comparait à la copie ENREGISTRÉE — égale à la fiche, il ne corrigeait rien");
  ok(effet(enregistree, article.attributs).description === WWE, "corrigé : les attributs de l'article du Stock suffisent — le texte du vendeur reste");
  ok(T.champsAReprendreDeLaFiche(T.texteDuVendeurDe(article), avant, []).description === WWE, "corrigé : le filet compare au texte affiché — un texte posé entre-temps est remplacé par celui du vendeur");
  ok(T.champsAReprendreDeLaFiche(T.texteDuVendeurDe(article), { ...avant, description: "Ma retouche" }, ["description"]).description === undefined, "une retouche à la main de cet écran n'est jamais défaite");
}

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
