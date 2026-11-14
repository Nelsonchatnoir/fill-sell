// Selftest — le plafond de la dépense IA, codé en dur (18/10, lot 2 ; filet de 50 $/jour depuis le 14/11).
//   npm run selftest:budget-ia
// (14/11/2026) Règle de Nico : rien ne doit être bloqué — un filet de 50 $/jour, au-delà le chemin sans IA.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import { PLAFONDS_ANTHROPIC_USD, budgetOuvert } from "../supabase/functions/_shared/budget-ia.ts";

let n = 0;
const cas = (nom: string, f: () => void) => { f(); n++; console.log(`  ✓ ${nom}`); };
console.log("budget-ia-selftest");
const lire = (p: string) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url)).replace(/\r\n/g, "\n");

cas("le plafond est codé en dur : un FILET de 50 $ par jour, le même pour les trois niveaux, sans plafond par mois (14/11)", () => {
  for (const niveau of ["moteur", "confort", "essentiel"] as const) {
    assertEquals(PLAFONDS_ANTHROPIC_USD[niveau].jour, 50);
    assert(!("mois" in PLAFONDS_ANTHROPIC_USD[niveau]));
  }
  assert(Object.isFrozen(PLAFONDS_ANTHROPIC_USD));
});

cas("octobre réel (54,8 $ au 18, 3,1 $/jour) et le 14/11 (10,18 $) : tout passe", () => {
  for (const etat of [{ anthropic_jour: 3.1, anthropic_mois: 54.8 }, { anthropic_jour: 10.18, anthropic_mois: 77.3 }]) {
    for (const niveau of ["moteur", "confort", "essentiel"] as const) assertEquals(budgetOuvert(niveau, etat).ouvert, true);
  }
});

cas("au-delà du filet, chaque niveau retombe sur le chemin sans IA (rien n'est bloqué : voir filet-ia-selftest)", () => {
  for (const niveau of ["moteur", "confort", "essentiel"] as const) {
    assertEquals(budgetOuvert(niveau, { anthropic_jour: 50.5, anthropic_mois: 60 }).motif, "plafond_jour_50");
    assertEquals(budgetOuvert(niveau, { anthropic_jour: 2, anthropic_mois: 400 }).ouvert, true);
  }
});

cas("compteur illisible : l'essentiel et le confort passent (une panne n'est pas une dépense), le moteur non", () => {
  assertEquals(budgetOuvert("essentiel", null).ouvert, true);
  assertEquals(budgetOuvert("confort", null).ouvert, true);
  assertEquals(budgetOuvert("moteur", null), { ouvert: false, motif: "compteur_illisible" });
  assertEquals(budgetOuvert("confort", { anthropic_jour: Number.NaN, anthropic_mois: 3 }).ouvert, true);
});

cas("branché AVANT tout appel et tout débit : resolve-categorie, lens-analysis, generate-listing", () => {
  const rc = lire("supabase/functions/resolve-categorie/index.ts");
  assert(/const budget = await budgetIaAutorise\(admin, "confort", "resolve-categorie"\);\n  if \(!budget\.ouvert\) return json\(\{ choix: \{\}, valeurs: \{\}, motif: "ia_indisponible"/.test(rc));
  const la = lire("supabase/functions/lens-analysis/index.ts");
  const iBudget = la.indexOf('budgetIaAutorise(adminClient, estIdentify ? "confort" : "essentiel", "lens-analysis")');
  const iReserve = la.indexOf("RÉSERVATION DU SCAN, AVANT TOUT DÉBIT");
  assert(iBudget > 0 && iBudget < iReserve, "lens : avant la réservation et le débit du scan");
  const gl = lire("supabase/functions/generate-listing/index.ts");
  const iGl = gl.indexOf('budgetIaAutorise(adminClient, microAppel ? "confort" : "essentiel", "generate-listing")');
  assert(iGl > 0 && iGl < gl.indexOf('if (body.resolve_genre === true) {\n      const it'), "generate-listing : avant le premier appel");
  assert(iGl < gl.indexOf('.rpc("spend_coins_for_generate"'), "generate-listing : avant le débit");
});

cas("le compteur : alimenté par chaque journal qui porte un coût, sans jamais casser l'écriture", () => {
  const m = lire("supabase/migrations/20261018120000_deduction_apprise_budget_ia.sql");
  assert(/CREATE TRIGGER usage_logs_ia_depense AFTER INSERT ON public\.usage_logs\n  FOR EACH ROW WHEN \(NEW\.metadata \? 'cost_usd'\)/.test(m));
  assert(/EXCEPTION WHEN OTHERS THEN\n    -- Un compteur ne casse jamais l'écriture d'un journal\.\n    NULL;/.test(m));
  assert(/GRANT EXECUTE ON FUNCTION public\.ia_depense_etat\(\) TO service_role;/.test(m));
});

console.log(`budget-ia-selftest : ${n} cas verts`);
