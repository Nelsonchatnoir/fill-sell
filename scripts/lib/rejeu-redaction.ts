// ═══════════════════════════════════════════════════════════════════════════
// REJOUER LA RÉDACTION SANS APPEL IA (13/11, lot « zéro problème », point 5a) — pour les verrous de la rédaction
// ═══════════════════════════════════════════════════════════════════════════
// Le VRAI module (supabase/functions/_shared/redaction-plateformes.ts, redigerAnnoncesPlateformes) tourne en entier ;
// seul l'appel au modèle est remplacé : `fetch` rend, plateforme par plateforme, une sortie donnée (les propositions
// réellement stockées dans fiches_annonce, scripts/fixtures/redaction-de63ca45/). Le prompt système envoyé est relevé.
// FILLSELL_RACINE=<dossier> : le code mis à l'épreuve est celui de ce dossier (pour la mesure « rouge avant »).
//   deno run --allow-read --allow-env scripts/<verrou>.ts

export function racineDuCode(): URL {
  const r = Deno.env.get("FILLSELL_RACINE");
  return r ? new URL(`file:///${r.replace(/\\/g, "/").replace(/^\/+/, "").replace(/\/?$/, "/")}`) : new URL("../../", import.meta.url);
}

export async function importer(chemin: string): Promise<Record<string, unknown>> {
  return await import(new URL(chemin, racineDuCode()).href);
}

export async function lireFixture(): Promise<{ consignes: Record<string, string>; fiches: Array<Record<string, unknown>> }> {
  return JSON.parse(await Deno.readTextFile(new URL("../fixtures/redaction-de63ca45/sept-fiches.json", import.meta.url)));
}

type Sortie = { title: string; description: string; platform_fields: Record<string, unknown> };

/** Rejoue redigerAnnoncesPlateformes : `sorties[plateforme]` est ce que « le modèle » répond pour elle. */
export async function rejouer(R: Record<string, unknown>, { platforms, sorties, item, canonicalProvided = {}, consignes = null, note = null }: {
  platforms: string[]; sorties: Record<string, Sortie>; item: Record<string, unknown>; canonicalProvided?: Record<string, string>;
  consignes?: Record<string, unknown> | null; note?: string | null;
}): Promise<{ platformListings: Record<string, Sortie>; traceEtat: Record<string, unknown>; systemes: Record<string, string>; itemContext: string }> {
  const construire = R.construireContexteArticle as (a: unknown) => { itemContext: string };
  const rediger = R.redigerAnnoncesPlateformes as (a: unknown) => Promise<{ platformListings: Record<string, Sortie>; traceEtat: Record<string, unknown> }>;
  const { itemContext } = construire({ item, canonicalProvided, familleLivresMedias: false, noteVendeur: note });
  const systemes: Record<string, string> = {};
  const ordre = [...platforms];
  let i = 0;
  const avant = globalThis.fetch;
  globalThis.fetch = (async (_url: unknown, init?: { body?: string }) => {
    const p = ordre[i++];
    const corps = JSON.parse(String(init?.body ?? "{}"));
    systemes[p] = String(corps.system ?? "");
    const s = sorties[p] ?? { title: "", description: "", platform_fields: {} };
    return new Response(JSON.stringify({ content: [{ text: JSON.stringify(s) }], usage: { input_tokens: 1, output_tokens: 1 } }), { status: 200 });
  }) as typeof fetch;
  try {
    const log = console.log, warn = console.warn;
    console.log = () => {}; console.warn = () => {};
    try {
      const r = await rediger({
        apiKey: "essai", platforms, itemContext, item, canonicalProvided, trackClaude: () => {},
        descriptionFournie: null, titreFourni: null, langues: null, consignes,
      });
      return { ...r, systemes, itemContext };
    } finally { console.log = log; console.warn = warn; }
  } finally {
    globalThis.fetch = avant;
  }
}

/** Une fiche de la fixture, prête pour rejouer (item, note, sorties stockées). */
export function ficheDeRejeu(f: Record<string, unknown>) {
  const props = f.propositions as Record<string, Sortie>;
  return {
    item: { titre: f.titre, marque: f.marque, type: f.type, description: f.lecture_photos },
    note: String(f.note ?? "") || null,
    canonicalProvided: f.etat_estime ? { etat: String(f.etat_estime) } : {},
    sorties: props,
  };
}

export function compteur() {
  let ko = 0, n = 0;
  const ok = (c: unknown, m: string, d?: unknown) => {
    n++;
    if (c) console.log(`  ✓ ${m}`);
    else { ko++; console.log(`  ✗ ${m}${d === undefined ? "" : `\n      ← ${JSON.stringify(d).slice(0, 500)}`}`); }
  };
  const fin = () => { console.log(`\n${n - ko}/${n} verts${ko ? `, ${ko} rouge(s)` : ""}`); if (ko) Deno.exit(1); };
  return { ok, fin };
}
