// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// LA RETOUCHE PHOTO OPENAI — MODÈLE, RÉGLAGES, REPLI, COÛT (14/11/2026, lot de Nico, point 2)
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Source UNIQUE de la retouche : generate-listing (le geste de l'app) et retouche-banc (le banc de comparaison)
// passent par ici — même prompt, mêmes réglages, même calcul de coût. Les textes des prompts sont ceux de
// generate-listing, déplacés à l'octet près (verrou : selftest retouche-modele).
//
// LE MODÈLE (documentation officielle OpenAI relue le 14/11/2026, developers.openai.com/api/docs/deprecations) :
//   · gpt-image-1 est arrêté depuis le 23/10/2026 ; gpt-image-1-mini, gpt-image-1.5 et chatgpt-image-latest
//     s'arrêtent le 01/12/2026 ; gpt-image-2 (le modèle de la retouche jusqu'au 14/11) est annoncé arrêté le
//     10/02/2027 (préavis du 10/11/2026), remplaçants « gpt-image-2.6-sunburst ou gpt-image-2.6-flare ».
//   · Même prix au jeton pour gpt-image-2, 2.5 et 2.6 (sunburst comme flare) : texte 5 $, image en entrée 8 $,
//     image en sortie 30 $ par million de jetons. La différence de coût vient du NOMBRE de jetons consommés.
// LE BANC DU 14/11 (retouche-banc, 10 vraies photos des comptes de Nico et d'Ornella, retouche légère, low, 1024×1024 ;
// docs/enquetes/lot-1411-plafond-ia-retouche/RAPPORT.md) : gpt-image-2, gpt-image-2.5-flare et gpt-image-2.5-sunburst = 0,0171 $
// la photo (mêmes jetons : ~1 300 d'image en entrée, 196 en sortie) ; la famille 2.6 = 0,0360 $ (824 jetons en sortie,
// quel que soit `complexity`). Aucun modèle n'est moins cher à qualité égale : gpt-image-2 RESTE le modèle principal
// (règle de Nico : « si aucun ne fait les deux à la fois, ne bascule pas »).
// LE REPLI : le modèle principal d'abord ; s'il échoue pour une raison de MODÈLE ou de DISPONIBILITÉ (modèle refusé ou
// arrêté, panne, limite de débit — repliPermis), le suivant de la chaîne encore en service : gpt-image-2.5-flare, même
// prix mesuré, plus rapide ; s'ils échouent tous, la photo d'origine part (comme avant : jamais une erreur au client).
// Un refus de contenu (modération) ne passe pas au suivant : il serait refusé pareil. Une requête refusée n'est pas
// facturée par OpenAI : le repli ne coûte jamais plus qu'une retouche.
// Un modèle passé sa date d'arrêt sort SEUL de la chaîne (ARRETS_MODELES) : le 10/02/2027, gpt-image-2.5-flare devient
// le principal sans redéploiement — le successeur définitif reste à décider par Nico avant cette date.
// ⛔ Le modèle et les réglages ne changent ici que sur décision de Nico, chiffres du banc à l'appui.

/** La retouche « légère » (ia_light) : le seul niveau proposé dans l’app depuis le 02/09. */
export const PROMPT_RETOUCHE_LEGERE = `Lightly enhance this product photo: adjust white balance and brightness slightly so the item reads clearly, and correct any obvious color cast. Keep everything else exactly as in the original photo — pose, framing, angle, background, and every detail of the item.

Strict constraints — do NOT change:
- The pose, framing, angle, or camera perspective
- The background
- The item's shape, size, color, pattern, material texture, or any detail (logos, stitching, prints, labels, signs of wear)
- Do not smooth, iron, or flatten anything; do not remove wrinkles, creases, or defects
- Do not add, remove, or invent any element

This is a fast, subtle brightness/white-balance correction only — nothing else should visibly change.`;

/** Les fonds de la retouche « avancée » (ia_advanced). */
export const FONDS_RETOUCHE: Record<string, string> = {
  white: `New background: a premium seamless white studio sweep (cyclorama), bright and clean, with a subtle soft gradient from pure white behind the product to a very light grey toward the edges, professional e-commerce lighting.`,
  grey:  `New background: a polished microcement / smooth concrete surface in soft neutral grey, with subtle natural texture and gentle tonal variation, modern industrial-chic feel, soft directional studio light. Understated and premium, not busy.`,
  beige: `New background: a warm natural linen fabric backdrop with a soft visible woven texture, warmly and evenly lit, refined and tactile.`,
  wood:  `New background: a pale natural light-oak wood surface with clean visible grain (planks / parquet), warm daylight, calm lifestyle feel.`,
};

export const CLAUSE_FOND_OBJET = `Replace ONLY the background of this product photo. The product itself must remain strictly identical to the original: do not redraw, reshape, resize, recolor, clean, repair or beautify it. Preserve exactly its shape, contours, proportions, colors, material and texture, patterns, logos, text, stitching, and every existing defect, stain, scratch, mark or sign of wear. Keep the product in its original position, angle, scale and framing. Add a soft, natural, physically plausible contact shadow beneath the product so it sits believably on the new surface, avoiding any cut-out, floating or pasted look. Do not add any object, prop, text or watermark.`;

export const CLAUSE_FOND_VETEMENT = `Replace the background of this clothing photo and present the garment as prepared for sale. You MAY lightly soften pronounced storage or folding creases (sharp crease lines from being stored folded or crumpled) so the garment looks cared-for and neatly arranged, but always preserve the fabric's natural drape and normal micro-folds: never press it perfectly flat, never make it look ironed or shrink-wrapped. Apart from softening those storage creases, the garment must remain strictly identical to the original: do not reshape, resize, recolor, repair or embellish it; preserve exactly its colors, material and texture, all patterns, prints, logos, text and stitching, and every existing defect, stain, hole or sign of wear. Keep the garment in its original position, angle, scale and framing. Add a soft, natural, physically plausible contact shadow so it sits believably on the new surface, with no cut-out, floating or pasted look. Do not add any object, prop, text or watermark.`;

/** Dates d'arrêt officielles (OpenAI, page deprecations, relue le 14/11/2026), jour de Paris. */
export const ARRETS_MODELES: Readonly<Record<string, string>> = Object.freeze({
  "gpt-image-1": "2026-10-23",
  "gpt-image-1-mini": "2026-12-01",
  "gpt-image-1.5": "2026-12-01",
  "chatgpt-image-latest": "2026-12-01",
  "gpt-image-2": "2027-02-10",
});

/** Tarifs OpenAI par million de jetons (page pricing officielle relue le 14/11/2026, traitement standard). */
export const TARIFS_IMAGE_USD_PAR_MTOK: Readonly<Record<string, { texteEntree: number; imageEntree: number; sortie: number }>> = Object.freeze({
  "gpt-image-2": { texteEntree: 5, imageEntree: 8, sortie: 30 },
  "gpt-image-2.5-sunburst": { texteEntree: 5, imageEntree: 8, sortie: 30 },
  "gpt-image-2.5-flare": { texteEntree: 5, imageEntree: 8, sortie: 30 },
  "gpt-image-2.6-sunburst": { texteEntree: 5, imageEntree: 8, sortie: 30 },
  "gpt-image-2.6-flare": { texteEntree: 5, imageEntree: 8, sortie: 30 },
});

/** La chaîne de la retouche, dans l'ordre : le principal (gpt-image-2, inchangé), puis le repli (même prix mesuré). */
export const CHAINE_RETOUCHE: readonly string[] = Object.freeze(["gpt-image-2", "gpt-image-2.5-flare"]);

/** Réglages par modèle. `complexity` n'existe que sur la famille 2.6 (défaut OpenAI : high) ; aucun modèle de la chaîne
 *  n'en a besoin aujourd'hui (banc du 14/11 : low ou high, la famille 2.6 rend 824 jetons en sortie). */
export const REGLAGES_MODELE: Readonly<Record<string, { complexity?: "low" | "medium" | "high" }>> = Object.freeze({});

/**
 * Le modèle suivant est-il permis après cette erreur ? Oui pour une raison de MODÈLE ou de DISPONIBILITÉ : panne (5xx),
 * limite de débit (429), modèle inconnu, arrêté ou non autorisé (404, 403, 400 qui parle du modèle). Non pour un refus de
 * contenu (modération, sécurité) ni pour une requête mal formée : le modèle suivant refuserait pareil.
 */
export function repliPermis(http: number, corps: string): boolean {
  if (/moderation|safety|content.?policy/i.test(corps)) return false;
  if (http >= 500 || http === 429 || http === 404 || http === 403) return true;
  if (http === 400 || http === 410) return /model|deprecat|shut ?down|not (found|supported|available)|does not exist|retired/i.test(corps);
  return false;
}

/** Le jour de Paris (AAAA-MM-JJ) d'un instant. */
export function jourDeParis(instant: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Paris", year: "numeric", month: "2-digit", day: "2-digit" }).format(instant);
}

/** Les modèles de la chaîne encore en service ce jour-là (un modèle s'arrête le jour de sa date d'arrêt). */
export function modelesEnService(chaine: readonly string[] = CHAINE_RETOUCHE, instant: Date = new Date()): string[] {
  const jour = jourDeParis(instant);
  return chaine.filter((m) => !ARRETS_MODELES[m] || jour < ARRETS_MODELES[m]);
}

export type UsageImage = { texte: number; image: number; sortie: number };

/** Les jetons facturés d'une réponse /images/edits (null si le bloc usage manque). */
export function usageDeLaReponse(data: unknown): UsageImage | null {
  const u = (data as { usage?: { input_tokens?: number; output_tokens?: number; input_tokens_details?: { text_tokens?: number; image_tokens?: number } } })?.usage;
  if (!u) return null;
  const image = u.input_tokens_details?.image_tokens ?? 0;
  // Détail texte/image absent : tout l'entrant part en « texte » (le tarif le plus bas : on sous-estime plutôt que d'inventer).
  const texte = u.input_tokens_details?.text_tokens ?? Math.max(0, (u.input_tokens ?? 0) - image);
  return { texte, image, sortie: u.output_tokens ?? 0 };
}

/** Le coût en dollars d'une image, au tarif de SON modèle (tarif de gpt-image-2 pour un modèle inconnu). */
export function coutImageUsd(modele: string, u: UsageImage): number {
  const t = TARIFS_IMAGE_USD_PAR_MTOK[modele] ?? TARIFS_IMAGE_USD_PAR_MTOK["gpt-image-2"];
  return (u.texte * t.texteEntree + u.image * t.imageEntree + u.sortie * t.sortie) / 1_000_000;
}

export type EssaiRetouche = { modele: string; http: number | null; erreur: string | null; ms: number };
export type ResultatRetouche =
  | { ok: true; b64: string; usage: UsageImage | null; modele: string; essais: EssaiRetouche[] }
  | { ok: false; essais: EssaiRetouche[] };

/**
 * Retouche UNE photo : chaque modèle de la chaîne (encore en service) dans l'ordre, jusqu'au premier qui rend une
 * image ; le suivant n'est essayé qu'après une erreur de modèle ou de disponibilité (repliPermis) ou une coupure
 * réseau. Un abandon (échéance de l'appelant) arrête tout : la photo d'origine part. `surEchec` est appelé pour chaque
 * réponse en erreur (journal des fournisseurs) ; il ne doit jamais lever.
 */
export async function retoucherPhoto(o: {
  cle: string; blob: Blob; prompt: string; qualite: string; taille: string; signal?: AbortSignal;
  chaine?: readonly string[];
  /** Banc seulement : impose (texte) ou retire (null) le réglage complexity ; absent = REGLAGES_MODELE. */
  complexite?: string | null;
  surEchec?: (e: { modele: string; http: number; corps: string }) => Promise<void> | void;
  fetchFn?: typeof fetch;
}): Promise<ResultatRetouche> {
  const f = o.fetchFn ?? fetch;
  const essais: EssaiRetouche[] = [];
  for (const modele of modelesEnService(o.chaine ?? CHAINE_RETOUCHE)) {
    if (o.signal?.aborted) break;
    const debut = Date.now();
    const form = new FormData();
    form.append("model", modele);
    form.append("prompt", o.prompt);
    form.append("n", "1");
    form.append("size", o.taille);
    form.append("quality", o.qualite);
    const complexite = o.complexite !== undefined ? o.complexite : REGLAGES_MODELE[modele]?.complexity;
    if (complexite) form.append("complexity", complexite);
    form.append("image[]", o.blob, "product.jpg");
    try {
      const res = await f("https://api.openai.com/v1/images/edits", {
        method: "POST", headers: { "Authorization": `Bearer ${o.cle}` }, body: form, signal: o.signal,
      });
      if (!res.ok) {
        const corps = await res.text().catch(() => "");
        essais.push({ modele, http: res.status, erreur: corps.slice(0, 300), ms: Date.now() - debut });
        try { await o.surEchec?.({ modele, http: res.status, corps }); } catch { /* le journal ne casse jamais la retouche */ }
        if (!repliPermis(res.status, corps)) break;
        continue;
      }
      const data = await res.json();
      const b64 = (data as { data?: Array<{ b64_json?: string }> })?.data?.[0]?.b64_json;
      if (!b64) {
        // Réponse facturée sans image : pas de second appel (il serait payé deux fois) — la photo d'origine part.
        essais.push({ modele, http: res.status, erreur: "réponse sans image (b64_json absent)", ms: Date.now() - debut });
        break;
      }
      essais.push({ modele, http: res.status, erreur: null, ms: Date.now() - debut });
      return { ok: true, b64, usage: usageDeLaReponse(data), modele, essais };
    } catch (e) {
      const abandon = (e as Error)?.name === "AbortError";
      essais.push({ modele, http: null, erreur: abandon ? "échéance atteinte" : String((e as Error)?.message ?? e).slice(0, 300), ms: Date.now() - debut });
      if (abandon) break;
    }
  }
  return { ok: false, essais };
}
