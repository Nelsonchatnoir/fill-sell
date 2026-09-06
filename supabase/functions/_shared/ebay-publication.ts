// ═══════════════════════════════════════════════════════════════════════════
// eBay par API — briques de publication (Inventory API), lot 2a, 06/09/2026
//
// Utilisé par ebay-api-worker. Tout ce qui touche à une catégorie, un état,
// un aspect ou un emplacement est lu chez eBay ou dans nos caches — jamais
// deviné. Relevés de la phase 0 (06/09, compte de Nico) :
//   · arbre EBAY_FR = 71, version 120 = celle du cache ebay_item_aspects ;
//   · Metadata get_item_condition_policies : conditions PAR CATÉGORIE
//     (vêtements 1000/1500/1750/2990/3000/3010, général 1000/1500/3000/7000,
//     livres 1000/2750/4000/5000/6000) ;
//   · aspects : SELECTION_ONLY rares (Département…), FREE_TEXT à suggestions
//     partout (Marque 19 037 valeurs) ; MPN FREE_TEXT sans valeur ;
//   · 0 emplacement marchand sur le compte → createInventoryLocation.
// ═══════════════════════════════════════════════════════════════════════════
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { appelEbay, type EbayEnv } from "./ebay-oauth.ts";
import { valeurDeListeCorrespondante } from "./texte-comparable.ts";
import { resoudreAspectsIA, type AspectDemande, type ContexteArticle } from "./ebay-aspects-ia.ts";

export const MARKETPLACE = "EBAY_FR";
export const ARBRE_FR = "71";

// ── Erreurs eBay REST : premier message lisible + errorId ───────────────────
export interface ErreurEbay { errorId: number | null; message: string; parametres?: string; params?: Array<{ name: string; value: string }>; }
export function lireErreurEbay(json: unknown, texte: string): ErreurEbay {
  const errs = (json as { errors?: Array<{ errorId?: number; message?: string; longMessage?: string; parameters?: Array<{ name?: string; value?: string }> }> } | null)?.errors;
  if (Array.isArray(errs) && errs.length) {
    const e = errs[0];
    const params = (e.parameters ?? []).map((p) => `${p.name ?? "?"}=${p.value ?? ""}`).join(", ");
    return { errorId: e.errorId ?? null, message: String(e.longMessage ?? e.message ?? "").slice(0, 400), parametres: params || undefined, params: (e.parameters ?? []).map((p) => ({ name: String(p.name ?? ""), value: String(p.value ?? "") })) };
  }
  const warns = (json as { warnings?: Array<{ message?: string }> } | null)?.warnings;
  if (Array.isArray(warns) && warns.length) return { errorId: null, message: String(warns[0].message ?? "").slice(0, 400) };
  return { errorId: null, message: texte.slice(0, 300) };
}

// ── Conditions ──────────────────────────────────────────────────────────────
// conditionId (Metadata) → valeur de l'enum `condition` de l'Inventory API.
// ⚠️ Correspondance à CONFIRMER par la réponse d'eBay au premier
// createOrReplaceInventoryItem (consigne Nico) : un refus est rendu tel quel.
export const CONDITION_ENUM_PAR_ID: Record<string, string> = {
  "1000": "NEW",
  "1500": "NEW_OTHER",
  "1750": "NEW_WITH_DEFECTS",
  "2000": "CERTIFIED_REFURBISHED",
  "2500": "SELLER_REFURBISHED",
  "2750": "LIKE_NEW",
  "2990": "PRE_OWNED_EXCELLENT",
  "3000": "USED_EXCELLENT",
  "3010": "PRE_OWNED_FAIR",
  "4000": "USED_VERY_GOOD",
  "5000": "USED_GOOD",
  "6000": "USED_ACCEPTABLE",
  "7000": "FOR_PARTS_OR_NOT_WORKING",
};

// Notre `etat` → conditionIds acceptables, du plus fidèle au repli. Le premier
// présent dans la liste de la catégorie gagne.
const PREFERENCES_ETAT: Array<[RegExp, string[]]> = [
  [/neuf avec/i, ["1000"]],
  [/neuf sans/i, ["1500", "1000"]],
  [/neuf/i, ["1000", "1500"]],
  [/tr[eè]s bon/i, ["3000", "2990", "4000", "2750"]],
  [/^bon/i, ["3010", "5000", "3000", "4000"]],
  [/satisf|correct|us[ée]/i, ["6000", "3010", "5000", "3000"]],
];

export interface ConditionCategorie { id: string; libelle: string; }
const cacheConditions = new Map<string, ConditionCategorie[]>();

export async function conditionsCategorie(env: EbayEnv, token: string, categoryId: string): Promise<ConditionCategorie[] | null> {
  const enCache = cacheConditions.get(categoryId);
  if (enCache) return enCache;
  const r = await appelEbay(env, token, `/sell/metadata/v1/marketplace/${MARKETPLACE}/get_item_condition_policies?filter=categoryIds:%7B${encodeURIComponent(categoryId)}%7D`);
  if (r.http !== 200 || !r.json) return null;
  const pol = (r.json as { itemConditionPolicies?: Array<{ categoryId?: string; itemConditions?: Array<{ conditionId?: string; conditionDescription?: string }> }> }).itemConditionPolicies?.[0];
  if (!pol?.itemConditions?.length) return null;
  const liste = pol.itemConditions.map((c) => ({ id: String(c.conditionId ?? ""), libelle: String(c.conditionDescription ?? "") })).filter((c) => c.id);
  cacheConditions.set(categoryId, liste);
  return liste;
}

export function choisirCondition(etat: string | null | undefined, conditions: ConditionCategorie[] | null): { id: string; enumValue: string; libelle: string } | null {
  const e = String(etat ?? "").trim();
  let candidats: string[] = ["3000", "4000", "5000", "2990", "3010"];
  for (const [re, ids] of PREFERENCES_ETAT) { if (re.test(e)) { candidats = ids; break; } }
  const autorises = conditions ? new Set(conditions.map((c) => c.id)) : null;
  for (const id of candidats) {
    if (autorises && !autorises.has(id)) continue;
    const enumValue = CONDITION_ENUM_PAR_ID[id];
    if (!enumValue) continue;
    return { id, enumValue, libelle: conditions?.find((c) => c.id === id)?.libelle ?? "" };
  }
  return null;
}

// ── Aspects ─────────────────────────────────────────────────────────────────
export interface AspectCatalogue { name: string; required: boolean; mode: string; allowedValues: string[]; }

// Lecture du cache ebay_item_aspects ; catégorie absente → Taxonomy avec le
// jeton du vendeur (api_scope, vérifié en phase 0), puis dépôt dans le cache
// (même forme que fetch-ebay-aspects : mode,name,format,dataType,required,
// cardinality,allowedValues).
// `rafraichir` (06/09) : eBay change le mode d'un aspect sans prévenir —
// « Taille » des T-shirts homme est passée de texte libre à liste fermée
// (refus 25129 « no longer support custom values ») pendant que le cache
// disait encore FREE_TEXT. Sur ce refus, le worker relit Taxonomy et
// remplace la ligne du cache avant de rejouer.
export async function aspectsCategorie(admin: SupabaseClient, env: EbayEnv, token: string, categoryId: string, options: { rafraichir?: boolean } = {}): Promise<{ aspects: AspectCatalogue[]; source: "cache" | "taxonomy" } | { erreur: string }> {
  if (!options.rafraichir) {
    const { data } = await admin.from("ebay_item_aspects").select("aspects, status").eq("category_id", categoryId).maybeSingle();
    if (data && (data.status === "ok" || data.status === "empty") && Array.isArray(data.aspects)) {
      return { aspects: (data.aspects as Array<Record<string, unknown>>).map(normaliserCache), source: "cache" };
    }
  }
  const r = await appelEbay(env, token, `/commerce/taxonomy/v1/category_tree/${ARBRE_FR}/get_item_aspects_for_category?category_id=${encodeURIComponent(categoryId)}`);
  if (r.http !== 200 || !r.json) return { erreur: `Taxonomy ${r.http} : ${lireErreurEbay(r.json, r.texte).message}` };
  const brut = (r.json as { aspects?: Array<Record<string, unknown>> }).aspects ?? [];
  const lignes = brut.map((a) => {
    const c = (a.aspectConstraint ?? {}) as Record<string, unknown>;
    return {
      name: String(a.localizedAspectName ?? ""),
      required: Boolean(c.aspectRequired),
      mode: String(c.aspectMode ?? "FREE_TEXT"),
      format: c.aspectFormat ? String(c.aspectFormat) : null,
      dataType: String(c.aspectDataType ?? "STRING"),
      cardinality: String(c.itemToAspectCardinality ?? "SINGLE"),
      allowedValues: ((a.aspectValues ?? []) as Array<{ localizedValue?: string }>).map((v) => String(v.localizedValue ?? "")).filter(Boolean),
    };
  }).filter((l) => l.name);
  // Dépôt best-effort dans le référentiel (jamais bloquant).
  try {
    await admin.from("ebay_item_aspects").upsert({
      category_id: categoryId, aspects: lignes, aspect_count: lignes.length, required_count: lignes.filter((l) => l.required).length,
      status: lignes.length ? "ok" : "empty", note: options.rafraichir ? "worker api — rafraîchi sur refus 25129" : "worker api 2a", source: "get_item_aspects_for_category",
      category_tree_id: ARBRE_FR, category_tree_version: "120", marketplace_id: MARKETPLACE, ebay_env: env, fetched_at: new Date().toISOString(),
    }, { onConflict: "category_id" });
  } catch (_e) { /* best-effort */ }
  return { aspects: lignes.map(normaliserCache), source: "taxonomy" };
}

// Après un refus 25129 (« no longer support custom values for … »), eBay
// impose SES valeurs pour cet aspect même si Taxonomy le dit encore FREE_TEXT
// (relevé 06/09 : « Taille » des T-shirts homme, 15687 — Taxonomy relu =
// toujours FREE_TEXT, publication refusée quand même). On grave donc le mode
// SELECTION_ONLY dans la ligne du cache pour cet aspect : l'IA est contrainte
// à la liste, une valeur hors liste devient « manquant » → mini-éditeur.
export async function marquerAspectFerme(admin: SupabaseClient, categoryId: string, nomAspect: string): Promise<boolean> {
  const { data } = await admin.from("ebay_item_aspects").select("aspects, note").eq("category_id", categoryId).maybeSingle();
  if (!data || !Array.isArray(data.aspects)) return false;
  let touche = false;
  const aspects = (data.aspects as Array<Record<string, unknown>>).map((a) => {
    if (String(a.name ?? "") !== nomAspect) return a;
    touche = true;
    return { ...a, mode: "SELECTION_ONLY", mode_taxonomy: a.mode_taxonomy ?? a.mode, ferme_par: "refus_25129", ferme_le: new Date().toISOString() };
  });
  if (!touche) return false;
  const { error } = await admin.from("ebay_item_aspects").update({ aspects, note: `${String(data.note ?? "")} · ${nomAspect} fermé (25129)`.slice(0, 300) }).eq("category_id", categoryId);
  return !error;
}

function normaliserCache(a: Record<string, unknown>): AspectCatalogue {
  return {
    name: String(a.name ?? ""),
    required: Boolean(a.required),
    mode: String(a.mode ?? a.aspectMode ?? "FREE_TEXT"),
    allowedValues: Array.isArray(a.allowedValues) ? (a.allowedValues as unknown[]).map(String) : [],
  };
}

// Département eBay depuis notre `genre` (valeurs exactes relevées en phase 0
// sur 15687/15689/11484 : Femme, Homme, Adolescents, Bébé et tout-petit
// (unisexe), Garçon, Fille, Adulte unisexe).
const DEPARTEMENT_PAR_GENRE: Record<string, string[]> = {
  Femme: ["Femme"], Homme: ["Homme"], Fille: ["Fille"], "Garçon": ["Garçon"],
  "Bébé": ["Bébé et tout-petit (unisexe)"], Enfant: ["Bébé et tout-petit (unisexe)"], Mixte: ["Adulte unisexe"],
};

export interface PlatformFields {
  marque?: string | null; taille?: string | null; couleur?: string | null; colors?: string[] | null;
  matiere?: string | null; genre?: string | null; modele?: string | null; stockage?: string | null; etat?: string | null;
  famille?: string | null; ebayCategoryPath?: string[] | null;
  ebayAspects?: Record<string, string> | null;
  // Lot 1 (07/09/2026) : champs comblés depuis inventaire.attributs et leur
  // étiquette ('attributs' | 'lens') — cf. enrichirDepuisAttributs.
  attributsSources?: Record<string, "attributs" | "lens"> | null;
  attributs_visibles?: Record<string, unknown> | null;
  objet?: string | null; isbn?: string | null;
  [k: string]: unknown;
}

// ── inventaire.attributs → champs du job (lot 1, 07/09/2026) ────────────────
// Le job reste la photographie des choix de l'utilisateur : un champ NON VIDE
// du job gagne toujours ; attributs (sync liste, détail Vinted, capture, Lens,
// saisie — fusionnés par priorité EN BASE, trigger inventaire_attributs_fusion)
// ne fait que combler les vides. Chaque champ comblé est étiqueté dans
// pf.attributsSources ('lens' si la valeur vient d'un scan, 'attributs' sinon)
// pour que last_diagnostic.sources dise d'où vient chaque aspect ; `utilises`
// garde la source exacte (vinted_liste, vinted_detail, capture, manuel, lens).
export type AttributsInventaire = Record<string, { v?: unknown; source?: string; at?: string } | undefined>;
const CHAMPS_ATTRIBUTS_TEXTE = ["taille", "etat", "marque", "couleur", "matiere", "genre", "modele", "isbn", "famille", "objet"] as const;
function champVide(x: unknown): boolean { return x == null || (typeof x === "string" && !x.trim()); }
export function enrichirDepuisAttributs(pf: PlatformFields, attributs: AttributsInventaire | null | undefined): { pf: PlatformFields; utilises: Record<string, string>; disponibles: string[] } {
  const out: PlatformFields = { ...pf };
  const utilises: Record<string, string> = {};
  const attributsSources: Record<string, "attributs" | "lens"> = { ...((pf.attributsSources as Record<string, "attributs" | "lens"> | null) ?? {}) };
  const a: AttributsInventaire = (attributs && typeof attributs === "object") ? attributs : {};
  const lire = (cle: string): { v: unknown; source: string } | null => {
    const champ = a[cle];
    if (!champ || typeof champ !== "object" || champVide(champ.v)) return null;
    return { v: champ.v, source: String(champ.source ?? "") };
  };
  for (const cle of CHAMPS_ATTRIBUTS_TEXTE) {
    const lu = lire(cle);
    if (!lu || typeof lu.v !== "string") continue;
    // couleur : le job porte colors[] (split Vinted) ou couleur — l'un ou
    // l'autre non vide vaut choix du job.
    const dejaLa = cle === "couleur"
      ? (!champVide(out.couleur) || (Array.isArray(out.colors) && out.colors.length > 0))
      : !champVide(out[cle]);
    if (dejaLa) continue;
    out[cle] = lu.v.trim();
    utilises[cle] = lu.source;
    attributsSources[cle] = lu.source === "lens" ? "lens" : "attributs";
  }
  const av = lire("attributs_visibles");
  const avJob = out.attributs_visibles;
  const avJobVide = !(avJob && typeof avJob === "object" && Object.keys(avJob as object).length);
  if (av && av.v && typeof av.v === "object" && !Array.isArray(av.v) && Object.keys(av.v as object).length && avJobVide) {
    out.attributs_visibles = av.v as Record<string, unknown>;
    utilises.attributs_visibles = av.source;
  }
  out.attributsSources = attributsSources;
  return { pf: out, utilises, disponibles: Object.keys(a).filter((k) => lire(k) !== null) };
}

// Règles DÉTERMINISTES portées depuis ListingPreviewScreen (defautAspectEbay,
// 11/08 et 02/09) — une seule doctrine pour les deux voies :
//   · marque absente ou générique → l'entrée générique de la liste eBay
//     (« - Sans marque/Générique - ») quand la catégorie en propose une ;
//   · « Modèle » FREE_TEXT sur un objet sans marque réelle, ou sur un LIVRE
//     (famille livres_medias, ou chemin de catégorie « Livres… ») →
//     « Ne s'applique pas » ; SELECTION_ONLY → on laisse manquant.
const MARQUE_GENERIQUE_RE = /(sans\s*marque|g[ée]n[ée]rique|unbranded|no\s*brand)/i;
const VALEUR_NE_S_APPLIQUE_PAS = "Ne s'applique pas";
function estLivre(pf: PlatformFields): boolean {
  if (String(pf.famille ?? "") === "livres_medias") return true;
  const racine = Array.isArray(pf.ebayCategoryPath) ? String(pf.ebayCategoryPath[0] ?? "") : "";
  return /^livres/i.test(racine);
}

// Valeur candidate pour un aspect : d'abord ce que le job porte déjà
// (ebayAspects, posé par l'app / la réponse needs_user), puis nos champs
// standard. Recalée sur la liste eBay quand elle y correspond ; SELECTION_ONLY
// hors liste = manquant (eBay refuserait) ; FREE_TEXT hors liste = gardé tel quel.
// 'attributs' / 'lens' (lot 1, 07/09/2026) : valeur standard comblée depuis
// inventaire.attributs — respectivement une source Vinted/capture/saisie, ou
// un scan Lens (stepper ou worker).
export type SourceAspect = "job" | "genre" | "standard" | "attributs" | "lens" | "defaut" | "ia";
const CHAMP_PAR_ASPECT: Record<string, string> = {
  "Marque": "marque", "Taille": "taille", "Couleur": "couleur", "Matière": "matiere", "Modèle": "modele",
  "Capacité de stockage": "stockage", "ISBN": "isbn",
};
export function assemblerAspects(pf: PlatformFields, catalogue: AspectCatalogue[]): { aspects: Record<string, string[]>; manquants: string[]; recalages: string[]; sources: Record<string, SourceAspect> } {
  const aspects: Record<string, string[]> = {};
  const manquants: string[] = [];
  const recalages: string[] = [];
  const sources: Record<string, SourceAspect> = {};
  const sourcesIA = (pf.ebayAspectsSources && typeof pf.ebayAspectsSources === "object") ? pf.ebayAspectsSources as Record<string, string> : {};
  const attributsSources = (pf.attributsSources && typeof pf.attributsSources === "object") ? pf.attributsSources as Record<string, string> : {};
  const ebayAspects = (pf.ebayAspects && typeof pf.ebayAspects === "object") ? pf.ebayAspects : {};
  const couleur = (Array.isArray(pf.colors) && pf.colors[0]) ? String(pf.colors[0]) : (pf.couleur ? String(pf.couleur) : "");
  const marqueBrute = String(pf.marque ?? "").trim();
  const marqueGenerique = !marqueBrute || MARQUE_GENERIQUE_RE.test(marqueBrute);
  const entreeGenerique = (liste: string[]) => liste.find((v) => /sans\s*marque|g[ée]n[ée]rique/i.test(v)) ?? "";
  const standard: Record<string, string> = {
    "Marque": marqueBrute,
    "Taille": String(pf.taille ?? ""),
    "Couleur": couleur,
    "Matière": String(pf.matiere ?? ""),
    "Modèle": String(pf.modele ?? ""),
    "Capacité de stockage": String(pf.stockage ?? ""),
    "ISBN": String(pf.isbn ?? ""),
    "Numéro de pièce fabricant": "Ne s'applique pas",
  };
  for (const a of catalogue) {
    if (!a.required && !(a.name in ebayAspects)) continue; // 2a : requis + ce que le job porte déjà
    let brut = String(ebayAspects[a.name] ?? "").trim();
    let source: SourceAspect = sourcesIA[a.name] === "ia" ? "ia" : "job";
    if (!brut && a.name === "Département") {
      const cands = DEPARTEMENT_PAR_GENRE[String(pf.genre ?? "")] ?? [];
      brut = cands.find((c) => valeurDeListeCorrespondante(c, a.allowedValues)) ?? cands[0] ?? "";
      source = "genre";
    }
    if (!brut) {
      brut = String(standard[a.name] ?? "").trim();
      // Étiquette de provenance : champ posé par le stepper ('standard'),
      // comblé depuis inventaire.attributs ('attributs' / 'lens'), ou défaut.
      const origine = attributsSources[CHAMP_PAR_ASPECT[a.name] ?? ""];
      source = a.name === "Numéro de pièce fabricant" ? "defaut" : origine === "lens" ? "lens" : origine === "attributs" ? "attributs" : "standard";
    }
    // Marque générique/absente → entrée générique de la liste ; Modèle sans
    // marque réelle ou sur un livre → « Ne s'applique pas » (FREE_TEXT seul).
    if (a.name === "Marque" && marqueGenerique) { const g = entreeGenerique(a.allowedValues); if (g) { brut = g; source = "defaut"; } }
    if (a.name === "Modèle" && !brut && a.mode !== "SELECTION_ONLY" && (marqueGenerique || estLivre(pf))) { brut = VALEUR_NE_S_APPLIQUE_PAS; source = "defaut"; }
    if (!brut) { if (a.required) manquants.push(a.name); continue; }
    const recale = a.allowedValues.length ? valeurDeListeCorrespondante(brut, a.allowedValues) : null;
    if (recale) {
      if (recale !== brut) recalages.push(`${a.name}: « ${brut} » → « ${recale} »`);
      aspects[a.name] = [recale]; sources[a.name] = source;
    } else if (a.mode === "SELECTION_ONLY") {
      if (a.required) manquants.push(a.name);
    } else {
      aspects[a.name] = [brut]; sources[a.name] = source;
    }
  }
  return { aspects, manquants, recalages, sources };
}

// ── Remplissage complet : job/standard/défauts, PUIS l'IA sous contrainte
// pour ce qui manque encore, PUIS ré-assemblage (recalage + contrôle exact).
// C'est ce qui rend la publication autonome : un job qui sortait en
// needs_user « Type, Style » (test 2a du 06/09) se complète ici tout seul.
export interface RemplissageAspects {
  aspects: Record<string, string[]>;
  manquants: string[];
  recalages: string[];
  sources: Record<string, SourceAspect>;
  ia: { demandes: string[]; obtenus: Record<string, string>; refuses: Array<{ name: string; valeur: string; motif: string }>; appel: boolean } | null;
}
export async function remplirAspects(pf: PlatformFields, catalogue: AspectCatalogue[], contexte: ContexteArticle, apiKey: string, onUsage?: (d: unknown) => void): Promise<RemplissageAspects> {
  const premier = assemblerAspects(pf, catalogue);
  if (!premier.manquants.length) return { ...premier, ia: null };
  const demandes: AspectDemande[] = premier.manquants
    .map((nom) => catalogue.find((c) => c.name === nom))
    .filter((c): c is AspectCatalogue => Boolean(c))
    .map((c) => ({ name: c.name, mode: c.mode, allowedValues: c.allowedValues }));
  const ia = await resoudreAspectsIA(demandes, contexte, { apiKey, onUsage });
  const pf2: PlatformFields = {
    ...pf,
    ebayAspects: { ...((pf.ebayAspects && typeof pf.ebayAspects === "object") ? pf.ebayAspects : {}), ...ia.aspects },
    ebayAspectsSources: Object.fromEntries(Object.keys(ia.aspects).map((k) => [k, "ia"])),
  };
  let second = assemblerAspects(pf2, catalogue);
  let obtenus = { ...ia.aspects };
  let refuses = [...ia.refuses];
  const demandesNoms = demandes.map((d) => d.name);
  // 2e passe : un aspect FREE_TEXT requis encore vide (ex. « Style » d'un
  // sweat, dont la liste eBay ne propose que des styles de pull) — eBay
  // accepte le texte libre, on demande le terme exact du contexte, sans liste.
  const libres = second.manquants
    .map((nom) => catalogue.find((c) => c.name === nom))
    .filter((c): c is AspectCatalogue => c !== undefined && c.mode !== "SELECTION_ONLY" && c.name !== "Marque")
    .map((c) => ({ name: c.name, mode: c.mode, allowedValues: c.allowedValues, libre: true }));
  if (libres.length) {
    const ia2 = await resoudreAspectsIA(libres, contexte, { apiKey, onUsage });
    if (Object.keys(ia2.aspects).length) {
      const pf3: PlatformFields = {
        ...pf2,
        ebayAspects: { ...((pf2.ebayAspects && typeof pf2.ebayAspects === "object") ? pf2.ebayAspects : {}), ...ia2.aspects },
        ebayAspectsSources: { ...((pf2.ebayAspectsSources as Record<string, string>) ?? {}), ...Object.fromEntries(Object.keys(ia2.aspects).map((k) => [k, "ia"])) },
      };
      second = assemblerAspects(pf3, catalogue);
      obtenus = { ...obtenus, ...ia2.aspects };
    }
    refuses = [...refuses, ...ia2.refuses];
    for (const l of libres) if (!demandesNoms.includes(l.name)) demandesNoms.push(l.name);
  }
  return { ...second, ia: { demandes: demandesNoms, obtenus, refuses, appel: ia.appel_ia } };
}

// ── Catégorie : suggestions eBay depuis le titre (repli de la phase 0) ──────
export interface SuggestionCategorie { id: string; nom: string; chemin: string[]; }
export async function suggererCategories(env: EbayEnv, token: string, titre: string): Promise<SuggestionCategorie[]> {
  // ⚠️ 06/09 : /s+/ (sans antislash) effaçait chaque « s » du titre —
  // « Musculation » devenait « Mu culation », « T-shirt Adidas » « T- hirt
  // Adida  » : les suggestions eBay répondaient à un titre mutilé (la BD
  // du T-shirt Sergio Garcia vient de là). Les blancs seuls sont repliés.
  const q = String(titre ?? "").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!q) return [];
  const r = await appelEbay(env, token, `/commerce/taxonomy/v1/category_tree/${ARBRE_FR}/get_category_suggestions?q=${encodeURIComponent(q)}`);
  if (r.http !== 200 || !r.json) return [];
  const brut = (r.json as { categorySuggestions?: Array<{ category?: { categoryId?: string; categoryName?: string }; categoryTreeNodeAncestors?: Array<{ categoryName?: string }> }> }).categorySuggestions ?? [];
  return brut.map((s) => ({
    id: String(s.category?.categoryId ?? ""),
    nom: String(s.category?.categoryName ?? ""),
    chemin: [...(s.categoryTreeNodeAncestors ?? []).map((a) => String(a.categoryName ?? "")).reverse(), String(s.category?.categoryName ?? "")],
  })).filter((s) => s.id);
}

// ── Emplacement marchand ────────────────────────────────────────────────────
export const CLE_EMPLACEMENT = "fs-principal";

interface CompteEmplacement { merchant_location_key: string | null; }

export async function emplacementMarchand(admin: SupabaseClient, env: EbayEnv, token: string, userId: string): Promise<{ cle: string; cree: boolean } | { manque: "adresse" | "eBay"; detail: string }> {
  const { data: compte } = await admin.from("ebay_accounts").select("merchant_location_key").eq("user_id", userId).maybeSingle();
  const existante = (compte as CompteEmplacement | null)?.merchant_location_key;
  if (existante) return { cle: existante, cree: false };

  // Déjà créé chez eBay (clé connue) mais pas mémorisé ? On relit avant de créer.
  const lecture = await appelEbay(env, token, `/sell/inventory/v1/location/${CLE_EMPLACEMENT}`);
  if (lecture.http === 200) {
    await admin.from("ebay_accounts").update({ merchant_location_key: CLE_EMPLACEMENT }).eq("user_id", userId);
    return { cle: CLE_EMPLACEMENT, cree: false };
  }

  // Adresse : code postal + ville depuis l'adresse de remise Leboncoin
  // (profiles.platform_settings.leboncoin.adresse) — la rue n'est jamais
  // envoyée à eBay, seuls ville, code postal et pays.
  const { data: profil } = await admin.from("profiles").select("platform_settings").eq("id", userId).maybeSingle();
  const adresse = String((profil?.platform_settings as { leboncoin?: { adresse?: string } } | null)?.leboncoin?.adresse ?? "");
  const m = adresse.match(/\b(\d{5})\b\s*(.+)$/);
  if (!m) return { manque: "adresse", detail: "aucune ville + code postal connus (adresse Leboncoin absente ou illisible)" };
  const codePostal = m[1];
  const ville = m[2].trim().replace(/\s+/g, " ");

  const creation = await appelEbay(env, token, `/sell/inventory/v1/location/${CLE_EMPLACEMENT}`, {
    method: "POST",
    body: {
      name: "FillSell",
      merchantLocationStatus: "ENABLED",
      locationTypes: ["WAREHOUSE"],
      location: { address: { city: ville, postalCode: codePostal, country: "FR" } },
    },
  });
  if (creation.http !== 204 && creation.http !== 200 && creation.http !== 201) {
    return { manque: "eBay", detail: `createInventoryLocation HTTP ${creation.http} : ${lireErreurEbay(creation.json, creation.texte).message}` };
  }
  await admin.from("ebay_accounts").update({ merchant_location_key: CLE_EMPLACEMENT }).eq("user_id", userId);
  return { cle: CLE_EMPLACEMENT, cree: true };
}

// ── Texte ───────────────────────────────────────────────────────────────────
export function titreEbay(titre: string): string {
  return String(titre ?? "").replace(/\s+/g, " ").trim().slice(0, 80);
}
export function descriptionEbay(description: string, titre: string): string {
  const d = String(description ?? "").trim() || String(titre ?? "").trim();
  // Texte brut → HTML minimal (eBay affiche listingDescription en HTML).
  const echap = d.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<p>${echap.replace(/\n{2,}/g, "</p><p>").replace(/\n/g, "<br>")}</p>`.slice(0, 4000);
}
// Photos d'un job ou d'un article : objets { type, url } (forme garantie par
// l'app, cf. src/utils/photos.js) OU chaînes nues (URLs CDN Vinted écrites par
// la sync du dressing — 06/09 : le T-shirt Adidas de Nico en portait 6). Les
// deux formes sont lues ; seules les URLs https comptent.
export function urlsPhotos(photos: unknown): string[] {
  if (!Array.isArray(photos)) return [];
  return photos
    .map((p) => typeof p === "string" ? p : String((p as { url?: unknown })?.url ?? ""))
    .filter((u) => /^https:\/\//.test(u))
    .slice(0, 24);
}
export function skuPour(inventaireId: number | string): string {
  return `fs-${inventaireId}`.slice(0, 50);
}
export function urlAnnonce(listingId: string): string {
  return `https://www.ebay.fr/itm/${listingId}`;
}
