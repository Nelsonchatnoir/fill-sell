// Autotest : MODIFIER EN LOT LE PRIX OU LA QUANTITÉ DES FICHES (04/10/2026, Louis).
//
//     node --import ./scripts/loader-ext.mjs scripts/modifier-en-lot-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. le calcul : valeur fixe, ± euros, ± %, arrondi au centime ; 1 € au
//      moins ; un article SANS prix n'a pas de base pour un calcul : laissé
//      de côté, jamais un prix inventé ;
//   2. la quantité : entière, 1 au moins (0 = vendu, c'est le geste Vendre) ;
//   3. une écriture par valeur, pas par article ;
//   4. l'écran dit la vérité : les annonces en ligne ne changent pas, et
//      aucun chemin n'envoie un prix ou une quantité de fiche à une
//      plateforme (les jobs ne savent que publier, retirer, republier).
// (19/11, Louis) VERROU du poids, du format du colis Leboncoin et du prix d'achat en lot :
//   5. le poids : « 650 g », « 650 », « 1,2 kg », « 1.2kg » (la lecture du lot de publication, pas une copie) ;
//      1 g à 150 kg, sinon refusé ; un article qui a déjà ce poids n'est pas réécrit ; une écriture par valeur ;
//   6. le format : Petit, Moyen, Volumineux, Déduit du poids ; posé au poids de CHAQUE fiche (une écriture par
//      couple valeur + poids), relu « choisi » par formatDeLaFiche ; un article qui porte déjà ce choix n'est pas
//      réécrit ; l'écriture ne touche que attributs.format_colis_lbc ;
//   7. le prix d'achat : vide ≠ 0 (vide n'écrit rien, 0 = gratuit, accepté) ; « Je ne sais pas » écrit NULL +
//      prix_achat_inconnu ; aucun ± ; un article qui a déjà ce prix n'est pas réécrit ;
//   8. l'écran : six gestes (rien de l'existant ne disparaît), la phrase « annonces en ligne » sous chaque bouton.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg) => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}`); } };

const M = await charger("src/stock/modifierEnLot.js");

console.log("1. le prix");
const items = [
  { id: 1, prix_vente: 10, quantite: 1 },
  { id: 2, prix_vente: 12.5, quantite: 3 },
  { id: 3, prix_vente: null, quantite: 1 },
  { id: 4, prix_vente: 1.5, quantite: 2 },
];
ok(M.lireNombre("12,5") === 12.5 && M.lireNombre("10 %") === 10 && M.lireNombre("3 €") === 3 && M.lireNombre("abc") === null && M.lireNombre("-2") === null, "saisies lues : « 12,5 », « 10 % », « 3 € » ; refusées : texte, négatif");
const fixe = M.planPrix(items, "fixer", 15);
ok(fixe.changements.length === 4 && fixe.ignores.length === 0, "valeur fixe : tous les articles, y compris celui sans prix");
const pct = M.planPrix(items, "plus_pct", 10);
ok(pct.changements.find((c) => c.id === 2).apres === 13.75 && pct.changements.find((c) => c.id === 1).apres === 11, "+ 10 % : 10 → 11, 12,50 → 13,75");
ok(pct.ignores.length === 1 && pct.ignores[0].id === 3 && pct.ignores[0].raison === "sans_prix", "+ 10 % : l'article sans prix est laissé de côté (aucun prix inventé)");
const moins = M.planPrix(items, "moins_euros", 1);
ok(moins.changements.find((c) => c.id === 1).apres === 9 && moins.ignores.some((x) => x.id === 4 && x.raison === "sous_minimum"), "− 1 € : 10 → 9 ; 1,50 → 0,50 refusé (1 € au moins)");
ok(M.planPrix(items, "moins_pct", 33).changements.find((c) => c.id === 1).apres === 6.7, "− 33 % : arrondi au centime (6,70)");
ok(M.planPrix(items, "fixer", 0.5).ignores.length === 4, "fixer à 0,50 € : refusé partout");
ok(M.planPrix([{ id: 9, prix_vente: 15 }], "fixer", 15).changements.length === 0, "même prix : rien à écrire");

console.log("2. la quantité");
const q = M.planQuantite(items, 2);
ok(q.changements.map((c) => c.id).join() === "1,2,3", "quantité 2 : seuls ceux qui ne l'ont pas changent");
ok(M.planQuantite(items, 0).changements.length === 0 && M.planQuantite(items, 1.5).changements.length === 0, "0 ou 1,5 : refusés (entier, 1 au moins — 0 = vendu, geste Vendre)");

console.log("3. une écriture par valeur");
const g = M.parValeur([{ id: 1, apres: 15 }, { id: 2, apres: 15 }, { id: 3, apres: 9 }]);
ok(g.length === 2 && g[0].ids.join() === "1,2" && g[1].ids.join() === "3", "deux valeurs, deux écritures");

console.log("4. l'écran dit la vérité");
const barre = lire("src/stock/BarreModifierLot.jsx");
ok(/Les annonces déjà en ligne ne changent pas, sur aucune plateforme/.test(barre), "en-tête : les annonces en ligne ne changent pas, sur aucune plateforme");
ok(/Tes annonces en ligne gardent leur prix \(une republication aussi\)/.test(barre) && /Tes annonces en ligne n'ont pas changé/.test(barre), "sous le bouton et au bilan : rien ne part vers les annonces");
// (11/10) Par lots de 400 (utils/parLots.js) : un .in() de plus de ~800 identifiants tombe.
// (19/11, Louis) Les écritures viennent du plan (ecrituresDuPlan, pur) : la barre n'écrit que ce qu'il dit.
const cles = (e) => (e ? Object.keys(e.champs).sort().join() : "");
const ePrix = M.ecrituresDuPlan?.("prix", M.planPrix(items, "fixer", 15));
const eQte = M.ecrituresDuPlan?.("quantite", M.planQuantite(items, 2));
ok(ePrix?.length === 1 && cles(ePrix[0]) === "prix_vente" && ePrix[0].champs.prix_vente === 15
  && eQte?.length === 1 && cles(eQte[0]) === "quantite" && eQte[0].champs.quantite === 2, "écriture : la fiche seule (prix_vente ou quantite), rien d'autre");
ok(/for \(const g of ecrituresDuPlan\(champ, plan\)\) \{/.test(barre) && /update\(g\.champs\)\.in\("id", lot\)/.test(barre)
  && /for \(const lot of parLots\(g\.ids\)\) \{/.test(barre) && /eq\("user_id", userId\)/.test(barre), "écriture : celle du plan, bornée à la personne, par lots de 400");
const stock = lire("src/tabs/StockTab.jsx");
ok(/<BarreModifierLot /.test(stock) && /Modifier plusieurs articles : prix, quantité, poids, format, prix d'achat/.test(stock), "Stock : la porte et la barre du mode");
ok(/filter\(\(i\) => i\.statut === 'stock'\)/.test(stock), "Stock : seuls les articles en stock (jamais un vendu)");
// Aucun chemin ne pousse un prix de fiche vers une annonce existante.
const fonctions = fs.readdirSync(join(ROOT, "supabase/functions")).filter((d) => !d.startsWith("_") && !d.startsWith("."));
const poussePrix = fonctions.filter((d) => {
  const f = join(ROOT, "supabase/functions", d, "index.ts");
  return fs.existsSync(f) && /reviseInventoryItem|bulkUpdatePriceQuantity|ReviseItem|updateOffer/.test(fs.readFileSync(f, "utf8"));
});
ok(poussePrix.length === 0, "aucune fonction ne révise le prix d'une annonce en ligne (eBay compris)");

// ── (19/11, Louis) VERROU : poids, format du colis Leboncoin, prix d'achat ────────────────────────────────────────────
// Un bloc qui lève (fonction absente, par exemple) compte rouge au lieu d'arrêter le test.
const bloc = (titre, f) => { console.log(titre); try { f(); } catch (e) { ko++; console.log(`  ✗ ${titre} : ${e.message}`); } };
const R = await charger("src/publication/lot/regles.js");
const C = await charger("supabase/functions/_shared/colis-de-la-fiche.js");
const ids = (liste) => (liste ?? []).map((c) => (typeof c === "object" ? c.id : c)).join();

bloc("5. le poids", () => {
  ok(M.lirePoids === R.lirePoidsSaisi, "lecture : celle du lot de publication (lirePoidsSaisi), pas une copie");
  ok(M.lirePoids("650 g") === 650 && M.lirePoids("650") === 650 && M.lirePoids("1,2 kg") === 1200 && M.lirePoids("1.2kg") === 1200 && M.lirePoids("150 kg") === 150000,
    "saisies lues : « 650 g », « 650 », « 1,2 kg », « 1.2kg », « 150 kg »");
  ok(M.lirePoids("") === null && M.lirePoids("0") === null && M.lirePoids("0,4 g") === null && M.lirePoids("150001") === null && M.lirePoids("200 kg") === null && M.lirePoids("abc") === null,
    "refusées : vide, 0, 0,4 g, 150 001 g, 200 kg, texte");
  const fiches = [{ id: 1, poids_g: 650 }, { id: 2, poids_g: null }, { id: 3, poids_g: 1200 }, { id: 4 }];
  const p = M.planPoids(fiches, 650);
  ok(ids(p.changements) === "2,3,4" && ids(p.inchanges) === "1", "650 g : l'article déjà à 650 g n'est pas réécrit");
  const horsBornes = [M.planPoids(fiches, 0), M.planPoids(fiches, 150001), M.planPoids(fiches, null), M.planPoids(fiches, 12.5)];
  ok(horsBornes.every((x) => x.changements.length === 0 && x.ignores.length === fiches.length && x.ignores.every((i) => i.raison === "poids")),
    "0, 150 001 g, vide, 12,5 g : refusés (entier, 1 g à 150 kg), rien n'est écrit");
  const e = M.ecrituresDuPlan("poids", p);
  ok(e.length === 1 && cles(e[0]) === "poids_g" && e[0].champs.poids_g === 650 && e[0].ids.join() === "2,3,4", "une écriture pour la valeur, poids_g seul, sans l'article inchangé");
});

bloc("6. le format du colis Leboncoin", () => {
  const AT = "2026-11-19T09:00:00.000Z";
  const choix = (v, poids_g, at = AT) => ({ format_colis_lbc: { v, source: "manuel", at, poids_g } });
  const fiches = [
    { id: 1, poids_g: 500 },                                                   // calculé Petit
    { id: 2, poids_g: 2000 },                                                  // calculé Moyen
    { id: 3, poids_g: 500, attributs: choix("Moyen", 500) },                   // choisi Moyen, valable
    { id: 4, poids_g: null },                                                  // ni poids ni choix
    { id: 5, poids_g: 2000, attributs: choix("Petit", 1000) },                 // choisi Petit à un autre poids : (19/11 soir) le choix TIENT
    { id: 6, poids_g: 500, poids_change_le: "2026-11-19T10:00:00.000Z", attributs: choix("Volumineux", 500, "2026-11-18T10:00:00.000Z") }, // poids changé après le choix : (19/11 soir) le choix TIENT
  ];
  ok(M.CHOIX_FORMAT_LBC.join() === "Petit,Moyen,Volumineux,auto", "quatre choix : Petit, Moyen, Volumineux, Déduit du poids (« auto »)");
  // (19/11 soir, décision de Nico — bug de Louis : « Petit » choisi en masse restait « Automatique : Petit ») Le format
  // choisi en masse DEVIENT le choix de la personne sur chaque fiche (comme le poids) : « inchangé » seulement quand la
  // fiche porte DÉJÀ ce choix ; un format seulement calculé du poids n'est pas un choix (remplace le verrou d'OTA 1).
  const moyen = M.planFormatLbc(fiches, "Moyen");
  ok(ids(moyen.inchanges) === "3" && ids(moyen.changements) === "1,2,4,5,6", "Moyen : seul l'article qui a DÉJÀ choisi Moyen n'est pas réécrit (Moyen par son poids devient un choix)");
  const petitV = M.planFormatLbc(fiches, "Petit");
  ok(ids(petitV.inchanges) === "5" && ids(petitV.changements) === "1,2,3,4,6", "Louis : Petit sur un article de 500 g « Automatique : Petit » → ENREGISTRÉ comme son choix");
  const auto = M.planFormatLbc(fiches, "auto");
  ok(ids(auto.changements) === "3,5,6" && ids(auto.inchanges) === "1,2,4", "Déduit du poids : les articles avec un choix y reviennent ; ceux qui suivent déjà le poids ne sont pas réécrits");
  ok(ids(M.planFormatLbc(fiches, "").changements) === "3,5,6", "« » vaut « Déduit du poids » (choixFormatPourLaFiche)");
  ok(M.planFormatLbc(fiches, "Grand colis").changements.length === 0, "un format inconnu de Leboncoin : refusé, rien n'est écrit");
  const maintenant = new Date("2026-11-19T12:00:00.000Z");
  const petit = M.planFormatLbc(fiches, "Petit");
  const e = M.ecrituresDuPlan("format_lbc", petit, { maintenant });
  const groupes = e.map((x) => `${x.champs.attributs.format_colis_lbc.poids_g}:${x.ids.join("+")}`).join(" ");
  ok(groupes === "500:1+3+6 2000:2 null:4", "une écriture par couple (valeur, poids) : 500 g (1, 3, 6), 2 kg (2), sans poids (4)", groupes);
  ok(e.every((x) => cles(x) === "attributs" && Object.keys(x.champs.attributs).join() === "format_colis_lbc"
    && JSON.stringify(x.champs.attributs) === JSON.stringify(C.choixFormatPourLaFiche("Petit", { poids_g: x.champs.attributs.format_colis_lbc.poids_g, maintenant }))),
  "écriture : attributs.format_colis_lbc seul, par choixFormatPourLaFiche (le trigger fusionne le reste)");
  const relus = petit.changements.map((c) => {
    const f = fiches.find((x) => x.id === c.id);
    const ecrit = e.find((x) => x.ids.includes(c.id)).champs.attributs;
    return C.formatDeLaFiche({ poids_g: f.poids_g, poids_change_le: f.poids_change_le ?? null, attributs: ecrit });
  });
  ok(relus.length === 5 && relus.every((r) => r?.valeur === "Petit" && r.origine === "choisi"), "posé au poids de chaque fiche : relu « choisi, Petit » sur chacune (sans poids compris)");
  ok(C.formatDeLaFiche({ poids_g: 3000, poids_change_le: "2026-11-20T09:00:00.000Z", attributs: e.find((x) => x.ids.includes(1)).champs.attributs })?.origine === "choisi",
    "le poids change ENSUITE (500 g → 3 kg) : le format choisi en masse reste « Petit », jamais recalculé");
  const eAuto = M.ecrituresDuPlan("format_lbc", auto, { maintenant });
  ok(eAuto.length === 2 && eAuto.every((x) => x.champs.attributs.format_colis_lbc.v === "auto")
    && C.formatDeLaFiche({ poids_g: 500, attributs: eAuto[0].champs.attributs })?.origine === "poids", "Déduit du poids : « auto » posé, le calcul du poids reprend");
});

bloc("7. le prix d'achat", () => {
  const fiches = [
    { id: 1, prix_achat: null, buy: null, prix_achat_inconnu: false }, // vide : pas encore renseigné
    { id: 2, prix_achat: 0, buy: 0, prix_achat_inconnu: false },       // 0 : gratuit
    { id: 3, prix_achat: 8, buy: 8, prix_achat_inconnu: false },
    { id: 4, prix_achat: null, buy: null, prix_achat_inconnu: true },  // « je ne sais pas »
  ];
  ok(M.GESTES_PRIX_ACHAT.join() === "fixer,inconnu", "deux gestes : « Fixer à » et « Je ne sais pas » — aucun ±");
  ok(["plus_euros", "moins_euros", "plus_pct", "moins_pct"].every((o) => M.planPrixAchat(fiches, o, 10).changements.length === 0), "± € et ± % : refusés pour le prix d'achat");
  ok([M.planPrixAchat(fiches, "fixer", null), M.planPrixAchat(fiches, "fixer", ""), M.planPrixAchat(fiches, "fixer", M.lireNombre(""))].every((x) => x.changements.length === 0),
    "vide ≠ 0 : un champ vide n'écrit rien (jamais lu comme 0)");
  const zero = M.planPrixAchat(fiches, "fixer", M.lireNombre("0"));
  ok(ids(zero.changements) === "1,3,4" && ids(zero.inchanges) === "2", "0 € accepté (gratuit) : le vide et l'inconnu deviennent 0, l'article déjà à 0 n'est pas réécrit");
  const eZero = M.ecrituresDuPlan("prix_achat", zero);
  ok(eZero.length === 1 && JSON.stringify(eZero[0].champs) === JSON.stringify({ prix_achat: 0, prix_achat_inconnu: false }), "écriture « Fixer à 0 » : { prix_achat: 0, prix_achat_inconnu: false }");
  const huit = M.planPrixAchat(fiches, "fixer", M.lireNombre("8,00 €"));
  ok(ids(huit.changements) === "1,2,4" && ids(huit.inchanges) === "3", "8 € : l'article déjà à 8 € n'est pas réécrit");
  ok(M.planPrixAchat(fiches, "fixer", 12.346).changements[0]?.apres === 12.35 && M.planPrixAchat(fiches, "fixer", -1).changements.length === 0, "arrondi au centime ; négatif refusé");
  const inconnu = M.planPrixAchat(fiches, "inconnu");
  ok(ids(inconnu.changements) === "1,2,3" && ids(inconnu.inchanges) === "4", "« Je ne sais pas » : 0 n'est pas inconnu (réécrit), l'article déjà inconnu n'est pas réécrit");
  const eInc = M.ecrituresDuPlan("prix_achat", inconnu);
  ok(eInc.length === 1 && JSON.stringify(eInc[0].champs) === JSON.stringify({ prix_achat: null, prix_achat_inconnu: true }), "écriture « Je ne sais pas » : { prix_achat: null, prix_achat_inconnu: true }");
});

bloc("8. l'écran", () => {
  for (const l of ["Tout sélectionner", "Terminer", "Prix de vente", "Quantité", "Poids", "Format Leboncoin", "Prix d'achat", "Supprimer", "Je ne sais pas", "Déduit du poids"]) {
    ok(new RegExp(`["\`]${l}`).test(barre), `geste « ${l} » présent`);
  }
  const phrases = barre.match(/Tes annonces en ligne ne changent pas/g) ?? [];
  ok(phrases.length >= 4 && /Tes annonces en ligne gardent leur prix \(une republication aussi\)/.test(barre), "sous le bouton, pour chaque champ : les annonces en ligne ne changent pas");
  ok(/Leboncoin et Beebs/.test(barre) && /calculs de marge/.test(barre), "le poids sert à Leboncoin et Beebs ; le prix d'achat aux calculs de marge");
  ok(/import \{ LBC_FORMATS \} from "\.\.\/utils\/leboncoinColis"/.test(barre) && /fr \? x\.aide : x\.aideEn/.test(barre), "chaque format montre ce qu'il fait (textes de LBC_FORMATS, fr/en)");
  ok(/display: "flex", gap: 6, flexWrap: "wrap"/.test(barre), "les onglets passent à la ligne (360 px de large)");
});

console.log(ko ? `\n${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
