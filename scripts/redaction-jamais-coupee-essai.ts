// L'ESSAI (Deno) du verrou « une rédaction n'est jamais coupée » (12/11/2026, point 8 de Nico) — lancé par
// scripts/redaction-jamais-coupee-selftest.mjs. Le VRAI module de rédaction (_shared/redaction-plateformes.ts), un
// fournisseur IA qui ne répond jamais (fetch simulé, aucun réseau) : à l'échéance, chaque plateforme prend son texte de
// repli et la rédaction rend la main. Sortie : une ligne JSON.
const { redigerAnnoncesPlateformes } = await import("../supabase/functions/_shared/redaction-plateformes.ts");

let appels = 0;
// deno-lint-ignore no-explicit-any
(globalThis as any).fetch = (_url: string, init?: { signal?: AbortSignal }) => {
  appels++;
  return new Promise((_ok, rejeter) => {
    const s = init?.signal;
    if (s) s.addEventListener("abort", () => rejeter(new DOMException("aborted", "AbortError")), { once: true });
  });
};

const ctl = new AbortController();
setTimeout(() => ctl.abort(), 80);
const t0 = Date.now();
const garde = new Promise((r) => setTimeout(() => r("PENDU"), 3_000));
const r = await Promise.race([
  redigerAnnoncesPlateformes({
    apiKey: "essai", platforms: ["vinted", "leboncoin"], itemContext: "Article: Pull en laine", canonicalProvided: {},
    item: { titre: "Pull en laine", marque: "Essai", description: "Pull porté deux fois." }, trackClaude: () => {},
    signal: ctl.signal,
  } as Parameters<typeof redigerAnnoncesPlateformes>[0]),
  garde,
]);
const ms = Date.now() - t0;
// deno-lint-ignore no-explicit-any
const pl = r === "PENDU" ? null : (r as any).platformListings;
console.log(JSON.stringify({
  pendu: r === "PENDU", ms, appels,
  titres: pl ? Object.fromEntries(Object.entries(pl).map(([k, v]) => [k, (v as { title: string }).title])) : null,
  descriptions: pl ? Object.values(pl).map((v) => (v as { description: string }).description) : null,
}));
Deno.exit(0);
