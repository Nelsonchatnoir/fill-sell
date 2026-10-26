// Autotest — la recréation Vinted reprend les caractéristiques capturées (point 10,
// 02/10 soir). `npm run selftest:vinted-attributs-capture`. Données RÉELLES :
// capture 10759 de Tech-t (2d37ee4a), libellés relevés sur le formulaire Vinted.
import { aspectsDeLaCapture, completerAspects, exigencesCouvertes, CHAMPS_VINTED_CANAUX_DEDIES, libelleChampVinted, VINTED_MODELE_REPLI_PAR_TYPE }
  from "../supabase/functions/_shared/vinted-attributs-capture.js";

let ko = 0;
const ok = (c, nom, d = "") => { if (c) console.log(`  ✓ ${nom}`); else { console.error(`  ✗ ${nom}${d ? `\n      ${d}` : ""}`); ko++; } };

const natif = {
  model: { has_children: false, metadata: { collection_id: 8576 }, name: "Chromebook CM14", type: "known" },
  item_attributes: [
    { code: "keyboard_layout", ids: [1430] }, { code: "computer_ram", ids: [3460] },
    { code: "computer_storage_capacity", ids: [3480] }, { code: "computer_operating_system", ids: [3489] },
    { code: "laptop_display_size", ids: [3496] }, { code: "laptop_charger_included", ids: [3500] },
    { code: "condition", ids: [2] },
  ],
};
console.log("\n1. TECH-T — CE QUE LA CAPTURE PORTAIT");
const cap = aspectsDeLaCapture(natif);
ok(cap.aspects.model === "Chromebook CM14", "modèle connu de Vinted (collection 8576)");
ok(cap.aspects.computer_ram === "4 Go" && cap.aspects.computer_storage_capacity === "64 Go" && cap.aspects.laptop_charger_included === "Inclus",
  "RAM 4 Go, stockage 64 Go, chargeur inclus — les ids de l'annonce d'origine", JSON.stringify(cap.aspects));
ok(!("condition" in cap.aspects) && cap.nonResolus.length === 0, "l'état passe par son canal ; rien d'irrésolu");

console.log("\n2. AUCUNE VALEUR INVENTÉE");
const inconnu = aspectsDeLaCapture({ item_attributes: [{ code: "computer_ram", ids: [99999] }, { code: "sim_lock", ids: [12] }] });
ok(!Object.keys(inconnu.aspects).length && inconnu.nonResolus.join() === "computer_ram,sim_lock", "id ou code hors table : non résolu, jamais deviné");
ok(aspectsDeLaCapture({ model: { name: "Truc", type: "custom" } }).aspects.model === undefined, "modèle libre (pas dans la liste Vinted) : pas reposé");

console.log("\n3. FUSION AVEC CE QUI EST DÉJÀ LÀ");
const r = completerAspects({ model: "CM1400FX", computer_ram: "8 Go" }, cap);
ok(r.vintedAspects.model === "Chromebook CM14" && r.remplace.model === "CM1400FX", "modèle hors liste remplacé par celui de l'annonce d'origine (tracé)");
ok(r.vintedAspects.computer_ram === "8 Go", "une valeur déjà posée (réponse de la personne) n'est jamais écrasée");
const req = [{ key: "model" }, { key: "computer_storage_capacity" }, { key: "computer_ram" }, { key: "laptop_charger_included" }];
ok(exigencesCouvertes(req, completerAspects({}, cap).vintedAspects), "les 4 champs exigés par le 400 sont couverts → la recréation repart");
ok(!exigencesCouvertes(req, { model: "Chromebook CM14" }), "un champ manque → on ne relance pas");
ok(!exigencesCouvertes([], {}), "aucun refus connu : rien à relancer ici");

console.log("\n4. LA GARDE AVANT RETRAIT");
ok(["color", "brand", "size", "package_size", "language_book", "condition"].every((k) => CHAMPS_VINTED_CANAUX_DEDIES.has(k)), "champs à canal dédié : jamais redemandés par la garde");
ok(libelleChampVinted("computer_ram") === "RAM" && libelleChampVinted("laptop_charger_included") === "Chargeur inclus", "libellés humains, pas les codes serveur");

// (26/10, point 3c) Thibault, dca41766 — capture 18142 TELLE QU'EN BASE (Téléphones portables 3661, Samsung
// 109048) : l'annonce d'origine portait un modèle de REPLI ; la copie l'a perdu, quatre 400 {"field":"model"}
// après le retrait. ⚠️ « other » = « Mon modèle ne figure pas dans la liste » est une HYPOTHÈSE (aucune preuve
// en base, cf. _shared/vinted-attributs-capture.js).
console.log("\n5. THIBAULT — LE MODÈLE DE REPLI DE L'ANNONCE D'ORIGINE");
const natifThibault = {
  model: { has_children: false, metadata: { collection_id: 2 }, type: "other" },
  catalog_id: 3661, ontology_collection_id: 2, ontology_model_id: null,
  brand_dto: { id: 109048, title: "Samsung" },
  item_attributes: [{ code: "internal_memory_capacity", ids: [1292] }, { code: "sim_lock", ids: [1313] }, { code: "condition", ids: [3] }],
};
// (26/10 nuit) Le repli n'est versé qu'à un poste qui sait le choisir (get-pending-jobs : build ≥ BUILD_VINTED_MODELE_REPLI).
const capT = aspectsDeLaCapture(natifThibault, { repliModele: true });
{
  const ancien = aspectsDeLaCapture(natifThibault);
  ok(ancien.aspects.model === undefined && ancien.modele_repli === false && ancien.modele_exige === true,
    "poste qui ne sait pas choisir un repli : rien n'est versé (la question reste, jamais une relance vers un 400)", JSON.stringify(ancien));
  ok(!exigencesCouvertes([{ key: "model", label: "Modèle" }], completerAspects(null, ancien).vintedAspects), "… et la question « Modèle » ne repart pas");
}
const REPLI = "Mon modèle ne figure pas dans la liste";
ok(VINTED_MODELE_REPLI_PAR_TYPE.other === REPLI, "type « other » → « Mon modèle ne figure pas dans la liste » (hypothèse écrite)");
ok(capT.aspects.model === REPLI && capT.modele_repli === true && capT.modele === null, "le modèle « other » devient le libellé de repli (il était jeté)", JSON.stringify(capT));
ok(JSON.stringify(capT.modele_capture) === JSON.stringify({ type: "other", collection_id: 2, name: null }), "modele_capture : type, collection_id, name — tels que capturés", JSON.stringify(capT.modele_capture));
ok(capT.modele_exige === true, "le modèle est « exigé » : l'annonce d'origine en portait un");
ok(capT.nonResolus.join() === "internal_memory_capacity,sim_lock", "stockage et simlock : toujours à leur canal (résolus au formulaire), rien d'inventé");
{
  const vide = completerAspects(null, capT);
  ok(vide.vintedAspects.model === REPLI && vide.poses.join() === "model" && !Object.keys(vide.remplace).length, "copie SANS modèle : le repli est posé");
  ok(exigencesCouvertes([{ key: "model", label: "Modèle", message: "Sélectionne le modèle de ton article" }], vide.vintedAspects),
    "le 400 de dca41766 (server_required_fields « model ») est couvert → la question « Modèle » repart d'elle-même");
  const repondu = completerAspects({ model: "Galaxy S10" }, capT);
  ok(repondu.vintedAspects.model === "Galaxy S10" && !repondu.poses.length && !Object.keys(repondu.remplace).length, "copie qui a un modèle (réponse) : JAMAIS remplacé par le repli");
  ok(completerAspects({ model: REPLI }, capT).poses.length === 0, "le repli déjà là : rien à réécrire");
}
ok(completerAspects({ model: "CM1400FX" }, cap).remplace.model === "CM1400FX", "un modèle CONNU de l'annonce prime toujours sur une saisie hors liste (Tech-t, inchangé)");
ok(cap.modele_repli === false && cap.modele_exige === true && cap.modele_capture?.type === "known" && cap.modele_capture?.collection_id === 8576 && cap.modele_capture?.name === "Chromebook CM14",
  "modèle connu : jamais un repli ; modele_capture fidèle");
{
  const sans = aspectsDeLaCapture({ item_attributes: [] });
  ok(sans.modele_exige === false && sans.modele_capture === null && !("model" in sans.aspects), "aucun modèle capturé : rien d'exigé, rien posé");
  ok(aspectsDeLaCapture({ model: null }).modele_exige === false, "natif.model nul : rien d'exigé");
  const autreType = aspectsDeLaCapture({ model: { type: "unknown", metadata: { collection_id: 7 } } });
  ok(!("model" in autreType.aspects) && autreType.modele_exige === true && autreType.modele_capture?.type === "unknown",
    "un autre type (jamais vu) : aucun libellé inventé, mais le modèle reste « exigé »");
  ok(aspectsDeLaCapture({ model: { name: "Truc", type: "custom" } }).modele_exige === true, "« custom » : pas reposé (inchangé), mais exigé");
}

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ recréation : les caractéristiques de l'annonce d'origine sont reposées, rien n'est inventé");
