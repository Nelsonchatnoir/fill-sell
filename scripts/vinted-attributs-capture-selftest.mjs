// Autotest — la recréation Vinted reprend les caractéristiques capturées (point 10,
// 02/10 soir). `npm run selftest:vinted-attributs-capture`. Données RÉELLES :
// capture 10759 de Tech-t (2d37ee4a), libellés relevés sur le formulaire Vinted.
import { aspectsDeLaCapture, completerAspects, exigencesCouvertes, CHAMPS_VINTED_CANAUX_DEDIES, libelleChampVinted }
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

if (ko) { console.error(`\n✗ ${ko} échec(s)`); process.exit(1); }
console.log("\n✓ recréation : les caractéristiques de l'annonce d'origine sont reposées, rien n'est inventé");
