// ── AUTOTEST : LA CASCADE DES LEVIERS IA, CHAMP PAR CHAMP (18/10/2026, « zéro friction ») ──
//   deno run --allow-read scripts/ia-leviers-selftest.ts
// Base factice, Anthropic factice : aucun réseau, aucune écriture.
// Verrouille : (1) une réponse de l'existant n'est JAMAIS remplacée ; (2) seul un
// champ de la table, vivant, déclenche un levier ; (3) « fantome » note sans
// poser, « actif » pose ; (4) les paires Maison & Jardin ne déclenchent rien ;
// (5) plafond IA « moteur » fermé = rien ne tourne ; (6) Haiku 5.5 sans
// température, réflexion coupée ; (7) la ligne usage_logs porte le coût une fois.
import { choisirLeviers, appliquerLeviers } from "../supabase/functions/_shared/ia-leviers-bascule.ts";
import { optionsDuLevier, coutUsd } from "../supabase/functions/_shared/aspects-leviers.ts";

let echecs = 0;
const ok = (t: string, c: boolean, d = "") => { if (c) console.log(`  ✓ ${t}`); else { echecs++; console.log(`  ✗ ${t}${d ? ` — ${d}` : ""}`); } };
console.log("\n── LA CASCADE DES LEVIERS IA ───────────────────────────────────");

const B = [
  { plateforme: "leboncoin", champ: "Produit", levier: "L1", etat: "actif" },
  { plateforme: "leboncoin", champ: "Support", levier: "L1", etat: "fantome" },
  { plateforme: "beebs", champ: "Âge", levier: "L4", etat: "actif" },
] as const;
console.log("\n1. Le choix (pur)");
{
  const d = [{ name: "Produit" }, { name: "Support" }, { name: "Genre" }];
  const c = choisirLeviers({ plateforme: "leboncoin", demandes: d, l0: { Produit: "", Support: "VHS" }, bascules: [...B] as never });
  ok("l'existant a répondu (Support) : jamais remplacé", !c.some((x) => x.name === "Support"));
  ok("un champ vide de la table (Produit) : son levier", c.length === 1 && c[0].name === "Produit" && c[0].ligne.levier === "L1");
  ok("un champ hors table (Genre) : rien", !c.some((x) => x.name === "Genre"));
  ok("feuille Maison & Jardin : Univers / Produit / Type jamais", choisirLeviers({ plateforme: "leboncoin", demandes: [{ name: "Produit" }], l0: {}, bascules: [...B] as never, feuilleDependante: true }).length === 0);
  ok("« Univers et produit » (paire) jamais", choisirLeviers({ plateforme: "leboncoin", demandes: [{ name: "Univers et produit" }], l0: {}, bascules: [{ plateforme: "leboncoin", champ: "Univers et produit", levier: "L1", etat: "actif" }] as never }).length === 0);
  ok("eBay n'entre pas dans la cascade", choisirLeviers({ plateforme: "ebay", demandes: [{ name: "Produit" }], l0: {}, bascules: [...B] as never }).length === 0);
}

console.log("\n2. La cascade, base et Anthropic factices");
const corpsEnvoyes: Array<Record<string, unknown>> = [];
const logs: Array<Record<string, unknown>> = [];
// deno-lint-ignore no-explicit-any
function fausseBase(bascules: any[], budget = { anthropic_jour: 1, anthropic_mois: 10 }) {
  return {
    from: (t: string) => {
      if (t === "ia_leviers_bascule") {
        return { select: () => ({ eq: (_c: string, p: string) => ({ in: async () => ({ data: bascules.filter((b) => b.plateforme === p), error: null }) }) }) };
      }
      if (t === "usage_logs") return { insert: async (rows: Array<Record<string, unknown>>) => { logs.push(...rows); return { error: null }; } };
      throw new Error(`table inattendue ${t}`);
    },
    rpc: async (f: string) => (f === "ia_depense_etat" ? { data: budget, error: null } : { data: null, error: null }),
  };
}
const vraiFetch = globalThis.fetch;
globalThis.fetch = (async (_url: string, init?: RequestInit) => {
  const corps = JSON.parse(String(init?.body ?? "{}"));
  corpsEnvoyes.push(corps);
  const question = JSON.stringify(corps.messages ?? "");
  const reponse = question.includes("Produit") ? { aspects: { Produit: "Figurines" } } : question.includes("Âge") ? { aspects: { "Âge": "3 ans - 4 ans" } } : { objet: "jeu de société", mentions: { age: "3+" } };
  return new Response(JSON.stringify({ content: [{ type: "text", text: JSON.stringify(reponse) }], usage: { input_tokens: 1000, output_tokens: 50 } }), { status: 200 });
}) as typeof fetch;
{
  const demandes = [{ name: "Produit", mode: "SELECTION_ONLY", allowedValues: ["Figurines", "Cartes"], key: "leisure_collection_product", cible: null }];
  const r = await appliquerLeviers({ admin: fausseBase([...B]), userId: "u", plateforme: "leboncoin", categorie: "Loisirs > Collection", inventaireId: "1",
    feuilleDependante: false, demandes, contexte: { titre: "Figurine Star Wars" }, l0: {}, photos: [], apiKey: "k", supabaseUrl: "https://x.supabase.co" });
  ok("« actif » : la réponse contrôlée est POSÉE", r.poses.Produit === "Figurines", JSON.stringify(r.poses));
  const c = corpsEnvoyes.at(-1) ?? {};
  ok("L1 = Haiku 5.5, réflexion coupée, effort bas, sans température", c.model === "claude-haiku-5-5" && (c.thinking as { type?: string })?.type === "disabled"
    && (c.output_config as { effort?: string })?.effort === "low" && !("temperature" in c));
  ok("la ligne ia_levier dit levier, état, clé, valeur, coût", logs.length === 1 && (logs[0].metadata as Record<string, unknown>).levier === "L1"
    && (logs[0].metadata as Record<string, unknown>).cle === "leisure_collection_product" && (logs[0].metadata as Record<string, unknown>).posee === true
    && Number((logs[0].metadata as Record<string, unknown>).cost_usd) === coutUsd("claude-haiku-5-5", 1000, 50));
}
{
  logs.length = 0;
  const demandes = [{ name: "Support", mode: "SELECTION_ONLY", allowedValues: ["DVD", "Cassettes vidéo"], key: "dvd_movies_format", cible: null }];
  const r = await appliquerLeviers({ admin: fausseBase([...B]), userId: "u", plateforme: "leboncoin", categorie: "Loisirs > DVD - Films", inventaireId: "2",
    feuilleDependante: false, demandes, contexte: { titre: "Rudy VHS" }, l0: {}, photos: [], apiKey: "k", supabaseUrl: "https://x.supabase.co" });
  ok("« fantome » : rien n'est posé (la question part comme avant)", Object.keys(r.poses).length === 0);
  ok("« fantome » : la réponse est NOTÉE", logs.length === 1 && (logs[0].metadata as Record<string, unknown>).etat === "fantome" && (logs[0].metadata as Record<string, unknown>).posee === false);
}
{
  // Le compteur est gardé 60 s en mémoire (budget-ia.ts) : la règle se vérifie pure,
  // et le câblage dans la source (le plafond est lu AVANT tout appel).
  const { budgetOuvert } = await import("../supabase/functions/_shared/budget-ia.ts");
  ok("plafond « moteur » du jour atteint (7 $ > 6 $) : fermé", budgetOuvert("moteur", { anthropic_jour: 7, anthropic_mois: 50 }).ouvert === false
    && budgetOuvert("moteur", null).ouvert === false);
  const src = await Deno.readTextFile(new URL("../supabase/functions/_shared/ia-leviers-bascule.ts", import.meta.url));
  ok("la cascade lit le plafond « moteur » avant tout appel, et s'arrête s'il est fermé",
    /const budget = await budgetIaAutorise\(admin, "moteur", "generate-listing:ia_levier"\);\s*if \(!budget\.ouvert\) return \{ poses, notes: 0 \};/.test(src)
    && src.indexOf('budgetIaAutorise(admin, "moteur"') < src.indexOf("passerLevier(levier"));
}
{
  const n = corpsEnvoyes.length;
  const r = await appliquerLeviers({ admin: fausseBase([...B]), userId: "u", plateforme: "leboncoin", categorie: "c", inventaireId: "4",
    feuilleDependante: false, demandes: [{ name: "Produit", mode: "SELECTION_ONLY", allowedValues: ["Figurines"] }], contexte: { titre: "x" },
    l0: { Produit: "Cartes" }, photos: [], apiKey: "k", supabaseUrl: "https://x.supabase.co" });
  ok("l'existant a répondu : aucun appel du tout", corpsEnvoyes.length === n && Object.keys(r.poses).length === 0);
}
{
  logs.length = 0;
  const demandes = [{ name: "Âge", mode: "SELECTION_ONLY", allowedValues: ["3 ans - 4 ans", "5 ans - 6 ans"], key: "Âge", cible: "age" }];
  const r = await appliquerLeviers({ admin: fausseBase([...B]), userId: "u", plateforme: "beebs", categorie: "Jeux, jouets et loisirs > Jeux de société", inventaireId: "5",
    feuilleDependante: false, demandes, contexte: { titre: "Jeu de société" }, l0: {}, photos: [], apiKey: "k", supabaseUrl: "https://x.supabase.co" });
  ok("L4 sans photo lisible : la lecture des photos est sautée, le texte répond", r.poses["Âge"] === "3 ans - 4 ans" && optionsDuLevier("L4").modele === "claude-haiku-5-5");
}
globalThis.fetch = vraiFetch;
console.log(echecs ? `\n✗ ${echecs} échec(s)` : "\n✓ cascade des leviers IA — tout est vert");
Deno.exit(echecs ? 1 : 0);
