// Autotest VERROU : MODIFIER EN MASSE PLUSIEURS CHAMPS D'UN COUP, ET LA TAILLE (20/11/2026 soir, bloc C de Nico — Louis).
//
//     node --import ./scripts/loader-ext.mjs scripts/modifier-en-lot-multi-selftest.mjs
//
// Louis (Business) devait faire le poids, valider, tout resélectionner, faire la taille, valider, tout resélectionner…
// Ce qu'il prouve, sans réseau ni base :
//   1. la lecture des saisies : seuls les champs REMPLIS comptent ; vide ≠ 0 (prix d'achat : vide = rien, 0 = gratuit,
//      « Je ne sais pas » = inconnu) ; un champ rempli mais illisible est signalé, jamais ignoré en silence ;
//   2. UN SEUL champ rempli = exactement les écritures d'avant (ecrituresDuPlan de ce champ), pour chaque champ ;
//   3. plusieurs champs : une écriture par article au plus, regroupée par contenu identique ; un article déjà à jour
//      n'est pas réécrit ; chaque écriture ne porte que ce qui change (attributs : les seules clés qui changent) ;
//   4. l'ordre poids → format : un poids ET un format dans la même validation, le format se juge et se pose au NOUVEAU
//      poids (« Déduit du poids » compris) ; les transporteurs trop lourds se comptent au nouveau poids ;
//   5. la taille : attributs.taille = { v, source « manuel », at } par patchFicheCorrection (« toutes ») ; les tailles
//      gardées à part pour une plateforme (valeurs_plateformes) s'effacent ; un article déjà à cette taille garde la
//      sienne (et sa source) ; jamais `pointure` ;
//   6. le récapitulatif : combien d'articles, quels champs, combien changent / déjà à jour / laissés de côté ;
//   7. par lots de 400 ; une seule écriture par article, même à 1 000 articles ;
//   8. l'écran : la sélection reste après la validation (« Terminer » la vide), un seul bouton « Appliquer à N
//      articles », le récapitulatif avant, « × » pour retirer un champ, tactile ≥ 44 px, « Supprimer » à part.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.RACINE ? process.env.RACINE : join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
let ko = 0, n = 0;
const ok = (c, m, d = "") => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 300)}` : ""}`); } };
const bloc = (titre, f) => { console.log(`\n${titre}`); try { f(); } catch (e) { ko++; n++; console.log(`  ✗ ${titre} : ${e.stack ?? e.message}`); } };

const M = await charger("src/stock/modifierEnLot.js");
const C = await charger("supabase/functions/_shared/colis-de-la-fiche.js");
const K = await charger("src/publication/lot/corrections.js");
const L = await charger("src/utils/parLots.js");
if (M.__erreur) { console.log(`✗ modifierEnLot.js ne se charge pas : ${M.__erreur}`); process.exit(1); }

const maintenant = new Date("2026-11-20T20:09:00.000Z");
const AT = maintenant.toISOString();
// Une forme canonique (clés triées) : deux écritures égales au contenu près de l'ordre des clés.
const canon = (v) => (Array.isArray(v) ? `[${v.map(canon).join(",")}]`
  : v && typeof v === "object" ? `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canon(v[k])}`).join(",")}}` : JSON.stringify(v ?? null));
const ids = (l) => (l ?? []).map((x) => (typeof x === "object" ? x.id : x)).join(",");
const ecritDe = (ecritures, id) => ecritures.filter((e) => e.ids.includes(id));
const champsDe = (ecritures, id) => ecritDe(ecritures, id)[0]?.champs ?? null;
const tousLesIds = (ecritures) => ecritures.flatMap((e) => e.ids);

bloc("1. la lecture des saisies : seuls les champs remplis, vide ≠ 0", () => {
  const vide = M.lireSaisiesMasse({ prix: { op: "fixer", saisie: "" }, quantite: "", taille: "   ", poids: "", format_lbc: null, transporteurs_lbc: null, prix_achat: { geste: "fixer", saisie: "" } });
  ok(Object.keys(vide.valeurs).length === 0 && vide.invalides.length === 0, "tout vide : rien à appliquer, rien à corriger", JSON.stringify(vide));
  ok(M.lireSaisiesMasse({ prix_achat: { geste: "fixer", saisie: "" } }).valeurs.prix_achat === undefined, "prix d'achat vide : rien (jamais lu comme 0)");
  ok(canon(M.lireSaisiesMasse({ prix_achat: { geste: "fixer", saisie: "0" } }).valeurs.prix_achat) === canon({ geste: "fixer", valeur: 0 }), "prix d'achat « 0 » : 0 € = gratuit");
  ok(canon(M.lireSaisiesMasse({ prix_achat: { geste: "inconnu", saisie: "" } }).valeurs.prix_achat) === canon({ geste: "inconnu" }), "« Je ne sais pas » : inconnu, sans saisie");
  ok(M.lireSaisiesMasse({ quantite: "" }).valeurs.quantite === undefined && M.lireSaisiesMasse({ poids: "" }).valeurs.poids === undefined, "quantité ou poids vides : rien (jamais 0)");
  ok(M.lireSaisiesMasse({ quantite: "2" }).valeurs.quantite === 2 && M.lireSaisiesMasse({ poids: "1,2 kg" }).valeurs.poids === 1200, "« 2 » → 2 ; « 1,2 kg » → 1 200 g (la lecture du lot de publication)");
  const inv = (s, champ) => { const r = M.lireSaisiesMasse(s); return r.invalides.some((x) => x.champ === champ) && r.valeurs[champ] === undefined; };
  ok(inv({ quantite: "0" }, "quantite") && inv({ quantite: "1,5" }, "quantite") && inv({ quantite: "abc" }, "quantite"), "quantité 0, 1,5, « abc » : à corriger (entière, 1 au moins)");
  ok(inv({ poids: "200 kg" }, "poids") && inv({ poids: "abc" }, "poids") && inv({ poids: "0" }, "poids"), "poids 200 kg, « abc », 0 : à corriger (1 g à 150 kg)");
  ok(inv({ prix: { op: "plus_pct", saisie: "abc" } }, "prix") && inv({ prix_achat: { geste: "fixer", saisie: "huit" } }, "prix_achat"), "prix ou prix d'achat illisibles : à corriger, jamais ignorés en silence");
  ok(canon(M.lireSaisiesMasse({ prix: { op: "plus_pct", saisie: "10 %" } }).valeurs.prix) === canon({ op: "plus_pct", valeur: 10 }), "prix « + 10 % » lu");
  ok(M.lireSaisiesMasse({ taille: "  M / 38  " }).valeurs.taille === "M / 38", "taille : le texte, espaces du bord retirés");
  ok(M.lireSaisiesMasse({ format_lbc: "auto" }).valeurs.format_lbc === "auto" && M.lireSaisiesMasse({ format_lbc: "Petit" }).valeurs.format_lbc === "Petit", "format : Petit… ou « Déduit du poids »");
  ok(M.lireSaisiesMasse({ transporteurs_lbc: [] }).valeurs.transporteurs_lbc === undefined && M.lireSaisiesMasse({ transporteurs_lbc: "auto" }).valeurs.transporteurs_lbc === "auto",
    "transporteurs : aucun coché = rien ; « Comme le compte » = auto");
  ok(canon(M.lireSaisiesMasse({ transporteurs_lbc: ["Colissimo", "Mondial Relay"] }).valeurs.transporteurs_lbc) === canon(["Mondial Relay", "Colissimo"]), "transporteurs : les noms de Leboncoin, dans son ordre");
});

const AV = (v, poids_g) => ({ format_colis_lbc: { v, source: "manuel", at: "2026-11-19T09:00:00.000Z", poids_g } });
const fiches = [
  { id: 1, prix_vente: 10, quantite: 1, poids_g: 500, prix_achat: null, buy: null, prix_achat_inconnu: false, attributs: {} },
  { id: 2, prix_vente: null, quantite: 3, poids_g: null, prix_achat: 0, buy: 0, prix_achat_inconnu: false, attributs: { taille: { v: "M", source: "vinted_liste" } } },
  { id: 3, prix_vente: 15, quantite: 1, poids_g: 650, prix_achat: 8, buy: 8, prix_achat_inconnu: false, attributs: { ...AV("Moyen", 650), transporteurs_lbc: { v: ["Colissimo"], source: "manuel" } } },
  { id: 4, prix_vente: 1.5, quantite: 2, poids_g: 2000, prix_achat: null, buy: null, prix_achat_inconnu: true, attributs: { taille: { v: "L", source: "manuel" } } },
];

bloc("2. un seul champ rempli = exactement les écritures d'avant", () => {
  const cas = [
    ["prix", { prix: { op: "fixer", valeur: 15 } }, () => M.planPrix(fiches, "fixer", 15)],
    ["prix", { prix: { op: "plus_pct", valeur: 10 } }, () => M.planPrix(fiches, "plus_pct", 10)],
    ["prix", { prix: { op: "moins_euros", valeur: 1 } }, () => M.planPrix(fiches, "moins_euros", 1)],
    ["quantite", { quantite: 2 }, () => M.planQuantite(fiches, 2)],
    ["poids", { poids: 650 }, () => M.planPoids(fiches, 650)],
    ["format_lbc", { format_lbc: "Petit" }, () => M.planFormatLbc(fiches, "Petit")],
    ["format_lbc", { format_lbc: "auto" }, () => M.planFormatLbc(fiches, "auto")],
    ["transporteurs_lbc", { transporteurs_lbc: ["Mondial Relay", "Colissimo"] }, () => M.planTransporteursLbc(fiches, ["Mondial Relay", "Colissimo"])],
    ["transporteurs_lbc", { transporteurs_lbc: "auto" }, () => M.planTransporteursLbc(fiches, "auto")],
    ["prix_achat", { prix_achat: { geste: "fixer", valeur: 0 } }, () => M.planPrixAchat(fiches, "fixer", 0)],
    ["prix_achat", { prix_achat: { geste: "fixer", valeur: 8 } }, () => M.planPrixAchat(fiches, "fixer", 8)],
    ["prix_achat", { prix_achat: { geste: "inconnu" } }, () => M.planPrixAchat(fiches, "inconnu")],
    ["taille", { taille: "M" }, () => M.planTaille(fiches, "M")],
  ];
  for (const [champ, valeurs, planAvant] of cas) {
    const avant = M.ecrituresDuPlan(champ, planAvant(), { maintenant });
    const c = M.planCombine(valeurs, fiches, { maintenant });
    ok(canon(c.ecritures) === canon(avant) && c.recap.aEcrire === new Set(tousLesIds(avant)).size,
      `${champ} ${canon(Object.values(valeurs)[0])} : mêmes écritures, mêmes groupes, même ordre (${avant.length} écriture${avant.length > 1 ? "s" : ""})`,
      `${canon(c.ecritures)}\n  attendu ${canon(avant)}`);
  }
});

bloc("3. plusieurs champs : une écriture par article au plus, seulement ce qui change", () => {
  const c = M.planCombine({ quantite: 1, taille: "M", poids: 650, prix_achat: { geste: "fixer", valeur: 0 } }, fiches, { maintenant });
  const tous = tousLesIds(c.ecritures);
  ok(tous.length === new Set(tous).size, "aucun article dans deux écritures", ids(tous));
  // 1 : quantité 1 déjà, taille absente → M, 500 g → 650, prix d'achat vide → 0.
  ok(canon(champsDe(c.ecritures, 1)) === canon({ poids_g: 650, prix_achat: 0, prix_achat_inconnu: false, attributs: { taille: { v: "M", source: "manuel", at: AT } } }),
    "article 1 : poids, prix d'achat, taille — PAS la quantité (déjà 1)", canon(champsDe(c.ecritures, 1)));
  // 2 : quantité 3 → 1, taille M déjà (vinted_liste : gardée), poids vide → 650, prix d'achat 0 déjà.
  ok(canon(champsDe(c.ecritures, 2)) === canon({ quantite: 1, poids_g: 650 }), "article 2 : quantité et poids seuls (sa taille M et son 0 € restent)", canon(champsDe(c.ecritures, 2)));
  // 3 : quantité 1 déjà, 650 g déjà, taille → M, 8 € → 0.
  const e3 = champsDe(c.ecritures, 3);
  ok(canon(e3) === canon({ prix_achat: 0, prix_achat_inconnu: false, attributs: { taille: { v: "M", source: "manuel", at: AT } } }), "article 3 : taille et prix d'achat seuls", canon(e3));
  ok(!("format_colis_lbc" in (e3?.attributs ?? {})) && !("transporteurs_lbc" in (e3?.attributs ?? {})), "article 3 : son format et ses transporteurs ne sont pas renvoyés (attributs : les clés qui changent)");
  // Tout déjà à jour : aucune écriture.
  const aJour = M.planCombine({ quantite: 1, poids: 650, taille: "m" }, [{ id: 9, quantite: 1, poids_g: 650, attributs: { taille: { v: "M", source: "capture" } } }], { maintenant });
  ok(aJour.ecritures.length === 0 && aJour.recap.aEcrire === 0 && aJour.recap.dejaAJour === 1, "un article déjà à jour sur tous les champs n'est jamais réécrit", canon(aJour));
  // Contenu identique : une écriture pour plusieurs articles.
  const pareils = [{ id: 21, quantite: 2, poids_g: 300, attributs: {} }, { id: 22, quantite: 2, poids_g: 300, attributs: {} }, { id: 23, quantite: 1, poids_g: 300, attributs: {} }];
  const g = M.planCombine({ quantite: 1, poids: 400 }, pareils, { maintenant });
  ok(g.ecritures.length === 2 && ids(g.ecritures[0].ids) === "21,22" && ids(g.ecritures[1].ids) === "23", "deux articles au contenu identique : une seule écriture pour les deux", canon(g.ecritures));
  // Les champs vides restent intacts.
  const seulTaille = M.planCombine(M.lireSaisiesMasse({ taille: "S", poids: "", quantite: "", prix_achat: { geste: "fixer", saisie: "" } }).valeurs, fiches, { maintenant });
  ok(seulTaille.ecritures.every((e) => canon(Object.keys(e.champs)) === canon(["attributs"])), "taille seule remplie : ni poids, ni quantité, ni prix d'achat écrits");
});

bloc("4. l'ordre poids → format : le format se juge et se pose au NOUVEAU poids", () => {
  const f = [
    { id: 31, poids_g: 500, attributs: AV("Moyen", 500) },  // choisi Moyen
    { id: 32, poids_g: 500, attributs: {} },                // suit le poids (Petit)
    { id: 33, poids_g: null, attributs: {} },               // sans poids
  ];
  const auto = M.planCombine({ poids: 2000, format_lbc: "auto" }, f, { maintenant });
  const e31 = champsDe(auto.ecritures, 31);
  ok(e31?.poids_g === 2000 && e31?.attributs?.format_colis_lbc?.v === "auto" && e31.attributs.format_colis_lbc.poids_g === 2000,
    "« Déduit du poids » + 2 kg : le choix est rendu au calcul, posé au poids de 2 kg", canon(e31));
  ok(C.formatDeLaFiche({ poids_g: 2000, attributs: e31?.attributs })?.valeur === "Moyen" && C.formatDeLaFiche({ poids_g: 2000, attributs: e31?.attributs })?.origine === "poids",
    "… relu : Moyen, du poids (2 kg)");
  ok(canon(champsDe(auto.ecritures, 32)) === canon({ poids_g: 2000 }), "l'article qui suit déjà le poids : le poids seul (son format suit le nouveau poids)", canon(champsDe(auto.ecritures, 32)));
  ok(auto.recap.formatAuNouveauPoids === true && auto.recap.sansPoids === 0, "le récapitulatif le dit ; aucun « sans poids » une fois le poids donné");
  const petit = M.planCombine({ poids: 3000, format_lbc: "Petit" }, f, { maintenant });
  ok(canon(champsDe(petit.ecritures, 32)?.attributs) === canon(C.choixFormatPourLaFiche("Petit", { poids_g: 3000, maintenant })),
    "« Petit » + 3 kg : le choix est posé au poids de 3 kg (choixFormatPourLaFiche)", canon(champsDe(petit.ecritures, 32)));
  const sansPoids = M.planCombine({ format_lbc: "Petit" }, f, { maintenant });
  ok(champsDe(sansPoids.ecritures, 32)?.attributs?.format_colis_lbc?.poids_g === 500 && sansPoids.recap.sansPoids === 1 && sansPoids.recap.formatAuNouveauPoids === false,
    "sans poids saisi : le format au poids de chaque fiche, comme avant (1 article sans poids)");
  const refuse = M.planCombine({ poids: 0, format_lbc: "Petit" }, f, { maintenant });
  ok(champsDe(refuse.ecritures, 32)?.attributs?.format_colis_lbc?.poids_g === 500 && !("poids_g" in (champsDe(refuse.ecritures, 32) ?? {})),
    "un poids refusé n'est jamais celui du format (le format reste au poids de la fiche)");
  const lourds = M.planCombine({ poids: 3000, transporteurs_lbc: ["Courrier suivi"] }, f, { maintenant });
  ok(lourds.recap.tropLourds === 3 && M.planCombine({ transporteurs_lbc: ["Courrier suivi"] }, f, { maintenant }).recap.tropLourds === 0,
    "transporteurs : trop lourds comptés au NOUVEAU poids (3 kg > 2 kg du Courrier suivi), pas à l'ancien");
});

bloc("5. la taille : manuelle, pour toutes les plateformes, jamais réécrite à l'identique", () => {
  const VP = (v) => ({ valeurs_plateformes: { v, source: "manuel", at: "2026-11-19T10:00:00.000Z" } });
  const f = [
    { id: 41, attributs: null },                                                                                     // aucune taille
    { id: 42, attributs: { taille: { v: "m", source: "vinted_liste" } } },                                           // déjà M (casse)
    { id: 43, attributs: { taille: { v: "M", source: "manuel" }, ...VP({ vinted: { taille: { v: "L", base: "M" }, prix: { v: "9", base: "10" } } }) } }, // M + L gardée pour Vinted
    { id: 44, attributs: { taille: { v: "S", source: "capture" }, pointure: { v: "38" }, ...VP({ ebay: { taille: { v: "XS", base: "S" } } }) } },        // S + XS pour eBay
  ];
  const p = M.planTaille(f, " M ");
  ok(ids(p.inchanges) === "42" && ids(p.changements) === "41,43,44", "déjà à « m » (vinted_liste) : inchangé ; les autres changent", canon(p));
  const e = M.planCombine({ taille: "M" }, f, { maintenant }).ecritures;
  ok(canon(champsDe(e, 41)) === canon({ attributs: { taille: { v: "M", source: "manuel", at: AT } } }), "sans taille : attributs.taille = { v, source « manuel », at }, seul");
  ok(ecritDe(e, 42).length === 0, "déjà à cette taille : pas réécrit (sa source vinted_liste reste, elle sert la republication Vinted)");
  ok(canon(champsDe(e, 43)) === canon({ attributs: { valeurs_plateformes: { v: { vinted: { prix: { v: "9", base: "10" } } }, source: "manuel", at: AT } } }),
    "déjà M mais L gardée pour Vinted : seule la taille à part s'efface (le prix gardé pour Vinted reste) ; la taille n'est pas renvoyée", canon(champsDe(e, 43)));
  const patch44 = K.patchFicheCorrection({ cle: "taille", valeur: "M", portee: K.PORTEE_TOUTES, attributs: f[3].attributs, maintenant });
  ok(canon(patch44.colonnes) === canon({}) && canon(champsDe(e, 44)) === canon({ attributs: patch44.attributs }),
    "S + XS pour eBay : exactement patchFicheCorrection({ cle: « taille », portee: « toutes » })", canon(champsDe(e, 44)));
  ok(canon(champsDe(e, 44)?.attributs?.valeurs_plateformes?.v) === canon({}), "… la taille gardée pour eBay s'efface (elle ne repartirait plus)");
  ok(!JSON.stringify(e).includes("pointure"), "jamais `pointure`");
  ok(M.planTaille(f, "   ").changements.length === 0 && M.planCombine(M.lireSaisiesMasse({ taille: "" }).valeurs, f, { maintenant }).ecritures.length === 0, "une taille vide n'écrit rien");
  ok(M.ecrituresDuPlan("taille", M.planTaille(f, "M"), { maintenant }).length === 3, "trois contenus différents : trois écritures (une par contenu, jamais une par champ)");
});

bloc("6. le récapitulatif avant la validation", () => {
  const c = M.planCombine({ prix: { op: "plus_pct", valeur: 10 }, quantite: 1, poids: 650 }, fiches, { maintenant });
  const r = c.recap;
  const ligne = (champ) => r.champs.find((x) => x.champ === champ);
  ok(r.selection === 4 && canon(r.champs.map((x) => x.champ)) === canon(["prix", "quantite", "poids"]), "4 articles ; les champs remplis, dans l'ordre des onglets");
  ok(ligne("prix")?.changent === 3 && ligne("prix")?.ignores === 1 && ligne("prix")?.raisons?.sans_prix === 1 && ligne("prix")?.dejaAJour === 0,
    "prix + 10 % : 3 changent, 1 laissé de côté (sans prix)", canon(ligne("prix")));
  ok(ligne("quantite")?.changent === 2 && ligne("quantite")?.dejaAJour === 2, "quantité 1 : 2 changent, 2 déjà à jour", canon(ligne("quantite")));
  ok(ligne("poids")?.changent === 3 && ligne("poids")?.dejaAJour === 1, "poids 650 g : 3 changent, 1 déjà à jour", canon(ligne("poids")));
  ok(r.aEcrire === 4 && r.laisses === 1, "4 articles à écrire (une écriture chacun au plus) ; 1 laissé de côté pour un champ", canon(r));
  const sous = M.planCombine({ prix: { op: "moins_euros", valeur: 1 }, quantite: 1 }, fiches, { maintenant }).recap.champs[0];
  ok(sous.raisons.sous_minimum === 1 && sous.raisons.sans_prix === 1, "− 1 € : 1,50 € tomberait sous 1 € (laissé de côté), l'article sans prix aussi");
});

bloc("7. par lots de 400 ; une écriture par article, même à 1 000 articles", () => {
  const mille = Array.from({ length: 1000 }, (_, k) => ({ id: 1000 + k, quantite: 2, poids_g: 300, attributs: {} }));
  const c = M.planCombine({ quantite: 1, poids: 400, taille: "M" }, mille, { maintenant });
  ok(c.ecritures.length === 1 && c.ecritures[0].ids.length === 1000, "1 000 articles au contenu identique : une écriture", c.ecritures.length);
  const lots = L.parLots(c.ecritures[0].ids);
  ok(lots.length === 3 && lots.every((l) => l.length <= 400), "… envoyée par lots de 400 (3 appels, jamais un .in() de 1 000)");
  // Simulation de la boucle de la barre : chaque article reçoit UNE mise à jour.
  const recus = new Map();
  for (const g of c.ecritures) for (const lot of L.parLots(g.ids)) for (const id of lot) recus.set(id, (recus.get(id) ?? 0) + 1);
  ok(recus.size === 1000 && [...recus.values()].every((x) => x === 1), "chaque article reçoit une seule mise à jour (poids, quantité, taille ensemble)");
});

bloc("8. l'écran", () => {
  const barre = lire("src/stock/BarreModifierLot.jsx");
  const stock = lire("src/tabs/StockTab.jsx");
  ok(/planCombine\(lecture\.valeurs, choisis\)/.test(barre) && /lireSaisiesMasse\(\{/.test(barre), "la barre lit les saisies et calcule le plan combiné (modifierEnLot.js)");
  ok(/for \(const g of c\.ecritures\) \{\n\s+for \(const lot of parLots\(g\.ids\)\) \{/.test(barre) && /update\(g\.champs\)\.in\("id", lot\)/.test(barre) && /eq\("user_id", userId\)/.test(barre),
    "les écritures du plan combiné, par lots de 400, bornées à la personne");
  ok(!/setSel\(new Set\(\)\)/.test(barre), "la sélection RESTE après la validation (plus de setSel(new Set()) dans la barre)");
  ok(/onQuitter=\{\(\)=>\{setModeModif\(false\);setModifSel\(new Set\(\)\);\}\}/.test(stock), "« Terminer » vide la sélection, comme avant (StockTab)");
  ok(/\["taille", "Taille", "Size"\],/.test(barre) && /aria-label=\{champ === "quantite"[\s\S]*Nouvelle taille/.test(barre), "l'onglet « Taille » et sa saisie");
  ok(/data-recap-modifier-lot=""/.test(barre) && /Récapitulatif · \$\{nSel\} article/.test(barre) && /déjà à jour/.test(barre) && /laissé\$\{x\.ignores > 1 \? "s" : ""\} de côté/.test(barre),
    "le récapitulatif : nombre d'articles, chaque champ, combien changent / déjà à jour / laissés de côté");
  ok((barre.match(/className="apply"/g) ?? []).length === 2 && /Appliquer à \$\{recap\.aEcrire\} article/.test(barre), "UN bouton « Appliquer à N articles » (l'autre est « Supprimer »)");
  ok(/const peutAppliquer = !occupe && !lecture\.invalides\.length && recap\.aEcrire > 0;/.test(barre), "un champ rempli mais illisible bloque la validation (jamais ignoré en silence)");
  ok(/onClick=\{\(\) => viderChamp\(x\.champ\)\}/.test(barre) && /Ne pas changer : \$\{libelle\(x\.champ\)\}/.test(barre), "« × » retire un champ du récapitulatif");
  ok(/onClick=\{\(\) => \{ setChamp\(c\); setBilan\(null\); \}\}/.test(barre), "changer d'onglet garde les saisies des autres champs");
  ok(/if \(nRemplis <= 1\) appliquer\(\); else e\.currentTarget\.blur\(\);/.test(barre), "« Entrée » : applique un champ seul (comme avant) ; plusieurs champs : le bouton du récapitulatif");
  ok(/const TACTILE = \{ minHeight: 44/.test(barre) && /style=\{\{ \.\.\.ONGLET,/.test(barre) && /minWidth: 44, padding: 0/.test(barre) && /style=\{\{ \.\.\.TACTILE, flex: "1 1 100%"/.test(barre),
    "tactile ≥ 44 px : onglets, « × », bouton Appliquer");
  ok(/display: "flex", gap: 6, flexWrap: "wrap", minWidth: 0/.test(barre) && !/overflowX|whiteSpace: "nowrap"/.test(barre) && /overflowWrap: "anywhere"/.test(barre),
    "390 px : les onglets passent à la ligne, le récapitulatif aussi, aucun défilement horizontal");
  ok(/champ === "supprimer" && onSupprimer && \(/.test(barre) && /\{champ !== "supprimer" && \(<>/.test(barre) && /onClick=\{\(\) => onSupprimer\(choisis\.map\(\(i\) => i\.id\)\)\}/.test(barre),
    "« Supprimer » reste un geste à part (sa confirmation), hors du récapitulatif et du bouton Appliquer");
  ok(/Un seul champ : le bilan d'avant, mot pour mot/.test(barre) && /const seul = r\.champs\.length === 1 \? c\.plans\[r\.champs\[0\]\.champ\] : null;/.test(barre), "un seul champ : le bilan d'avant");
  ok(/Tes annonces en ligne ne changent pas : la taille sert/.test(barre), "la phrase « annonces en ligne » sous la taille aussi");
});

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ tout est vert — ${n} vérifications`);
process.exit(ko ? 1 : 0);
