// ═══════════════════════════════════════════════════════════════════════════
// L'OBJET NOMMÉ PAR LES PHOTOS QUAND LE TEXTE N'EN NOMME AUCUN (19/11/2026 soir, lot de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas : « TEST FillSell 30/10 — fiche d'essai abandonnée (à supprimer) », « TEST FillSell 28/10 — 0.6.152c rayon par
// identifiant » : le titre ne nomme aucun produit. generate-listing classe l'objet sur le TEXTE seul (classifyCategoryIcon,
// Haiku, titre + description) — il rendait null (67 copies de test en 30 jours, categorie_objet_ia vide) et l'app
// prenait un mot du titre (« 28/10 », lu comme un numéro de carte par src/utils/shared.js, corrigé le même soir).
// (« images: 0 » de usage_logs generate_listing compte les photos RETOUCHÉES, pas les photos lues : la rédaction et la
// classification de generate-listing ont toujours été en texte seul ; la vision est celle de lens-analysis.)
// RÈGLE : quand le texte ne nomme aucun objet (réponse null, ou un mot qui n'est pas un objet : « article de test »,
// « produit »…), UNE question aux photos (deux au plus), même contrat de réponse : le nom commun de l'objet, l'icône
// de la liste fermée. Réponse hors règle (chiffres, phrase, icône hors liste) : rien — le repli de l'app, comme avant.
// Verrou : scripts/aspects-devines-1911-selftest.ts (D).
import { MODELE_ASPECTS_DEFAUT } from "./ebay-aspects-ia.ts";

// Les mots qui ne nomment pas un objet : la question part aux photos.
const PAS_UN_OBJET = /^(articles?|objets?|produits?|tests?|essais?|annonces?|fiches?|article de test|article test|fiche d'essai|fiche de test|lots?|divers|autres?|inconnu|null)$/;

/** Le nom commun rendu par l'IA, s'il en est un (minuscules, 1 à 40 lettres, pas un mot générique) ; sinon null. (pur) */
export function objetValide(brut: unknown): string | null {
  const s = String(brut ?? "").trim().toLowerCase();
  if (!/^[\p{L}][\p{L}\s'’-]{1,39}$/u.test(s)) return null;
  return PAS_UN_OBJET.test(s) ? null : s;
}

// deno-lint-ignore no-explicit-any
type SourceImage = any;

export async function objetParLesPhotos(
  { images, contexte, menuIcones, icones }: { images: SourceImage[]; contexte: string; menuIcones: string; icones: Set<string> },
  opts: { apiKey: string; onUsage?: (data: unknown) => void; fetchFn?: typeof fetch; delaiMs?: number },
): Promise<{ icon: string | null; objet: string | null }> {
  const sources = (Array.isArray(images) ? images : []).slice(0, 2);
  if (!sources.length || !opts.apiKey) return { icon: null, objet: null };
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), opts.delaiMs ?? 20_000);
  try {
    const res = await (opts.fetchFn ?? fetch)("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": opts.apiKey, "anthropic-version": "2023-06-01" },
      signal: ctl.signal,
      body: JSON.stringify({
        model: MODELE_ASPECTS_DEFAUT,
        max_tokens: 60,
        system: `Tu classes un article d'occasion d'après ses PHOTOS : son titre ne nomme pas l'objet. Tu rends DEUX choses.

1) "objet" — LE NOM COMMUN FRANÇAIS de l'objet principal VU sur les photos, au SINGULIER, en minuscules, 1 à 3 mots
   (« veste polaire », « rouleau de ruban adhésif », « boutons de manchette »). Pas de marque, pas de couleur, pas de
   taille. Si les photos ne montrent pas un objet à vendre (une affiche de test, une image de texte, rien de net) : null.

2) "icon" — l'emoji qui représente le mieux ce même objet, STRICTEMENT parmi cette liste (emoji = sens) :
${menuIcones}

Réponds UNIQUEMENT du JSON valide {"objet":"<nom commun ou null>","icon":"<un emoji exact de la liste ou null>"}.`,
        messages: [{ role: "user", content: [
          ...sources.map((source: SourceImage) => ({ type: "image", source })),
          { type: "text", text: `Quel objet, et quel emoji ?\n${String(contexte ?? "").slice(0, 600)}` },
        ] }],
      }),
    });
    if (!res.ok) { console.error("[objet-par-les-photos]", res.status, (await res.text()).slice(0, 200)); return { icon: null, objet: null }; }
    const data = await res.json();
    opts.onUsage?.(data);
    const texte: string = (Array.isArray(data?.content) ? data.content.find((b: { type?: string }) => b?.type === "text")?.text : "") ?? "";
    const icon = texte.match(/"icon"\s*:\s*"([^"]+)"/)?.[1] ?? null;
    const objet = objetValide(texte.match(/"objet"\s*:\s*"([^"]{1,60})"/)?.[1] ?? null);
    return { icon: objet && icon && icones.has(icon) ? icon : null, objet };
  } catch (e) {
    console.error("[objet-par-les-photos] exception :", (e as Error)?.message ?? e);
    return { icon: null, objet: null };
  } finally {
    clearTimeout(minuteur);
  }
}
