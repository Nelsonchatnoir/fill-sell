// ═══════════════════════════════════════════════════════════════════════════
// LA FICHE D'UN ARTICLE DU LOT — CE QUI PART, LU SUR SON MOTEUR (26/10, refonte C validée par Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Une ligne par article dans la liste, une pop-up par article : le commun (photos, titre, prix, état, description),
// puis UNE SECTION PAR PLATEFORME (rayon, colis ou port, caractéristiques). Ce fichier ne décide RIEN : il lit le
// moteur du stepper (le même que la publication à l'unité) et dit ce qu'il porte, plateforme par plateforme.
// ⛔ Le poids affiché vient de la fiche ou du choix de la personne, jamais d'une estimation (règle 7 de Nico).
// ⛔ Une plateforme n'est écartée d'office que si elle n'a AUCUN rayon pour l'article (Beebs, Depop : C9) ou
//    qu'elle l'interdit ; « Annuler » la remet, et sa question de rayon reparaît dans la pop-up.
// Pur : aucune lecture, aucune écriture. Imports à extension explicite (selftest sous Node).

export const ORDRE_PLATEFORMES = ["vinted", "leboncoin", "beebs", "depop", "ebay", "opla"];

const PREMIER_CHEMIN = {
  vinted: (pf) => pf.categoryPath,
  leboncoin: (pf) => pf.lbcCategoryPath,
  beebs: (pf) => pf.beebsCategoryPath,
  depop: (pf) => pf.depopCategoryLibelles,
  ebay: (pf) => pf.ebayCategoryPath,
  opla: (pf) => pf.oplaCategoryPath,
};

/** Le rayon que la copie de la plateforme porte (choisi, sinon calculé), en tableau ; null si inconnu. */
export function cheminRayon(m, p) {
  const r = m?.rayonsParPf?.[p]?.chemin;
  if (Array.isArray(r) && r.length) return r.map(String);
  const pf = m?.edited?.[p]?.platform_fields ?? {};
  const c = PREMIER_CHEMIN[p]?.(pf);
  if (Array.isArray(c) && c.length) return c.map(String);
  if (typeof c === "string" && c.trim()) return c.split(" > ");
  return null;
}

/** Le rayon écrit pour l'écran : jamais coupé, les étages séparés par « › ». Les deux premiers étages génériques
 *  d'un long chemin (« Mode › Femme › Vêtements (femme) › … ») restent : rien n'est caché (règle 2 de Nico). */
export function texteRayon(chemin) {
  return Array.isArray(chemin) && chemin.length ? chemin.join(" › ") : "";
}

/** Les plateformes qui partiront pour cet article (cochées et rédigées), dans l'ordre de l'app. */
export function plateformesDeLArticle(m) {
  const pub = new Set([...(m?.plateformesPubliables ?? [])]);
  const sel = new Set([...(m?.selected ?? [])]);
  const toutes = new Set([...pub, ...sel]);
  return ORDRE_PLATEFORMES.filter((p) => toutes.has(p));
}

const etatBloquant = (a) => a && (a.state === "missing" || a.state === "invalid") && a.blocking !== false;

/** Ce qui reste à régler sur UNE plateforme : ses questions, son rayon à choisir, un rayon « neuf seulement ». */
export function aReglerSurPlateforme(m, p) {
  const raisons = [];
  if (m?.rayonsAChoisir?.[p]) raisons.push("rayon");
  for (const a of m?.genericRequiredStatus?.[p] ?? []) {
    if (!etatBloquant(a)) continue;
    raisons.push(a.neufSeulement ? "neuf" : a.rayonEnCause ? "rayon_public" : `champ:${a.key}`);
  }
  if (p === "ebay") for (const a of m?.ebayRequiredStatus ?? []) if (etatBloquant(a)) raisons.push(`champ:${a.name}`);
  if (p === "depop" && m?.portDepop?.manquant) raisons.push("port");
  if ((m?.questionsParPlateforme?.[p] ?? []).length && !raisons.length) raisons.push("question");
  return raisons;
}

/** « pret » ou « a_regler », plateforme par plateforme (le statut de sa section dans la pop-up). */
export function statutPlateforme(m, p) {
  return aReglerSurPlateforme(m, p).length ? "a_regler" : "pret";
}

/**
 * (C9) Les plateformes à écarter D'OFFICE pour cet article : Beebs ou Depop sans aucun rayon candidat (la question
 * de rayon n'a rien à proposer), ou Depop qui interdit l'objet. Jamais Vinted, Leboncoin ni eBay (leur rayon se
 * choisit toujours). Jamais une plateforme que la personne a remise (« Annuler ») : `remises`.
 * @returns {Array<{ p: string, motif: "aucun_rayon"|"interdit", objet: string|null }>}
 */
export function ecarteesAutomatiques(m, remises = []) {
  if (!m) return [];
  const out = [];
  const garde = new Set(remises ?? []);
  for (const p of ["beebs", "depop"]) {
    if (garde.has(p)) continue;
    const q = m.rayonsAChoisir?.[p];
    if (!q) continue;
    const candidats = (m.suggestionsParPf?.[p] ?? []).filter((f) => Array.isArray(f?.chemin) && f.chemin.length);
    if (!candidats.length) out.push({ p, motif: "aucun_rayon", objet: q?.objet ?? null });
  }
  if (!garde.has("depop") && m.depopInterdit && !out.some((x) => x.p === "depop")) {
    out.push({ p: "depop", motif: "interdit", objet: m.depopInterdit.quoi ?? null });
  }
  return out;
}

/** La phrase discrète d'une ou plusieurs plateformes écartées d'office (« Pas sur Beebs ni Depop : aucun rayon. »). */
export function phraseEcartees(ecartees, nom, lang = "fr") {
  if (!ecartees?.length) return "";
  const en = lang === "en";
  const noms = ecartees.map((e) => nom(e.p));
  const liste = en ? noms.join(" or ") : noms.join(" ni ");
  const toutesSansRayon = ecartees.every((e) => e.motif === "aucun_rayon");
  if (en) return `Not on ${liste}: ${toutesSansRayon ? "no category" : "not accepted"}.`;
  return `Pas sur ${liste} : ${toutesSansRayon ? "aucun rayon" : "refusé par la plateforme"}.`;
}

// ── LE POIDS (règle 7 de Nico) ─────────────────────────────────────────────────────────────────────────────────
/** Le poids de l'article : le choix de la personne dans ce lot, sinon celui de la fiche. Jamais une estimation
 *  (ni celle de l'IA, ni la tranche Leboncoin « De 100 g à 250 g »). null : « sans poids ». */
export function poidsAffiche(m, decision = {}, item = null) {
  for (const v of [decision?.poids, m?.initialListing?.poids_g, item?.poids_g]) {
    const g = Number(v);
    if (v != null && v !== "" && Number.isFinite(g) && g > 0) return Math.round(g);
  }
  return null;
}

/** Un poids en mots : « 650 g », « 1,2 kg ». */
export function textePoids(g, lang = "fr") {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return "";
  if (n < 1000) return `${Math.round(n)} g`;
  const kg = Math.round(n / 100) / 10;
  return `${lang === "en" ? String(kg) : String(kg).replace(".", ",")} kg`;
}

// (C10) Un poids incohérent pour l'objet : bornes MESURÉES à la louche sur des objets réels (poids emballé),
// volontairement larges — on ne signale que l'écart grossier (Louis : une maison de poupée partie à 100 g ; Nico :
// une bouilloire à 200 g). Le premier motif qui nomme l'objet décide.
const OBJETS = [
  { re: /robots? aspirateurs?|aspirateurs? robots?/, nom: { fr: "un robot aspirateur", en: "a robot vacuum" }, min: 2000, max: 8000, propositions: [3000, 4000] },
  { re: /aspirateur/, nom: { fr: "un aspirateur", en: "a vacuum cleaner" }, min: 2000, max: 12000, propositions: [4000, 6000] },
  { re: /bouilloire/, nom: { fr: "une bouilloire", en: "a kettle" }, min: 600, max: 3000, propositions: [1000, 1500] },
  { re: /maisons? de poupees?|maison poupee/, nom: { fr: "une maison de poupée", en: "a dollhouse" }, min: 1000, max: 15000, propositions: [2000, 5000] },
  { re: /cafetiere|machine a cafe|expresso/, nom: { fr: "une cafetière", en: "a coffee maker" }, min: 1000, max: 8000, propositions: [2000, 4000] },
  { re: /grille[- ]pain/, nom: { fr: "un grille-pain", en: "a toaster" }, min: 900, max: 4000, propositions: [1500, 2000] },
  { re: /micro[- ]?ondes/, nom: { fr: "un micro-ondes", en: "a microwave" }, min: 8000, max: 25000, propositions: [12000, 15000] },
  { re: /poussette/, nom: { fr: "une poussette", en: "a stroller" }, min: 4000, max: 20000, propositions: [8000, 12000] },
  { re: /\bvelo\b|trottinette/, nom: { fr: "un vélo ou une trottinette", en: "a bike or scooter" }, min: 3000, max: 25000, propositions: [8000, 12000] },
  { re: /ordinateur portable|pc portable|laptop|macbook/, nom: { fr: "un ordinateur portable", en: "a laptop" }, min: 1000, max: 5000, propositions: [2000, 3000] },
  { re: /\bconsole\b|playstation|xbox|nintendo switch/, nom: { fr: "une console", en: "a console" }, min: 800, max: 6000, propositions: [2000, 3000] },
  { re: /\bbottes?\b|chaussures|baskets|sneakers|escarpins|sandales|mocassins/, nom: { fr: "une paire de chaussures", en: "a pair of shoes" }, min: 400, max: 3000, propositions: [1000, 1500] },
  { re: /manteau|doudoune|parka|blouson|veste en cuir/, nom: { fr: "un manteau", en: "a coat" }, min: 500, max: 4000, propositions: [1000, 1500] },
  { re: /jeu de societe|jeux de societe|jeu cooperatif|\bpuzzle\b/, nom: { fr: "un jeu de société", en: "a board game" }, min: 300, max: 5000, propositions: [800, 1500] },
  { re: /\blampe\b|lampadaire/, nom: { fr: "une lampe", en: "a lamp" }, min: 400, max: 10000, propositions: [1000, 2000] },
  { re: /casserole|poele|cocotte|faitout/, nom: { fr: "un ustensile de cuisson", en: "cookware" }, min: 600, max: 8000, propositions: [1500, 3000] },
];
const sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();

/**
 * (C10) Le poids est-il incohérent pour l'objet ? `texte` : le titre et l'objet nommé par l'IA. Rend null (rien à
 * dire, objet inconnu ou poids plausible) ou { nom, min, max, propositions } — propositions : des poids plausibles,
 * en grammes, pour un geste.
 */
export function poidsIncoherent(texte, g, lang = "fr") {
  const n = Number(g);
  if (!Number.isFinite(n) || n <= 0) return null;
  const t = sansAccents(texte);
  const o = OBJETS.find((x) => x.re.test(t));
  if (!o) return null;
  if (n >= o.min * 0.5 && n <= o.max * 3) return null;
  return { nom: o.nom[lang === "en" ? "en" : "fr"], min: o.min, max: o.max, propositions: o.propositions };
}

// ── LA PHOTO DE REMPLISSAGE (le Medik8 de Nico) ────────────────────────────────────────────────────────────────
// Beebs sert une image par défaut à une annonce sans photo (un pictogramme 200 × 200 : la casquette violette) ; le
// relevé l'avait rapatriée comme photo de la fiche. Mesuré le 26/10 (vignette 48 × 48, couleurs quantifiées sur
// 4 bits) : l'image par défaut 30 couleurs à 200 × 200 ; de vraies photos, même minuscules : 67 (140 × 70), 99
// (131 × 140), 125 (700 × 933). Une image petite ET presque sans couleurs n'est pas une photo d'article.
export function estPhotoDeRemplissage({ largeur, hauteur, couleurs } = {}) {
  const l = Number(largeur), h = Number(hauteur), c = Number(couleurs);
  if (![l, h, c].every(Number.isFinite)) return false;
  return Math.max(l, h) <= 256 && c <= 40;
}

// ── LE COLIS, PLATEFORME PAR PLATEFORME ────────────────────────────────────────────────────────────────────────
/**
 * Ce que la copie dit du colis ou du port, en mots, et ce que le geste modifie.
 * @returns {{ libelle: string, genre: "poids"|"format"|"port"|"livraison", manquant?: boolean }}
 */
export function colisDe(m, p, { poids = null, grilleVinted = null, lang = "fr" } = {}) {
  const en = lang === "en";
  const pf = m?.edited?.[p]?.platform_fields ?? {};
  if (p === "vinted") {
    const id = Number(pf.packageSizeId);
    if (Number.isInteger(id) && id > 0) {
      const g = (grilleVinted ?? []).find((x) => x.id === id);
      return { libelle: g?.libelle ?? (en ? `Size ${id}` : `Format ${id}`), genre: "format" };
    }
    return { libelle: en ? "Recommended by Vinted" : "Recommandé par Vinted", genre: "format" };
  }
  if (p === "leboncoin") {
    const format = String(pf.format_colis ?? pf.livraison_lbc?.format_pose ?? "").trim();
    if (!poids) return { libelle: en ? "No weight" : "Sans poids", genre: "poids", manquant: true };
    return { libelle: `${textePoids(poids, lang)}${format ? ` · ${format}` : ""}`, genre: "poids" };
  }
  if (p === "beebs") {
    const explicite = String(pf.format_colis_explicite ?? pf.format_colis ?? "").trim();
    if (!poids) return { libelle: explicite || (en ? "No weight" : "Sans poids"), genre: "poids", manquant: !explicite };
    return { libelle: `${textePoids(poids, lang)}${explicite ? ` · ${explicite}` : ""}`, genre: "poids" };
  }
  if (p === "depop") {
    const port = m?.portDepop ?? {};
    const brut = String(port.saisie ?? "").trim() || (port.defaut != null ? String(port.defaut) : "") || (pf.depopPort != null ? String(pf.depopPort) : "");
    const v = Number(String(brut).replace(",", "."));
    if (!brut || !Number.isFinite(v)) return { libelle: en ? "Shipping to set" : "Frais de port à fixer", genre: "port", manquant: true };
    const txt = en ? `€${v.toFixed(2)}` : `${v.toFixed(2).replace(".", ",")} €`;
    return { libelle: en ? `${txt} paid by the buyer` : `${txt} payés par l'acheteur`, genre: "port" };
  }
  if (p === "ebay") {
    const pol = String(pf.ebayFulfillmentPolicyId ?? "").trim();
    return { libelle: pol ? (en ? "The policy chosen for this item" : "La règle choisie pour cet article") : (en ? "Your eBay account's delivery policy" : "La règle de livraison de ton compte eBay"), genre: "livraison" };
  }
  return { libelle: "", genre: "livraison" };
}

// ── LES CARACTÉRISTIQUES ───────────────────────────────────────────────────────────────────────────────────────
const CLES_HORS_DETAILS = new Set(["title", "description", "photos"]);
/**
 * Les champs du rayon de la plateforme, avec leur valeur : tout ce qui part, une ligne chacun. Les champs à
 * régler d'abord. [{ id, gp, cle, label, valeur, aRegler, allowedValues, dedicatedTarget, ebay }]
 */
export function detailsDe(m, p) {
  const out = [];
  if (p === "ebay") {
    for (const a of m?.ebayRequiredStatus ?? []) {
      out.push({ id: `ebay:${a.name}`, gp: "ebay", cle: a.name, label: String(a.label ?? a.name), valeur: String(a.value ?? ""),
        aRegler: etatBloquant(a), allowedValues: Array.isArray(a.allowedValues) ? a.allowedValues : [], ebay: true, ligne: a });
    }
  } else {
    for (const a of m?.genericRequiredStatus?.[p] ?? []) {
      if (CLES_HORS_DETAILS.has(a.key) || a.neufSeulement || a.rayonEnCause) continue;
      out.push({ id: `${p}:${a.key}`, gp: p, cle: a.key, label: String(a.label ?? a.key), valeur: String(a.value ?? ""),
        aRegler: etatBloquant(a), allowedValues: Array.isArray(a.allowedValues) ? a.allowedValues : [], dedicatedTarget: a.dedicatedTarget ?? null, ligne: a });
    }
  }
  return out.sort((x, y) => Number(y.aRegler) - Number(x.aRegler));
}

/** La ligne « rayon neuf seulement » d'une plateforme (C8), ou null : { label, valeur, valeursNeuves, message }. */
export function rayonNeufDe(m, p) {
  const a = (m?.genericRequiredStatus?.[p] ?? []).find((x) => x.neufSeulement);
  if (!a) return null;
  return { label: a.label, valeur: a.value ?? "", valeursNeuves: Array.isArray(a.valeursNeuves) ? a.valeursNeuves : [], message: a.message ?? "", ligne: a };
}
