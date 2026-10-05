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
  && /champsAReprendreDeLaFiche\(texteDuVendeurDe\(art\), data\.fiche\.generales \?\? \{\}\)/.test(ecran), "réouverture : la fiche relue est comparée à la copie enregistrée");
ok(/\.select\("titre,description,origine,attributs"\)\.eq\("id", idFiche\)/.test(ecran) && /edited: editedEnvoi, price/.test(ecran),
  "envoi : la fiche est relue et les jobs sont construits depuis ce texte");
ok(ecran.indexOf("retoucheAEcrire(ligneFiche") < ecran.indexOf("const construction = construireJobs("), "envoi : la retouche est écrite sur la fiche AVANT les jobs");
ok(/onValeurGenerale: retoucherValeurGenerale/.test(ecran) && /onValeurGenerale=\{retoucherValeurGenerale\}/.test(ecran)
  && /poserValeurGenerale: retoucherValeurGenerale/.test(ecran), "stepper, nouvelle peau et lot : la saisie de la personne est notée comme retouche");
ok(/if \(duVendeur\[champ\]\) continue; \/\/ le texte du vendeur sur la fiche fait foi/.test(ecran), "repli « version en ligne la plus récente » coupé sur un texte du vendeur");
const lot = lire("src/publication/lot/LotPublication.jsx");
ok(/m\.poserValeurGenerale\?\.\("description", ev\.target\.value\)/.test(lot), "lot : le texte relu passe par la retouche de l'écran");

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
