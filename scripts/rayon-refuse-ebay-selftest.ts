// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON REFUSÉ NE PART JAMAIS — CÔTÉ SERVEUR eBAY — SELFTEST (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qu'il garantit, sans réseau (supabase/functions/_shared/rayon-refuse-ebay.ts) :
//   1. PÉRIMÈTRE : un job sans refus (aucune vérification, « confirme »,
//      « remplace », « rayon_apres_refus », « rayon_a_choisir »…) rend null —
//      ebay-api-worker suit alors son chemin d'avant, au caractère près ;
//   2. un mapping qui n'est PAS le rayon refusé (choix du vendeur, rayon repris
//      par l'app) rend null, même quand le job porte un refus ;
//   3. le mapping refusé est reconnu malgré accents, casse et espaces ;
//   4. « refuse_hors_famille » : le chemin écarté par le contrôle de famille
//      compte comme refusé, au même titre que celui de l'icône ;
//   5. le rayon refusé sort des suggestions d'eBay, par chemin ET par
//      identifiant ; les autres restent, dans leur ordre ;
//   6. les six dépôts eBay « refusés » réels depuis le 10/09 sont reconnus.
//
//   deno run scripts/rayon-refuse-ebay-selftest.ts
import {
  cheminsRefusesParLApp, cleChemin, mappingRefuseParLApp, suggestionsSansRefus, VERDICTS_REFUS,
} from "../supabase/functions/_shared/rayon-refuse-ebay.ts";

let echecs = 0;
const ok = (cond: boolean, quoi: string) => {
  console.log(`${cond ? "  ✓" : "  ✗"} ${quoi}`);
  if (!cond) echecs++;
};

const CADRES = ["Maison", "Décoration d'intérieur", "Cadres"];
const SCULPT = ["Maison", "Décoration d'intérieur", "Scultures, figurines"];
const CHARGEURS = ["Téléphonie, mobilité", "Tél. mobiles: accessoires", "Chargeurs, stations d'accueil"];
const ROUTEURS = ["Informatique, réseaux", "Réseau, connectivité domestiq.", "Routeurs sans fil"];

console.log("\n1. Périmètre : sans refus, rien ne change");
ok(mappingRefuseParLApp({}, CADRES) === null, "aucune vérification → null");
ok(mappingRefuseParLApp(null, CADRES) === null, "pas de platform_fields → null");
for (const verdict of ["confirme", "remplace", "descente_arbre", "attente_resolution", "rayon_apres_refus", "rayon_a_choisir", ""]) {
  ok(mappingRefuseParLApp({ categorie_verification: { verdict, chemin_icone: CADRES } }, CADRES) === null, `verdict « ${verdict || "(vide)"} » → null`);
}
ok(cheminsRefusesParLApp({ categorie_verification: { verdict: "confirme", chemin_icone: CADRES } }).length === 0, "« confirme » : aucun rayon refusé");
ok(VERDICTS_REFUS.size === 3 && ["incoherent", "refuse_hors_famille", "descente_non_confirmee"].every((v) => VERDICTS_REFUS.has(v)),
  "les trois verdicts de l'app, et eux seuls (mêmes que VERDICTS_REFUS de rayonApresRefus.js)");

console.log("\n2. Un mapping qui n'est pas le rayon refusé passe");
const pfRefus = { categorie_verification: { verdict: "incoherent", chemin_icone: CADRES } };
ok(mappingRefuseParLApp(pfRefus, SCULPT) === null, "le vendeur a choisi « Scultures, figurines » → null");
ok(mappingRefuseParLApp(pfRefus, []) === null, "mapping vide → null");
ok(mappingRefuseParLApp(pfRefus, null) === null, "mapping absent → null");

console.log("\n3. Le mapping refusé est reconnu");
const r3 = mappingRefuseParLApp(pfRefus, CADRES);
ok(Array.isArray(r3) && r3.length === 1 && cleChemin(r3[0]) === cleChemin(CADRES), "« incoherent » + mapping = chemin de l'icône → refusé");
ok(mappingRefuseParLApp(pfRefus, ["maison", "Decoration d'interieur ", "  CADRES"]) !== null, "accents, casse, espaces neutralisés");

console.log("\n4. « refuse_hors_famille » : le chemin écarté compte");
const pfFamille = {
  categorie_verification: { verdict: "refuse_hors_famille", chemin_icone: ["Jouets et jeux", "Peluches, doudous", "Modernes"] },
  categorie_plausibilite: { verdict: "hors_famille", chemin_ecarte: ["Jouets et jeux", "Peluches, doudous", "Modernes"] },
};
const r4 = cheminsRefusesParLApp(pfFamille);
ok(r4.length === 1, "icône et chemin écarté identiques → un seul refusé (dédoublonné)");
const pfFamille2 = {
  categorie_verification: { verdict: "refuse_hors_famille", chemin_icone: CADRES },
  categorie_plausibilite: { verdict: "hors_famille", chemin_ecarte: CHARGEURS },
};
ok(cheminsRefusesParLApp(pfFamille2).length === 2, "icône et chemin écarté différents → deux refusés");
ok(mappingRefuseParLApp(pfFamille2, CHARGEURS) !== null, "mapping = chemin écarté par la famille → refusé");

console.log("\n5. Les suggestions d'eBay sans le rayon refusé");
const sugg = [
  { id: "123417", chemin: CHARGEURS },
  { id: "44995", chemin: ROUTEURS },
  { id: "79654", chemin: ["Maison", "Décoration d'intérieur", "Cadres"] },
  { id: "36025", chemin: SCULPT },
];
const s1 = suggestionsSansRefus(sugg, [CHARGEURS], "123417");
ok(s1.length === 3 && s1[0].id === "44995", "refusé retiré par chemin et identifiant ; ordre gardé");
const s2 = suggestionsSansRefus(sugg, [["Téléphonie, mobilité", "Tel. mobiles : accessoires", "Chargeurs"]], "123417");
ok(!s2.some((s) => s.id === "123417"), "libellé divergent : l'identifiant suffit à le retirer");
const s3 = suggestionsSansRefus(sugg, [CADRES], "0");
ok(!s3.some((s) => s.id === "79654") && s3.length === 3, "identifiant inconnu : le chemin suffit à le retirer");
ok(suggestionsSansRefus([], [CADRES], "79654").length === 0, "aucune suggestion → aucune");

console.log("\n6. Les six dépôts eBay « refusés » réels depuis le 10/09");
// Relevés en base le 25/09 : verdict, chemin refusé, et le mapping que l'app
// avait posé en partant (le worker a réécrit celui des trois voies API).
const reels = [
  { id: "4d430101", voie: "api", pf: { categorie_verification: { verdict: "refuse_hors_famille", chemin_icone: ["Jouets et jeux", "Peluches, doudous", "Modernes"] } }, mapping: ["Jouets et jeux", "Peluches, doudous", "Modernes"] },
  { id: "095e28ac", voie: "api", pf: { categorie_verification: { verdict: "incoherent", chemin_icone: ["Jeux vidéo, consoles", "Consoles"] } }, mapping: ["Jeux vidéo, consoles", "Consoles"] },
  { id: "bf3db976", voie: "api", pf: { categorie_verification: { verdict: "incoherent", chemin_icone: CHARGEURS } }, mapping: CHARGEURS },
  { id: "17a7abfe", voie: "extension", pf: { categorie_verification: { verdict: "incoherent", chemin_icone: CADRES } }, mapping: CADRES },
  { id: "a543f955", voie: "extension", pf: { categorie_verification: { verdict: "incoherent", chemin_icone: CADRES } }, mapping: CADRES },
  { id: "e9ee25f0", voie: "extension", pf: { categorie_verification: { verdict: "incoherent", chemin_icone: ["Vêtements, accessoires", "Homme : vêtements, accessoires", "Homme : vêtements", "Costumes"] } }, mapping: ["Vêtements, accessoires", "Homme : vêtements, accessoires", "Homme : vêtements", "Costumes"] },
];
for (const r of reels) ok(mappingRefuseParLApp(r.pf, r.mapping) !== null, `${r.id} (${r.voie}) : le mapping de départ est reconnu comme refusé`);
// Et le rayon que le worker a posé depuis sur les trois voies API n'est PAS un refus :
ok(mappingRefuseParLApp(reels[2].pf, ROUTEURS) === null, "bf3db976 : « Routeurs sans fil » (posé par le worker) n'est pas refusé");

console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ rayon refusé côté serveur eBay : tout passe");
if (echecs) Deno.exit(1);
