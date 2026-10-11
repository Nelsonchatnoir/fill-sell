// ═══════════════════════════════════════════════════════════════════════════
// LA COULEUR NE BLOQUE JAMAIS, NE FAIT JAMAIS ABANDONNER (11/10/2026, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// « La couleur ne fait pas vendre, les gens la voient sur la photo. »
// Cas jakefawright (10/10) : figurine importée sans Lens (inventaire
// 1791662902637, Enfants > Jeux et jouets > Figurines), rédaction en texte
// seul (« null », la couleur n'est pas dans le texte), extraction IA en texte
// seul (null) → question « Couleur » → publication Vinted ABANDONNÉE.
// Mesure 18/09 → 11/10 : 174 lignes « couleur » / 13 comptes (Vinted 100,
// eBay 74), 6 abandons sur 3 articles — toute la friction est dans l'app
// (stepper ET lot, même moteur), avant la création du job. Deux causes de
// plus : 67 des 77 rayons Vinted où la couleur est exigée ne portaient que
// 20 couleurs sur 29 (relevé tronqué de l'extension), et les couleurs de Lens
// arrivaient en anglais (« Black ») sans traduction (utils/vintedColors.js).
//
// LA RÈGLE, À LA PUBLICATION (stepper et lot) :
//   · une plateforme exige une couleur (ligne Vinted `color` ; aspect eBay
//     « Couleur », « Couleur de la monture », « Couleur extérieure ») et sa
//     copie n'en porte AUCUNE après la passe texte ;
//   · couleur CONNUE (une copie, la fiche, Lens) → ramenée à la palette et
//     posée, sans IA ;
//   · sinon UN appel IA par article (generate-listing, resolve_couleur : la
//     PHOTO et le texte, une entrée de la liste donnée, contrôlée) ;
//   · l'IA échoue (pas de photo, erreur, > 6 s, hors liste) → « Multicolore »
//     (l'entrée « multi » de la liste eBay) — JAMAIS une question.
// GARDE-FOUS : jamais par-dessus une couleur présente (copie, fiche, retouchée
// par la personne) ; rien n'est écrit sur la fiche ; taille, marque et rayon
// ne bougent pas. Une couleur posée ici l'est UNE fois par (plateforme, rayon,
// champ) : vidée à la main, elle n'est pas reposée.
// À la REPUBLICATION : rien ne change — elle ne passe pas par ce moteur
// (spend_coins_and_republish, balayage serveur ; l'extension repose la
// couleur de l'annonce d'origine). Le filet serveur de get-pending-jobs
// (_shared/vinted-couleur-marque-filet.js) couvre les écrans d'avant.
//
// ES module pur : importé par ListingPreviewScreen (Vite) et par
// scripts/couleur-auto-selftest.mjs (Node).
import { VINTED_COLORS, normalizeVintedColors } from "../../utils/vintedColors.js";
import { EBAY_ASPECT_LABELS } from "./champsPartages.js";

export const COULEUR_REPLI = "Multicolore";
/** Au-delà, l'appel IA est abandonné : repli, jamais d'attente sans fin. */
export const DELAI_COULEUR_IA_MS = 6000;
/** Les aspects eBay qui portent la couleur de l'article. */
export const ASPECTS_COULEUR_EBAY = EBAY_ASPECT_LABELS.couleur;

const norme = (s) => String(s ?? "")
  .normalize("NFD").replace(/[̀-ͯ]/g, "")
  .replace(/[’`´]/g, "'")
  .toLowerCase().replace(/\s+/g, " ").trim();

/** L'entrée de `liste` qui s'écrit comme `valeur` (casse, accents), ou null. */
export function entreeDeListe(valeur, liste) {
  const n = norme(valeur);
  if (!n) return null;
  return (Array.isArray(liste) ? liste : []).find((v) => norme(v) === n) ?? null;
}

// ── (b) LA PALETTE VINTED COMPLÈTE, JAMAIS LE RELEVÉ TRONQUÉ ───────────────
// La palette Vinted est GLOBALE (29 libellés, relevée sur le formulaire le
// 07/09 — vintedColors.js) ; le catalogue platform_category_aspects n'en porte
// que 20 sur 67 rayons (doublons DOM coupés à 40 par l'extension). Toute ligne
// `color` de Vinted prend la palette entière, à l'écran comme pour l'IA.
export function avecPaletteVintedComplete(platform, rows) {
  if (platform !== "vinted" || !Array.isArray(rows)) return rows;
  return rows.map((r) => (r?.field_key === "color" ? { ...r, allowed_values: [...VINTED_COLORS] } : r));
}

// ── 1. LES COULEURS EXIGÉES ET VIDES ───────────────────────────────────────
/**
 * @param {object} p
 * @param {Record<string, Array<{key:string,state:string}>>|null} p.genericRequiredStatus
 * @param {Array<{name:string,state:string,allowedValues?:string[],mode?:string}>|null} p.ebayRequiredStatus
 * @param {Record<string,string>} [p.categories]  rayon courant par plateforme ({ vinted: "…", ebay: "63862" })
 * @param {Record<string, Set<string>>} [p.verrous]  sharedOverrides : une copie retouchée à la main pour `couleur`
 * @returns {Array<{platform:string,key:string,cle:string,liste:string[],mode:string|null}>}
 */
export function couleursExigeesVides({ genericRequiredStatus = null, ebayRequiredStatus = null, categories = {}, verrous = {} } = {}) {
  const out = [];
  const retouchee = (p) => Boolean(verrous?.[p]?.has?.("couleur"));
  for (const a of genericRequiredStatus?.vinted ?? []) {
    if (a?.key !== "color" || a.state !== "missing" || retouchee("vinted")) continue;
    out.push({ platform: "vinted", key: "color", cle: `vinted|${categories.vinted ?? ""}|color`, liste: [...VINTED_COLORS], mode: null });
  }
  for (const a of ebayRequiredStatus ?? []) {
    if (!ASPECTS_COULEUR_EBAY.includes(a?.name) || a.state !== "missing" || retouchee("ebay")) continue;
    out.push({
      platform: "ebay", key: a.name, cle: `ebay|${categories.ebay ?? ""}|${a.name}`,
      liste: (Array.isArray(a.allowedValues) ? a.allowedValues : []).map((v) => String(v).trim()).filter(Boolean),
      mode: a.mode ?? null,
    });
  }
  return out;
}

// ── 2. LA COULEUR CONNUE (copie, fiche, Lens), RAMENÉE À LA PALETTE ────────
const COPIES_ORDRE = ["vinted", "ebay", "beebs", "leboncoin", "opla", "depop"];
function couleursDeLaCopie(pf) {
  if (!pf || typeof pf !== "object") return [];
  const out = [pf.couleur, Array.isArray(pf.colors) ? pf.colors[0] : null, pf.vintedAspects?.color];
  for (const n of ASPECTS_COULEUR_EBAY) out.push(pf.ebayAspects?.[n]);
  out.push(pf.beebsAspects?.Couleur);
  return out;
}
const valeurAttribut = (attrs, cle) => {
  const e = attrs && typeof attrs === "object" ? attrs[cle] : null;
  if (!e) return "";
  return String(typeof e === "object" ? (e.v ?? "") : e).trim();
};

/**
 * La couleur que l'article porte déjà quelque part, ramenée à la palette
 * Vinted (le vocabulaire commun : « Black » → Noir, « Burgundy » → Bordeaux).
 * @returns {{ canon: string, source: "copie"|"fiche"|"lens", de: string } | null}
 */
export function couleurConnue({ copies = {}, partagee = null, ficheAttributs = null, lens = null } = {}) {
  const essais = [];
  for (const p of COPIES_ORDRE) for (const v of couleursDeLaCopie(copies?.[p]?.platform_fields)) essais.push([v, "copie"]);
  essais.push([partagee, "copie"]);
  essais.push([valeurAttribut(ficheAttributs, "couleur"), "fiche"]);
  essais.push([lens, "lens"]);
  for (const [brut, source] of essais) {
    const s = String(brut ?? "").trim();
    if (!s || s.length < 2) continue;
    const canon = normalizeVintedColors(s).colors[0];
    if (canon) return { canon, source, de: s };
  }
  return null;
}

// ── 3. LA CORRESPONDANCE PAR PLATEFORME ────────────────────────────────────
// Une couleur de la palette Vinted → l'entrée de la liste eBay qui la dit, la
// plus précise d'abord (« Marine » → « Bleu marine », sinon « Bleu »).
const FAMILLE_EBAY = {
  "Noir": ["Noir"],
  "Gris": ["Gris"],
  "Blanc": ["Blanc", "Ivoire"],
  "Crème": ["Crème", "Ivoire", "Beige", "Blanc"],
  "Beige": ["Beige", "Ivoire"],
  "Abricot": ["Abricot", "Orange"],
  "Orange": ["Orange"],
  "Corail": ["Corail", "Orange", "Rose"],
  "Rouge": ["Rouge"],
  "Bordeaux": ["Bordeaux", "Rouge"],
  "Fuchsia": ["Fuchsia", "Magenta", "Rose"],
  "Rose": ["Rose"],
  "Violet": ["Violet", "Violette"],
  "Lila": ["Lilas", "Lila", "Violet"],
  "Bleu clair": ["Bleu clair", "Bleu"],
  "Bleu": ["Bleu"],
  "Marine": ["Bleu marine", "Marine", "Bleu"],
  "Turquoise": ["Turquoise", "Bleu"],
  "Menthe": ["Menthe", "Vert"],
  "Vert": ["Vert"],
  "Vert foncé": ["Vert foncé", "Vert"],
  "Kaki": ["Kaki", "Olive", "Vert"],
  "Marron": ["Marron", "Brun"],
  "Moutarde": ["Moutarde", "Jaune"],
  "Jaune": ["Jaune"],
  "Argenté": ["Argenté", "Gris"],
  "Doré": ["Doré", "Jaune"],
  "Multicolore": ["Multicolore", "Multicouleur"],
  "Transparence": ["Transparent", "Translucide", "Transparence"],
};

/** L'entrée « plusieurs couleurs » d'une liste (« Multicolore », « Multicouleur »). */
const entreeMulti = (liste) => (Array.isArray(liste) ? liste : []).find((v) => /^multi\s*-?\s*(colou?re?|couleurs?)s?$/i.test(String(v).trim())) ?? null;

/**
 * La valeur que CETTE plateforme reçoit pour une couleur de la palette.
 * Vinted : la palette elle-même. eBay : l'entrée de sa liste ; une liste
 * libre (FREE_TEXT, ou vide) prend le libellé tel quel quand rien n'y
 * correspond ; une liste fermée sans correspondance → null.
 */
export function couleurPourPlateforme(canon, besoin) {
  const c = String(canon ?? "").trim();
  if (!c || !besoin) return null;
  if (besoin.platform === "vinted") return VINTED_COLORS.includes(c) ? c : (normalizeVintedColors(c).colors[0] ?? null);
  const liste = besoin.liste ?? [];
  if (!liste.length) return c;
  const exacte = entreeDeListe(c, liste);
  if (exacte) return exacte;
  for (const cand of FAMILLE_EBAY[c] ?? []) {
    const e = entreeDeListe(cand, liste);
    if (e) return e;
  }
  if (c === COULEUR_REPLI) { const m = entreeMulti(liste); if (m) return m; }
  return besoin.mode === "SELECTION_ONLY" ? null : c;
}

/** Le repli « plusieurs couleurs » de la plateforme : jamais une question. */
export function repliCouleur(besoin) {
  if (!besoin) return null;
  if (besoin.platform === "vinted") return COULEUR_REPLI;
  const m = entreeMulti(besoin.liste);
  if (m) return m;
  return besoin.mode === "SELECTION_ONLY" && (besoin.liste ?? []).length ? null : COULEUR_REPLI;
}

// ── 4. CE QU'ON DEMANDE À L'IA, ET CE QU'ON POSE ───────────────────────────
/** La liste envoyée à l'IA : la palette Vinted dès que Vinted est en jeu (la
 *  plus riche, et la correspondance vers eBay est sûre), sinon la liste eBay
 *  quand elle est une vraie liste (1 à 60 entrées), sinon la palette. */
export function listePourIa(besoins) {
  if ((besoins ?? []).some((b) => b.platform === "vinted")) return [...VINTED_COLORS];
  const e = (besoins ?? []).find((b) => b.platform === "ebay" && (b.liste?.length ?? 0) > 0 && b.liste.length <= 60);
  return e ? [...e.liste] : [...VINTED_COLORS];
}

/**
 * Ce qui se pose pour chaque besoin. `connue` (couleurConnue) passe d'abord,
 * puis la réponse de l'IA ({ valeur, source: "texte"|"photo", liste }), puis
 * le repli. Rend [{ besoin, valeur, source, de? }] — valeur null quand rien ne
 * peut s'écrire (liste eBay fermée sans entrée « multi » : 0 cas mesuré).
 */
export function posesCouleur({ besoins = [], connue = null, reponseIa = null } = {}) {
  return besoins.map((b) => {
    if (connue?.canon) {
      const v = couleurPourPlateforme(connue.canon, b);
      if (v) return { besoin: b, valeur: v, source: "connue", de: connue.de, origine: connue.source };
    }
    const r = reponseIa?.valeur ? String(reponseIa.valeur).trim() : "";
    if (r) {
      const directe = entreeDeListe(r, b.liste) ?? (b.platform === "vinted" ? entreeDeListe(r, VINTED_COLORS) : null);
      const canon = normalizeVintedColors(r).colors[0] ?? null;
      const v = directe ?? (canon ? couleurPourPlateforme(canon, b) : null);
      if (v) return { besoin: b, valeur: v, source: reponseIa.source === "texte" ? "texte" : "photo" };
    }
    return { besoin: b, valeur: repliCouleur(b), source: "repli" };
  });
}

/** La réponse de resolve_couleur, CONTRÔLÉE : une entrée de la liste envoyée,
 *  sinon null (hors liste = refus → repli). */
export function reponseCouleurControlee(data, liste) {
  const brut = typeof data?.couleur === "string" ? data.couleur.trim() : "";
  const valeur = brut ? entreeDeListe(brut, liste) : null;
  if (!valeur) return null;
  return { valeur, source: data?.source === "texte" ? "texte" : "photo", liste };
}

// ── 5. LA TÉLÉMÉTRIE ATTEND LA FIN (« affiche » = une question RESTÉE) ────
/** Une clé de champ_requis_bloquant porte-t-elle la couleur ? */
export function estChampCouleur({ platform, key = null, sharedKey = null, partage = null }) {
  if (partage === "couleur" || sharedKey === "couleur") return true;
  if (platform === "vinted") return key === "color";
  if (platform === "ebay") return ASPECTS_COULEUR_EBAY.includes(key);
  return false;
}

/** La couleur auto n'a pas encore fini pour un besoin présent : on ne compte
 *  pas encore la question (elle va, très probablement, disparaître). */
export function couleurAutoEnAttente(besoins, traites) {
  return (besoins ?? []).some((b) => !traites?.has?.(b.cle));
}

/** Les photos envoyées à l'IA : 1 à 2 URLs http(s), la couverture d'abord. */
export function photosPourCouleur(urls) {
  return (Array.isArray(urls) ? urls : [])
    .map((u) => String(u ?? "").trim())
    .filter((u) => /^https?:\/\//i.test(u))
    .slice(0, 2);
}
