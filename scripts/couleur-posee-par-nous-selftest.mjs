// Autotest : VINTED — QUI A POSÉ LA COULEUR EN LIGNE ? NOUS → LA COULEUR DE LA FICHE ; LA PERSONNE → LA SIENNE
// (07/11/2026 soir, décision de Nico — Marta MELE, vinted.it).
//
//     npm run selftest:couleur-posee-par-nous
//
// Cas réels (valeurs lues en base le 07/11, lecture seule) :
//   · b9460406 « Vestito rosa WITCH » : annonce d'origine 10508676435 en 24 « Rosa » (ROSE, capture 17685 du 24/10),
//     recréée par la republication FillSell 5b179870 (0.6.141, 25/10 09:58) en 10520953498, relue 5 « Rosa » (PINK,
//     capture 22184 du 03/11) — même libellé italien, deux cases. Attendu : 24.
//   · f1c4a0e0 « Maglietta J & Y » : fiche « Blu marino » (27), publiée par FillSell (98c8d46d, 25/10 08:08) avec
//     colors ["Bleu"] / color_ids [9] (vintedColors.js ne connaît pas « blu marino »), relue 9 « Blu » (capture 21783).
//     Attendu : 27 « Blu marino ».
//   · 154ce210 / 03baac38 : republications fidèles (4+7, 27) : rien ne change.
// Sans réseau.
import fs from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const lire = (p) => fs.readFileSync(join(ROOT, p), "utf8").replace(/\r\n/g, "\n");
const M = await import(pathToFileURL(join(ROOT, "supabase/functions/_shared/couleur-posee-par-nous.js")).href);
const { COULEURS_VINTED_FR } = await (async () => {
  // La table française du module = celle de _shared/vinted-ids-publication.ts (relevé vinted.fr du 25/09).
  const src = lire("supabase/functions/_shared/vinted-ids-publication.ts");
  const bloc = src.slice(src.indexOf("COULEURS_VINTED_FR"), src.indexOf("};", src.indexOf("COULEURS_VINTED_FR")));
  return { COULEURS_VINTED_FR: Object.fromEntries([...bloc.matchAll(/(\d+): "([^"]+)"/g)].map((m) => [Number(m[1]), m[2]])) };
})();
let ko = 0;
const ok = (c, m) => { if (c) console.log(`  ✓ ${m}`); else { ko++; console.log(`  ✗ ${m}`); } };
const F = M.couleurDeLaFicheALaRepublication;

console.log("0. Tables relevées");
ok(Object.keys(M.COULEURS_VINTED_PAR_LANGUE.fr).length === 29 && Object.keys(M.COULEURS_VINTED_PAR_LANGUE.it).length === 29, "29 couleurs en français et en italien");
ok(JSON.stringify(M.COULEURS_VINTED_PAR_LANGUE.fr) === JSON.stringify(Object.fromEntries(Object.entries(COULEURS_VINTED_FR))), "français = COULEURS_VINTED_FR (vinted-ids-publication.ts, relevé du 25/09)");
ok(JSON.stringify(M.idsDuLibelle("Rosa")) === "[5,24]", "« Rosa » nomme deux couleurs en italien (5 PINK, 24 ROSE)");
ok(JSON.stringify(M.idsDuLibelle("blu marino")) === "[27]" && JSON.stringify(M.idsDuLibelle("Marine")) === "[27]", "« Blu marino » / « Marine » → 27");
ok(M.idsDuLibelle("Bleu nuit").length === 0, "un libellé libre n'a aucun identifiant (jamais d'approximation)");
ok(M.langueDesCouleurs([9], ["Blu"]) === "it" && M.langueDesCouleurs([9], ["Bleu"]) === "fr" && M.langueDesCouleurs([9], ["Blau"]) === null, "langue des libellés d'une capture : it / fr / inconnue");

// ── Données réelles ──────────────────────────────────────────────────────────
const capB = { id: 22184, vinted_item_id: "10520953498", captured_at: "2026-11-03T13:28:48Z",
  libelles: { couleurs: ["Rosa"], categoryPath: ["Donna"] }, natif: { color1_id: 5, color2_id: null, color1: "Rosa", color2: null, catalog_id: 1878 } };
const depotB = { id: "5b179870-0000-4000-8000-000000000000", action: "republish", status: "cancelled", published_at: "2026-10-25T08:58:23Z",
  platform_listing_id: "10520953498", handler_build: "2026-10-24T21:18:48Z+a07091c · v0.6.141",
  platform_fields: { capture_id: 17685, vintedAspects: { condition: "Ottime" }, republish_snapshot: { color1_id: 24, color2_id: null, couleurs: ["Rosa"] } } };
const ficheB = { attributs: { couleur: { v: "Rosa", at: "2026-11-03T13:28:48Z", source: "capture" } } };

console.log("1. b9460406 — recréée par NOTRE republication en 5 au lieu de 24 (même libellé « Rosa »)");
const rB = F({ capture: capB, depot: depotB, lectures: [capB], fiche: ficheB });
ok(rB.verdict === "fiche" && rB.motif === "posee_par_notre_depot_meme_libelle", `verdict fiche (${rB.motif})`);
ok(JSON.stringify(rB.reference) === "[24]" && rB.natif.color1_id === 24 && rB.natif.color2_id === null, "la capture repart en 24 (ROSE)");
ok(JSON.stringify(rB.libelles.couleurs) === '["Rosa"]' && rB.libelles.categoryPath?.[0] === "Donna" && rB.natif.catalog_id === 1878, "libellé « Rosa » ; le reste de la capture intact");

const capF = { id: 21783, vinted_item_id: "10519923047", captured_at: "2026-11-02T12:38:00Z",
  libelles: { couleurs: ["Blu"] }, natif: { color1_id: 9, color2_id: null, color1: "Blu", color2: null } };
const depotF = { id: "98c8d46d-0000-4000-8000-000000000000", action: "publish", status: "cancelled", published_at: "2026-10-25T07:08:55Z",
  platform_listing_id: "10519923047", handler_build: "2026-10-24T21:18:48Z+a07091c · v0.6.141",
  platform_fields: { couleur: "Blu marino", colors: ["Bleu"], color_unmapped: "Blu marino", vinted_ids: { color_ids: [9], status_id: 2, catalog_id: 221 },
    couleur_sans_question: { de: "Blu marino", colors: ["Bleu"], source: "copie" } } };
const ficheF = { attributs: { couleur: { v: "Blu marino", at: "2026-10-24T07:33:20.428Z", source: "vinted_detail" } } };

console.log("2. f1c4a0e0 — publiée par NOUS en 9 « Blu » pour une fiche « Blu marino »");
const rF = F({ capture: capF, depot: depotF, lectures: [capF], fiche: ficheF });
ok(rF.verdict === "fiche" && rF.motif === "posee_par_notre_depot", `verdict fiche (${rF.motif})`);
ok(JSON.stringify(rF.reference) === "[27]" && rF.natif.color1_id === 27 && rF.langue === "it", "la capture repart en 27, langue de la capture : italien");
ok(JSON.stringify(rF.libelles.couleurs) === '["Blu marino"]' && rF.natif.color1 === "Blu marino", "libellé italien « Blu marino »");

console.log("3. La personne garde SA couleur");
const capC = { ...capB, id: 30000, captured_at: "2026-11-06T10:00:00Z" };
const lectureAvant = { id: 29000, vinted_item_id: "10520953498", captured_at: "2026-10-28T10:00:00Z", libelles: { couleurs: ["Rosa"] }, natif: { color1_id: 24, color1: "Rosa" } };
const r3 = F({ capture: capC, depot: depotB, lectures: [lectureAvant, capC], fiche: null });
ok(r3.verdict === "en_ligne" && r3.motif === "changee_apres_notre_depot", "relue 24 après notre dépôt puis 5 : changée sur Vinted → la sienne");
const r3b = F({ capture: capB, depot: depotB, lectures: [capB], fiche: { attributs: { couleur: { v: "Viola", at: "2026-10-30T09:00:00Z", source: "vinted_detail" } } } });
ok(r3b.verdict === "en_ligne" && r3b.motif === "changee_apres_notre_depot", "la synchro a relu « Viola » après notre dépôt, « Rosa » aujourd'hui : changée → la sienne");
const capViola = { ...capB, libelles: { couleurs: ["Viola"] }, natif: { color1_id: 6, color1: "Viola" } };
ok(F({ capture: capViola, depot: depotB, lectures: [], fiche: null }).motif === "pas_la_couleur_de_notre_depot", "en ligne « Viola » : ni l'identifiant ni le libellé de notre dépôt → la sienne");
const depotRep = { ...depotB, platform_fields: { ...depotB.platform_fields, vintedAspects: { color: "Rosa" } } };
ok(F({ capture: capB, depot: depotRep, lectures: [], fiche: null }).motif === "couleur_choisie_par_la_personne", "couleur répondue par la personne pour ce dépôt → la sienne");
const depotUF = { ...depotB, platform_fields: { ...depotB.platform_fields, republish_user_fields: { couleur: "Rosa" } } };
ok(F({ capture: capB, depot: depotUF, lectures: [], fiche: null }).motif === "couleur_choisie_par_la_personne", "couleur saisie à la republication → la sienne");

console.log("4. Annonce qui n'est pas de FillSell → la couleur en ligne");
ok(F({ capture: capB, depot: null }).motif === "annonce_pas_de_fillsell", "aucun dépôt FillSell sous ce numéro");
ok(F({ capture: capB, depot: { ...depotB, handler_build: "2026-10-23T11:19:48Z+4098342 · sync-dressing" } }).motif === "annonce_pas_de_fillsell", "ligne « sync-dressing » (relevé d'une annonce née sur Vinted) : jamais un dépôt");
ok(F({ capture: capB, depot: { ...depotB, platform_listing_id: "10508676435" } }).motif === "annonce_pas_de_fillsell", "dépôt d'un AUTRE numéro : sans objet");
ok(F({ capture: capB, depot: { ...depotB, published_at: null } }).motif === "annonce_pas_de_fillsell", "dépôt jamais publié : sans objet");

console.log("5. Rien ne change quand rien n'est prouvé");
const capFid = { id: 22300, vinted_item_id: "10506369253", captured_at: "2026-11-07T10:00:00Z", libelles: { couleurs: ["Beige", "Rosso"] }, natif: { color1_id: 4, color2_id: 7, color1: "Beige", color2: "Rosso" } };
const depotFid = { id: "b2e16276", action: "republish", published_at: "2026-10-24T08:59:00Z", platform_listing_id: "10506369253", handler_build: "v0.6.131",
  platform_fields: { republish_snapshot: { color1_id: 4, color2_id: 7, couleurs: ["Beige", "Rosso"] } } };
const rFid = F({ capture: capFid, depot: depotFid, fiche: { attributs: { couleur: { v: "Beige", source: "vinted_detail", at: "2026-10-24T08:43:07Z" } } } });
ok(rFid.verdict === "en_ligne" && rFid.motif === "concorde", "154ce210 : republication fidèle (4+7) → concorde");
ok(F({ capture: { ...capB, natif: {}, libelles: {} }, depot: depotB }).motif === "sans_couleur_en_ligne", "annonce sans couleur (jeu, carte) → rien");
const depotLibre = { ...depotF, platform_fields: { ...depotF.platform_fields, couleur: "Bleu nuit", couleur_sans_question: null } };
ok(F({ capture: capF, depot: depotLibre }).motif === "reference_inconnue", "fiche au libellé libre (« Bleu nuit ») : aucune référence → la couleur en ligne");
const depotAmb = { ...depotF, platform_fields: { couleur: "Rosa", colors: ["Rose"], vinted_ids: { color_ids: [24] } } };
const capAmb = { ...capF, libelles: { couleurs: ["Rosa"] }, natif: { color1_id: 5, color1: "Rosa" } };
ok(F({ capture: capAmb, depot: depotAmb }).motif === "pas_la_couleur_de_notre_depot", "publication « Rosa » envoyée 24, en ligne 5 : pas l'envoi de notre dépôt → la sienne");
const depotSansSnap = { ...depotB, platform_fields: { capture_id: 17685, republish_snapshot: {} } };
const capDepot = { id: 17685, vinted_item_id: "10508676435", captured_at: "2026-10-24T12:17:00Z", libelles: { couleurs: ["Rosa"] }, natif: { color1_id: 24, color1: "Rosa" } };
const rSnap = F({ capture: capB, depot: depotSansSnap, depotCapture: capDepot, fiche: ficheB });
ok(rSnap.verdict === "fiche" && JSON.stringify(rSnap.reference) === "[24]", "copie sans identifiants : la capture qu'a utilisée le dépôt donne la référence (24)");
ok(F({ capture: capB, depot: depotSansSnap, depotCapture: null }).motif === "reference_inconnue", "ni copie ni capture du dépôt : aucune référence → la couleur en ligne");

console.log("6. Compte français (même règle pour tous)");
const capFr = { id: 1, vinted_item_id: "1", captured_at: "2026-11-05T10:00:00Z", libelles: { couleurs: ["Bleu"] }, natif: { color1_id: 9, color1: "Bleu" } };
const depotFr = { id: "fr", action: "publish", published_at: "2026-11-01T10:00:00Z", platform_listing_id: "1", handler_build: "v0.6.170",
  platform_fields: { couleur: "Marine", colors: ["Bleu"] } };
const rFr = F({ capture: capFr, depot: depotFr });
ok(rFr.verdict === "fiche" && rFr.natif.color1_id === 27 && rFr.libelles.couleurs[0] === "Marine", "fiche « Marine », publiée « Bleu » par nous → « Marine » (27)");
ok(F({ capture: capFr, depot: { ...depotFr, platform_fields: { couleur: "Bleu", colors: ["Bleu"] } } }).motif === "concorde", "fiche « Bleu », en ligne « Bleu » → concorde");

console.log("7. Branchement dans get-pending-jobs (bloc des republications Vinted)");
const gpj = lire("supabase/functions/get-pending-jobs/index.ts");
ok(gpj.includes('import { couleurDeLaFicheALaRepublication } from "../_shared/couleur-posee-par-nous.js";'), "import du module");
const i = gpj.indexOf("QUI A POSÉ LA COULEUR EN LIGNE ? NOUS → LA COULEUR DE LA FICHE");
const bloc = i >= 0 ? gpj.slice(i, gpj.indexOf("// ══ UNE REPUBLICATION RECRÉÉE EST FINIE", i)) : "";
ok(bloc.length > 0 && i > gpj.indexOf("VINTED : LA CAPTURE CORRIGÉE PAR LA FICHE AVANT LA RECRÉATION"), "bloc posé APRÈS la capture corrigée (relit la capture en base)");
ok(/\["captured", "deleted"\]\.includes/.test(bloc), "étapes 'captured' (avant la une-passe) et 'deleted' (recréation)");
ok(bloc.includes("!includeProcessing && !includeNeedsUser") && bloc.includes('j.status === "pending"'), "poll d'exécution, jobs en attente seulement");
ok(bloc.includes(".slice(0, 10)") && bloc.includes("couleur_de_la_fiche ?? {}") && bloc.includes(".capture_id ?? \"\") !== String(pf.capture_id)"), "10 jobs par passage, jugé une fois par capture");
ok(/sync-dressing/.test(bloc) && bloc.includes('.not("published_at", "is", null)'), "dépôt FillSell : publié, jamais une ligne « sync-dressing »");
ok(bloc.includes('select("payload, libelles")') && bloc.includes("libelles: { ...libPleins, couleurs: v.libelles.couleurs }")
  && bloc.includes("natif: { ...natifPlein, color1_id: v.natif.color1_id") && bloc.includes('.eq("user_id", user.id)'),
  "la capture ne change que de couleur (payload et libellés relus entiers, seules les clés de couleur fusionnées), filtrée par compte");
ok(bloc.includes("c1:payload->natif->color1_id") && !bloc.includes("natif:payload->natif"), "lectures groupées : les couleurs seulement, jamais le natif entier de 200 captures");
ok(bloc.includes('select("platform_fields").eq("id", String(j.id)).eq("status", "pending")') && bloc.includes("pfAPersister({ ...pfBase, ...ajout })"), "le job : platform_fields relu frais, seules nos clés ajoutées");
ok(bloc.includes("file servie telle quelle"), "jamais un point de panne");

console.log(ko ? `\n✗ ${ko} échec(s)` : "\n✓ tout est vert");
process.exit(ko ? 1 : 0);
