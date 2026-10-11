// ═══════════════════════════════════════════════════════════════════════════
// LA COULEUR D'UN ARTICLE, LUE SUR SA PHOTO (11/10/2026 — point 9, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « La couleur ne fait pas vendre, les gens la voient sur la photo. » Le mode
// `resolve_couleur` de generate-listing : appelé par le moteur de publication
// (src/publication/moteur/couleurAuto.js, stepper et lot) quand une plateforme
// exige une couleur que ni la copie, ni la fiche, ni Lens, ni la passe texte
// n'ont donnée. UNE entrée de la liste fournie, contrôlée ici ; hors liste =
// refus (null) — l'app pose alors « Multicolore », jamais une question.
//   · modèle : Haiku 4.5 (même identifiant que les autres micro-appels) ;
//   · 1 à 2 photos : celles de NOTRE Storage préparées comme lens-analysis
//     (preparerPhotos : mesure de l'en-tête, réduction au-delà de 6 000 px) ;
//     celles d'un CDN de plateforme (images1.vinted.net, articles importés)
//     téléchargées ici et envoyées en base64 — l'API ne va pas les chercher
//     elle-même de façon fiable ;
//   · délai borné (l'app abandonne à 6 s) ; une photo qui résiste est écartée.
// Ne touche ni resoudreAspectsIA ni completerAspectsIA (_shared/ebay-aspects-ia.ts).
// Coût (Haiku 4.5, 1 $ / 5 $ par MTok) : une image ≈ (l × h) / 750 tokens,
// plafonnée vers 1 600 (côté ramené à 1 568 px) → 2 photos + texte ≈ 3 500 à
// 4 000 tokens d'entrée, ~25 en sortie ≈ 0,004 $ par appel (0,002 $ avec une
// photo). Mesuré par usage_logs « couleur_auto » (tokens, cost_usd).
import { preparerPhotos } from "../lens-analysis/images.ts";
import { estChezNous } from "./photos-rapatriement.ts";
import { valeurDeListeCorrespondante } from "./texte-comparable.ts";

export const MODELE_COULEUR = "claude-haiku-4-5-20251001";
// L'app abandonne à 6 s (DELAI_COULEUR_IA_MS) : photos 1,8 s + IA 4 s tiennent dedans.
const DELAI_PHOTO_MS = 1800;
const DELAI_IA_MS = 4000;
const OCTETS_MAX = 3_500_000;
const TYPES_IMAGE = ["image/jpeg", "image/png", "image/webp", "image/gif"];
const LISTE_MAX = 60;

export type SourceImage =
  | { type: "url"; url: string }
  | { type: "base64"; media_type: string; data: string };

/** La liste reçue, propre : chaînes non vides, sans doublon, 60 au plus. */
export function listeCouleurPropre(liste: unknown): string[] {
  if (!Array.isArray(liste)) return [];
  const vus = new Set<string>();
  const out: string[] = [];
  for (const v of liste) {
    const s = typeof v === "string" ? v.trim() : "";
    if (!s || s.length > 60 || vus.has(s.toLowerCase())) continue;
    vus.add(s.toLowerCase());
    out.push(s);
    if (out.length >= LISTE_MAX) break;
  }
  return out;
}

function versBase64(octets: Uint8Array): string {
  let brut = "";
  const pas = 0x8000;
  for (let i = 0; i < octets.length; i += pas) brut += String.fromCharCode(...octets.subarray(i, i + pas));
  return btoa(brut);
}

// Les SEULS hôtes d'où une photo est téléchargée côté serveur : les CDN des
// plateformes relevés dans l'inventaire (11/10 : images1.vinted.net,
// i.ebayimg.com, img.leboncoin.fr, cdn.beebs.app, media-photos.depop.com,
// d2f61lx5s6m7uh.cloudfront.net). Une URL envoyée par le client ne fait
// jamais sortir la fonction vers n'importe quelle adresse.
const HOTES_PHOTOS = [/(^|\.)vinted\.net$/i, /(^|\.)ebayimg\.com$/i, /^img\.leboncoin\.fr$/i,
  /^cdn\.beebs\.app$/i, /(^|\.)depop\.com$/i, /^d2f61lx5s6m7uh\.cloudfront\.net$/i];
export function hotePhotoAutorise(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === "https:" && HOTES_PHOTOS.some((re) => re.test(u.hostname));
  } catch { return false; }
}

/** Une photo hors de notre Storage, téléchargée et passée en base64 (bornée). */
async function enBase64(url: string): Promise<SourceImage | null> {
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), DELAI_PHOTO_MS);
  try {
    const r = await fetch(url, { signal: ctl.signal });
    if (!r.ok) { await r.body?.cancel().catch(() => {}); return null; }
    const type = (r.headers.get("content-type") ?? "").split(";")[0].trim().toLowerCase();
    if (!TYPES_IMAGE.includes(type)) { await r.body?.cancel().catch(() => {}); return null; }
    const octets = new Uint8Array(await r.arrayBuffer());
    if (!octets.length || octets.length > OCTETS_MAX) return null;
    return { type: "base64", media_type: type, data: versBase64(octets) };
  } catch {
    return null;
  } finally {
    clearTimeout(minuteur);
  }
}

/**
 * Les 1 à 2 photos envoyées à l'IA. Ne lève jamais : une photo qui résiste
 * est comptée dans `ecartees` et le reste continue.
 */
export async function photosPourCouleurIA(urls: unknown, supabaseUrl: string): Promise<{ sources: SourceImage[]; ecartees: number }> {
  const propres = (Array.isArray(urls) ? urls : [])
    .map((u) => (typeof u === "string" ? u.trim() : ""))
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 2);
  const une = async (url: string): Promise<SourceImage | null> => {
    if (!estChezNous(url)) return hotePhotoAutorise(url) ? await enBase64(url) : null;
    const borne = new Promise<null>((r) => setTimeout(() => r(null), DELAI_PHOTO_MS));
    const prep = (async () => {
      try { return (await preparerPhotos([url], supabaseUrl))[0]?.source ?? null; } catch { return null; }
    })();
    return (await Promise.race([prep, borne])) as SourceImage | null;
  };
  const res = await Promise.all(propres.map(une));
  const sources = res.filter((s): s is SourceImage => Boolean(s));
  return { sources, ecartees: propres.length - sources.length };
}

/** La réponse du modèle, CONTRÔLÉE : une entrée de la liste, sinon refus. */
export function controlerReponseCouleur(texte: string, liste: string[]):
  { couleur: string; source: "photo" | "texte" } | { couleur: null; motif: string; brut: string | null } {
  const m = String(texte ?? "").match(/\{[\s\S]*\}/);
  if (!m) return { couleur: null, motif: "illisible", brut: String(texte ?? "").slice(0, 60) || null };
  let parsed: Record<string, unknown> = {};
  try { parsed = JSON.parse(m[0]); } catch { return { couleur: null, motif: "illisible", brut: m[0].slice(0, 60) }; }
  const brut = typeof parsed.couleur === "string" ? parsed.couleur.trim() : "";
  if (!brut || brut.toLowerCase() === "null") return { couleur: null, motif: "vide", brut: null };
  const entree = valeurDeListeCorrespondante(brut, liste);
  if (!entree) return { couleur: null, motif: "hors_liste", brut: brut.slice(0, 60) };
  return { couleur: entree, source: parsed.source === "texte" ? "texte" : "photo" };
}

export type ResultatCouleur = {
  couleur: string | null;
  source: "photo" | "texte" | null;
  motif?: string;
  brut?: string | null;
};

/**
 * UN appel : les photos (déjà préparées), le titre, la description, la liste.
 * `onUsage` reçoit la réponse brute (comptage des tokens, comme trackClaude).
 */
export async function resoudreCouleurIA(
  { liste, images, titre = "", description = "", type = "" }:
    { liste: string[]; images: SourceImage[]; titre?: string; description?: string | null; type?: string | null },
  { apiKey, onUsage, delaiMs = DELAI_IA_MS }: { apiKey: string; onUsage?: (data: unknown) => void; delaiMs?: number },
): Promise<ResultatCouleur> {
  if (!liste.length) return { couleur: null, source: null, motif: "liste_vide" };
  if (!images.length) return { couleur: null, source: null, motif: "sans_photo" };
  if (!apiKey) return { couleur: null, source: null, motif: "sans_cle" };
  const contexte = [
    titre && `Titre : ${String(titre).slice(0, 200)}`,
    type && `Type : ${String(type).slice(0, 80)}`,
    description && `Description : ${String(description).slice(0, 600)}`,
  ].filter(Boolean).join("\n");
  const ctl = new AbortController();
  const minuteur = setTimeout(() => ctl.abort(), delaiMs);
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        model: MODELE_COULEUR,
        max_tokens: 60,
        temperature: 0,
        system:
          `Tu choisis LA couleur d'un article d'occasion mis en vente, pour le champ « Couleur » de son annonce. ` +
          `Regarde l'ARTICLE sur la photo — pas le fond, pas le support, pas l'emballage. Si le titre ou la description ` +
          `nomme clairement la couleur de l'article, elle prime. Réponds par UNE SEULE entrée de la liste fournie, ` +
          `recopiée caractère pour caractère, jamais une valeur hors liste. Article de plusieurs couleurs sans dominante ` +
          `nette : l'entrée « Multicolore » (ou son équivalent) si la liste en a une. ` +
          `Réponds UNIQUEMENT en JSON : {"couleur":"<entrée de la liste>","source":"photo"|"texte"} — "texte" si la ` +
          `couleur est écrite dans le titre ou la description, sinon "photo".`,
        messages: [{
          role: "user",
          content: [
            ...images.map((source) => ({ type: "image", source })),
            { type: "text", text: `Couleurs possibles : ${liste.join(" | ")}${contexte ? `\n\n${contexte}` : ""}` },
          ],
        }],
      }),
    });
    if (!res.ok) {
      const corps = await res.text().catch(() => "");
      console.error(`[couleur-ia] HTTP ${res.status} : ${corps.slice(0, 200)}`);
      return { couleur: null, source: null, motif: `http_${res.status}` };
    }
    const data = await res.json();
    onUsage?.(data);
    const texte: string = Array.isArray(data?.content)
      ? data.content.filter((b: { type?: string }) => b?.type === "text").map((b: { text?: string }) => b.text ?? "").join("")
      : "";
    const r = controlerReponseCouleur(texte, liste);
    if ("motif" in r) return { couleur: null, source: null, motif: r.motif, brut: r.brut };
    return { couleur: r.couleur, source: r.source };
  } catch (e) {
    const delai = (e as Error)?.name === "AbortError";
    if (!delai) console.error("[couleur-ia] exception :", (e as Error)?.message ?? e);
    return { couleur: null, source: null, motif: delai ? "delai" : "erreur" };
  } finally {
    clearTimeout(minuteur);
  }
}
