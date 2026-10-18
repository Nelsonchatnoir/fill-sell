// ── AUTOTEST : LES ORANGES QUE FILLSELL TRANCHE SEUL (18/10/2026, « zéro friction ») ──
//   deno run --allow-read scripts/zero-friction-oranges-selftest.ts
// Rejoue les cas réels du 18/10 (valeurs relues en base, rien d'écrit) :
//   · Leboncoin 9e1fc76b : « Type d'article neuf » déjà répondu par le compte + poids répondu « pour le lot » ;
//   · Leboncoin b67c3bfb : « Type d'article neuf » né d'un état neuf DÉDUIT, état choisi « Très bon état » ;
//   · Leboncoin 233e165d : les valeurs sont déjà sur le job (une seule reprise) ;
//   · Depop f441eebf : texte « Enfant XL / S Homme », catégorie Vinted « Hommes › … » → le rayon Homme.
import { champsLbcConnus, messageChampsLbc, champsDemandesLbc } from "../supabase/functions/_shared/questions-tranchees.ts";
import { departementDeLOrigine, resoudreRayonDepop } from "../supabase/functions/_shared/depop-rayon.js";

let echecs = 0;
const ok = (t: string, c: boolean, d = "") => { if (c) console.log(`  ✓ ${t}`); else { echecs++; console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); } };
const POIDS = ["Jusqu’à 100 g", "De 100 g à 250 g", "De 250 g à 500 g", "De 500 g à 1 kg", "De 1 kg à 2 kg"];
const TYPES = ["Création / Artisanat", "Fin de série", "Article neuf du commerce"];
const champ = (k: string, l: string, liste: string[]) => ({ field_key: k, field_label: l, allowed_values: liste });

console.log("\n── LES ORANGES QUE FILLSELL TRANCHE SEUL ───────────────────────");
console.log("\n1. Leboncoin : les champs que FillSell connaît");
{
  // 9e1fc76b : état choisi neuf (la question est vraie), réponse du compte + poids du lot.
  const pf = { etat: "Neuf sans étiquette", lbcAspects: { condition: "État neuf" }, lbc_deduit: { etat: { valeur: "État neuf" } },
    needsUserFields: [champ("new_item_type", "Type d'article neuf*", TYPES), champ("estimated_parcel_weight", "Poids du colis*", POIDS)] };
  const r = champsLbcConnus(pf, { typeDuCompte: "Création / Artisanat", poidsDuLot: "De 100 g à 250 g" });
  ok("type d'article neuf ← la réponse du compte ; poids ← la réponse « pour le lot »", r.restants.length === 0
    && r.connus.find((c) => c.key === "new_item_type")?.source === "reponse_du_compte"
    && r.connus.find((c) => c.key === "estimated_parcel_weight")?.valeur === "De 100 g à 250 g");
  const sansLot = champsLbcConnus(pf, { typeDuCompte: "Création / Artisanat", poidsDuLot: null });
  ok("sans réponse « pour le lot » : le poids reste la question (jamais inventé)", sansLot.restants.map((f) => f.field_key).join() === "estimated_parcel_weight");
  ok("une réponse hors de la liste de la question n'est jamais posée", champsLbcConnus(pf, { typeDuCompte: "Seconde main", poidsDuLot: null }).connus.length === 0);
}
{
  // b67c3bfb : état neuf DÉDUIT par FillSell, état CHOISI « Très bon état ».
  const pf = { etat: "Très bon état", lbcAspects: { condition: "Neuf sans étiquette" }, lbc_deduit: { etat: { valeur: "Neuf sans étiquette" } },
    needsUserFields: [champ("new_item_type", "Type d'article neuf*", TYPES), champ("estimated_parcel_weight", "Poids du colis*", POIDS)] };
  const r = champsLbcConnus(pf, {});
  ok("« Type d'article neuf » sans objet (l'état choisi n'est pas neuf)", r.sansObjet.join() === "new_item_type");
  ok("le poids sans source reste la question, seule", r.restants.length === 1 && r.restants[0].field_key === "estimated_parcel_weight");
  ok("le message ne demande plus que le poids", /« Poids du colis\* »/.test(messageChampsLbc(r.restants)) && !/Type d'article/.test(messageChampsLbc(r.restants)));
  const repondu = champsLbcConnus({ ...pf, needsUserResolved: { "lbcAspects.condition": "Neuf sans étiquette" } }, {});
  ok("un état neuf RÉPONDU par la personne garde la question", !repondu.sansObjet.length);
}
{
  // 233e165d : les deux valeurs sont déjà sur le job.
  const pf = { etat: "Bon état", lbcAspects: { table_art_product: "Couvert", estimated_parcel_weight: "Jusqu’à 100 g" },
    needsUserFields: [champ("table_art_product", "Produit*", ["Assiette", "Couvert", "Verre"]), champ("estimated_parcel_weight", "Poids du colis*", POIDS)] };
  const r = champsLbcConnus(pf, {});
  ok("valeurs déjà sur le job → toutes connues (une seule reprise)", r.restants.length === 0 && r.connus.every((c) => c.source === "job"));
  ok("apostrophe ’ / ' : même valeur", champsLbcConnus({ ...pf, lbcAspects: { ...pf.lbcAspects, estimated_parcel_weight: "Jusqu'à 100 g" } }, {}).connus.length === 2);
  ok("une liste vide ne prouve rien : la question", champsLbcConnus({ lbcAspects: { x: "a" }, needsUserField: { field_key: "x", field_label: "X", allowed_values: [] } }, {}).restants.length === 1);
  ok("needsUserField seul est lu aussi", champsDemandesLbc({ needsUserField: champ("x", "X", ["a"]) }).length === 1);
}
{
  const src = await Deno.readTextFile(new URL("../supabase/functions/_shared/questions-tranchees.ts", import.meta.url));
  ok("une passe par job (champs_lbc_tranches), compare-and-swap sur needs_user", /\.is\("platform_fields->champs_lbc_tranches", null\)/.test(src)
    && /np\.champs_lbc_tranches = \{/.test(src) && /\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)\.select\("id"\);\s*if \(data\?\.length\) \(n as Record<string, number>\)\.champs_lbc/.test(src));
  ok("seule une réponse « pour le lot » (poids_lbc_du_lot) vaut pour les frères", /if \(!pfF\.poids_lbc_du_lot\) continue;/.test(src));
}
console.log("\n2. Depop : la catégorie d'origine tranche un texte « enfant ET adulte »");
{
  ok("Hommes › … → menswear ; Enfants → kidswear ; Femmes → womenswear ; rien → null",
    departementDeLOrigine(["Hommes", "Vêtements", "Hauts et t-shirts"]) === "menswear" && departementDeLOrigine("Enfants > Filles") === "kidswear"
    && departementDeLOrigine(["Femmes"]) === "womenswear" && departementDeLOrigine(null) === null && departementDeLOrigine(["Maison"]) === null);
  const demandes: unknown[] = [];
  const ia = async (corps: Record<string, unknown>) => { demandes.push(corps); const ids = ((corps as { candidats?: { depop?: Array<{ id: string }> } }).candidats?.depop ?? []).map((c) => c.id); return { choix: { depop: { id: ids.find((id) => /t-?shirt/.test(id)) ?? ids[0] } } }; };
  const ctx = { titre: "Lot de 2 T-shirts de sport Nike & Under Armour", description: "Taille S (Enfant XL / S Homme)", origine: ["Hommes", "Vêtements", "Vêtements de sport et accessoires", "Hauts et t-shirts"], genre: "Homme", taille: "S" };
  const r = await resoudreRayonDepop(ctx, ia) as Record<string, unknown>;
  const cands = ((demandes[0] as { candidats?: { depop?: Array<{ id: string }> } })?.candidats?.depop ?? []).map((c) => c.id);
  ok("f441eebf : le moteur cherche dans le rayon Homme seulement, et trouve", cands.length > 0 && cands.every((id) => id.startsWith("menswear/")) && String(r.id ?? "").startsWith("menswear/tops/"), JSON.stringify(r).slice(0, 160));
  const r2 = await resoudreRayonDepop({ ...ctx, origine: null }, ia) as Record<string, unknown>;
  ok("sans catégorie d'origine : la question, comme avant", r2.motif === "enfant_et_adulte" && Boolean(r2.question));
  const hw = await Deno.readTextFile(new URL("../supabase/functions/handler-watch/index.ts", import.meta.url));
  ok("handler-watch rejuge UNE fois une question « enfant ET adulte » d'avant la règle", /pf\.depop_rayon\?\.motif === "enfant_et_adulte" && !pf\.depop_rayon_rejuge && !reponseRayonDepop\(pf\)/.test(hw)
    && /update\(\{ status: "pending", error: null, platform_fields: pfR \}\)\s*\.eq\("id", j\.id\)\.eq\("status", "needs_user"\)/.test(hw));
}
console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ oranges tranchées par FillSell — tout est vert");
Deno.exit(echecs ? 1 : 0);
