// Autotest : REFONTE DE LA PUBLICATION EN LOT ET DE LA REPUBLICATION EN SÉRIE (19/11/2026, maquettes lot-1911 validées
// par Nico ; thecloset, Louis).
//
//     node --import ./scripts/loader-ext.mjs scripts/lot-corrections-1911-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. une correction, plateforme par plateforme : « toutes ses plateformes » (défaut) ou « seulement sur X », par le
//      moteur du stepper (jamais une règle réécrite), une copie « à part » respectée depuis l'onglet « L'article » ;
//   2. ce que la FICHE reçoit : colonnes, attributs « manuel », valeurs gardées par plateforme (avec la valeur de
//      l'article du moment), effacées par une correction « toutes » ; reposées seulement si l'article n'a pas changé ;
//   3. Leboncoin : le format du colis de la FICHE (jamais une valeur unique pour le lot), les marqueurs convenus avec
//      le serveur (format_colis_par_article, geste « article »), les transporteurs de la fiche avant ceux du lot ;
//   4. « À vérifier » ne bloque rien : la taille que le titre contredit, une réponse reprise, un poids douteux ;
//   5. la republication : corrections par article, ce que la tâche porte (corrections_republication), le prix corrigé ;
//   6. VERROU (défaut du 19/11) : « Remonter les K plus anciennes » garde les photos choisies (rouge sur 281018e) ;
//   7. le câblage, lu dans le source (écrans du lot, Stock, fiche article, moteur).
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const charger = (p) => import(pathToFileURL(join(ROOT, p)).href);
let ko = 0;
const ok = (cond, msg, detail = "") => { if (cond) console.log(`  ✓ ${msg}`); else { ko++; console.log(`  ✗ ${msg}${detail ? ` — ${detail}` : ""}`); } };

const C = await charger("src/publication/lot/corrections.js");
const TF = await charger("src/utils/transporteursLbcFiche.js");
const R = await charger("src/stock/correctionsRepublication.js");

// Un moteur factice : les mêmes écritures que le pilote du stepper, tracées.
function moteur({ edited, generales = {}, price = 40, sharedFields = {}, dissociees = {}, config = null } = {}) {
  const m = {
    edited: structuredClone(edited), generales: { ...generales }, price, sharedFields: { ...sharedFields },
    traces: [], custom: new Set(),
    platformFieldsConfig: config ?? {
      vinted: [{ key: "etat", label: "État", type: "select", options: [{ value: "Très bon état" }, { value: "Bon état" }] }, { key: "taille", label: "Taille", type: "select", options: [{ value: "M" }, { value: "L" }] }, { key: "marque", label: "Marque", type: "text" }, { key: "couleur", label: "Couleur", type: "text" }, { key: "matiere", label: "Matière", type: "text" }, { key: "genre", label: "Genre", type: "select", options: [] }],
      depop: [{ key: "etat", label: "État", type: "select", options: [] }, { key: "taille", label: "Taille", type: "select", options: [] }, { key: "couleur", label: "Couleur", type: "text" }, { key: "depopPort", label: "Port", type: "text" }],
      ebay: [{ key: "couleur", label: "Couleur", type: "text" }, { key: "modele", label: "Modèle", type: "text" }],
      leboncoin: [{ key: "taille", label: "Taille", type: "select", options: [] }, { key: "univers", label: "Univers", type: "select", options: [{ value: "Femme" }] }, { key: "format_colis", label: "Format", type: "select", options: [] }],
    },
  };
  const setEdited = (f) => { m.edited = typeof f === "function" ? f(m.edited) : f; };
  Object.assign(m, {
    poserValeurGenerale: (c, v) => { m.traces.push(["generale", c, v]); m.generales[c] = v; for (const p of Object.keys(m.edited)) { if (dissociees[c]?.has(p)) continue; if (c === "titre") m.edited[p].title = v; if (c === "description") m.edited[p].description = v; if (c === "etat") m.edited[p].platform_fields.etat = v; } },
    modifierCarte: (p, c, v) => { m.traces.push(["carte", p, c, v]); if (c === "titre") m.edited[p].title = v; else if (c === "description") m.edited[p].description = v; else m.edited[p].platform_fields.etat = v; },
    poserPrixGeneral: (v) => { m.traces.push(["prix", v]); m.price = Number(v); for (const p of Object.keys(m.edited)) if (!m.custom.has(p)) m.edited[p].price = Number(v); },
    setSharedField: (k, v) => { m.traces.push(["partage", k, v]); m.sharedFields[k] = v; for (const p of Object.keys(m.edited)) m.edited[p].platform_fields[k] = v; },
    noterReponseFiche: (k) => m.traces.push(["fiche", k]),
    poserChampCopie: (p, k, v) => { m.edited[p].platform_fields[k] = v; },
    propsStepGeneration: { setEdited, dissociees, setCustomPriced: (f) => { m.custom = f(m.custom); } },
  });
  return m;
}
const COPIES = {
  vinted: { title: "Robe Sézane", description: "Jolie robe.", price: 45, platform_fields: { taille: "M", couleur: "Bleu", etat: "Très bon état" } },
  leboncoin: { title: "Robe Sézane", description: "Jolie robe.", price: 45, platform_fields: { taille: "M", couleur: "Bleu" } },
  ebay: { title: "Robe Sézane", description: "Jolie robe.", price: 45, platform_fields: { taille: "M", couleur: "Bleu", colors: ["Bleu", "Blanc"] } },
};
const PFS = ["vinted", "leboncoin", "ebay"];

console.log("1. une correction, plateforme par plateforme");
{
  const m = moteur({ edited: COPIES, generales: { titre: "Robe Sézane" }, sharedFields: { taille: "M", couleur: "Bleu" }, price: 45 });
  C.appliquerCorrection(m, { cle: "taille", valeur: "L", portee: C.PORTEE_TOUTES, plateformes: PFS });
  ok(m.traces.some((t) => t[0] === "partage" && t[1] === "taille" && t[2] === "L") && m.traces.some((t) => t[0] === "fiche" && t[1] === "taille"), "« toutes » : la taille de l'article (setSharedField) et sa réponse rangée sur la fiche (noterReponseFiche)");
  ok(PFS.every((p) => m.edited[p].platform_fields.taille === "L"), "« toutes » : chaque copie reçoit la taille (convertie au dépôt, comme avant)");
  C.appliquerCorrection(m, { cle: "couleur", valeur: "Rouge", portee: "ebay", plateformes: PFS });
  ok(m.edited.ebay.platform_fields.couleur === "Rouge" && m.edited.ebay.platform_fields.colors[0] === "Rouge" && m.edited.ebay.platform_fields.colors[1] === "Blanc", "« seulement sur eBay » : la couleur eBay, en tête de colors (ce que lisent la garde et ebay.js)");
  ok(m.edited.vinted.platform_fields.couleur === "Bleu" && m.edited.leboncoin.platform_fields.couleur === "Bleu", "… les autres plateformes gardent la leur");
  ok(C.copieAPart(m, "ebay", "couleur") && !C.copieAPart(m, "vinted", "couleur"), "la copie eBay est « à part » (repère « pour eBay seulement »), Vinted non");
  C.appliquerCorrection(m, { cle: "prix", valeur: "39", portee: "vinted", plateformes: PFS });
  ok(m.edited.vinted.price === 39 && m.edited.leboncoin.price === 45 && m.custom.has("vinted"), "prix « seulement sur Vinted » : la copie Vinted, marquée personnalisée (customPriced) ; les autres gardent 45 €");
  C.appliquerCorrection(m, { cle: "prix", valeur: "42", portee: C.PORTEE_TOUTES, plateformes: PFS });
  ok(PFS.every((p) => m.edited[p].price === 42) && !m.custom.size && m.traces.some((t) => t[0] === "prix" && t[1] === "42"), "prix « toutes » : partout 42 €, plus aucune copie à part (poserPrixGeneral + copies)");
  C.appliquerCorrection(m, { cle: "couleur", valeur: "Vert", portee: C.PORTEE_TOUTES, plateformes: PFS, gardees: ["ebay"] });
  ok(m.edited.vinted.platform_fields.couleur === "Vert" && m.edited.ebay.platform_fields.couleur === "Rouge", "onglet « L'article » : une copie à part (eBay « Rouge ») garde SA valeur");
  const m2 = moteur({ edited: COPIES, generales: { titre: "Robe" }, dissociees: { titre: new Set(["leboncoin"]) } });
  C.appliquerCorrection(m2, { cle: "titre", valeur: "Robe Sézane\nbleue", portee: C.PORTEE_TOUTES, plateformes: PFS });
  ok(m2.traces.some((t) => t[0] === "generale" && t[1] === "titre" && t[2] === "Robe Sézane bleue") && m2.traces.some((t) => t[0] === "carte" && t[1] === "leboncoin"), "titre « toutes » : la valeur générale, ET la copie modifiée à part (une ligne, jamais deux)");
  C.appliquerCorrection(m2, { cle: "etat", valeur: "Bon état", portee: "vinted", plateformes: PFS });
  ok(m2.traces.some((t) => t[0] === "carte" && t[1] === "vinted" && t[2] === "etat"), "état « seulement sur Vinted » : la carte Vinted, dissociée (modifierCarte)");
  const { lignes, aAjouter } = C.lignesDeLaPlateforme(moteur({ edited: { depop: { description: "x", price: 10, platform_fields: { taille: "M" } } } }), "depop");
  ok(!lignes.some((l) => l.cle === "titre") && lignes.some((l) => l.cle === "description") && lignes.some((l) => l.cle === "taille"), "Depop : pas de titre (Depop n'en a pas), la description et la taille");
  ok(aAjouter.some((l) => l.cle === "couleur") && !lignes.concat(aAjouter).some((l) => l.cle === "depopPort" || l.cle === "genre"), "un champ vide se propose en « + Ajouter » ; le port et le genre ont leur ligne ailleurs");
  const lb = C.lignesDeLaPlateforme(moteur({ edited: { leboncoin: { title: "x", description: "", price: 5, platform_fields: { univers: "Femme" } } } }), "leboncoin").lignes;
  ok(lb.some((l) => l.cle === "univers" && !l.commun) && !lb.some((l) => l.cle === "format_colis"), "Leboncoin : l'univers (champ de la plateforme seule) ; le format a sa ligne à lui");
}

console.log("2. ce que la fiche reçoit");
{
  const t0 = new Date("2026-11-19T10:00:00Z");
  const p1 = C.patchFicheCorrection({ cle: "prix", valeur: "42", portee: C.PORTEE_TOUTES, maintenant: t0 });
  ok(p1.colonnes.prix_vente === 42 && !Object.keys(p1.attributs).length, "prix « toutes » → inventaire.prix_vente");
  const p2 = C.patchFicheCorrection({ cle: "marque", valeur: "Sézane", portee: C.PORTEE_TOUTES, maintenant: t0 });
  ok(p2.colonnes.marque === "Sézane" && p2.attributs.marque?.source === "manuel", "marque « toutes » → colonne marque + attribut « manuel »");
  const p3 = C.patchFicheCorrection({ cle: "taille", valeur: "L", portee: "vinted", base: "M", attributs: { valeurs_plateformes: { v: { ebay: { couleur: { v: "Rouge", base: "Bleu" } } }, source: "manuel" } }, maintenant: t0 });
  const vp = p3.attributs.valeurs_plateformes;
  ok(vp?.source === "manuel" && vp.v.vinted.taille.v === "L" && vp.v.vinted.taille.base === "M" && vp.v.ebay.couleur.v === "Rouge", "« seulement sur Vinted » → valeurs_plateformes (fusionné avec ce qui était gardé), avec la valeur de l'article du moment");
  const p4 = C.patchFicheCorrection({ cle: "couleur", valeur: "Vert", portee: C.PORTEE_TOUTES, attributs: { valeurs_plateformes: vp }, maintenant: t0 });
  ok(p4.attributs.couleur?.v === "Vert" && !p4.attributs.valeurs_plateformes?.v?.ebay?.couleur && p4.attributs.valeurs_plateformes?.v?.vinted?.taille?.v === "L", "couleur « toutes » : la valeur gardée pour eBay s'efface (elle ne repartirait plus), la taille Vinted reste");
  const p5 = C.patchFicheCorrection({ cle: "couleur", valeur: "Vert", portee: C.PORTEE_TOUTES, attributs: { valeurs_plateformes: vp }, garderAPart: true, maintenant: t0 });
  ok(!p5.attributs.valeurs_plateformes, "… depuis l'onglet « L'article » (garderAPart) : la valeur à part reste gardée");
  const m = moteur({ edited: COPIES, sharedFields: { taille: "M", couleur: "Bleu" }, price: 45 });
  const rep = C.valeursAReposer(m, { valeurs_plateformes: { v: { vinted: { taille: { v: "L", base: "M" }, prix: { v: "39", base: "45" } }, ebay: { couleur: { v: "Rouge", base: "Noir" } } } } }, PFS);
  ok(rep.some((r) => r.portee === "vinted" && r.cle === "taille" && r.valeur === "L") && rep.some((r) => r.cle === "prix" && r.valeur === "39"), "à la publication suivante : la taille et le prix gardés pour Vinted se reposent (l'article a gardé M et 45 €)");
  ok(!rep.some((r) => r.portee === "ebay"), "… la couleur gardée pour eBay ne repart pas : l'article n'est plus « Noir »");
}

console.log("3. Leboncoin : le format de la FICHE, les transporteurs de la fiche");
{
  ok(C.formatColisLbc({ pf: { format_colis: "Moyen", format_colis_par_article: true }, fiche: { poids_g: 300 } }).origine === "article", "un format choisi pour CET article (marqueur) part");
  ok(C.formatColisLbc({ pf: { format_colis: "Petit", format_colis_source: "manuel" }, fiche: { poids_g: 2000 } }).valeur === "Moyen", "un format « manuel » sans marqueur (le format unique d'un lot) ne passe pas devant la fiche : parka de 2 kg → Moyen");
  const fChoisi = C.formatColisLbc({ pf: {}, fiche: { poids_g: 300, attributs: { format_colis_lbc: { v: "Petit", source: "manuel", at: "2026-11-18T10:00:00Z", poids_g: 300 } } } });
  ok(fChoisi.valeur === "Petit" && fChoisi.origine === "choisi", "la fiche dit « Petit » (cas faf5021a) : le lot montre « Petit · choisi sur la fiche », jamais « Estimé par Leboncoin »");
  ok(C.formatColisLbc({ pf: {}, fiche: {}, poids_g: null }).origine === "estime", "ni choix ni poids : « Estimé par Leboncoin » (rien d'inventé)");
  const pf = C.pfAvecFormatDeLArticle({ lbcPoidsGrammes: 650 }, "Petit");
  ok(pf.format_colis === "Petit" && pf.format_colis_source === "manuel" && pf.format_colis_par_article === true && pf.format_colis_choisi_poids === 650, "le choix de l'article : marqué « manuel », daté, au poids, ET format_colis_par_article (convenu avec le serveur)");
  ok(!("format_colis_par_article" in C.pfAvecFormatDeLArticle(pf, "")), "« Revenir à la fiche » retire le marqueur");
  const at = C.attributFormatDeLArticle("Petit", { poids_g: 650 });
  ok(at.format_colis_lbc.v === "Petit" && at.format_colis_lbc.geste === "article" && at.format_colis_lbc.source === "manuel", "la fiche reçoit le choix marqué geste « article » (jamais pris pour l'écho d'un lot)");
  ok(TF.transporteursValides(["Colissimo", "Inconnu", "Mondial Relay"]).join() === "Mondial Relay,Colissimo", "transporteurs : les noms de Leboncoin seulement, dans son ordre");
  ok(TF.transporteursDeLaFiche({ transporteurs_lbc: { v: ["Courrier suivi"], source: "manuel" } }).join() === "Courrier suivi" && TF.transporteursDeLaFiche({ transporteurs_lbc: { v: "auto" } }) === null, "la fiche porte un choix (ou « auto » : plus aucun)");
  const t1 = TF.transporteursDeLArticle({ attributs: { transporteurs_lbc: { v: ["Courrier suivi", "Colissimo"] } }, duLot: ["Mondial Relay"], poids_g: 300 });
  ok(t1.source === "fiche" && t1.noms.join() === "Courrier suivi,Colissimo", "ceux de la fiche passent devant ceux du lot");
  const t2 = TF.transporteursDeLArticle({ attributs: { transporteurs_lbc: { v: ["Courrier suivi", "Colissimo"] } }, poids_g: 5000 });
  ok(t2.noms.join() === "Colissimo", "… bornés au poids (5 kg : plus de Courrier suivi)");
  ok(TF.transporteursDeLArticle({ duLot: ["Mondial Relay"], poids_g: 300 }).source === "lot" && TF.transporteursDeLArticle({}).noms === null, "sans choix sur la fiche : ceux du lot ; sans rien : Leboncoin propose les siens");
  ok(TF.choixTransporteursPourLaFiche([]) === null && TF.basculerTransporteur(null, "Colissimo").join() === "Courrier suivi,Shop2Shop by Chronopost,Mondial Relay", "décocher depuis « tous » ; jamais une liste vide écrite");
}

console.log("4. « À vérifier » ne bloque rien");
{
  const pts = C.pointsAVerifier({ plateformesPubliables: ["vinted", "beebs"] }, {
    tailleTitre: { taille_fiche: "FR 38", taille_titre: "FR 42", systeme: "FR" },
    poses: [{ pose: { plateforme: "beebs", champ: "Âge", label: "Âge" }, valeur: "3 ans - 4 ans" }, { pose: { plateforme: "opla", champ: "x" }, valeur: "y" }],
    poidsDouteux: "un manteau",
  });
  ok(pts.some((x) => x.cle === "taille_titre" && x.valeurs.fiche === "FR 38" && x.valeurs.titre === "FR 42"), "la taille que le titre contredit : les deux valeurs, côte à côte");
  ok(pts.some((x) => x.cle === "memoire:beebs|Âge" && x.plateformes[0] === "beebs") && !pts.some((x) => x.cle.includes("opla")), "une réponse reprise de la mémoire (seulement d'une plateforme de l'article)");
  ok(pts.some((x) => x.cle === "poids"), "un poids douteux pour l'objet");
  const D = await charger("src/publication/lot/tailleDuTitre.js");
  // (19/11) La règle du serveur (Opus-2, 05f8546), branchée telle quelle : les cas de thecloset (8ac5bbda).
  const pikeur = D.tailleContreditTitre({ titre: "Pantalon Pikeur Taille FR 42", taille: "L / 40 / 12" });
  ok(pikeur && pikeur.systeme === "FR" && /42/.test(pikeur.taille_titre) && /40/.test(pikeur.taille_fiche), "« Pikeur Taille FR 42 » / fiche « L / 40 / 12 » : à vérifier, FR 40 contre FR 42", JSON.stringify(pikeur));
  ok(D.tailleContreditTitre({ titre: "Robe taille M", taille: "M" }) === null && D.tailleContreditTitre({ titre: "Lot de 2 jeans", taille: "38" }) === null, "accord ou doute : rien à vérifier (jamais une contradiction inventée)");
  const lp = lire("src/publication/lot/LotPublication.jsx");
  ok(/tailleContreditTitre\(\{ titre: String\(m\.generales\?\.titre \|\| titreDe\(item\) \|\| ""\), taille: String\(m\.sharedFields\?\.taille \?\? ""\), rayon: cheminRayon\(m, pfs0\[0\]\) \?\? null \}\)/.test(lp),
    "la liste du lot l'appelle avec le titre, la taille et le rayon de l'article");
}

console.log("5. la republication : corriger un article");
{
  const item = { id: 7, title: "Robe", description: "Texte", prix_vente: 45, marque: "", poids_g: 300, attributs: { taille: { v: "M" }, etat: { v: "Très bon état" } } };
  let c = R.avecCorrection(null, { cle: "taille", valeur: "L", portee: C.PORTEE_TOUTES });
  c = R.avecCorrection(c, { cle: "prix", valeur: "39", portee: "vinted" });
  c = R.avecCorrection(c, { cle: "etat", valeur: "Bon état", portee: C.PORTEE_TOUTES });
  ok(R.valeurQuiRepart(item, c, "vinted", "prix") === "39" && R.valeurQuiRepart(item, c, "leboncoin", "prix") === "45" && R.valeurQuiRepart(item, c, "leboncoin", "taille") === "L", "ce qui repart : sa valeur à part, sinon celle de l'article corrigée, sinon la fiche");
  ok(R.prixCorrige(c, "vinted") === 39 && R.prixCorrige(c, "depop") === null, "le prix corrigé de Vinted part à la place (prixRepublication) ; Depop garde la règle de la feuille");
  const tv = R.correctionsPourLaTache(c, "vinted");
  ok(tv.taille.v === "L" && tv.prix.v === "39" && tv.etat.v === "Bon état", "la tâche Vinted porte corrections_republication { taille, prix, etat } (forme convenue avec le serveur)");
  const tb = R.correctionsPourLaTache(R.avecCorrection(c, { cle: "couleur", valeur: "Bleu", portee: C.PORTEE_TOUTES }), "beebs");
  ok(tb.etat?.v && tb.couleurs?.v === "Bleu" && !tb.prix, "Beebs : l'état dans son vocabulaire, la couleur sous « couleurs », pas le prix de Vinted");
  ok(R.correctionsPourLaTache(R.avecCorrection(null, { cle: "poids", valeur: "500", portee: C.PORTEE_TOUTES }), "leboncoin") === null, "le poids ne va pas sur la tâche : il est sur la fiche (le serveur le lit là)");
  const c2 = R.avecCorrection(c, { cle: "prix", valeur: "41", portee: C.PORTEE_TOUTES });
  ok(!c2.parPf.vinted?.prix && R.prixCorrige(c2, "vinted") === 41, "un prix « toutes » efface le prix à part de Vinted");
  const pf = R.patchFicheRepublication({ item, cle: "titre", valeur: "Robe Sézane", portee: C.PORTEE_TOUTES });
  ok(pf.colonnes.titre === "Robe Sézane" && pf.attributs.titre_source?.v === "manuel", "titre « toutes » → la colonne titre, marquée « manuel » comme une retouche du stepper");
  ok(R.patchFicheRepublication({ item, cle: "poids", valeur: "650", portee: C.PORTEE_TOUTES }).colonnes.poids_g === 650 && !Object.keys(R.patchFicheRepublication({ item, cle: "poids", valeur: "999999", portee: C.PORTEE_TOUTES }).colonnes).length, "poids → poids_g (borné à 150 kg)");
  ok(R.champsCorriges(c).sort().join() === "etat,prix,taille", "la ligne de l'article dit ce qui a été modifié");
}

console.log("6. VERROU — « Remonter les K plus anciennes » garde les photos choisies");
{
  const items = [{ item: { id: 1 }, plateformes: ["vinted", "leboncoin"] }, { item: { id: 2 }, plateformes: ["vinted"] }, { item: { id: 3 }, plateformes: ["vinted"] }];
  const photos = { 1: { vinted: ["https://a/1.jpg"] }, 3: { vinted: ["https://a/3.jpg"] } };
  const photosDe = (item, env) => { const o = {}; for (const p of env) if (photos[item.id]?.[p]) o[p] = photos[item.id][p]; return Object.keys(o).length ? o : null; };
  const cibles = R.ciblesDeLaFeuille({ items, cochee: () => true, prix: null, baissePct: 10, garder: new Set([0, 2]), photosDe });
  ok(cibles.length === 2 && cibles[0].item.id === 1 && cibles[1].item.id === 3, "les plus anciennes seulement, dans l'ordre de la sélection");
  ok(cibles[0].photosParPlateforme?.vinted?.[0] === "https://a/1.jpg" && cibles[1].photosParPlateforme?.vinted?.[0] === "https://a/3.jpg", "… avec leurs photos choisies (perdues avant le 19/11)");
  ok(cibles.every((c) => c.baissePct === 10 && c.prix === null), "… et la baisse de la feuille, comme avant");
  const st = lire("src/tabs/StockTab.jsx");
  const plus = st.slice(st.indexOf("const confirmerPlusAnciennes = () => {"), st.indexOf("const confirmer = () => {"));
  ok(/ciblesDeLaFeuille\(\{/.test(plus) && /photosDe: \(item, envoyees\) => photosDeLaCible\(choixPhotos, item, envoyees\)/.test(plus) && /garder,/.test(plus),
    "StockTab : « Remonter les plus anciennes » bâtit ses cibles comme « Republier » (photos choisies comprises)");
  const conf = st.slice(st.indexOf("const confirmer = () => {"), st.indexOf("const chip = (p, label) =>"));
  ok(/ciblesDeLaFeuille\(\{/.test(conf) && /photosDe: \(item, envoyees\) => photosDeLaCible\(choixPhotos, item, envoyees\), correctionsDe/.test(conf), "… et « Republier » aussi, corrections comprises");
}

console.log("7. le câblage");
{
  const fa = lire("src/publication/lot/FicheArticle.jsx");
  ok(/role="tablist"/.test(fa) && /"L'article"/.test(fa) && /"Côte à côte"/.test(fa) && /useGrandEcran\(\)/.test(fa), "la fiche : un onglet « L'article », un par plateforme, « Côte à côte » sur grand écran seulement");
  ok(/Toutes ses plateformes/.test(fa) && /Seulement sur \$\{NOM\(p\)\}/.test(fa) && /gardé sur la fiche/.test(fa), "la portée d'une correction : « Toutes ses plateformes » (défaut, gardé sur la fiche) ou « Seulement sur X »");
  ok(/<LignesDeLaCopie m=\{m\} p=\{p\}/.test(fa) && /<LivraisonLbcDeLArticle /.test(fa), "chaque onglet de plateforme montre tout ce qui part, et Leboncoin son format et ses transporteurs");
  ok(/<PhotosPlateforme platform=\{p\}/.test(fa) && /className="fsf-retirer-pf"/.test(fa) && /seulementLeRayon rechercheOuverte=\{ouvert === "rayon"\}/.test(fa), "rien ne disparaît : photos par plateforme, rayon « Changer », « Ne pas publier sur X »");
  const cf = lire("src/publication/lot/correctionsFiche.js");
  ok(/from\("inventaire"\)\.update\(maj\)\.eq\("id", id\)\.eq\("user_id", uid\)/.test(cf) && /feature: "publication_correction"/.test(cf), "une correction s'écrit sur la fiche (bornée à la personne) et se journalise (usage_logs)");
  const lp = lire("src/publication/lot/LotPublication.jsx");
  const appl = lp.slice(lp.indexOf("const appliquerLivraison = (id, g = poidsDe(id)) => {"), lp.indexOf("const poserPoids = (id, g) => {"));
  ok(!/format_colis/.test(appl.replace(/\/\/.*$/gm, "")) && /transporteursDeLArticle\(\{/.test(appl), "lot : la livraison ne pose JAMAIS de format unique (ni « » qui effaçait celui de la fiche) ; transporteurs de la fiche d'abord");
  ok(/"À vérifier"/.test(lp) && /setFiltre\(k\)/.test(lp) && /fsv-filtre/.test(lp) && /valeursAReposer\(m, /.test(lp), "lot : « À vérifier » et les filtres ; les valeurs gardées par plateforme se reposent");
  ok(/<FicheArticle m=\{mOuvert\}/.test(lp) && /poserTransporteursArticle: \(liste\) => poserTransporteursArticle\(ouvert, liste\)/.test(lp), "la pop-up de l'article reçoit les transporteurs du lot et rend ceux de l'article");
  const liv = lire("src/publication/lot/LivraisonDuLot.jsx");
  ok(!/LBC_FORMATS\.map/.test(liv) && /Jamais un format unique pour tout le lot/.test(liv) && /data-formats-lot/.test(liv), "bloc Livraison : plus de format unique à choisir, le format de chaque fiche est DIT");
  ok(/Laisser Leboncoin estimer/.test(liv) && /Transporteurs Leboncoin/.test(liv) && /Recommandé par Vinted/.test(liv), "… le reste du bloc est là (poids, transporteurs, colis Vinted)");
  const lps = lire("src/components/ListingPreviewScreen.jsx");
  ok(/pfLbc\.format_colis_par_article !== true/.test(lps), "moteur : le format déjà rangé au geste n'est jamais réécrit sans sa marque au clic Publier");
  const app = lire("src/App.jsx");
  ok(/<TransporteursLbcFiche item=\{editItem\}/.test(app), "fiche article : le choix des transporteurs Leboncoin, sous le format du colis");
  const st = lire("src/tabs/StockTab.jsx");
  ok(/<CorrigerRepublication lang=\{lang\} items=\{items\}/.test(st) && (st.match(/appliquerCorrectionsTache\(supabase,/g) ?? []).length === 2, "republication : « Ce qui repart · corriger un article », et les corrections posées sur chaque tâche (unité et lot)");
  const ver = lire("src/publication/EcranVerifier.jsx");
  ok(/valeursAReposer\(m, /.test(ver) && /<FicheArticle m=\{m\}/.test(ver), "« Vérifier » (publication à l'unité) : la même fiche, les mêmes valeurs reposées");
}

console.log(ko ? `\n✗ ${ko} échec(s)` : "\nTout est vert.");
process.exit(ko ? 1 : 0);
