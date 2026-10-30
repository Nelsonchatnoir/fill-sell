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
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.117.0";
import { appelEbay, type EbayEnv } from "./ebay-oauth.ts";
import { valeurDeListeCorrespondante } from "./texte-comparable.ts";
import { resoudreAspectsIA, estAspectDeTaille, tailleRetenueDansLaListe, tailleSansPrefixeEuFr, type AspectDemande, type ContexteArticle } from "./ebay-aspects-ia.ts";
// (25/10, N5) tailleSansPrefixeEuFr vit désormais dans ebay-aspects-ia.ts (même corps) : la réponse de l'IA
// sur une taille passe par la même lecture. Réexportée ici pour ses appelants d'avant.
export { tailleSansPrefixeEuFr };
import { estSansMarque } from "./marque-absente.js";
import { tailleDeService, brancheDeTaille } from "./taille-de-service.js";
// (30/10, lot E) La matière d'un vêtement = la composition de son étiquette, jamais une matière devinée.
import { matieresDeLaComposition } from "./composition-matieres.js";

export const MARKETPLACE = "EBAY_FR";
export const ARBRE_FR = "71";

// ── Erreurs eBay REST : premier message lisible + errorId ───────────────────
export interface ErreurEbay {
  errorId: number | null;
  message: string;
  parametres?: string;
  params?: Array<{ name: string; value: string }>;
  /** Le CORPS BRUT de la réponse eBay, tronqué (2026-09-10). Jusqu'ici
   *  lireErreurEbay ne gardait que `errors[0]` et ses `parameters` : une URL de
   *  redirection, une seconde entrée d'`errors` ou un champ de premier niveau
   *  étaient JETÉS sans que personne le sache — c'est précisément ce qui a
   *  empêché de répondre « eBay donne-t-il un lien vers la vérification ? » sur
   *  le refus KYC de Victor. Il part dans `last_diagnostic.brut`, jamais à
   *  l'écran : c'est de la matière d'enquête, pas un message. */
  brut?: string;
}

/** Le corps brut, tronqué à 2 000 caractères : `texte` quand il existe (c'est
 *  la réponse telle qu'eBay l'a écrite), sinon la re-sérialisation du json. */
function brutEbay(texte: string, json: unknown): string | undefined {
  const t = texte && texte.trim() ? texte : (json == null ? "" : JSON.stringify(json));
  return t ? t.slice(0, 2000) : undefined;
}
export function lireErreurEbay(json: unknown, texte: string): ErreurEbay {
  const errs = (json as { errors?: Array<{ errorId?: number; message?: string; longMessage?: string; parameters?: Array<{ name?: string; value?: string }> }> } | null)?.errors;
  if (Array.isArray(errs) && errs.length) {
    const e = errs[0];
    const params = (e.parameters ?? []).map((p) => `${p.name ?? "?"}=${p.value ?? ""}`).join(", ");
    return { errorId: e.errorId ?? null, message: String(e.longMessage ?? e.message ?? "").slice(0, 400), parametres: params || undefined, params: (e.parameters ?? []).map((p) => ({ name: String(p.name ?? ""), value: String(p.value ?? "") })), brut: brutEbay(texte, json) };
  }
  const warns = (json as { warnings?: Array<{ message?: string }> } | null)?.warnings;
  if (Array.isArray(warns) && warns.length) return { errorId: null, message: String(warns[0].message ?? "").slice(0, 400), brut: brutEbay(texte, json) };
  return { errorId: null, message: texte.slice(0, 300), brut: brutEbay(texte, json) };
}

/** (17/10, Fluxen) Refus 25002 « Spécifiez des conditions de retour valides »
 *  avec le paramètre ReturnsAcceptedOption : eBay refuse « Pas de retour » pour
 *  CE compte (vendeur professionnel : les retours sont obligatoires). Relevé sur
 *  pièce : job b731ae0f du 15/10, politique « Pas de retour » créée par FillSell,
 *  quatre refus identiques à la mise en ligne. Les comptes particuliers publient
 *  avec la même politique (7 comptes, 20 annonces) : c'est le compte, pas le corps. */
export function refusRetoursObligatoires(e: ErreurEbay): boolean {
  if (Number(e.errorId) !== 25002) return false;
  return (e.params ?? []).some((p) => String(p.value ?? "").trim() === "ReturnsAcceptedOption");
}

// ── (18/10, lot 3 — sebimsn10) eBAY EXIGE UN EAN ─────────────────────────────
// Refus 25002 à la mise en ligne, relevé sur pièce (3 jobs du 18/10, catégories
// 41510 « Tableau d'affichage » et 108161 « Leurres de surface ») :
//   parameters = [0 « Le champ EAN n'a pas été renseigné. », 1 « … Ajoutez EAN à
//   l'annonce et réessayez. », 2 « 1 », 3 « EAN »].
// LA RÈGLE : l'EAN de la fiche s'il est LISIBLE (8 ou 13 chiffres, clé de
// contrôle juste — un ISBN-13 EST un EAN-13), sinon « Ne s'applique pas » (la
// valeur qu'eBay accepte déjà pour le MPN : 10 annonces publiées ainsi). Envoyé
// SEULEMENT après qu'eBay l'a exigé pour ce job (marque ebay_api.ean_non_applicable) :
// un identifiant produit peut faire rapprocher l'annonce du catalogue d'eBay,
// on ne l'ajoute pas aux autres. UNE nouvelle publication ; un second refus EAN
// = la question (le seul vrai geste : les chiffres sous le code-barres).
// (18/10, preuve réelle) eBay a REFUSÉ « Ne s'applique pas » pour l'EAN (3 jobs de sebimsn10, 12:33-12:35) :
// valable pour le MPN (texte libre), pas pour un identifiant produit. Le texte officiel d'eBay France pour un
// produit sans identifiant est « Non applicable » (developer.ebay.com, « product identifier text », France ;
// ProductDetails.ProductIdentifierUnavailableText de GeteBayDetails).
export const EAN_SANS_IDENTIFIANT_EBAY_FR = "Non applicable";
/** @deprecated (18/10) refusé par eBay pour l'EAN — gardé pour reconnaître les marques posées avant. */
export const EAN_NE_S_APPLIQUE_PAS = "Ne s'applique pas";
/** La marque d'une relance EAN : a-t-elle déjà essayé le texte officiel ? (sinon, une relance de plus est due) */
export function eanDejaEssayeOfficiel(pf: Record<string, unknown>): boolean {
  const api = (pf.ebay_api && typeof pf.ebay_api === "object") ? pf.ebay_api as Record<string, unknown> : {};
  const m = (api.ean_non_applicable && typeof api.ean_non_applicable === "object") ? api.ean_non_applicable as Record<string, unknown> : null;
  return Boolean(m) && m!.valeur === EAN_SANS_IDENTIFIANT_EBAY_FR;
}
export const SOURCE_QUESTION_EAN = "ebay_api_worker_ean";

export function refusEanRequis(e: ErreurEbay): boolean {
  if (Number(e.errorId) !== 25002) return false;
  return (e.params ?? []).some((p) => String(p.value ?? "").trim().toUpperCase() === "EAN");
}

/** Un EAN lisible (EAN-8 ou EAN-13, clé de contrôle juste), sinon null. */
export function eanValide(v: unknown): string | null {
  const t = String(v ?? "").replace(/[\s-]/g, "");
  if (!/^(\d{8}|\d{13})$/.test(t)) return null;
  const chiffres = t.split("").map(Number);
  const cle = chiffres.pop() as number;
  // Poids 3 / 1 en partant de la droite (hors clé), pour EAN-8 comme EAN-13.
  const somme = chiffres.reverse().reduce((s, c, i) => s + c * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (somme % 10)) % 10 === cle ? t : null;
}

/** L'EAN à joindre au produit : null tant qu'eBay ne l'a pas exigé pour ce job. */
export function eanAEnvoyer(pf: Record<string, unknown>): { valeur: string; source: "fiche" | "defaut" } | null {
  const api = (pf.ebay_api && typeof pf.ebay_api === "object") ? pf.ebay_api as Record<string, unknown> : {};
  if (!api.ean_non_applicable) return null;
  const aspects = (pf.ebayAspects && typeof pf.ebayAspects === "object") ? pf.ebayAspects as Record<string, unknown> : {};
  for (const v of [aspects["EAN"], pf.ean, pf.gtin, pf.isbn]) {
    const e = eanValide(v);
    if (e) return { valeur: e, source: "fiche" };
  }
  return { valeur: EAN_SANS_IDENTIFIANT_EBAY_FR, source: "defaut" };
}

/** L'aspect et la valeur d'un refus 25129 (« no longer support custom values
 *  for <aspect> »), lus SANS se fier à la position des paramètres.
 *  30/09, patrick.giry07 : eBay rend 0 = « Saisissez une valeur valide pour
 *  Taille. », 1 = « 38 n'est pas une valeur valide pour Taille. […] »,
 *  2 = « 500 », 3 = « Taille », 4 = « 38 ». Le worker lisait l'aspect en « 2 »
 *  (format relevé le 06/09) : il cherchait « 500 », ne trouvait rien, et
 *  rendait le refus brut au lieu de la liste d'eBay — trois relances, trois
 *  refus identiques. On retient donc le premier candidat qui est un VRAI nom
 *  d'aspect de la catégorie ; la valeur refusée se lit d'abord dans la phrase
 *  « X n'est pas une valeur valide pour <aspect> », puis dans les paramètres
 *  restants — jamais le nom de l'aspect lui-même. */
export function lireRefus25129(e: ErreurEbay, nomsAspects: string[]): { nomAspect: string; valeurRefusee: string } {
  const val = (n: string) => String((e.params ?? []).find((p) => p.name === n)?.value ?? "").trim();
  const noms = new Set(nomsAspects);
  const pour = (s: string) => (s.match(/pour\s+(.+?)\.?$/)?.[1] ?? "").trim();
  const candidatsNom = [
    val("3"), val("2"),
    pour(val("0")),
    pour(val("1").split(".")[0] ?? ""),
    (String(e.message ?? "").match(/custom values for\s+(.+?)\./)?.[1] ?? "").trim(),
  ].filter(Boolean);
  const nomAspect = candidatsNom.find((c) => noms.has(c)) ?? "";
  if (!nomAspect) return { nomAspect: "", valeurRefusee: "" };
  // Sinon : le paramètre qui SUIT celui qui porte le nom (06/09 : 2 → 3 ;
  // 30/09 : 3 → 4).
  const phrase = (val("1").match(/^(.+?) n'est pas une valeur valide pour /)?.[1] ?? "").trim();
  const cle = ["3", "2"].find((k) => val(k) === nomAspect);
  const suivant = cle ? val(String(Number(cle) + 1)) : "";
  return { nomAspect, valeurRefusee: phrase || (suivant !== nomAspect ? suivant : "") };
}

// ══════════════════════════════════════════════════════════════════════════
// LE VRAI MOTIF D'UN REFUS eBAY — 2026-09-10, costume Hugo Boss de Victor
// ══════════════════════════════════════════════════════════════════════════
// CE QUI S'EST PASSÉ : refus 400 / errorId 25019 sur une première publication.
// `longMessage` d'eBay, que nous relayions tel quel, dit :
//   « Impossible de modifier l'annonce. […] Il est possible que le titre ou la
//     description contienne des mots inappropriés ou que le vendeur enfreigne
//     le règlement d'eBay. »
// C'est un texte-parapluie, et il ACCUSE l'utilisateur. Le vrai motif était
// dans `parameters` :
//   parameters[2] = « KYC_DSAReq_EUB2C_SYI »
//   parameters[1] = « Nous avons toujours besoin de vérifier vos informations.
//                     […] seuls les vendeurs vérifiés peuvent mettre des
//                     objets en vente. […] »
// C'est la vérification d'identité vendeur (DSA / B2C européen). Le titre, la
// description et l'article n'y sont pour rien.
//
// LA RÈGLE POSÉE ICI, VOLONTAIREMENT GÉNÉRALE : dès qu'eBay joint un code de
// motif dans `parameters`, ce code fait FOI contre le `longMessage`. Mesure du
// 10/09 : sur 90 jours, ce refus est le SEUL de la voie API (1 occurrence,
// aucun autre errorId), donc aucun autre code n'a pu être relevé sur pièce —
// on ne nomme donc QUE celui qu'on a vu, et tout code inconnu retombe sur la
// PHRASE d'eBay (parameters, en clair) plutôt que sur son texte-parapluie.
// Jamais l'inverse : on n'invente pas un diagnostic pour un code qu'on ne
// connaît pas, on cite eBay mot pour mot.
//
// ⛔ Aucun de ces motifs ne se règle dans l'app : `champ` reste null, donc
// aucun needsUserField n'est posé et l'app n'affiche AUCUN bouton
// « Compléter » (règle du 10/09 : un bouton n'existe que s'il ouvre quelque
// chose). Le message dit où aller et ce que ça débloque.

/** Un code de motif eBay : au moins 3 segments soudés par « _ »
 *  (KYC_DSAReq_EUB2C_SYI). Assez strict pour ne jamais attraper un mot ni une
 *  phrase — un texte contient des espaces, ce motif n'en accepte aucun. */
const CODE_MOTIF_EBAY_RE = /^[A-Za-z][A-Za-z0-9]*(?:_[A-Za-z0-9]+){2,}$/;

/** Motifs NOMMÉS : uniquement ceux relevés sur un vrai refus, avec notre
 *  propre phrase. Tout le reste passe par la phrase d'eBay. */
const MOTIFS_EBAY_NOMMES: Array<{ re: RegExp; fr: string }> = [
  {
    // KYC_DSAReq_EUB2C_SYI (relevé 10/09). Le préfixe KYC_ couvre la famille
    // « vérification du vendeur » : même cause, même geste, même impuissance
    // de notre côté quel que soit le suffixe.
    re: /^KYC_/i,
    fr: "eBay demande de vérifier ton identité de vendeur avant d'autoriser une mise en vente "
      + "(obligation européenne). C'est à faire une seule fois, directement sur eBay — nous ne "
      + "pouvons pas le faire à ta place, et cela ne vient ni de ton article ni de ton annonce. "
      + "Une fois la vérification faite, relance la publication.",
  },
];

/** Entités HTML rencontrées dans les `parameters` d'eBay (il y sert du texte
 *  HTML : « v&eacute;rifier », « <font …> »). Liste FERMÉE + entités
 *  numériques : on ne construit pas un décodeur général pour trois accents. */
const ENTITES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ",
  eacute: "é", egrave: "è", ecirc: "ê", agrave: "à", acirc: "â", ccedil: "ç",
  ocirc: "ô", ugrave: "ù", ucirc: "û", icirc: "î", iuml: "ï", euml: "ë",
};
function enClair(s: string): string {
  return String(s ?? "")
    .replace(/<[^>]*>/g, " ")                                   // <font …>, <br>…
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITES[String(n).toLowerCase()] ?? m)
    .replace(/\s+/g, " ")
    .trim();
}

export interface MotifEbay {
  /** Le code technique d'eBay, pour la base et les rapports. */
  code: string | null;
  /** Ce qu'on AFFICHE à l'utilisateur — jamais un texte qui l'accuse à tort. */
  message: string;
  /** true = motif nommé par nous ; false = phrase d'eBay citée telle quelle. */
  nomme: boolean;
}

/**
 * Le vrai motif d'un refus, quand eBay en joint un — sinon `null` et
 * l'appelant garde son comportement d'origine (message générique + détail).
 */
export function motifReelEbay(e: ErreurEbay): MotifEbay | null {
  const params = (e.params ?? []).map((p) => String(p.value ?? "")).filter(Boolean);
  if (!params.length) return null;

  const code = params.find((v) => CODE_MOTIF_EBAY_RE.test(v.trim()))?.trim() ?? null;
  if (code) {
    const nomme = MOTIFS_EBAY_NOMMES.find((m) => m.re.test(code));
    if (nomme) return { code, message: nomme.fr, nomme: true };
  }

  // Code inconnu (ou absent) : la PHRASE d'eBay, en clair, plutôt que son
  // texte-parapluie. On retient la plus longue — les `parameters` servent la
  // même phrase en HTML et en clair, et la version longue est la complète.
  const phrase = params
    .map(enClair)
    .filter((t) => t.length >= 40 && /\s/.test(t) && !CODE_MOTIF_EBAY_RE.test(t))
    .sort((a, b) => b.length - a.length)[0];
  if (!phrase) return null;

  return {
    code,
    message: `eBay a refusé la publication. Son motif, mot pour mot : « ${phrase.slice(0, 320)} »`,
    nomme: false,
  };
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

// `descripteurs` (24/09, cartes à collectionner) : certaines conditions
// exigent des descripteurs — « Non gradée » (4000) demande l'état de la carte
// (descripteur 40001). Lus dans la même réponse Metadata, défensivement :
// absents → [] et rien ne change.
export interface DescripteurCondition { id: string; nom: string; requis: boolean; valeurs: Array<{ id: string; nom: string }>; }
export interface ConditionCategorie { id: string; libelle: string; descripteurs?: DescripteurCondition[]; }
const cacheConditions = new Map<string, ConditionCategorie[]>();

export async function conditionsCategorie(env: EbayEnv, token: string, categoryId: string): Promise<ConditionCategorie[] | null> {
  const enCache = cacheConditions.get(categoryId);
  if (enCache) return enCache;
  const r = await appelEbay(env, token, `/sell/metadata/v1/marketplace/${MARKETPLACE}/get_item_condition_policies?filter=categoryIds:%7B${encodeURIComponent(categoryId)}%7D`);
  if (r.http !== 200 || !r.json) return null;
  // deno-lint-ignore no-explicit-any
  const pol = (r.json as { itemConditionPolicies?: Array<{ categoryId?: string; itemConditions?: Array<Record<string, any>> }> }).itemConditionPolicies?.[0];
  if (!pol?.itemConditions?.length) return null;
  // deno-lint-ignore no-explicit-any
  const tableau = (x: any): Array<Record<string, any>> => (Array.isArray(x) ? x : []);
  const liste: ConditionCategorie[] = pol.itemConditions.map((c) => ({
    id: String(c.conditionId ?? ""),
    libelle: String(c.conditionDescription ?? ""),
    descripteurs: tableau(c.conditionDescriptors).map((d) => ({
      id: String(d.conditionDescriptorId ?? ""),
      nom: String(d.conditionDescriptorName ?? ""),
      requis: String(d.conditionDescriptorConstraint?.usage ?? "").toUpperCase() === "REQUIRED",
      valeurs: tableau(d.conditionDescriptorValues)
        .map((v) => ({ id: String(v.conditionDescriptorValueId ?? ""), nom: String(v.conditionDescriptorValueName ?? "") }))
        .filter((v) => v.id),
    })).filter((d) => d.id),
  })).filter((c) => c.id);
  cacheConditions.set(categoryId, liste);
  return liste;
}

export function choisirCondition(etat: string | null | undefined, conditions: ConditionCategorie[] | null): { id: string; enumValue: string; libelle: string; descripteurs: DescripteurCondition[] } | null {
  const e = String(etat ?? "").trim();
  let candidats: string[] = ["3000", "4000", "5000", "2990", "3010"];
  for (const [re, ids] of PREFERENCES_ETAT) { if (re.test(e)) { candidats = ids; break; } }
  const autorises = conditions ? new Set(conditions.map((c) => c.id)) : null;
  const rendre = (id: string) => {
    const enumValue = CONDITION_ENUM_PAR_ID[id];
    if (!enumValue) return null;
    const c = conditions?.find((x) => x.id === id);
    return { id, enumValue, libelle: c?.libelle ?? "", descripteurs: c?.descripteurs ?? [] };
  };
  // ── CARTES À COLLECTIONNER : « NON GRADÉE » D'ABORD (24/09, Tech-t dbdbd423) ──
  // Le rayon « Cartes à l'unité » (183050) ne propose que Gradée, Occasion et
  // Non gradée. « Non gradée » ne dit rien de l'usure : elle dit seulement
  // que la carte n'a pas été notée par un organisme — vrai de toute carte
  // qu'on n'a pas fait noter, neuve comprise. L'usure part dans le
  // descripteur « état de la carte » (descripteursCondition), jamais meilleur
  // que l'article. « Gradée » n'est JAMAIS choisie : elle affirmerait une
  // notation qui n'existe pas.
  const nonGradee = conditions?.find((c) => /non\s*grad|ungraded/i.test(c.libelle));
  if (nonGradee && autorises?.has(nonGradee.id)) {
    const r = rendre(nonGradee.id);
    if (r) return r;
  }
  for (const id of candidats) {
    if (autorises && !autorises.has(id)) continue;
    const r = rendre(id);
    if (r) return r;
  }
  return null;
}

// ── LES DESCRIPTEURS D'UNE CONDITION (24/09) ─────────────────────────────────
// Descripteur REQUIS → la réponse déjà donnée par la personne
// (pf.ebayAspects[<nom du descripteur>]) ; sinon une valeur déduite de l'état
// de l'article, JAMAIS meilleure que lui ; sinon `manquant` → question.
// « État de la carte » (40001, cartes non gradées) : ids eBay documentés
// 400010 quasi neuf ou mieux · 400011 excellent · 400012 très bon · 400013
// mauvais, rapprochés aussi par le libellé pour ne dépendre d'aucun des deux
// seuls. Un descripteur requis qu'on ne sait pas lire n'est JAMAIS deviné.
const ETAT_CARTE: Array<[RegExp, string, RegExp]> = [
  [/^neuf/i, "400010", /near\s*mint|quasi[\s-]*neuf|comme\s*neuf/i],
  [/tr[eè]s\s*bon/i, "400011", /excellent/i],
  [/^bon/i, "400012", /very\s*good|tr[eè]s\s*bon/i],
  [/satisf|correct|us[ée]/i, "400013", /poor|mauvais|ab[iî]m/i],
];
export function descripteursCondition(
  etat: string | null | undefined,
  condition: { descripteurs?: DescripteurCondition[] } | null,
  reponses: Record<string, unknown> = {},
): { descripteurs: Array<{ name: string; values: string[] }>; manquant: DescripteurCondition | null } {
  const e = String(etat ?? "").trim();
  const out: Array<{ name: string; values: string[] }> = [];
  for (const d of condition?.descripteurs ?? []) {
    if (!d.requis) continue;
    const repondu = String(reponses[d.nom] ?? reponses[d.id] ?? "").trim().toLowerCase();
    let valeur = repondu ? (d.valeurs.find((v) => v.nom.toLowerCase() === repondu || v.id === repondu) ?? null) : null;
    if (!valeur && (d.id === "40001" || /carte|card/i.test(d.nom))) {
      const regle = ETAT_CARTE.find(([re]) => re.test(e));
      if (regle) valeur = d.valeurs.find((v) => v.id === regle[1]) ?? d.valeurs.find((v) => regle[2].test(v.nom)) ?? null;
    }
    if (!valeur) return { descripteurs: out, manquant: d };
    out.push({ name: d.id, values: [valeur.id] });
  }
  return { descripteurs: out, manquant: null };
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
  // 07/09/2026 (lot de 24 DVD d'Ornella) : true = le texte de l'article
  // désigne un support vidéo/audio/jeu (estSupportNonLivre, _shared/
  // support-non-livre.ts). Posé par le worker AVANT toute règle « livre » :
  // la famille Lens `livres_medias` n'est PAS un synonyme de « livre ».
  support_non_livre?: boolean | null;
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
// (04/10, Louis) Absence de marque = liste FERMÉE, égalité exacte
// (_shared/marque-absente.js) : l'ancienne regex non ancrée prenait
// « Generic Surplus » pour une absence de marque.
const VALEUR_NE_S_APPLIQUE_PAS = "Ne s'applique pas";
// ⚠️ 07/09/2026 : la famille Lens `livres_medias` porte AUSSI les DVD, CD,
// vinyles et jeux vidéo — elle ne vaut « livre » que si le SUPPORT n'est pas
// un média (pf.support_non_livre, posé par le worker depuis le titre). Garde
// dormante jusqu'ici (famille jamais écrite sur un job) que le lot 2
// (attributs.famille écrit par le scan Lens) aurait réveillée à tort.
function estLivre(pf: PlatformFields): boolean {
  if (pf.support_non_livre === true) return false;
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
// ── LES ALIAS MODE, UNE SEULE DOCTRINE POUR LES DEUX VOIES (2026-09-25) ─────
// Ornella, « Parka C.P.E. Classic Club » (job c0ace243, catégorie 57988) :
// needs_user « eBay exige encore : Matière doublure externe » APRÈS l'envoi,
// alors que le job portait matiere = « Polyester » dès sa création — le
// stepper l'avait vérifié (gardeAspectsEbay, src/publication/moteur/regles.js,
// qui range « Matière doublure externe » dans la famille Matière, comme
// ebay.js). Le worker, lui, ne connaissait que « Matière » au mot près :
// l'aspect partait à l'IA, qui ne trouvait rien, et la personne recevait une
// question dont la réponse était déjà sur le job.
// La famille Matière ci-dessous est EXACTEMENT celle de regles.js
// (knownAspects) et d'ebay.js : même valeur, même champ. La valeur du job
// prime toujours (ebayAspects, lu en premier) ; ceci ne comble que le vide.
// ⛔ Couleur (« … de la monture », « … extérieure ») et Pointure NE SONT PAS
//    ajoutées : mesuré sur 30 j de la voie API, l'IA les a trouvées 5 fois
//    sur 5 — on ne touche pas à ce qui marche. La Matière : 1 échec sur 8
//    (celui d'Ornella), c'est elle qu'on répare.
const ALIAS_MATIERE = ["Matériau", "Matériaux", "Matière de la couche extérieure", "Matière doublure externe", "Matière extérieure"];
const CHAMP_PAR_ASPECT: Record<string, string> = {
  "Marque": "marque", "Taille": "taille", "Couleur": "couleur", "Matière": "matiere", "Modèle": "modele",
  "Capacité de stockage": "stockage", "ISBN": "isbn",
  ...Object.fromEntries(ALIAS_MATIERE.map((n) => [n, "matiere"])),
};
// ── TAILLE « EU 42 » / « FR 42 » : LE PRÉFIXE QUE LA LISTE eBay N'ÉCRIT PAS
// (2026-10-01, tessy.galy d07f4c9e) — tailleSansPrefixeEuFr, déplacée le 25/10
// dans ebay-aspects-ia.ts avec son explication (importée et réexportée plus haut).
// ── (06/10 soir) LA TAILLE QUE LA LISTE eBay N'ÉCRIT PAS AUTREMENT ────────
// patrick giry, jean « W28 L32 », catégorie 11554 : la liste fermée porte « 38 »
// (Femme) — refus 25129 puis question. _shared/taille-de-service.js, APRÈS le
// recalage d'avant (texte, préfixe EU/FR) : tour de taille → FR (table publiée
// par Vinted), nombre français → lettre pour une femme face à une liste sans
// chiffre, stature entre parenthèses, « Ajustable ». Sur une liste fermée
// seulement ; la branche vient du Département, du genre ou du rayon.
export function tailleServieEbay(nomAspect: string, brut: string, liste: string[], pf: PlatformFields, ebayAspects: Record<string, unknown>): string | null {
  if (!/taille|pointure/i.test(nomAspect)) return null;
  const branche = brancheDeTaille(String(ebayAspects["Département"] ?? ""), String(pf.genre ?? ""),
    Array.isArray(pf.ebayCategoryPath) ? pf.ebayCategoryPath : []);
  return tailleDeService(brut, liste, { branche })?.valeur ?? null;
}
// ── (25/10, N5) LA TAILLE eBAY : LA PERSONNE, LA FICHE, PUIS LA LISTE — JAMAIS UN MOT DU TITRE ──
// Jobs 98f71143, 1ff48d68, 8d831cf5, c65b3e36, 12854dbb : ebayAspects.Taille portait la réponse de l'IA
// (« Classic Fit », « Col rond », « Jupe courte », « Veste de ski »), lue AVANT pf.taille et envoyée telle
// quelle en texte libre (Taxonomy dit FREE_TEXT) — refus 25129, puis question ; trois fois, la fiche portait
// déjà la bonne taille. Pour un aspect de taille (estAspectDeTaille, nom exact), DANS CET ORDRE :
//   1. la réponse de la personne (clé ebayAspects.<aspect> de needsUserResolved, comme ebay.js) : la règle
//      d'aujourd'hui, à l'identique ;
//   2. la taille de la fiche (pf.taille), passée par la règle des tailles sur la liste, QUEL QUE SOIT LE MODE ;
//   3. une autre valeur du job (IA, app) : retenue seulement si la liste l'écrit ou que la règle des tailles
//      l'y place, « Taille unique » seulement si la fiche ou son texte le disent (tailleRetenueDansLaListe) ;
//   4. sinon : la taille de la fiche hors liste garde la règle d'aujourd'hui (texte libre : envoyée telle
//      quelle — « EU 39 » passe, rejeu du 01/10 ; liste fermée : manquant), et sans elle, manquant — la
//      question part, avec la liste, AVANT tout appel eBay.
// Préfixe EU/FR (règle du 01/10) sur liste fermée seulement pour la fiche et la personne (inchangé) ; une
// valeur de l'IA, elle, n'est jamais qu'une entrée de la liste.
function tailleAssemblee(
  a: AspectCatalogue, pf: PlatformFields, ebayAspects: Record<string, unknown>, fiche: string, textes: unknown[],
): { valeur: string; deQui: "personne" | "fiche" | "autre"; brut: string } | null {
  const liste = a.allowedValues;
  const ferme = a.mode === "SELECTION_ONLY";
  const regleDuJour = (brut: string): string | null => liste.length
    ? (valeurDeListeCorrespondante(brut, liste)
      ?? (ferme ? (tailleSansPrefixeEuFr(a.name, brut, liste) ?? tailleServieEbay(a.name, brut, liste, pf, ebayAspects)) : null))
    : null;
  const resolus = (pf.needsUserResolved && typeof pf.needsUserResolved === "object") ? pf.needsUserResolved as Record<string, unknown> : {};
  const duJob = String(ebayAspects[a.name] ?? "").trim();
  // 1. La personne.
  if (duJob && Object.prototype.hasOwnProperty.call(resolus, `ebayAspects.${a.name}`)) {
    const r = regleDuJour(duJob);
    if (r) return { valeur: r, deQui: "personne", brut: duJob };
    return ferme ? null : { valeur: duJob, deQui: "personne", brut: duJob };
  }
  // 2. La fiche, quel que soit le mode.
  if (fiche) {
    const r = liste.length
      ? (valeurDeListeCorrespondante(fiche, liste)
        ?? (ferme ? tailleSansPrefixeEuFr(a.name, fiche, liste) : null)
        ?? tailleServieEbay(a.name, fiche, liste, pf, ebayAspects))
      : null;
    if (r) return { valeur: r, deQui: "fiche", brut: fiche };
  }
  // 3. Une autre valeur du job : la liste seulement.
  if (duJob) {
    const branche = brancheDeTaille(String(ebayAspects["Département"] ?? ""), String(pf.genre ?? ""),
      Array.isArray(pf.ebayCategoryPath) ? pf.ebayCategoryPath : []);
    const t = tailleRetenueDansLaListe(a.name, duJob, liste, { taille: fiche, textes, branche });
    if ("valeur" in t) return { valeur: t.valeur, deQui: "autre", brut: duJob };
  }
  // 4. La fiche hors liste : la règle d'aujourd'hui ; sinon, la question.
  if (fiche && !ferme) return { valeur: fiche, deQui: "fiche", brut: fiche };
  return null;
}
// ── (30/10, lot E) LES CARACTÉRISTIQUES QUE LA FICHE CONNAÎT PARTENT, MÊME QUAND eBAY NE LES EXIGE PAS ──
// thecloset72000 : « caractéristiques essentielles » vides sur ses annonces eBay. La voie API ne remplissait que les
// aspects OBLIGATOIRES (`if (!a.required …) continue`) : Matière, Saison, Coupe, Département… restaient vides même
// quand la fiche ou l'analyse les avaient LUS. Désormais un aspect facultatif part quand sa valeur est CONNUE (la
// fiche, l'analyse — ce qu'elle a lu sur l'article —, le rayon), jamais par un défaut ni par l'IA ; une liste fermée
// n'accepte qu'une de ses entrées ; sinon il reste vide, sans question.
// Les clés de l'analyse (attributs_visibles, lens-analysis : valeurs LUES seulement) → les aspects eBay.
const ASPECTS_DEPUIS_ANALYSE: Record<string, string> = {
  "Saison": "saison", "Coupe": "coupe", "Pointure": "pointure", "Matériau": "materiau", "Matériaux": "materiau",
  "Numéro de pièce fabricant": "reference_fabricant",
};
function valeurDeLAnalyse(pf: PlatformFields, cle: string): string {
  const av = (pf.attributs_visibles && typeof pf.attributs_visibles === "object") ? pf.attributs_visibles as Record<string, unknown> : {};
  const v = av[cle];
  const s = typeof v === "string" ? v.trim() : (typeof v === "number" ? String(v) : "");
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : "";
}
// La matière : la fiche, sinon la composition lue sur l'étiquette — la première matière (la plus forte part).
function matiereConnue(pf: PlatformFields): string {
  const brute = String(pf.matiere ?? "").trim() || valeurDeLAnalyse(pf, "composition");
  const liste = matieresDeLaComposition(brute);
  return liste[0] ?? brute;
}
// Un aspect FACULTATIF : sa valeur connue, recalée sur la liste eBay ; liste fermée sans correspondance = rien.
// Jamais de défaut (« Ne s'applique pas », marque générique), jamais l'IA, jamais une question.
function aspectFacultatifConnu(
  a: AspectCatalogue, pf: PlatformFields, ebayAspects: Record<string, unknown>, standard: Record<string, string>, depRayon: string,
): { brut: string; recale: string; source: SourceAspect } | null {
  const attributsSources = (pf.attributsSources && typeof pf.attributsSources === "object") ? pf.attributsSources as Record<string, string> : {};
  const origine = attributsSources[CHAMP_PAR_ASPECT[a.name] ?? ""];
  let source: SourceAspect = origine === "lens" ? "lens" : origine === "attributs" ? "attributs" : "standard";
  let brut = "";
  if (estAspectDeTaille(a.name)) {
    const fiche = String(standard[a.name] ?? "").trim();
    if (!fiche) return null;
    const t = tailleAssemblee(a, pf, ebayAspects, fiche, []);
    return t && t.deQui === "fiche" ? { brut: t.brut, recale: t.valeur, source } : null;
  }
  if (a.name === "Département") {
    const g = String(pf.genre ?? "");
    const cands = depRayon ? [depRayon] : (["Femme", "Homme", "Fille", "Garçon", "Bébé"].includes(g) ? (DEPARTEMENT_PAR_GENRE[g] ?? []) : []);
    brut = cands.find((c) => valeurDeListeCorrespondante(c, a.allowedValues)) ?? cands[0] ?? "";
    source = "genre";
  } else if (a.name === "Numéro de pièce fabricant") {
    brut = valeurDeLAnalyse(pf, "reference_fabricant");
    source = "lens";
  } else if (a.name === "Marque") {
    brut = String(pf.marque ?? "").trim();
    if (estSansMarque(brut)) return null;
  } else {
    brut = String(standard[a.name] ?? "").trim();
    if (a.name in ASPECTS_DEPUIS_ANALYSE && !CHAMP_PAR_ASPECT[a.name]) source = "lens";
  }
  if (!brut || brut === VALEUR_NE_S_APPLIQUE_PAS) return null;
  const recale = a.allowedValues.length ? valeurDeListeCorrespondante(brut, a.allowedValues) : null;
  if (recale) return { brut, recale, source };
  if (a.mode === "SELECTION_ONLY") return null;
  return { brut, recale: brut, source };
}
// Le Département que le RAYON eBay nomme (« Femme : vêtements… », « Homme : … ») : il prime sur un genre deviné.
function departementDuRayon(pf: PlatformFields): string {
  const chemin = Array.isArray(pf.ebayCategoryPath) ? pf.ebayCategoryPath.map((s) => String(s ?? "")) : [];
  if (chemin.some((s) => /^femme\b/i.test(s))) return "Femme";
  if (chemin.some((s) => /^homme\b/i.test(s))) return "Homme";
  return "";
}
export function assemblerAspects(pf: PlatformFields, catalogue: AspectCatalogue[], textes: unknown[] = []): { aspects: Record<string, string[]>; manquants: string[]; recalages: string[]; sources: Record<string, SourceAspect> } {
  const aspects: Record<string, string[]> = {};
  const manquants: string[] = [];
  const recalages: string[] = [];
  const sources: Record<string, SourceAspect> = {};
  const sourcesIA = (pf.ebayAspectsSources && typeof pf.ebayAspectsSources === "object") ? pf.ebayAspectsSources as Record<string, string> : {};
  const attributsSources = (pf.attributsSources && typeof pf.attributsSources === "object") ? pf.attributsSources as Record<string, string> : {};
  const ebayAspects: Record<string, unknown> = { ...((pf.ebayAspects && typeof pf.ebayAspects === "object") ? pf.ebayAspects : {}) };
  // (30/10, lot E) Un Département contraire au rayon (« Homme » sur « Femme : vêtements ») ne part jamais.
  const depRayon = departementDuRayon(pf);
  if (depRayon && /^(femme|homme)$/i.test(String(ebayAspects["Département"] ?? "").trim())
    && String(ebayAspects["Département"]).trim().toLowerCase() !== depRayon.toLowerCase()) {
    recalages.push(`Département: « ${ebayAspects["Département"]} » → « ${depRayon} » (le rayon le nomme)`);
    delete ebayAspects["Département"];
  }
  const couleur = (Array.isArray(pf.colors) && pf.colors[0]) ? String(pf.colors[0]) : (pf.couleur ? String(pf.couleur) : "");
  const marqueBrute = String(pf.marque ?? "").trim();
  // Une vraie marque, d'où qu'elle vienne (aspect tranché, sinon la fiche).
  const marqueReelle = [ebayAspects["Marque"], marqueBrute].map((v) => String(v ?? "").trim()).find((v) => v && !estSansMarque(v)) ?? "";
  const marqueGenerique = !marqueReelle;
  const entreeGenerique = (liste: string[]) => liste.find((v) => /sans\s*marque|g[ée]n[ée]rique/i.test(v)) ?? "";
  const standard: Record<string, string> = {
    "Marque": marqueBrute,
    "Taille": String(pf.taille ?? ""),
    "Couleur": couleur,
    // (30/10, lot E) La matière : la fiche ou la composition de l'étiquette, première matière (cf. matiereConnue).
    "Matière": matiereConnue(pf),
    "Modèle": String(pf.modele ?? ""),
    "Capacité de stockage": String(pf.stockage ?? ""),
    "ISBN": String(pf.isbn ?? ""),
    // (30/10, lot E) La référence LUE sur l'article d'abord ; sinon le défaut d'avant (aspect obligatoire seulement).
    "Numéro de pièce fabricant": valeurDeLAnalyse(pf, "reference_fabricant") || "Ne s'applique pas",
    // Famille Matière (cf. ALIAS_MATIERE) — même valeur que regles.js.
    ...Object.fromEntries(ALIAS_MATIERE.map((n) => [n, matiereConnue(pf)])),
    // (30/10, lot E) Ce que l'analyse a LU sur l'article (saison, coupe, pointure, matériau…).
    ...Object.fromEntries(Object.entries(ASPECTS_DEPUIS_ANALYSE)
      .filter(([nom]) => nom !== "Numéro de pièce fabricant" && !ALIAS_MATIERE.includes(nom))
      .map(([nom, cle]) => [nom, valeurDeLAnalyse(pf, cle)])),
  };
  // Les matériaux d'un meuble ou d'un objet : lus par l'analyse quand la fiche n'a pas de matière.
  for (const nom of ["Matériau", "Matériaux"]) if (!standard[nom]) standard[nom] = valeurDeLAnalyse(pf, "materiau");
  for (const a of catalogue) {
    // (30/10, lot E) Un aspect facultatif part quand sa valeur est CONNUE (cf. plus haut) ; il n'est jamais demandé.
    if (!a.required && !(a.name in ebayAspects)) {
      const facultatif = aspectFacultatifConnu(a, pf, ebayAspects, standard, depRayon);
      if (facultatif) {
        if (facultatif.recale !== facultatif.brut) recalages.push(`${a.name}: « ${facultatif.brut} » → « ${facultatif.recale} »`);
        aspects[a.name] = [facultatif.recale];
        sources[a.name] = facultatif.source;
      }
      continue;
    }
    // Bretelle 07/09/2026 : un DVD / CD / jeu n'a pas d'ISBN — même si une
    // catégorie Livres a été posée par erreur, l'aspect n'est ni envoyé ni
    // compté manquant (jamais de « mur ISBN » sur un média).
    if (a.name === "ISBN" && pf.support_non_livre === true) continue;
    // (25/10, N5) Une taille : la personne, la fiche, puis la liste (tailleAssemblee).
    if (estAspectDeTaille(a.name)) {
      const t = tailleAssemblee(a, pf, ebayAspects as Record<string, unknown>, String(standard[a.name] ?? "").trim(), textes);
      if (!t) { if (a.required) manquants.push(a.name); continue; }
      const origine = attributsSources[CHAMP_PAR_ASPECT[a.name] ?? ""];
      const source: SourceAspect = t.deQui === "fiche"
        ? (origine === "lens" ? "lens" : origine === "attributs" ? "attributs" : "standard")
        : (sourcesIA[a.name] === "ia" ? "ia" : "job");
      if (t.valeur !== t.brut) recalages.push(`${a.name}: « ${t.brut} » → « ${t.valeur} »`);
      aspects[a.name] = [t.valeur]; sources[a.name] = source;
      continue;
    }
    let brut = String(ebayAspects[a.name] ?? "").trim();
    let source: SourceAspect = sourcesIA[a.name] === "ia" ? "ia" : "job";
    if (!brut && a.name === "Département") {
      // (30/10, lot E) Le rayon genré d'abord (« Femme : vêtements »), puis le genre de la fiche.
      const cands = depRayon ? [depRayon] : (DEPARTEMENT_PAR_GENRE[String(pf.genre ?? "")] ?? []);
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
    // ⛔ Jamais par-dessus une vraie marque : seule la valeur RETENUE compte
    // (avant le 04/10, une fiche sans marque écrasait un aspect « Nike »).
    if (a.name === "Marque" && (!brut || estSansMarque(brut))) { const g = entreeGenerique(a.allowedValues); if (g) { brut = g; source = "defaut"; } }
    if (a.name === "Modèle" && !brut && a.mode !== "SELECTION_ONLY" && (marqueGenerique || estLivre(pf))) { brut = VALEUR_NE_S_APPLIQUE_PAS; source = "defaut"; }
    if (!brut) { if (a.required) manquants.push(a.name); continue; }
    // Préfixe EU/FR retiré SEULEMENT sur une liste fermée (SELECTION_ONLY, ou
    // fermée après un refus 25129) : en saisie libre, « EU 39 » passe déjà
    // (rejeu du 01/10 : 1fba4dbf publiée ainsi) et ne doit pas changer.
    const recale = a.allowedValues.length
      ? (valeurDeListeCorrespondante(brut, a.allowedValues)
        ?? (a.mode === "SELECTION_ONLY"
          ? (tailleSansPrefixeEuFr(a.name, brut, a.allowedValues) ?? tailleServieEbay(a.name, brut, a.allowedValues, pf, ebayAspects as Record<string, unknown>))
          : null))
      : null;
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
  // (25/10, N5) Les textes de l'article : seuls juges, avec la fiche, d'une « Taille unique ».
  const textes = [contexte.titre, contexte.description];
  const premier = assemblerAspects(pf, catalogue, textes);
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
  let second = assemblerAspects(pf2, catalogue, textes);
  let obtenus = { ...ia.aspects };
  let refuses = [...ia.refuses];
  const demandesNoms = demandes.map((d) => d.name);
  // 2e passe : un aspect FREE_TEXT requis encore vide (ex. « Style » d'un
  // sweat, dont la liste eBay ne propose que des styles de pull) — eBay
  // accepte le texte libre, on demande le terme exact du contexte, sans liste.
  // (25/10, N5) Jamais une taille : eBay refuse sa valeur libre (25129), et « le
  // terme exact du contexte » y posait un mot du titre (« Veste de ski »).
  const libres = second.manquants
    .map((nom) => catalogue.find((c) => c.name === nom))
    .filter((c): c is AspectCatalogue => c !== undefined && c.mode !== "SELECTION_ONLY" && c.name !== "Marque" && !estAspectDeTaille(c.name))
    .map((c) => ({ name: c.name, mode: c.mode, allowedValues: c.allowedValues, libre: true }));
  if (libres.length) {
    const ia2 = await resoudreAspectsIA(libres, contexte, { apiKey, onUsage });
    if (Object.keys(ia2.aspects).length) {
      const pf3: PlatformFields = {
        ...pf2,
        ebayAspects: { ...((pf2.ebayAspects && typeof pf2.ebayAspects === "object") ? pf2.ebayAspects : {}), ...ia2.aspects },
        ebayAspectsSources: { ...((pf2.ebayAspectsSources as Record<string, string>) ?? {}), ...Object.fromEntries(Object.keys(ia2.aspects).map((k) => [k, "ia"])) },
      };
      second = assemblerAspects(pf3, catalogue, textes);
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

  // Adresse : ville + code postal. La rue n'est JAMAIS envoyée à eBay, seuls
  // ville, code postal et pays.
  // DEUX sources, dans cet ordre (07/09/2026) :
  //   1. platform_settings.ebay.adresse_expedition {code_postal, ville} —
  //      saisie EXPLICITEMENT dans l'écran « Compte eBay », pour les vendeurs
  //      qui n'ont pas d'adresse Leboncoin (2 048 comptes sur 2 150 au 07/09 :
  //      sans cette source, leur toute première publication API partait en
  //      needs_user « adresse ») ;
  //   2. l'adresse de remise Leboncoin, comme avant — aucune publication qui
  //      marche aujourd'hui ne change.
  // On ne devine JAMAIS : ni ville approchante, ni code postal complété.
  // Absente ou illisible → needs_user, et l'écran la demande.
  const { data: profil } = await admin.from("profiles").select("platform_settings").eq("id", userId).maybeSingle();
  const reglages = (profil?.platform_settings ?? null) as { ebay?: { adresse_expedition?: { code_postal?: string; ville?: string } }; leboncoin?: { adresse?: string } } | null;
  const propre = reglages?.ebay?.adresse_expedition ?? null;
  const cpPropre = String(propre?.code_postal ?? "").trim();
  const villePropre = String(propre?.ville ?? "").trim();
  let codePostal = "";
  let ville = "";
  if (/^\d{5}$/.test(cpPropre) && villePropre) {
    codePostal = cpPropre;
    ville = villePropre.replace(/\s+/g, " ");
  } else {
    const adresse = String(reglages?.leboncoin?.adresse ?? "");
    const m = adresse.match(/\b(\d{5})\b\s*(.+)$/);
    if (!m) return { manque: "adresse", detail: "aucune ville + code postal connus (adresse d'expédition eBay et adresse Leboncoin absentes ou illisibles)" };
    codePostal = m[1];
    ville = m[2].trim().replace(/\s+/g, " ");
  }

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
