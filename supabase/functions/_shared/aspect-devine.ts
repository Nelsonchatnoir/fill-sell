// ═══════════════════════════════════════════════════════════════════════════
// LA VALEUR DEVINÉE — DANS LA LISTE DE LA PLATEFORME, MARQUÉE « DEVINÉE » (19/11/2026 soir, règle de Nico « zéro friction »)
// ═══════════════════════════════════════════════════════════════════════════
// Règle de Nico (19/11) : « tout ce qui se devine est rempli, avec la valeur la plus probable de la LISTE de la
// plateforme, marquée devinée ; on ne demande que l'impossible ; jamais une information fausse ».
// Cas (compte de Nico, lot du 19/11 13:25) : une veste polaire (les photos le montrent, le titre dit « Veste noir et
// gris ») → « Matière doublure externe » demandée ; des boutons de manchette → « Pour qui ? » (Vinted) demandé.
// Les passes d'avant (_shared/ebay-aspects-ia.ts) LISENT : une valeur écrite, ou le mot recopié du texte — et un mot
// ordinaire ne prouve rien (règle du 19/11 matin, aspect-du-texte.js). DEVINER est une autre chose : choisir, dans la
// liste de la plateforme, l'entrée la plus probable pour CET article (photos + texte), comme le ferait le vendeur.
// CE MODULE VIENT EN DERNIER, sur ce qui reste vide après la lecture. Garde-fous :
//   · une ENTRÉE DE LA LISTE seulement (recopiée telle que la liste l'écrit) ; jamais « Autre » (la règle de l'app,
//     valeursProbables.js, s'en charge) ; hors liste → refusée, motif tracé, la question reste ;
//   · null quand aucune entrée n'est nettement plus probable : la question reste ;
//   · JAMAIS deviné (ça se lit, ça ne se devine pas) : la marque, le modèle, le nom d'un jeu, d'un parfum, d'une
//     œuvre…, une taille, une pointure, une mesure, une capacité, un âge, un état, un format, une caractéristique
//     technique (aspectDevinable) ;
//   · la trace : `devinees` (les noms) — rendue par generate-listing et journalisée (ebay_aspects_ia, valeur_devinee) ;
//     l'écran peut la montrer (« devinée — change-la si besoin »).
// Appelants : generate-listing (encart eBay et canal générique Vinted/Leboncoin/Beebs, photos jointes), remplirAspects
// (ebay-publication.ts, voie API, texte seul). Verrou : scripts/aspects-devines-1911-selftest.ts.
import { valeurDeListeCorrespondante } from "./texte-comparable.ts";
import { questionClaude } from "./claude-cache.ts";
import {
  ASPECT_DEFAULTS, ASPECT_MESURE_RE, MODELE_ASPECTS_DEFAUT, contexteEnTexte, estAspectDeTaille,
  type AspectDemande, type ContexteArticle,
} from "./ebay-aspects-ia.ts";
import { estFourreTout, champDeductibleDuTexte } from "./option-du-texte.js";

export const SOURCE_DEVINEE = "devinee";
const LISTE_DEVINEE_MAX = 400;
const VALEUR_MAX = 65;

// Ce qui se LIT et ne se devine jamais : identité de l'objet, spécification, mesure, âge, état, format.
const JAMAIS_DEVINE_RE = new RegExp("^(?:" + [
  "marques?\\b", "mod[eè]les?\\b", "gamme", "ligne de produits", "s[ée]rie", "collection", "jeux?\\b", "nom\\b", "personnage",
  "franchise", "licence", "[ée]quipe", "club\\b", "joueur", "athl[eè]te", "ligue", "championnat", "titre\\b", "auteur",
  "artiste", "interpr[eè]te", "r[ée]alisateur", "acteur", "[ée]diteur", "maison d'[ée]dition", "label\\b", "[ée]dition",
  "version\\b", "ann[ée]e", "date\\b", "d[ée]cennie", "p[ée]riode", "[ée]poque", "vintage", "fait main", "num[ée]ro", "ean\\b",
  "isbn", "upc\\b", "gtin", "mpn", "r[ée]f[ée]rence", "code\\b", "pays\\b", "r[ée]gion\\b", "lieu\\b", "sign[ée]", "autographe",
  "certifi", "garantie", "personnalis", "[âa]ges?\\b", "tranche d'[âa]ge", "[ée]tat\\b", "condition", "type de taille",
  "taille", "pointure", "tour de", "poids", "capacit", "puissance", "tension", "voltage", "r[ée]solution",
  "m[ée]moire", "stockage", "processeur", "connectivit", "syst[eè]me d'exploitation", "plateforme", "console",
  "format", "langue", "teinte", "nombre", "quantit", "classification", "pegi", "parfum", "volume", "contenance",
].join("|") + ")", "i");

const plier = (s: unknown) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();

/**
 * Cet aspect peut-il recevoir une valeur DEVINÉE ? (pur) — `key` : la clé de la plateforme (canal générique).
 * Il faut une liste d'au moins deux vraies options (hors « Autre »), et un aspect qui ne se lit pas seulement.
 */
export function aspectDevinable(a: { name: string; allowedValues?: string[]; key?: string | null }): { ok: true } | { ok: false; motif: string } {
  const nom = String(a?.name ?? "").trim();
  if (!nom) return { ok: false, motif: "sans nom" };
  const vraies = [...new Set((a.allowedValues ?? []).map((v) => String(v ?? "").trim()).filter((v) => v && !estFourreTout(v)))];
  if (vraies.length < 2) return { ok: false, motif: "liste sans deux vraies options" };
  if (ASPECT_DEFAULTS[nom]) return { ok: false, motif: "défaut fixe" };
  if (estAspectDeTaille(nom) || /\b(taille|pointure|size)\b/i.test(nom)) return { ok: false, motif: "taille : se lit" };
  if (ASPECT_MESURE_RE.test(nom)) return { ok: false, motif: "mesure : se lit" };
  if (JAMAIS_DEVINE_RE.test(nom) || JAMAIS_DEVINE_RE.test(plier(nom))) return { ok: false, motif: "identité ou caractéristique : se lit" };
  if (a.key && !champDeductibleDuTexte(a.key, nom)) return { ok: false, motif: "champ jamais déduit (taille, marque, état, colis, identifiant)" };
  // Une liste de nombres (cm, Go, V, mm, pouces) est une mesure ou une capacité : elle se lit.
  if (vraies.filter((v) => /\d/.test(v)).length * 2 >= vraies.length) return { ok: false, motif: "liste de mesures : se lit" };
  return { ok: true };
}

/**
 * Les aspects envoyés SANS liste (l'app n'envoie pas une liste FREE_TEXT de plus de 60 valeurs) reçoivent celle du
 * catalogue eBay de la catégorie (ebay_item_aspects) — jamais la Marque (doctrine des marques fantômes), jamais à la
 * place d'une liste déjà envoyée. (pur)
 */
export function completerListesDuCatalogue<T extends { name: string; mode?: string; allowedValues?: string[] }>(
  demandes: T[], catalogue: Array<{ name?: string; mode?: string; allowedValues?: unknown }> | null | undefined,
): T[] {
  const parNom = new Map((Array.isArray(catalogue) ? catalogue : []).filter((c) => c && typeof c.name === "string").map((c) => [c.name as string, c]));
  return demandes.map((d) => {
    if (!d || d.name === "Marque" || (d.allowedValues ?? []).length) return d;
    const c = parNom.get(d.name);
    const liste = Array.isArray(c?.allowedValues) ? (c!.allowedValues as unknown[]).map((v) => String(v ?? "")).filter(Boolean) : [];
    return liste.length ? { ...d, allowedValues: liste, ...(c?.mode ? { mode: String(c.mode) } : {}) } : d;
  });
}

/** Les adresses des photos d'une fiche (chaînes ou { url }), dans l'ordre, au plus `max`. (pur) */
export function urlsDesPhotos(photos: unknown, max = 2): string[] {
  return (Array.isArray(photos) ? photos : [])
    .map((p) => (typeof p === "string" ? p : (p && typeof p === "object" ? String((p as { url?: unknown }).url ?? "") : "")))
    .map((u) => u.trim()).filter((u) => /^https?:\/\//i.test(u)).slice(0, max);
}

export interface ResultatDevinees {
  aspects: Record<string, string>;
  devinees: string[];
  refuses: Array<{ name: string; valeur: string; motif: string }>;
  appel_ia: boolean;
}

// deno-lint-ignore no-explicit-any
type SourceImageIA = any;

/**
 * UN appel pour tous les aspects devinables encore vides : l'entrée de la liste la plus probable pour CET article,
 * d'après le texte et (si jointes) les photos ; contrôlée ici (entrée exacte de la liste, jamais « Autre »).
 */
export async function devinerAspectsDansLaListe(
  demandes: Array<AspectDemande & { key?: string | null }>,
  contexte: ContexteArticle,
  // deno-lint-ignore no-explicit-any
  opts: { apiKey: string; onUsage?: (data: unknown) => void; admin?: any; fetchFn?: typeof fetch; images?: SourceImageIA[]; modele?: string; maxTokens?: number },
): Promise<ResultatDevinees> {
  const aspects: Record<string, string> = {};
  const refuses: ResultatDevinees["refuses"] = [];
  const devinees: string[] = [];
  const aDeviner = (Array.isArray(demandes) ? demandes : [])
    .filter((d) => d && typeof d.name === "string" && aspectDevinable(d).ok)
    .slice(0, 14);
  const ctx = contexteEnTexte(contexte);
  const images = Array.isArray(opts.images) ? opts.images.slice(0, 2) : [];
  if (!aDeviner.length || (!ctx && !images.length) || !opts.apiKey) return { aspects, devinees, refuses, appel_ia: false };
  const lignes = aDeviner.map((d) => {
    const liste = [...new Set((d.allowedValues ?? []).map((v) => String(v ?? "").trim()).filter((v) => v && !estFourreTout(v)))];
    return `- "${d.name}" — liste : ${liste.slice(0, LISTE_DEVINEE_MAX).join(" | ")}`;
  }).join("\n");
  const question = `Caractéristiques à deviner :\n${lignes}\n\nContexte article :\n${ctx || "(aucun texte : les photos seules)"}`;
  const modele = opts.modele ?? MODELE_ASPECTS_DEFAUT;
  let texte = "";
  try {
    const q = await questionClaude({
      model: modele,
      max_tokens: opts.maxTokens ?? 400,
      system:
        `Tu complètes une annonce d'occasion. Pour chaque caractéristique demandée, choisis dans SA liste la valeur la PLUS PROBABLE pour CET article précis, d'après ${images.length ? "les photos jointes et " : ""}le texte : ce qu'est l'objet, sa matière visible, sa forme, son usage, le public auquel il est d'ordinaire destiné. ` +
        `Exemples : une veste polaire → matière « Polyester » ; des boutons de manchette → public « Homme » (ou « Hommes ») ; une robe qui s'arrête au genou → « Au genou » ; un jean → matière « Coton ». ` +
        `RÈGLES : (1) la réponse est une entrée de la liste recopiée à l'identique ; (2) jamais une valeur choisie parce qu'elle est fréquente en général, jamais « Autre » ; (3) null si aucune entrée n'est nettement plus probable que les autres pour CET article, ou si aucune ne lui convient ; (4) jamais une valeur que le texte ou les photos contredisent. ` +
        `Retourne UNIQUEMENT du JSON valide : {"aspects":{"<nom exact>":"valeur ou null"}}`,
      messages: [{ role: "user", content: images.length
        ? [...images.map((source) => ({ type: "image", source })), { type: "text", text: question }]
        : question }],
    }, { apiKey: opts.apiKey, admin: opts.admin, fonction: "aspects_devines", interrupteur: "ia_cache_aspects", fetchFn: opts.fetchFn });
    if (!q.ok) {
      console.error("[aspect-devine] Anthropic :", q.statut, q.erreur ?? "");
      return { aspects, devinees, refuses, appel_ia: true };
    }
    if (q.data) opts.onUsage?.(q.data);
    texte = q.texte;
  } catch (e) {
    console.error("[aspect-devine] exception :", (e as Error)?.message ?? e);
    return { aspects, devinees, refuses, appel_ia: true };
  }
  const m = texte.match(/\{[\s\S]*\}/);
  let brut: Record<string, unknown> = {};
  try { brut = m ? ((JSON.parse(m[0])?.aspects ?? {}) as Record<string, unknown>) : {}; } catch { brut = {}; }
  const parNom = new Map(aDeviner.map((d) => [d.name, d]));
  for (const [nom, v] of Object.entries(brut)) {
    const d = parNom.get(nom);
    if (!d) continue; // jamais une clé non demandée
    const s = typeof v === "string" ? v.trim().slice(0, VALEUR_MAX) : "";
    if (!s || s.toLowerCase() === "null") continue;
    const entree = valeurDeListeCorrespondante(s, d.allowedValues ?? []);
    if (!entree) { refuses.push({ name: nom, valeur: s, motif: "devinée hors de la liste" }); continue; }
    if (estFourreTout(entree)) { refuses.push({ name: nom, valeur: s, motif: "« Autre » n'est pas une valeur devinée" }); continue; }
    aspects[nom] = entree;
    devinees.push(nom);
  }
  return { aspects, devinees, refuses, appel_ia: true };
}
