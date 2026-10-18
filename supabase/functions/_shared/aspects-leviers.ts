// ═══════════════════════════════════════════════════════════════════════════
// LES LEVIERS IA DU CHANTIER « ZÉRO FRICTION » (18/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Ce qu'on essaie, du moins cher au plus cher, AVANT de poser une question à la
// personne sur un champ obligatoire à liste (Leboncoin Univers/Produit, Beebs
// Âge, aspects eBay…). Chaque levier est mesuré sur le banc
// (scripts/bancs/zero-friction/banc-ia.mjs, vérité = la valeur choisie par le
// vendeur sur une annonce acceptée) et branché CHAMP PAR CHAMP par la bascule
// (table ia_leviers_bascule) : un champ en recul reste sur l'ancien chemin.
//   L0  existant : Haiku 4.5, texte seul, liste fermée bornée à 120 ;
//   L1  texte    : Haiku 5.5, texte seul, liste entière (200) ;
//   L2  photo    : L1 + 1 à 2 photos de l'article (au moment de publier) ;
//   L3  relecture: Sonnet 5.5, texte + photos — seulement si L2 n'a pas tranché ;
//   L4  Lens étoffé : une lecture des photos (objet, mentions écrites) versée au
//       contexte, puis L1.
// Contrôles IDENTIQUES à l'existant (resoudreAspectsIA) : une entrée de la
// liste recopiée, une mesure lue dans le texte, sinon rien.
import { resoudreAspectsIA, completerAspectsIA, corpsModele, type AspectDemande, type ContexteArticle, type ResultatAspectsIA } from "./ebay-aspects-ia.ts";

export const MODELE_HAIKU_55 = "claude-haiku-5-5";
export const MODELE_SONNET_55 = "claude-sonnet-5-5";
export const MODELE_HAIKU_45 = "claude-haiku-4-5-20251001";

// Prix publics (USD / million de jetons, entrée / sortie) — skill claude-api,
// relu le 18/10/2026. Haiku 5.5 : invites ≤ 100 K jetons.
const PRIX: Record<string, [number, number]> = {
  [MODELE_HAIKU_45]: [1, 5], "claude-haiku-4-5": [1, 5],
  [MODELE_HAIKU_55]: [0.1, 0.5],
  [MODELE_SONNET_55]: [2, 10],
};
export function coutUsd(modele: string, entree: number, sortie: number): number {
  const [pe, ps] = PRIX[modele] ?? PRIX[MODELE_HAIKU_45];
  return Number(((entree / 1e6) * pe + (sortie / 1e6) * ps).toFixed(6));
}

export type Levier = "L0" | "L1" | "L2" | "L3" | "L4";
export const LEVIERS: Levier[] = ["L0", "L1", "L2", "L3", "L4"];
export function optionsDuLevier(l: Levier): { modele: string; listeFermeeMax?: number; photos: boolean } {
  if (l === "L1" || l === "L4") return { modele: MODELE_HAIKU_55, listeFermeeMax: 200, photos: false };
  if (l === "L2") return { modele: MODELE_HAIKU_55, listeFermeeMax: 200, photos: true };
  if (l === "L3") return { modele: MODELE_SONNET_55, listeFermeeMax: 200, photos: true };
  return { modele: MODELE_HAIKU_45, photos: false };
}

export type Mesure = { appels: number; entree: number; sortie: number; cout_usd: number; ms: number };

// deno-lint-ignore no-explicit-any
type Image = any;

/**
 * L4 — la lecture des photos (« Lens étoffé ») : ce que l'on VOIT de l'objet et
 * ce qui est ÉCRIT dessus, sans liste et sans deviner. Rend un objet
 * d'attributs à verser au contexte (`attributs`), ou null.
 */
export async function lireAttributsPhoto(
  images: Image[], titre: string,
  opts: { apiKey: string; onUsage?: (data: unknown) => void; fetchFn?: typeof fetch },
): Promise<Record<string, unknown> | null> {
  if (!images.length || !opts.apiKey) return null;
  const f = opts.fetchFn ?? fetch;
  try {
    const res = await f("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELE_HAIKU_55, max_tokens: 300, ...corpsModele(MODELE_HAIKU_55),
        system: `Tu regardes les photos d'un article d'occasion mis en vente. Dis ce que tu VOIS, jamais ce que tu supposes. ` +
          `Réponds UNIQUEMENT en JSON : {"objet":"<l'objet en 2 à 8 mots>","usage":"<à quoi il sert, 2 à 6 mots, ou null>",` +
          `"public":"<public visé s'il se voit (bébé, enfant, adulte…) ou null>","mentions":{"<nom>":"<texte LU sur l'objet ou la boîte : âge, PEGI, dimensions, matière, marque…>"}}`,
        messages: [{ role: "user", content: [...images.slice(0, 2).map((source: Image) => ({ type: "image", source })),
          { type: "text", text: `Titre de l'annonce : ${String(titre ?? "").slice(0, 200)}` }] }],
      }),
    });
    if (!res.ok) return null;
    const data = await res.json();
    opts.onUsage?.(data);
    const blocs = Array.isArray(data?.content) ? data.content : [];
    const texte = String(blocs.find((b: { type?: string }) => b?.type === "text")?.text ?? "");
    const m = texte.match(/\{[\s\S]*\}/);
    if (!m) return null;
    const o = JSON.parse(m[0]);
    return o && typeof o === "object" ? o : null;
  } catch { return null; }
}

/**
 * Un levier sur UNE demande d'article : les mêmes demandes, le même contexte,
 * les mêmes contrôles ; seuls le modèle, la liste et les photos changent.
 */
export async function passerLevier(
  l: Levier, demandes: AspectDemande[], contexte: ContexteArticle, images: Image[],
  // completer : la voie eBay (première passe + seconde passe FREE_TEXT, comme generate-listing en mode eBay).
  opts: { apiKey: string; fetchFn?: typeof fetch; completer?: boolean },
): Promise<ResultatAspectsIA & { mesure: Mesure; lu_photo?: Record<string, unknown> | null }> {
  const o = optionsDuLevier(l);
  const mesure: Mesure = { appels: 0, entree: 0, sortie: 0, cout_usd: 0, ms: 0 };
  const compter = (modele: string) => (data: unknown) => {
    const u = (data as { usage?: { input_tokens?: number; output_tokens?: number } })?.usage ?? {};
    mesure.appels++; mesure.entree += Number(u.input_tokens) || 0; mesure.sortie += Number(u.output_tokens) || 0;
    mesure.cout_usd = Number((mesure.cout_usd + coutUsd(modele, Number(u.input_tokens) || 0, Number(u.output_tokens) || 0)).toFixed(6));
  };
  const debut = Date.now();
  let ctx = contexte;
  let lu: Record<string, unknown> | null = null;
  if (l === "L4") {
    lu = await lireAttributsPhoto(images, String(contexte.titre ?? ""), { apiKey: opts.apiKey, onUsage: compter(MODELE_HAIKU_55), fetchFn: opts.fetchFn });
    if (lu) ctx = { ...contexte, attributs: { ...(contexte.attributs ?? {}), ...lu } };
  }
  const r = await (opts.completer ? completerAspectsIA : resoudreAspectsIA)(demandes, ctx, {
    apiKey: opts.apiKey, onUsage: compter(o.modele), fetchFn: opts.fetchFn,
    modele: o.modele, listeFermeeMax: o.listeFermeeMax, images: o.photos ? images : [],
  });
  mesure.ms = Date.now() - debut;
  return { ...r, mesure, ...(l === "L4" ? { lu_photo: lu } : {}) };
}
