// ═══════════════════════════════════════════════════════════════════════════
// L'ISBN D'UN LIVRE, LU SUR SES PHOTOS (12/10/2026, Morgane)
// ═══════════════════════════════════════════════════════════════════════════
// Un livre importé de Leboncoin n'a ni ISBN dans l'annonce (Leboncoin n'en a
// pas), ni passage par Lens : la rédaction (texte seul) ne pouvait pas le
// trouver — il est pourtant imprimé au dos, sous le code-barres, et la photo
// de la 4e de couverture est souvent dans l'annonce. Ce module est la SEULE
// lecture de l'ISBN sur photo, appelée par :
//   · generate-listing, mode `resolve_isbn` (l'app, stepper et lot, avant de
//     poser la question « ISBN ») ;
//   · handler-watch (un job Vinted en question « ISBN » repart seul quand
//     l'ISBN se lit sur ses photos — le Blake & Mortimer de Morgane).
// Contrôle STRICT : la réponse n'est retenue que si normalizeIsbn
// (_shared/isbn.js) l'accepte — clé de contrôle juste, ISBN-13 en 978/979.
// Un ISBN inventé est pire qu'un ISBN absent : dans le doute, null.
// Haiku 4.5 (1 $ / 5 $ par MTok) : 1 à 4 photos ≈ 2 000 à 6 400 tokens
// d'entrée, ~30 en sortie ≈ 0,002 à 0,007 $ par appel. Mesure : usage_logs
// « isbn_auto » (app) et le journal de handler-watch.
import { normalizeIsbn, resoudreIsbn } from "./isbn.js";
import type { SourceImage } from "./couleur-ia.ts";

export const MODELE_ISBN = "claude-haiku-4-5-20251001";
const DELAI_IA_MS = 6000;

/** La réponse du modèle, CONTRÔLÉE : un ISBN valide (clé juste), sinon refus. */
export function controlerReponseIsbn(texte: string):
  { isbn13: string; trouve: string } | { isbn13: null; motif: string; brut: string | null } {
  const m = String(texte ?? "").match(/\{[\s\S]*\}/);
  if (!m) return { isbn13: null, motif: "illisible", brut: String(texte ?? "").slice(0, 60) || null };
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(m[0]); } catch { return { isbn13: null, motif: "illisible", brut: m[0].slice(0, 60) }; }
  const brut = typeof parsed.isbn === "string" ? parsed.isbn.trim() : "";
  if (!brut || brut.toLowerCase() === "null") return { isbn13: null, motif: "non_lu", brut: null };
  const n = normalizeIsbn(brut);
  if (!n.ok) return { isbn13: null, motif: "invalide", brut: brut.slice(0, 40) };
  if (!/^97[89]/.test(n.isbn13)) return { isbn13: null, motif: "hors_livre", brut: brut.slice(0, 40) };
  return { isbn13: n.isbn13, trouve: brut };
}

export type ResultatIsbn = { isbn13: string | null; source: "titre" | "description" | "photo" | null; trouve?: string; motif?: string; brut?: string | null };

/**
 * L'ISBN d'un livre : d'abord le TEXTE (titre, description — sans IA, même
 * règle que resoudreIsbn), puis les PHOTOS (un appel). Ne lève jamais.
 */
export async function resoudreIsbnArticle(
  { images, titre = "", description = "" }: { images: SourceImage[]; titre?: string; description?: string | null },
  { apiKey, onUsage, delaiMs = DELAI_IA_MS }: { apiKey: string; onUsage?: (data: unknown) => void; delaiMs?: number },
): Promise<ResultatIsbn> {
  const texte = resoudreIsbn({ description, titre });
  if (texte) return { isbn13: texte.isbn13, source: texte.source as "titre" | "description", trouve: texte.trouve };
  if (!images.length) return { isbn13: null, source: null, motif: "sans_photo" };
  if (!apiKey) return { isbn13: null, source: null, motif: "sans_cle" };
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), delaiMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELE_ISBN,
        max_tokens: 60,
        temperature: 0,
        system:
          "Tu lis l'ISBN d'un livre d'occasion sur les photos de son annonce. Il est imprimé au dos (4e de couverture), " +
          "souvent sous le code-barres (les chiffres qui commencent par 978 ou 979), ou sur la page de copyright, précédé de « ISBN ». " +
          "Recopie les chiffres EXACTEMENT, sans en deviner aucun. Si aucun ISBN n'est lisible en entier sur les photos, réponds null. " +
          'Réponds UNIQUEMENT en JSON : {"isbn":"<les chiffres>"} ou {"isbn":null}.',
        messages: [{
          role: "user",
          content: [
            ...images.map((source) => ({ type: "image", source })),
            { type: "text", text: `Livre : ${String(titre ?? "").slice(0, 200)}` },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const corps = await res.text().catch(() => "");
      console.error(`[isbn-ia] HTTP ${res.status} : ${corps.slice(0, 200)}`);
      return { isbn13: null, source: null, motif: `http_${res.status}` };
    }
    const data = await res.json();
    onUsage?.(data);
    const texteIa: string = Array.isArray(data?.content)
      ? data.content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("")
      : "";
    const r = controlerReponseIsbn(texteIa);
    if (!r.isbn13) return { isbn13: null, source: null, motif: (r as { motif: string }).motif, brut: (r as { brut: string | null }).brut };
    return { isbn13: r.isbn13, source: "photo", trouve: (r as { trouve: string }).trouve };
  } catch (e) {
    const delai = (e as Error)?.name === "AbortError";
    if (!delai) console.error("[isbn-ia] exception :", (e as Error)?.message ?? e);
    return { isbn13: null, source: null, motif: delai ? "delai" : "erreur" };
  } finally {
    clearTimeout(minuteur);
  }
}
