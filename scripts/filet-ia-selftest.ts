// Selftest VERROU — le filet de la dépense IA : plus rien n'est bloqué (14/11/2026, lot de Nico, point 1).
//   npm run selftest:filet-ia
// Le 14/11, le plafond « confort » de 9 $/jour (10,18 $ dépensés) a coupé l'identify (429 identify_unavailable dans le
// pré-contrôle eBay, 20:00) et le choix du rayon pour tout le monde jusqu'à minuit ; les plafonds par mois (120, 160,
// 185 $) auraient recoupé vers le 22/11 (77 $ au 14). Règle de Nico : les quotas du palier font la rentabilité ; le
// plafond global n'est qu'un filet de 50 $ par jour contre un bug en boucle, signalé à 80 %, et au-delà la fonction
// continue SANS l'IA, comme quand l'IA est indisponible. Ce test casse si l'une de ces règles revient en arrière.
import { assert, assertEquals } from "https://deno.land/std@0.168.0/testing/asserts.ts";
import * as B from "../supabase/functions/_shared/budget-ia.ts";

let n = 0;
const cas = async (nom: string, f: () => void | Promise<void>) => { await f(); n++; console.log(`  ✓ ${nom}`); };
const lire = (p: string) => Deno.readTextFileSync(new URL(`../${p}`, import.meta.url)).replace(/\r\n/g, "\n");
const NIVEAUX = ["moteur", "confort", "essentiel"] as const;
console.log("filet-ia-selftest");

await cas("le 14/11 rejoué : 10,18 $ dans la journée et 190 $ dans le mois — chaque niveau passe", () => {
  for (const niveau of NIVEAUX) {
    assertEquals(B.budgetOuvert(niveau, { anthropic_jour: 10.18, anthropic_mois: 190 }), { ouvert: true, motif: null }, niveau);
  }
});

await cas("un seul filet : 50 $ par jour pour les trois niveaux, AUCUN plafond par mois", () => {
  assertEquals(B.FILET_JOUR_USD, 50);
  for (const niveau of NIVEAUX) {
    const p = B.PLAFONDS_ANTHROPIC_USD[niveau] as Record<string, unknown>;
    assertEquals(p.jour, 50, niveau);
    assert(!("mois" in p), `${niveau} : plus de plafond par mois`);
    assertEquals(B.budgetOuvert(niveau, { anthropic_jour: 49.99, anthropic_mois: 5000 }).ouvert, true, niveau);
    assertEquals(B.budgetOuvert(niveau, { anthropic_jour: 50, anthropic_mois: 60 }), { ouvert: false, motif: "plafond_jour_50" }, niveau);
  }
  assert(Object.isFrozen(B.PLAFONDS_ANTHROPIC_USD));
});

await cas("compteur illisible : l'essentiel et le confort passent, le moteur reste prudent (comme avant)", () => {
  assertEquals(B.budgetOuvert("essentiel", null).ouvert, true);
  assertEquals(B.budgetOuvert("confort", null).ouvert, true);
  assertEquals(B.budgetOuvert("moteur", null), { ouvert: false, motif: "compteur_illisible" });
});

await cas("le signal : rien sous 40 $, « approche » dès 80 %, « atteint » à 100 %", () => {
  assertEquals(B.signalDuJour({ anthropic_jour: 39.99 }), null);
  assertEquals(B.signalDuJour({ anthropic_jour: 40 })?.feature, "ia_plafond_approche");
  assertEquals(B.signalDuJour({ anthropic_jour: 50 })?.feature, "ia_plafond_atteint");
  assertEquals(B.signalDuJour(null), null);
});

await cas("le signal est écrit dans usage_logs une fois par jour de Paris, jamais deux, et ne lève jamais", async () => {
  const lignes: Array<Record<string, unknown>> = [];
  let lectures = 0;
  // Fausse base : la sélection rend les lignes déjà posées (même feature, même jour) ; l'insertion les range.
  const fausse = (enPanne = false) => ({
    rpc: async () => ({ data: null, error: null }),
    from: (t: string) => {
      assertEquals(t, "usage_logs");
      const filtres: Record<string, unknown> = {};
      const q = {
        select: () => q,
        is: (c: string, v: unknown) => { filtres[c] = v; return q; },
        eq: (c: string, v: unknown) => { filtres[c] = v; return q; },
        gte: () => q,
        limit: async () => {
          lectures++;
          if (enPanne) throw new Error("base en panne");
          return { data: lignes.filter((l) => l.feature === filtres.feature && (l.metadata as Record<string, unknown>).jour === filtres["metadata->>jour"]), error: null };
        },
        insert: async (l: Record<string, unknown>) => { lignes.push(l); return { error: null }; },
      };
      return q;
    },
  });
  const etat = { anthropic_jour: 41.5, openai_jour: 3, jour: "2026-11-14" };
  await B.poserSignalBudget(fausse(), etat, "test");
  await B.poserSignalBudget(fausse(), etat, "test"); // même instance : déjà posé, la base n'est pas relue
  assertEquals(lignes.length, 1);
  assertEquals(lignes[0].user_id, null);
  assertEquals(lignes[0].feature, "ia_plafond_approche");
  const m = lignes[0].metadata as Record<string, unknown>;
  assertEquals([m.jour, m.depense_jour_usd, m.filet_jour_usd, m.pct], ["2026-11-14", 41.5, 50, 83]);
  // Le lendemain, puis le filet atteint : une ligne chacun.
  await B.poserSignalBudget(fausse(), { ...etat, jour: "2026-11-15" }, "test");
  await B.poserSignalBudget(fausse(), { ...etat, anthropic_jour: 50.2 }, "test");
  assertEquals(lignes.map((l) => `${(l.metadata as Record<string, unknown>).jour}:${l.feature}`),
    ["2026-11-14:ia_plafond_approche", "2026-11-15:ia_plafond_approche", "2026-11-14:ia_plafond_atteint"]);
  // Une base en panne ne casse jamais l'appel IA.
  await B.poserSignalBudget(fausse(true), { ...etat, jour: "2026-11-16" }, "test");
  assert(lectures >= 4);
  // Sous 80 % : ni lecture ni écriture.
  const avant = lectures;
  await B.poserSignalBudget(fausse(), { ...etat, anthropic_jour: 12, jour: "2026-11-17" }, "test");
  assertEquals(lectures, avant);
});

await cas("budgetIaAutorise pose le signal en lisant le compteur (le chemin réel des fonctions)", () => {
  const src = lire("supabase/functions/_shared/budget-ia.ts");
  assert(/const etat = await lireBudgetIa\(admin\);\n  await poserSignalBudget\(admin, etat, fonction\);\n  const r = budgetOuvert\(niveau, etat\);/.test(src));
});

await cas("lens-analysis : plus de plafond global en nombre d'appels ; au-delà du filet, la réponse d'une PANNE de l'IA", () => {
  const la = lire("supabase/functions/lens-analysis/index.ts");
  assert(!la.includes("PLAFOND_IDENTIFY_GLOBAL") && !la.includes("appelsIdentifyDuJour"), "le plafond de 3 000 identify par jour est retiré");
  const i = la.indexOf('const budget = await budgetIaAutorise(adminClient, estIdentify ? "confort" : "essentiel", "lens-analysis");');
  assert(i > 0);
  const bloc = la.slice(i, la.indexOf("RÉSERVATION DU SCAN, AVANT TOUT DÉBIT"));
  assert(!bloc.includes("analyse_indisponible"), "plus le 429 « analyse_indisponible » que l'app affichait en code brut");
  assert(/error: "ai_unavailable", retry_after: 30, budget: budget\.motif \}\), \{\n\s*status: 503/.test(bloc), "scan complet : le 503 « ai_unavailable » de la panne Anthropic");
  assert(/error: "identify_unavailable", budget: budget\.motif \}\), \{\n\s*status: 429/.test(bloc), "identify : la réponse que l'app et le worker eBay traitent déjà");
  // La réponse de la panne, déjà dans le fichier (le chemin qu'on imite) :
  assert(la.includes('JSON.stringify({ error: "ai_unavailable", retry_after: 30 }), {\n        status: 503'));
});

await cas("l'app lit le scan coupé comme une panne : « IA indisponible » puis « Créer l'annonce sans analyse »", () => {
  const me = lire("src/components/lens/motifEchec.js");
  assert(me.includes("if (/ai_unavailable|HTTP 50[23]|overloaded/i.test(brut)) return { type: 'indispo', detail: null };"));
  const app = lire("src/App.jsx");
  assert(app.includes("throw new Error(errBody.error||`HTTP ${r.status}`);"), "le code d'erreur du corps devient le message du scan");
  assert(lire("src/tabs/LensTab.jsx").includes("async function handleCreateSansAnalyse(){"));
});

await cas("generate-listing : au-delà du filet, la rédaction part SANS IA — plus jamais de 429 « generation_indisponible »", () => {
  const gl = lire("supabase/functions/generate-listing/index.ts");
  assert(!gl.includes('"generation_indisponible"'), "plus de refus de la rédaction");
  assert(/let iaCoupee: string \| null = null;\n    \{\n      const microAppel = /.test(gl));
  assert(gl.includes('        if (body.resolve_aspects === true) return json({ aspects: {} });\n        iaCoupee = budgetIa.motif ?? "plafond";\n'));
  assert(gl.includes("      if (iaCoupee) return { icon: null, objet: null };"), "pas d'appel de classification");
  assert(gl.includes("      sansIa: iaCoupee !== null,\n      signal: ctlRedaction.signal,\n    }).finally(() => clearTimeout(minuteurRedaction));"), "la rédaction prend le repli");
  // Le chemin d'une panne : aucun appel abouti → l'unité est rendue, le squelette est livré.
  assert(gl.includes('    if (cost.claude_calls === 0) {\n      console.warn("[generate-listing] aucun appel LLM abouti — squelette livré, unité remboursée");\n      await refundGenerateFn?.("no_llm_output");'));
  // Les micro-appels gardent leur réponse « rien », que l'app sait traiter.
  assert(gl.includes('if (body.resolve_couleur === true) return json({ couleur: null, source: null, motif: "ia_indisponible" });'));
});

await cas("redigerAnnoncesPlateformes sansIa : AUCUN appel, chaque plateforme prend le texte de repli", async () => {
  const vraiFetch = globalThis.fetch;
  let appels = 0;
  globalThis.fetch = (async () => { appels++; throw new Error("aucun appel ne doit partir"); }) as typeof fetch;
  try {
    const R = await import("../supabase/functions/_shared/redaction-plateformes.ts");
    const r = await R.redigerAnnoncesPlateformes({
      apiKey: "x", platforms: ["vinted", "leboncoin", "ebay"], itemContext: "Article: Pull rouge",
      item: { titre: "Pull col roulé", marque: "Zara", description: "Pull en maille rouge, très bon état", type: "Mode" },
      canonicalProvided: {}, trackClaude: () => { throw new Error("aucun usage"); }, sansIa: true,
    });
    assertEquals(appels, 0);
    for (const p of ["vinted", "leboncoin", "ebay"]) {
      assert(String(r.platformListings[p]?.title ?? "").includes("Pull col roulé"), `${p} : titre de repli`);
    }
  } finally {
    globalThis.fetch = vraiFetch;
  }
});

await cas("ops-digest : la constante du filet est importée — plus de plafond recopié à la main", () => {
  const od = lire("supabase/functions/ops-digest/index.ts");
  assert(od.includes('import { FILET_JOUR_USD, signalDuJour } from "../_shared/budget-ia.ts";'));
  assert(!od.includes("PLAFOND_IDENTIFY_GLOBAL"));
  assert(od.includes('await supabase.rpc("ia_depense_etat")'));
});

await cas("les quotas des paliers et le garde-fou eBay « catégorie à confirmer » ne sont pas touchés par ce filet", () => {
  const gl = lire("supabase/functions/generate-listing/index.ts");
  assert(gl.includes('.select("key, value").in("key", [`quota_retouche_${tierRetouche}`, "quotas_retouche_depuis"]);'));
  assert(gl.includes('return json({ error: "quota_annonces_atteint", plafond: spend.plafond, consommes: spend.consommes }, 402);'));
  assert(!/from\("coin_config"\)|rpc\("quotas_etat"|quota_annonces|quota_retouche/.test(lire("supabase/functions/_shared/budget-ia.ts")), "le filet ne lit aucun quota");
});

console.log(`filet-ia-selftest : ${n} cas verts`);
