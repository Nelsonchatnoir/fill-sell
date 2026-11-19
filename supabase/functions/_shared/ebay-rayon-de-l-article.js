// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// (19/11, ordre de Nico — compte f5fab0e0) CE QU'EST L'ARTICLE DÉCIDE DE SON RAYON eBAY, LÀ OÙ LA PUBLICATION S'ARRÊTAIT
// ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
// Cas (voie API, lot du 18/11) — six articles arrêtés CHEZ NOUS :
//   · « Statue décorative J-Line … 21 cm » (fiche titrée « J-Line »), « 4 poule J-Line » : icône 🖼️ → « Maison › Décoration
//     d'intérieur › Cadres » (79654), refusé par l'app (une statue n'est pas un cadre) ; « Lot de 4 coffrets » (kits
//     créatifs) : 🧱 → « LEGO › Kits complets » refusé ; « Bowling story » (un LIVRE, ISBN lu par Lens) : 🎱 tiré du mot
//     « bowling » → « Jeux de café » refusé. Le worker demandait alors les suggestions d'eBay sur le TITRE DE LA FICHE
//     (« J-Line », « 4 poule J-Line », « Lot de 4 coffrets », « Bowling story ») et faisait choisir l'IA avec ce titre
//     seul : ni l'objet vu par Lens (« statuette », « figurines poules », « coffret créatif bijoux », « livre »), ni
//     l'étagère Vinted où la vendeuse l'avait rangé (« Sculptures et figurines », « Kits créatifs », « Non-fiction ») —
//     « aucune », en pause pour toujours (rejouée le 18/11 sous la règle du genre, même issue) ;
//   · « Anneaux lumineux orientable » (ring light, étagère « Électronique › Appareils photo ») et « Poisson paulownia
//     bois » (étagère « Maison › Décoration › Bibelots ») : l'app a pris un FAUX AMI par le mot (« lumineux » →
//     « Camping › Bâtons lumineux », « décoratif » → « Décoration d'intérieur › Fruits décoratifs ») ; eBay conteste,
//     rien ne confirme le nôtre → « Catégorie eBay à confirmer », un geste demandé alors que l'objet et l'étagère du
//     vendeur tranchaient.
// RÈGLE (voie API, tous les comptes, SEULEMENT là où la publication s'arrêtait — jamais un rayon qui part aujourd'hui) :
//   1. l'IDENTITÉ de l'article : l'objet vu (Lens, puis l'objet de l'IA de l'app), l'étagère Vinted où le VENDEUR l'a
//      rangé (identifiant d'un relevé, sinon la colonne vinted_catalog_id → chemin, _shared/vinted-branche.ts — jamais un
//      libellé), la famille Lens ;
//   2. un rayon CORROBORÉ part sans IA : l'OBJET le nomme ET l'étagère (ou la famille) le confirme — table
//      RAYONS_DE_L_ARTICLE, chaque feuille eBay.fr justifiée (suggestions d'eBay en base, arbre relevé, publications
//      parties) ; deux rayons corroborés différents = doute, rien ; jamais un rayon refusé ; un LIVRE n'est jamais
//      corroboré (« Fiction » / « Non-fiction » de l'étagère n'est pas sûr : candidates pour l'IA) ;
//   3. après un refus de l'app, sinon : l'IA choisit le plus proche avec l'objet et l'étagère sous les yeux, parmi les
//      rayons de la table que l'objet ou l'étagère désignent, les suggestions d'eBay pour l'OBJET et pour le titre de
//      l'ANNONCE, puis les candidates d'avant ; « aucune » reste une réponse (la pause reste) ;
//   4. « à confirmer » : l'étagère du vendeur arbitre la RACINE (ETAGERES_RACINES) — l'IA (consigne stricte) tranche
//      parmi les suggestions d'eBay dans l'étagère, les rayons de la table et le rayon de l'app s'il y est ; « aucune »,
//      étagère hors table → la question, comme avant (le vrai doute).
// ⛔ Le genre n'est dit à l'IA que pour un rayon de mode : « homme » dans « statue … homme ethnique » est un sujet.
// Pur (Deno + Node), la lecture de l'étagère est injectée : scripts/ebay-rayon-maison-deco-selftest.mjs.

const plier = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/\s+/g, " ").trim();
const SEP = " › ";

/**
 * Les rayons eBay.fr que l'IDENTITÉ de l'article désigne. Une entrée = une feuille eBay.fr (identifiant et chemin exacts),
 * les objets qui la nomment (texte plié : minuscules, sans accents), les étagères Vinted (préfixes de chemin) et les
 * familles Lens qui la confirment. `preuve` : d'où vient la feuille (jamais inventée).
 * ⛔ Une famille ne confirme que si l'entrée en porte : un livre (fiction ou non) ne se tranche qu'à l'étagère.
 */
export const RAYONS_DE_L_ARTICLE = Object.freeze([
  Object.freeze({
    id: "36025", chemin: Object.freeze(["Maison", "Décoration d'intérieur", "Scultures, figurines"]),
    objets: /\b(statue|statuette|sculpture|figurine|buste)s?\b/,
    etageres: Object.freeze(["Maison › Décoration › Sculptures et figurines"]),
    familles: Object.freeze(["maison_deco"]),
    preuve: "arbre relevé (libellé d'eBay « Scultures », sic) ; 42 suggestions d'eBay en base ; retenue par le worker pour « Statuette poule J-Line » (0cb9c7cc), « Statuette décoration arbre et couple » (ddbb42bd)",
  }),
  // Livres : CANDIDATES seulement (jamais corroborés) — « Fiction » / « Non-fiction » de l'étagère Vinted n'est pas sûr
  // (mesuré sur 60 jours : « Ta deuxième vie commence… », un roman, rangé « Non-fiction » par son vendeur) ; l'IA tranche.
  Object.freeze({
    id: "171243", chemin: Object.freeze(["Livres, BD, revues", "Non-fiction"]),
    objets: /\b(livre|ouvrage|biographie|essai)s?\b/, horsSupport: true, candidatSeulement: true,
    etageres: Object.freeze(["Livres et médias › Livres › Non-fiction"]),
    familles: Object.freeze([]),
    preuve: "arbre relevé ; 92 suggestions d'eBay en base ; 4 publications parties de l'étagère 2320 (dont « Le pot au feu », 520be848)",
  }),
  Object.freeze({
    id: "171228", chemin: Object.freeze(["Livres, BD, revues", "Fiction"]),
    objets: /\b(livre|roman)s?\b/, horsSupport: true, candidatSeulement: true,
    etageres: Object.freeze(["Livres et médias › Livres › Fiction"]),
    familles: Object.freeze([]),
    preuve: "arbre relevé ; suggestions d'eBay en base ; 7 publications parties de l'étagère 2320 en « Fiction »",
  }),
  Object.freeze({
    id: "28145", chemin: Object.freeze(["Loisirs créatifs", "Loisirs créatifs pour enfant"]),
    objets: /\b(coffret|kit|set|boite)s? (creatifs?|diy|de bijoux|de perles|loisirs? creatifs?)\b|\bloisirs? creatifs?\b/,
    etageres: Object.freeze(["Enfants › Jeux et jouets › Loisirs créatifs"]),
    familles: Object.freeze([]),
    preuve: "suggestion d'eBay en base (« Loisirs créatifs > Loisirs créatifs pour enfant », tâches 4c4e8358 et 42712d30)",
  }),
  Object.freeze({
    id: "19591", chemin: Object.freeze(["Photo, caméscopes", "Eclairage, studio", "Eclairage continu", "Kits d'éclairage continu"]),
    objets: /\b(anneaux? (lumineux|led)|ring ?lights?|lampes? annulaires?)\b/,
    etageres: Object.freeze(["Électronique › Appareils photo et accessoires"]),
    familles: Object.freeze([]),
    preuve: "1re suggestion d'eBay en base pour « Anneaux lumineux orientable » (952cc9b0)",
  }),
]);

/**
 * Les RACINES eBay.fr où un article d'une étagère Vinted peut vivre (préfixe de chemin d'étagère → racines). Table
 * FERMÉE : une étagère absente ne pèse rien (comportement d'avant). Même principe que RAYONS_EBAY_PAR_FAMILLE (worker),
 * en plus fin : c'est le vendeur qui a rangé l'article.
 */
export const ETAGERES_RACINES = Object.freeze([
  ["Maison › Décoration", /^(Maison|Art, antiquit[ée]s|C[ée]ramiques, verres|Jardin, terrasse)$/i],
  ["Maison › Célébrations et fêtes", /^Maison$/i],
  ["Maison › Arts de la table", /^(Maison|C[ée]ramiques, verres|Art, antiquit[ée]s)$/i],
  ["Livres et médias › Livres", /^Livres, BD, revues$/i],
  ["Livres et médias › Magazines", /^Livres, BD, revues$/i],
  ["Livres et médias › Musique", /^Musique, CD, vinyles$/i],
  ["Livres et médias › Vidéo", /^(DVD, cin[ée]ma|Films, DVD)$/i],
  ["Électronique › Appareils photo et accessoires", /^Photo, cam[ée]scopes$/i],
  ["Enfants › Jeux et jouets › Loisirs créatifs", /^(Loisirs cr[ée]atifs|Jouets et jeux)$/i],
  ["Loisirs et collections › Loisirs créatifs", /^Loisirs cr[ée]atifs$/i],
]);

const SOURCE_RELEVE = /^(capture|vinted|releve)/;
const idValide = (v) => {
  const n = Number(v && typeof v === "object" ? v.v : v);
  return Number.isInteger(n) && n > 0 ? n : null;
};
const sousEtagere = (etagere, prefixe) => {
  const e = String(etagere ?? ""), p = String(prefixe ?? "");
  return Boolean(e && p) && (e === p || e.startsWith(p + SEP));
};
const cle = (c) => (Array.isArray(c) ? c.map(plier).filter(Boolean).join(" > ") : "");
const racine = (c) => String((Array.isArray(c) ? c[0] : "") ?? "").trim();

/** @typedef {{ id: string, chemin: string[] }} Rayon */
/** @typedef {{ objets: string[], etagere: { id: number|null, chemin: string } | null, famille: string|null, supportNonLivre: boolean }} Identite */

/**
 * L'étagère Vinted de la fiche : l'attribut d'un RELEVÉ d'abord, sinon la colonne `vinted_catalog_id`.
 * `etagereVinted(id)` → { chemin: string[] } | null (_shared/vinted-branche.ts). null = aucune étagère connue.
 * @param {{ categorieVinted?: unknown, colonne?: unknown }} fiche
 * @param {(id: unknown) => ({ chemin: string[] } | null)} etagereVinted
 * @returns {{ id: number, chemin: string } | null}
 */
export function etagereDeLArticle({ categorieVinted = null, colonne = null } = {}, etagereVinted) {
  if (typeof etagereVinted !== "function") return null;
  const cv = categorieVinted && typeof categorieVinted === "object" ? categorieVinted : null;
  const idAttribut = cv && SOURCE_RELEVE.test(String(cv.source ?? "")) ? idValide(cv.v) : null;
  for (const id of [idAttribut, idValide(colonne)]) {
    if (!id) continue;
    const e = etagereVinted(id);
    const chemin = Array.isArray(e?.chemin) ? e.chemin.map(String).join(SEP) : "";
    if (chemin) return { id, chemin };
  }
  return null;
}

/**
 * L'identité de l'article : objets vus (Lens d'abord, puis l'IA de l'app ; distincts), étagère, famille.
 * @param {{ objetLens?: string|null, objetIa?: string|null, etagere?: {id:number|null, chemin:string}|null, famille?: string|null, supportNonLivre?: boolean }} x
 * @returns {Identite}
 */
export function identiteDeLArticle({ objetLens = null, objetIa = null, etagere = null, famille = null, supportNonLivre = false } = {}) {
  const objets = [];
  for (const o of [objetLens, objetIa]) {
    const t = String(o ?? "").trim();
    if (t && !objets.some((x) => plier(x) === plier(t))) objets.push(t);
  }
  return { objets, etagere: etagere?.chemin ? { id: etagere.id ?? null, chemin: String(etagere.chemin) } : null,
    famille: String(famille ?? "").trim() || null, supportNonLivre: supportNonLivre === true };
}

const nommePar = (entree, objet, identite) => entree.objets.test(plier(objet)) && !(entree.horsSupport && identite.supportNonLivre);
const confirmePar = (entree, identite) => {
  if (identite.etagere && entree.etageres.some((p) => sousEtagere(identite.etagere.chemin, p))) return `étagère Vinted « ${identite.etagere.chemin} »`;
  if (identite.famille && entree.familles.includes(identite.famille)) return `famille ${identite.famille}`;
  return null;
};
const refuse = (id, chemin, refuses, idRefuse) =>
  String(id) === String(idRefuse ?? "") || (refuses ?? []).some((c) => cle(c) === cle(chemin));

/**
 * 2. Le rayon CORROBORÉ : un objet le nomme ET l'étagère ou la famille le confirme. Deux rayons différents = doute → null.
 * @param {Identite} identite
 * @param {{ refuses?: string[][], idRefuse?: string|null }} [x]
 * @returns {{ id: string, chemin: string[], preuve: string } | null}
 */
export function rayonCorrobore(identite, { refuses = [], idRefuse = null } = {}) {
  if (!identite?.objets?.length) return null;
  const trouves = new Map();
  for (const objet of identite.objets) {
    for (const e of RAYONS_DE_L_ARTICLE) {
      if (e.candidatSeulement || !nommePar(e, objet, identite)) continue;
      const par = confirmePar(e, identite);
      if (!par || trouves.has(e.id)) continue;
      trouves.set(e.id, { id: e.id, chemin: [...e.chemin], preuve: `objet « ${objet} » + ${par}` });
    }
  }
  if (trouves.size !== 1) return null;
  const r = [...trouves.values()][0];
  return refuse(r.id, r.chemin, refuses, idRefuse) ? null : r;
}

/**
 * Les rayons de la table que l'objet OU l'étagère désignent (candidates pour l'IA, jamais un rayon refusé).
 * @param {Identite} identite
 * @param {{ refuses?: string[][], idRefuse?: string|null }} [x]
 * @returns {Rayon[]}
 */
export function rayonsDeLaTable(identite, { refuses = [], idRefuse = null } = {}) {
  const out = [];
  for (const e of RAYONS_DE_L_ARTICLE) {
    const parEtagere = Boolean(identite?.etagere) && e.etageres.some((p) => sousEtagere(identite.etagere.chemin, p));
    const parObjet = (identite?.objets ?? []).some((o) => nommePar(e, o, identite));
    if ((parEtagere || parObjet) && !refuse(e.id, e.chemin, refuses, idRefuse)) out.push({ id: e.id, chemin: [...e.chemin] });
  }
  return out;
}

/**
 * Les racines eBay de l'étagère de l'article (le préfixe le plus long), null hors table.
 * @param {Identite} identite
 * @returns {RegExp | null}
 */
export function racinesDeLEtagere(identite) {
  const chemin = identite?.etagere?.chemin;
  if (!chemin) return null;
  let meilleur = null;
  for (const [p, re] of ETAGERES_RACINES) if (sousEtagere(chemin, p) && (!meilleur || p.length > meilleur[0].length)) meilleur = [p, re];
  return meilleur ? meilleur[1] : null;
}

/**
 * 3. Les candidates du second tour après un refus : la table, les suggestions d'eBay pour l'objet, pour le titre de
 * l'annonce, puis celles d'avant — sans doublon, jamais un rayon refusé, `max` au plus.
 * @param {{ table?: Rayon[], parObjet?: Rayon[], parTitreAnnonce?: Rayon[], avant?: Rayon[], refuses?: string[][], idRefuse?: string|null, max?: number }} x
 * @returns {Rayon[]}
 */
export function candidatesDeLArticle({ table = [], parObjet = [], parTitreAnnonce = [], avant = [], refuses = [], idRefuse = null, max = 10 } = {}) {
  const out = [];
  const vus = new Set();
  const ajouter = (s) => {
    if (!s?.id || !Array.isArray(s.chemin) || !s.chemin.length) return;
    const id = String(s.id);
    if (vus.has(id) || refuse(id, s.chemin, refuses, idRefuse)) return;
    vus.add(id);
    out.push({ id, chemin: s.chemin.map(String) });
  };
  for (const liste of [table, parObjet.slice(0, 6), parTitreAnnonce.slice(0, 4), avant]) for (const s of liste ?? []) ajouter(s);
  return out.slice(0, max);
}

/**
 * 4. « À confirmer » : l'étagère du vendeur arbitre la racine. null = étagère hors table (la question reste).
 * Candidates : la table, les suggestions d'eBay dans l'étagère (dans l'ordre d'eBay), le rayon de l'app EN DERNIER s'il
 * est dans l'étagère. Vide → null.
 * @param {Identite} identite
 * @param {{ mappee?: string|null, cheminMappe?: string[], suggestions?: Rayon[] }} x
 * @returns {{ candidates: Rayon[], mappingCoherent: boolean, coherentes: number } | null}
 */
export function arbitrageParLEtagere(identite, { mappee = null, cheminMappe = [], suggestions = [] } = {}) {
  const re = racinesDeLEtagere(identite);
  if (!re) return null;
  const dedans = (c) => re.test(racine(c));
  const mappingCoherent = Boolean(mappee) && dedans(cheminMappe);
  const coherentes = (suggestions ?? []).filter((s) => dedans(s.chemin));
  const table = rayonsDeLaTable(identite).filter((t) => dedans(t.chemin));
  const candidates = candidatesDeLArticle({ table, avant: [...coherentes, ...(mappingCoherent ? [{ id: String(mappee), chemin: cheminMappe }] : [])], max: 12 });
  return candidates.length ? { candidates, mappingCoherent, coherentes: coherentes.length } : null;
}

const MODE = /^(V[êe]tements, accessoires|B[ée]b[ée], pu[ée]riculture)$/i;

/**
 * Ce que l'IA lit de l'article (resolve-categorie, `attributs`) : l'objet et l'étagère du vendeur ; le genre seulement
 * pour un rayon de mode (cheminRefuse / cheminMappe sous « Vêtements, accessoires » ou « Bébé, puériculture »).
 * @param {Identite} identite
 * @param {{ genre?: string|null, taille?: string|null, marque?: string|null, isbn?: string|null, cheminRayon?: string[] }} [x]
 * @returns {Record<string, string>}
 */
export function attributsDeLArticle(identite, { genre = null, taille = null, marque = null, isbn = null, cheminRayon = [] } = {}) {
  /** @type {Record<string, string>} */
  const a = {};
  // L'objet VU (Lens, d'après les photos) d'abord : celui de l'IA de l'app peut venir d'un mot du titre (« Bowling
  // story » → « boule de bowling » pour un livre). Les deux servent à chercher, un seul est dit.
  if (identite?.objets?.length) a.objet = identite.objets[0];
  if (identite?.etagere?.chemin) a.rayon_vinted_du_vendeur = identite.etagere.chemin;
  if (isbn) a.isbn = String(isbn);
  if (genre && MODE.test(racine(cheminRayon))) a.genre = genre;
  if (taille) a.taille = taille;
  if (marque) a.marque = marque;
  return a;
}

/**
 * Le corps envoyé à resolve-categorie (consigne « plus_proche » après un refus, stricte pour « à confirmer »).
 * @param {{ titre?: string, userId?: string|null, attributs?: Record<string, string>, candidates?: Rayon[], plusProche?: boolean, rejeu?: boolean }} x
 */
export function corpsChoixDeLArticle({ titre = "", userId = null, attributs = {}, candidates = [], plusProche = false, rejeu = false } = {}) {
  return {
    titre: String(titre ?? ""),
    user_id: userId ?? null,
    attributs,
    candidats: { ebay: candidates.slice(0, 12).map((s) => ({ chemin: s.chemin, id: s.id, source: "eBay" })) },
    max_candidats: 20,
    ...(plusProche ? { consigne: "plus_proche" } : {}),
    ...(rejeu ? { rejeu: true } : {}),
  };
}
