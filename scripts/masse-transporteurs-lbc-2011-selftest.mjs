// Autotest VERROU : LES TRANSPORTEURS LEBONCOIN DANS LA MODIFICATION EN MASSE DU STOCK (20/11/2026, demande de Louis,
// ordre de Nico — lot « écrans », point 2 : « Transporteur Leboncoin ajouté à la modification en masse, à côté du poids
// et du format »).
//
//     node --import ./scripts/loader-ext.mjs scripts/masse-transporteurs-lbc-2011-selftest.mjs
//
// Ce qu'il prouve, sans réseau ni base :
//   1. le plan : les transporteurs choisis (noms de Leboncoin, dans son ordre, sans doublon) posés sur chaque fiche ;
//      une fiche qui porte déjà exactement ce choix n'est pas réécrite ; « Comme le compte » efface le choix des
//      fiches qui en ont un, laisse les autres ; un choix vide ou inconnu n'écrit rien ;
//   2. une seule écriture pour tout le lot (même valeur), qui ne touche QUE attributs.transporteurs_lbc (le déclencheur
//      inventaire_attributs_fusion fusionne clé par clé : poids, format, état… restent), source « manuel » ;
//   3. relu par la publication (transporteursDeLaFiche / transporteursDeLArticle) : le choix de la fiche passe devant
//      celui du compte, toujours borné au poids de l'article (Courrier suivi jamais pour un colis de 3 kg) ;
//   4. l'écran : l'onglet « Transporteurs Leboncoin » à côté du poids et du format, les 4 transporteurs avec leur
//      limite, « Comme le compte », la phrase « annonces en ligne », rien de l'existant ne disparaît.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = process.env.RACINE ? process.env.RACINE : join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => { try { return fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n"); } catch { return ""; } };
const charger = async (p) => { try { return await import(pathToFileURL(join(ROOT, p)).href); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };
let ko = 0, n = 0;
const ok = (c, m, d = "") => { n++; if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}${d ? `   ← ${String(d).slice(0, 240)}` : ""}`); } };
const essai = (f) => { try { return f(); } catch (e) { return { __erreur: String(e?.message ?? e) }; } };

const M = await charger("src/stock/modifierEnLot.js");
const T = await charger("src/utils/transporteursLbcFiche.js");
const ids = (l) => (l ?? []).map((x) => (typeof x === "object" ? x.id : x)).join(",");
const maintenant = new Date("2026-11-20T10:00:00.000Z");
const avec = (v) => ({ transporteurs_lbc: { v, source: "manuel", at: "2026-11-19T17:55:15.238Z" } });
const fiches = [
  { id: 1, poids_g: 100, attributs: avec(["Courrier suivi", "Mondial Relay", "Colissimo"]) }, // le choix de Louis
  { id: 2, poids_g: 100, attributs: avec(["Mondial Relay"]) },
  { id: 3, poids_g: 3000, attributs: {} },                                                      // aucun choix
  { id: 4, poids_g: null, attributs: avec("auto") },                                            // « comme le compte »
];

console.log("1. le plan");
ok(typeof M.planTransporteursLbc === "function", "planTransporteursLbc existe", M.__erreur);
const louis = essai(() => M.planTransporteursLbc(fiches, ["Colissimo", "Courrier suivi", "Mondial Relay", "Mondial Relay"]));
ok(ids(louis?.changements) === "2,3,4" && ids(louis?.inchanges) === "1", "le choix de Louis : la fiche qui le porte déjà n'est pas réécrite", JSON.stringify(louis));
ok(JSON.stringify(louis?.changements?.[0]?.apres) === JSON.stringify(["Courrier suivi", "Mondial Relay", "Colissimo"]), "les noms de Leboncoin, dans son ordre, sans doublon", JSON.stringify(louis?.changements?.[0]));
const auto = essai(() => M.planTransporteursLbc(fiches, M.TRANSPORTEURS_COMME_LE_COMPTE));
ok(ids(auto?.changements) === "1,2" && ids(auto?.inchanges) === "3,4", "« Comme le compte » : efface le choix des fiches qui en ont un, laisse les autres", JSON.stringify(auto));
const vide = essai(() => M.planTransporteursLbc(fiches, []));
ok(vide?.changements?.length === 0 && vide?.ignores?.length === 4, "aucun transporteur coché : rien n'est écrit", JSON.stringify(vide));
const inconnu = essai(() => M.planTransporteursLbc(fiches, ["La Poste express"]));
ok(inconnu?.changements?.length === 0, "un nom que Leboncoin n'a pas : jamais écrit", JSON.stringify(inconnu));

console.log("\n2. l'écriture");
const e = essai(() => M.ecrituresDuPlan("transporteurs_lbc", louis, { maintenant }));
ok(Array.isArray(e) && e.length === 1 && ids(e[0].ids) === "2,3,4", "une seule écriture pour tout le lot", JSON.stringify(e));
ok(Array.isArray(e) && JSON.stringify(Object.keys(e[0]?.champs ?? {})) === '["attributs"]' && JSON.stringify(Object.keys(e[0]?.champs?.attributs ?? {})) === '["transporteurs_lbc"]', "elle ne touche QUE attributs.transporteurs_lbc (le reste de la fiche est fusionné, jamais écrasé)");
ok(e?.[0]?.champs?.attributs?.transporteurs_lbc?.source === "manuel" && e?.[0]?.champs?.attributs?.transporteurs_lbc?.at === maintenant.toISOString(), "source « manuel », datée");
const eA = essai(() => M.ecrituresDuPlan("transporteurs_lbc", auto, { maintenant }));
ok(eA?.[0]?.champs?.attributs?.transporteurs_lbc?.v === "auto" && ids(eA?.[0]?.ids) === "1,2", "« Comme le compte » écrit « auto » (la fusion ne sait pas effacer une clé)", JSON.stringify(eA));

console.log("\n3. relu par la publication, borné au poids");
const relu = { ...fiches[2], attributs: { ...fiches[2].attributs, ...e?.[0]?.champs?.attributs } };
ok(JSON.stringify(T.transporteursDeLaFiche?.(relu.attributs)) === JSON.stringify(["Courrier suivi", "Mondial Relay", "Colissimo"]), "la fiche relue porte le choix");
const art = T.transporteursDeLArticle?.({ attributs: relu.attributs, duLot: ["Shop2Shop by Chronopost"], poids_g: 3000 });
ok(art?.source === "fiche" && JSON.stringify(art?.noms) === JSON.stringify(["Mondial Relay", "Colissimo"]), "il passe devant le choix du lot/compte ; Courrier suivi (2 kg) jamais pour 3 kg", JSON.stringify(art));
ok(T.transporteursDeLaFiche?.({ transporteurs_lbc: { v: "auto" } }) === null, "« auto » relu : aucun choix, celui du compte vaut");

console.log("\n4. l'écran");
const barre = lire("src/stock/BarreModifierLot.jsx");
ok(/\["format_lbc", "Format Leboncoin", "Leboncoin size"\],\n  \["transporteurs_lbc", "Transporteurs Leboncoin", "Leboncoin carriers"\],/.test(barre), "l'onglet, juste après le format (à côté du poids et du format)");
for (const l of ["Prix de vente", "Quantité", "Poids", "Format Leboncoin", "Prix d'achat", "Supprimer", "Comme le compte"]) ok(new RegExp(`["\`]${l}`).test(barre), `geste « ${l} » présent`);
ok(/LBC_TRANSPORTEURS\.map\(\(t\) =>/.test(barre) && /t\.kgMax/.test(barre), "les 4 transporteurs de Leboncoin, avec leur limite de poids");
ok(/planTransporteursLbc\(choisis, transporteursChoisis\)/.test(barre), "le plan de l'onglet");
ok(/transporteurs_lbc: \{\n    fr: "Tes annonces en ligne ne changent pas/.test(barre), "la phrase « annonces en ligne » sous le bouton");

console.log(ko ? `\n✗ ${ko} échec(s) sur ${n}` : `\n✓ tout est vert — ${n} vérifications`);
process.exit(ko ? 1 : 0);
