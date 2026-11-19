// Autotest VERROU : LE POIDS ESTIMÉ SELON L'ARTICLE, MOINS DE QUESTIONS DANS LE LOT (19/11/2026 soir, OTA 2 — Nico).
//
//     node --import ./scripts/loader-ext.mjs scripts/poids-estime-1911-selftest.mjs
//
// Décisions de Nico : « Ne laisse PAS le poids à l'estimation de Leboncoin par défaut (Louis : des acheteurs lui
// demandaient de corriger un poids faux). Nous estimons le poids selon le type d'article, marqué « estimé », modifiable
// d'un geste, et le format du colis en découle. Seulement si l'article est impossible à identifier, on laisse
// Leboncoin estimer, sans barre de question. Même logique pour Vinted et Beebs. » Et, sur le lot de ses 27 articles
// (17 « à régler », dont 10 « État ») : regrouper ce qui peut l'être, ne jamais reposer une question.
// Ce qu'il prouve :
//   1. la table : l'objet reconnu dans le titre, le rayon ou l'objet nommé par l'IA → un poids emballé typique ;
//      rien de reconnu → null ; pas de faux ami (« étoile » n'est pas une toile, « besoin » pas un soin, un jeu PS4
//      n'est pas une console) ;
//   2. la taille du colis Vinted qui en découle (Petit / Moyen / Grand / Lourd, grilles au poids) ;
//   3. au clic Publier (lot et unité) : jamais devant un poids connu ni « Saisir le poids », marqué poids_estime ;
//      Vinted : dernier recours après la copie, la fiche, le retenu du rayon ; jamais rangé sur la fiche ;
//   4. l'écran : « ≈ 800 g · estimé (veste) », « Estimé par Leboncoin » seulement pour un objet non reconnu, pas de
//      barre « N sans poids » hors « Saisir le poids » ; l'état « le même pour tous » en option ; le prix d'une copie.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg, d = "") => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${d ? ` — ${d}` : ""}`); } };

const P = await charger("src/utils/poidsEstime.js");
const V = await charger("src/utils/vintedColis.js");
const F = await charger("src/publication/lot/ficheLue.js");
const C = await charger("src/publication/lot/corrections.js");

console.log("1. la table");
{
  const cas = [
    ["Robot aspirateur LIEE blanc et noir", 4500], ["TEST FillSell 31/10 lot H — Veste noir et gris taille M", 800],
    ["T-shirt femme Picture blanc taille S", 250], ["Bouilloire électrique 0.8L blanc et noir", 1300],
    ["Scotch", 200], ["legging ironwomen-pink", 200], ["Call of Duty Modern Warfare PS4 Activision", 200],
    ["PS4 slim 500 Go", 2500], ["Medik8 Liquid Peptides Sérum anti-rides 30ml", 200], ["Téléphone intelligent noir écran 6 pouces", 450],
    ["Parka North Face homme", 1300], ["Baskets Nike Air Max 90", 1100], ["Jean Levi's 501 W32", 650],
  ];
  for (const [t, g] of cas) { const e = P.poidsEstime({ titre: t }); ok(e?.g === g, `« ${t} » → ${g} g`, JSON.stringify(e)); }
  ok(P.poidsEstime({ titre: "TEST FillSell 28/10 — 0.6.152c rayon par identifiant — ne pas acheter" }) === null, "un titre qui ne nomme rien : null (la plateforme estime)");
  ok(P.poidsEstime({ titre: "Une étoile filante" }) === null && P.poidsEstime({ titre: "Au besoin" }) === null, "pas de faux ami (étoile ≠ toile, besoin ≠ soin)");
  const r = P.poidsEstime({ titre: "Article sans nom", chemin: ["Femmes", "Vêtements", "Manteaux et vestes", "Parkas"] });
  ok(r?.g === 1300 && r.source === "rayon", "rien au titre : le rayon de la plateforme dit l'objet");
  const o = P.poidsEstime({ titre: "Lot H", objet: "veste polaire" });
  ok(o?.g === 800 && o.source === "objet", "ni titre ni rayon : l'objet nommé par l'IA (photos)");
  ok(P.texteEstime({ g: 1300, objet: "manteau" }) === "≈ 1,3 kg · estimé (manteau)", "en mots : « ≈ 1,3 kg · estimé (manteau) »");
}

console.log("2. la taille du colis Vinted");
{
  const PMG = [{ id: 1, libelle: "Petit" }, { id: 2, libelle: "Moyen" }, { id: 3, libelle: "Grand" }];
  ok(P.colisVintedDuPoids(PMG, 250)?.id === 1 && P.colisVintedDuPoids(PMG, 1300)?.id === 2 && P.colisVintedDuPoids(PMG, 4500)?.id === 3, "Petit ≤ 1 kg, Moyen ≤ 2 kg, Grand au-delà");
  ok(P.colisVintedDuPoids([...PMG, { id: 8, libelle: "Lourd (2 kg et +)" }], 4500)?.id === 8, "« Lourd » quand la grille l'a");
  ok(P.colisVintedDuPoids([{ id: 8 }, { id: 9 }, { id: 10 }], 6000)?.id === 9, "grille au poids : la plus petite qui porte (10 kg pour 6 kg)");
  ok(P.colisVintedDuPoids(null, 500) === null, "grille inconnue : rien (Vinted recommande)");
}

console.log("3. au clic Publier");
{
  const ed = { leboncoin: { platform_fields: {} }, beebs: { platform_fields: {} }, vinted: { platform_fields: {} } };
  const e1 = P.avecPoidsEstime(ed, { plateformes: ["leboncoin", "beebs", "vinted"], titre: "Veste polaire" });
  ok(e1.leboncoin.platform_fields.lbcPoidsGrammes === 800 && e1.leboncoin.platform_fields.poids_estime?.objet === "veste" && e1.beebs.platform_fields.poids_estime?.g === 800 && !("lbcPoidsGrammes" in e1.beebs.platform_fields),
    "Leboncoin : le poids estimé, marqué ; Beebs : poids_estime (lu au service)");
  ok(ed.leboncoin.platform_fields.lbcPoidsGrammes === undefined, "l'edited d'origine n'est pas touché");
  ok(P.avecPoidsEstime(ed, { plateformes: ["leboncoin"], titre: "Veste", poidsFiche: 650 }) === ed, "un poids sur la fiche : rien d'estimé");
  ok(P.avecPoidsEstime(ed, { plateformes: ["leboncoin"], titre: "Veste", saisir: true }) === ed, "« Saisir le poids » : rien d'estimé à la place de la personne");
  const e2 = P.avecPoidsEstime({ leboncoin: { platform_fields: { lbcPoidsGrammes: 1200 } } }, { plateformes: ["leboncoin"], titre: "Veste" });
  ok(e2.leboncoin.platform_fields.lbcPoidsGrammes === 1200 && !e2.leboncoin.platform_fields.poids_estime, "un poids déjà sur la copie : gardé");
  ok(P.avecPoidsEstime(ed, { plateformes: ["leboncoin"], titre: "Lot H ne pas acheter" }) === ed, "rien de reconnu : la copie part comme avant");
  const ch = ["Femmes", "Vêtements", "Manteaux et vestes"];
  const pfV = { categoryPath: ch };
  V.colisVintedPourJob(pfV, null, null, { g: 800, objet: "veste", source: "titre" });
  ok(pfV.colis_source === "estime" && Number(pfV.packageSizeId) > 0 && pfV.colis_estime?.objet === "veste", "Vinted : la taille estimée, marquée « estime »", JSON.stringify(pfV));
  const pfR = { categoryPath: ch };
  V.colisVintedPourJob(pfR, null, { [ch.join(" > ")]: { id: 2, libelle: "Moyen" } }, { g: 250, objet: "t-shirt", source: "titre" });
  ok(pfR.packageSizeId === 2 && pfR.colis_source === "retenu", "Vinted : le format retenu du rayon passe devant l'estimation");
  const pfF = { categoryPath: ch };
  V.colisVintedPourJob(pfF, { colis_vinted: { v: 3, source: "manuel" } }, null, { g: 250 });
  ok(pfF.packageSizeId === 3 && pfF.colis_source === "manuel", "Vinted : le format de la fiche passe devant l'estimation");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/editedEnvoi = avecPoidsEstime\(editedEnvoi, \{/.test(lps) && /colisVintedPourJob\([^)]*colisRetenus, estimationVinted\)/.test(lps), "le clic Publier (lot et unité) pose l'estimation, Leboncoin, Beebs et Vinted");
  ok(/&& !edited\?\.leboncoin\?\.platform_fields\?\.poids_estime/.test(lps), "un poids estimé n'est jamais rangé sur la fiche comme un poids connu");
  const lp = lire("src/publication/lot/LotPublication.jsx");
  ok(/const est = g == null && !poidsLbcChoixSaisi\(\) \? estimationDe\(m, "leboncoin"\) : null;/.test(lp) && /poids_estime: est \?/.test(lp), "lot : la copie Leboncoin reçoit l'estimation dès la préparation (transporteurs bornés à ce poids)");
}

console.log("4. l'écran");
{
  const m = { edited: { leboncoin: { platform_fields: {} }, beebs: { platform_fields: {} } }, generales: { titre: "Veste polaire noire" } };
  ok(F.colisDe(m, "leboncoin", { poids: null }).libelle === "≈ 800 g · estimé (veste)" && F.colisDe(m, "beebs", { poids: null }).estime === true, "Leboncoin et Beebs : « ≈ 800 g · estimé (veste) »");
  const mI = { edited: { leboncoin: { platform_fields: {} } }, generales: { titre: "Lot H" } };
  ok(F.colisDe(mI, "leboncoin", { poids: null }).libelle === "Estimé par Leboncoin" && !F.colisDe(mI, "leboncoin", { poids: null }).manquant, "objet non reconnu : « Estimé par Leboncoin », jamais une question");
  const mV = { edited: { vinted: { platform_fields: {} } }, generales: { titre: "T-shirt blanc" } };
  ok(F.colisDe(mV, "vinted", { grilleVinted: [{ id: 1, libelle: "Petit" }, { id: 2, libelle: "Moyen" }, { id: 3, libelle: "Grand" }] }).libelle === "Petit · estimé (t-shirt ou haut)", "Vinted : « Petit · estimé (t-shirt ou haut) »");
  const lp = lire("src/publication/lot/LotPublication.jsx");
  ok(/const sansPoids = !poidsASaisir \? \[\] :/.test(lp) && /poidsASaisir=\{Boolean\(poidsExigeLbc \|\| choixPoidsLbc === "saisir"\)\}/.test(lp), "pas de barre « N articles sans poids » hors « Saisir le poids »");
  // (19/11 soir, Nico : « une valeur commune peut être proposée en option, jamais par défaut ») L'état « le même pour
  // tous » vit dans le groupe État des questions par champ, replié (selftest:questions-par-champ-1911).
  ok(/groupeEtat && Array\.isArray\(m0\?\.etatsAuChoix\)/.test(lp) && /for \(const \{ id \} of g\.lignes\) moteurs\.get\(id\)\?\.choisirEtat\?\.\(libelle\)/.test(lp), "l'état que personne n'a dit : « Le même pour tous », en option repliée");
  ok(C.valeurDeLaCopie({ price: 45, edited: { vinted: { price: null, platform_fields: {} } } }, "vinted", "prix") === "45", "le prix d'une copie sans prix à elle : celui de l'article (plus jamais « À fixer »)");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
