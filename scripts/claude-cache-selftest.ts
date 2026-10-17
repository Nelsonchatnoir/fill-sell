// ═══════════════════════════════════════════════════════════════════════════
// selftest:claude-cache — point 5 de la nuit du 18/10 (Anthropic et base simulés)
// ═══════════════════════════════════════════════════════════════════════════
//   1. l'empreinte : stable (ordre des clés), sensible à tout ce qui part (modèle,
//      consigne, message, réglages) — l'article change → nouvelle question ;
//   2. interrupteur ÉTEINT : chaque question part à l'IA, rien n'est rangé ;
//      ALLUMÉ : la 1re part et se range, la 2e est relue (0 appel, même texte) ;
//      une erreur HTTP n'est jamais rangée ; une ligne de plus de 30 j n'est pas relue ;
//   3. le chemin regroupé (éteint en service) garde les contrôles de l'ancien :
//      SELECTION_ONLY hors liste refusé, mesure inventée refusée, mot non lu refusé ;
//   4. le branchement : resolve-categorie et generate-listing passent par le cache
//      derrière LEUR interrupteur ; le regroupement derrière ia_aspects_groupes.
//   deno run --allow-read scripts/claude-cache-selftest.ts
import { empreinteQuestion, questionClaude, jsonStable } from "../supabase/functions/_shared/claude-cache.ts";
import { completerAspectsIAGroupe } from "../supabase/functions/_shared/ebay-aspects-ia.ts";

let echecs = 0, total = 0;
const ok = (c: boolean, l: string) => { total++; if (!c) echecs++; console.log(`${c ? "✓" : "✗"} ${l}`); };

// Base simulée : coin_config + ia_questions_cache.
function fausseBase(interrupteurs: Record<string, number>) {
  const cache = new Map<string, { reponse: string; cree_le: string; usages: number }>();
  const admin = {
    cache,
    from(table: string) {
      const filtres: Record<string, unknown> = {};
      let depuis: string | null = null;
      const q = {
        select() { return q; },
        eq(c: string, v: unknown) { filtres[c] = v; return q; },
        gte(_c: string, v: string) { depuis = v; return q; },
        maybeSingle() {
          if (table === "coin_config") return Promise.resolve({ data: { value: interrupteurs[String(filtres.key)] ?? 0 }, error: null });
          const l = cache.get(String(filtres.cle));
          if (!l || (depuis && l.cree_le < depuis)) return Promise.resolve({ data: null, error: null });
          return Promise.resolve({ data: { reponse: l.reponse, usages: l.usages }, error: null });
        },
        update(patch: { usages: number }) { return { eq: (_c: string, v: string) => { const l = cache.get(v); if (l) l.usages = patch.usages; return Promise.resolve({ error: null }); } }; },
        upsert(row: { cle: string; reponse: string; cree_le: string }) { cache.set(row.cle, { reponse: row.reponse, cree_le: row.cree_le, usages: 0 }); return Promise.resolve({ error: null }); },
      };
      return q;
    },
  };
  return admin;
}
function fauxAnthropic(texte: string | ((n: number) => string), statut = 200) {
  const f = { appels: 0, fn: (async () => {
    f.appels++;
    const t = typeof texte === "function" ? texte(f.appels) : texte;
    return new Response(statut === 200 ? JSON.stringify({ content: [{ text: t }], usage: { input_tokens: 100, output_tokens: 10 } }) : "panne", { status: statut });
  }) as unknown as typeof fetch };
  return f;
}
const Q = { model: "claude-haiku-4-5-20251001", max_tokens: 120, temperature: 0, system: "S", messages: [{ role: "user", content: "ARTICLE\nRobe longue" }] };

console.log("1. L'empreinte");
{
  const a = await empreinteQuestion(Q);
  const b = await empreinteQuestion({ messages: Q.messages, system: "S", temperature: 0, max_tokens: 120, model: Q.model });
  ok(a === b && /^[0-9a-f]{64}$/.test(a), "stable : l'ordre des clés ne change pas l'empreinte (sha256)");
  const diff = await Promise.all([
    empreinteQuestion({ ...Q, messages: [{ role: "user", content: "ARTICLE\nRobe courte" }] }),
    empreinteQuestion({ ...Q, system: "S2" }), empreinteQuestion({ ...Q, model: "autre" }), empreinteQuestion({ ...Q, max_tokens: 150 }),
  ]);
  ok(diff.every((d) => d !== a), "l'article, la consigne, le modèle ou un réglage changent : nouvelle empreinte");
  ok(jsonStable({ b: 1, a: [2, { d: 1, c: 2 }] }) === '{"a":[2,{"c":2,"d":1}],"b":1}', "JSON stable");
}

console.log("2. L'interrupteur et la relecture");
{
  const admin = fausseBase({ t_eteint: 0 });
  const ia = fauxAnthropic('{"vinted":"v0"}');
  await questionClaude(Q, { apiKey: "k", admin, fonction: "resolve_categorie", interrupteur: "t_eteint", fetchFn: ia.fn });
  await questionClaude(Q, { apiKey: "k", admin, fonction: "resolve_categorie", interrupteur: "t_eteint", fetchFn: ia.fn });
  ok(ia.appels === 2 && admin.cache.size === 0, "éteint : chaque question part à l'IA, rien n'est rangé (le chemin d'avant)");
}
{
  const admin = fausseBase({ ia_cache_aspects: 1 });
  const ia = fauxAnthropic((n) => `{"aspects":{"Type":"Pull ${n}"}}`);
  const r1 = await questionClaude(Q, { apiKey: "k", admin, fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: ia.fn });
  const r2 = await questionClaude(Q, { apiKey: "k", admin, fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: ia.fn });
  ok(ia.appels === 1 && r2.depuisCache && r2.texte === r1.texte && r2.data === null, "allumé : la 2e question identique est relue (0 appel, même texte, aucun usage compté)");
  const r3 = await questionClaude({ ...Q, messages: [{ role: "user", content: "autre article" }] }, { apiKey: "k", admin, fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: ia.fn });
  ok(ia.appels === 2 && !r3.depuisCache, "un autre article : la question part");
}
{
  const admin = fausseBase({ t_erreur: 1 });
  const ia = fauxAnthropic("x", 529);
  const r = await questionClaude(Q, { apiKey: "k", admin, fonction: "resolve_categorie", interrupteur: "t_erreur", fetchFn: ia.fn });
  ok(!r.ok && admin.cache.size === 0, "une erreur HTTP n'est jamais rangée");
  const ok2 = fauxAnthropic('{"vinted":"v2"}');
  await questionClaude(Q, { apiKey: "k", admin, fonction: "resolve_categorie", interrupteur: "t_erreur", fetchFn: ok2.fn });
  ok(ok2.appels === 1 && admin.cache.size === 1, "(contrôle : ce bloc a bien le cache allumé — après l'erreur, la question repart et la réponse saine est rangée)");
}
{
  const admin = fausseBase({ t_30j: 1 });
  const cle = await empreinteQuestion(Q);
  admin.cache.set(cle, { reponse: "vieille", cree_le: new Date(Date.now() - 31 * 86_400_000).toISOString(), usages: 0 });
  const ia = fauxAnthropic('{"vinted":"v1"}');
  const r = await questionClaude(Q, { apiKey: "k", admin, fonction: "resolve_categorie", interrupteur: "t_30j", fetchFn: ia.fn });
  ok(ia.appels === 1 && r.texte.includes("v1") && admin.cache.get(cle)?.reponse.includes("v1"), "une réponse de plus de 30 jours n'est pas relue : la question repart et la remplace");
}
{
  const admin = fausseBase({ ia_cache_aspects: 0 });
  const ia = fauxAnthropic("{}");
  await questionClaude(Q, { apiKey: "k", admin, fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: ia.fn, forcer: true });
  await questionClaude(Q, { apiKey: "k", admin, fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: ia.fn, forcer: true });
  ok(ia.appels === 1, "« forcer » (banc seulement) passe par le cache même éteint");
  const sansAdmin = fauxAnthropic("{}");
  await questionClaude(Q, { apiKey: "k", fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: sansAdmin.fn, forcer: true });
  await questionClaude(Q, { apiKey: "k", fonction: "aspects_ia", interrupteur: "ia_cache_aspects", fetchFn: sansAdmin.fn, forcer: true });
  ok(sansAdmin.appels === 2, "sans client admin (worker API, banc ancien/nouveau) : jamais de cache");
}

console.log("3. Le chemin regroupé garde les contrôles");
{
  const ia = fauxAnthropic('{"aspects":{"Département":"Unisexe","Hauteur":"80 cm","Style":"Bohème","Type":"Pull polaire","Couleur":"Gris"}}');
  const r = await completerAspectsIAGroupe([
    { name: "Département", mode: "SELECTION_ONLY", allowedValues: ["Femme", "Homme"] },
    { name: "Hauteur", mode: "FREE_TEXT", allowedValues: [] },
    { name: "Style", mode: "FREE_TEXT", allowedValues: ["Polaire", "Col roulé"] },
    { name: "Type", mode: "FREE_TEXT", allowedValues: [] },
    { name: "Couleur", mode: "FREE_TEXT", allowedValues: ["Gris", "Noir"] },
  ], { titre: "Pull polaire 1/4 zip gris", description: "Très bon état" }, { apiKey: "k", fetchFn: ia.fn });
  ok(ia.appels === 1, "UN seul appel pour tous les aspects de l'article");
  ok(!r.aspects["Département"] && r.refuses.some((x) => x.name === "Département" && /fermée/.test(x.motif)), "SELECTION_ONLY hors liste : refusé");
  ok(!r.aspects["Hauteur"] && r.refuses.some((x) => x.name === "Hauteur" && /mesure/.test(x.motif)), "une mesure absente du texte : refusée");
  ok(!r.aspects["Style"] && r.refuses.some((x) => x.name === "Style"), "un mot que le texte ne porte pas (« Bohème ») : refusé");
  ok(r.aspects["Type"] === "Pull polaire" && r.aspects["Couleur"] === "Gris", "un mot lu dans le titre, une entrée de la liste : posés");
}

console.log("4. Le branchement");
const lire = (f: string) => Deno.readTextFileSync(new URL(`../${f}`, import.meta.url)).replace(/\r\n/g, "\n");
const RC = lire("supabase/functions/resolve-categorie/index.ts");
const GL = lire("supabase/functions/generate-listing/index.ts");
const EA = lire("supabase/functions/_shared/ebay-aspects-ia.ts");
ok((RC.match(/interrupteur: "ia_cache_categorie"/g) ?? []).length === 2 && !/fetch\("https:\/\/api\.anthropic\.com/.test(RC), "resolve-categorie : ses deux questions passent par le cache, derrière ia_cache_categorie");
ok(/if \(q\.data\) \{\s*try \{ await loggerAppelIA\(admin, userPourJournal, "resolve_categorie"/.test(RC) && RC.includes('feature: "resolve_categorie_cache"'), "une relecture n'est ni payée ni comptée dans le plafond (ligne resolve_categorie_cache à 0 $)");
ok((EA.match(/interrupteur: "ia_cache_aspects"/g) ?? []).length === 2, "aspects : derrière ia_cache_aspects");
ok(/const groupe = await cacheAllume\(adminClient, "ia_aspects_groupes"\);/.test(GL) && /\? await completerAspectsIAGroupe\(demandes, contexteIa, optsIa\)\s*: await completerAspectsIA\(demandes, contexteIa, optsIa\);/.test(GL), "generate-listing : le regroupement derrière ia_aspects_groupes, l'ancien chemin sinon");

console.log(`\n${total - echecs}/${total} ${echecs ? "ÉCHECS" : "OK"}`);
Deno.exit(echecs ? 1 : 0);
