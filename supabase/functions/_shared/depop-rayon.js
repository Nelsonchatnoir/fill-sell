// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON DEPOP PAR LE MOTEUR — l'IA tranche, les garde-fous jugent (11/10/2026)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateurs (11/10, mission de Nico) :
//   · Simon : « Short de basket Jordan … Taille M Enfant (10-12 ans) » parti en
//     Enfants › Chaussures › Baskets — le mot « basket » du titre faisait 👟
//     (shared.js), et la table icône → rayon (utils/depopCategories.js) ne
//     savait rien d'autre ; « Sweat à capuche Carhartt » en Pulls (Depop a
//     « Sweats à capuche ») ;
//   · Jake : « Woman size 39 trainers new » en Femme › Robes › Robes — titre
//     anglais, aucune icône reconnue, la robe par défaut.
// La catégorie Depop était la seule à NE PAS passer par le moteur (mot exact,
// candidates, arbitrage resolve-categorie, garde-fous). Elle y passe, ici, pour
// l'app (utils/resolutionPublication.js, à la création du job) ET pour le
// serveur (handler-watch : un job d'avant ce moteur est recalculé avant tout
// départ ; get-pending-jobs ne sert jamais une publication Depop sans ce
// verdict).
//
// POURQUOI PAS LE MOT CONTRE LES LIBELLÉS (règle du 09/10, qui tient toujours) :
// les libellés français servis par Depop sont faux ou en double (« Vestes »
// pour les débardeurs, « T-shirts (Shirts) » pour les chemises, « Robe
// habillée » pour un déguisement, « Courts » pour des escarpins). Aucune
// recherche par le mot n'est faite : l'IA reçoit les feuilles OFFICIELLES des
// départements plausibles sous des libellés CORRIGÉS (table ci-dessous, une
// ligne par correction), répond par une clé opaque, et resolve-categorie rend
// la feuille d'origine — son IDENTIFIANT, le seul qui part dans le job.
// Mesuré à blanc le 11/10 (resolve-categorie déployée, rejeu) : 19/20 justes
// sur un département, 8/8 sans genre connu (deux départements, ~160 feuilles).
//
// LES GARDE-FOUS (jugerRayonDepop), tous déterministes :
//   · un vêtement ne finit jamais en chaussures, une chaussure jamais en
//     vêtement — l'objet se lit sur le mot de l'IA d'abord, puis sur le NOM EN
//     TÊTE du titre (« Short de basket » : « short » vient avant « basket ») ;
//     un mot plus loin dans le titre ne prend jamais le dessus ;
//   · un article ne va en Enfants qu'avec un indice EXPLICITE (genre de la
//     fiche, catégorie d'origine, « enfant », « 10 ans », « 140-152 cm »,
//     « kids »…) — sans indice, Enfants n'est même pas proposé à l'IA ;
//   · un article d'enfant ne va pas en adulte, un genre dit (« homme »,
//     « women ») n'est pas contredit.
// En cas de doute (aucun choix, choix écarté), une QUESTION fermée en français
// (« Rayon Depop »), jamais un rayon faux.
// ═══════════════════════════════════════════════════════════════════════════
import { FEUILLES_DEPOP } from "./depop-feuilles.js";
import { RE_HOMME, RE_FEMME } from "./genre-du-texte.js";

// 3 (11/10 soir) : un article qui se dit À LA FOIS enfant et adulte (« Taille S
// (Enfant XL / S Homme) ») devient une question — la v2 laissait l'IA trancher.
export const VERSION_RAYON_DEPOP = 3;
/** La source posée sur le job (`platform_fields.categorie_source`). */
export const SOURCE_RAYON_DEPOP = "moteur_depop_v2";
/** Le champ de la question « Rayon Depop » (réponse : le libellé corrigé). */
export const CLE_QUESTION_RAYON_DEPOP = "depopCategorie";

const PAR_ID = new Map(FEUILLES_DEPOP.map((f) => [f.id, f]));

// ── LES LIBELLÉS CORRIGÉS (une ligne = une erreur de traduction de Depop) ──
// Clé = type de produit (3e segment de l'identifiant), valable dans les trois
// départements de mode. Ce qui n'est pas ici garde le libellé de Depop.
const TYPE_FR = Object.freeze({
  "vests-tanks-camis": "Débardeurs et caracos",        // Depop : « Vestes »
  shirts: "Chemises",                                   // Depop : « T-shirts (Shirts) »
  "fancy-dress": "Déguisements",                        // Depop : « Robe habillée »
  courts: "Escarpins",                                  // Depop : « Courts »
  "vest-undershirts": "Maillots de corps",              // Depop : « Vestes »
  robes: "Peignoirs",                                   // Depop : « Robes » (vêtements de nuit)
  gilets: "Vestes et doudounes sans manches",           // Depop : « Gilets » (bodywarmer, pas un gilet tricoté)
  "playsuit-romper": "Combishorts",                     // Depop : « Combinaisons courtes »
  "joggers-tracksuits": "Joggings et survêtements",     // Depop : « Jogging »
  hoodies: "Sweats à capuche",                          // Depop : « Sweat à capuche »
  brogues: "Chaussures à bout fleuri (brogues)",        // Depop : « Brogues »
  oxfords: "Richelieus",                                // Depop : « Richelieu »
  "babydoll-dresses": "Robes babydoll",
  "bodycon-dresses": "Robes moulantes",
  "casual-dresses": "Robes décontractées",
  "formal-dresses": "Robes habillées",
  "going-out-dresses": "Robes de soirée",
  "prom-dresses": "Robes de bal",
  "shift-dresses": "Robes droites",
  "shirt-dresses": "Robes chemises",
  "summer-dresses": "Robes d'été",
  "wedding-dresses": "Robes de mariée",
  "work-dresses": "Robes de bureau",
  "wrap-dresses": "Robes portefeuille",
  prints: "Estampes et affiches",                       // Depop : « À imprimé »
  grooming: "Rasage et soins",                          // Depop : « Toilettage »
});
const GROUPE_FR = Object.freeze({
  "fancy-dress": "Déguisements",                        // Depop : « Robe habillée »
  home: "Maison",                                       // Depop : « Accueil »
  "sports-equipment-accesories": "Équipements de sport",
  "tech-accessories": "Accessoires high-tech",
});
const DEPARTEMENT_FR = Object.freeze({ "everything-else": "Autres objets" });

/** Les libellés CORRIGÉS d'une feuille [département, groupe, type], ou null. */
export function libellesRayonDepop(id) {
  const f = PAR_ID.get(String(id ?? ""));
  if (!f) return null;
  const [d, g, t] = f.id.split("/");
  const type = /^other-/.test(t) ? "Autre" : (TYPE_FR[t] ?? f.fr[2]);
  return [DEPARTEMENT_FR[d] ?? f.fr[0], GROUPE_FR[g] ?? f.fr[1], type];
}
/** Le libellé d'une feuille sur une ligne (« Enfants › Bas › Shorts »). */
export function texteRayonDepop(id) {
  const l = libellesRayonDepop(id);
  return l ? l.join(" › ") : null;
}
/** L'identifiant d'une réponse à la question « Rayon Depop » (libellé exact), ou null. */
export function idDepuisReponseRayonDepop(reponse) {
  const r = String(reponse ?? "").trim();
  if (!r) return null;
  if (PAR_ID.has(r)) return r;
  for (const f of FEUILLES_DEPOP) if (texteRayonDepop(f.id) === r) return f.id;
  return null;
}
export function feuilleDepop(id) { return PAR_ID.get(String(id ?? "")) ?? null; }

// ── ÂGE ET GENRE : LES INDICES EXPLICITES ──────────────────────────────────
const sansAccents = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const GENRES_ENFANT = new Set(["fille", "garcon", "enfant", "enfants", "bebe"]);
const RE_ENFANT_MOT = /\b(enfants?|bebes?|fillettes?|garcons?|kids?|baby|babies|girls?|boys?|junior|toddlers?|naissance|nouveau-?nes?|newborn)\b/;
const RE_ENFANT_AGE = /\b\d{1,2}\s*(?:-|a|\/)?\s*\d{0,2}\s*(?:ans|mois|years?|months?|yrs?)\b/;
const RE_ENFANT_CM = /\b(?:5\d|6\d|7\d|8\d|9\d|1[0-7]\d)\s*(?:-|a|\/)\s*(?:5\d|6\d|7\d|8\d|9\d|1[0-7]\d)\s*cm\b|\b(?:taille|size)\s*(?:5\d|6\d|7\d|8\d|9\d|1[0-7]\d)\s*cm\b/;
const RE_DUREE_AVANT = /(portee?s?|achetee?s?|utilisee?s?|depuis|il y a|pendant|garantie?|worn|used|for)\s*$/;
// RE_HOMME / RE_FEMME : _shared/genre-du-texte.js (une seule liste, 30/10).

/**
 * Les indices d'âge et de genre de la fiche — EXPLICITES seulement.
 * @param {{ titre?: string, description?: string, genre?: string, origine?: string[]|string|null }} ctx
 */
export function indicesAgeGenre({ titre = "", description = "", genre = "", origine = null, taille = "" } = {}) {
  const ind = { enfant: [], homme: [], femme: [] };
  const g = sansAccents(genre).trim();
  // (30/10, lot E) Le genre de la fiche est souvent DEVINÉ par la rédaction (« tranche toujours ») : quand le
  // texte de l'article nomme l'autre genre, et lui seul, le genre deviné ne compte pas (« Lee … Femme Jean »
  // portait genre « Homme » : les deux signaux réunis proposaient Homme et désarmaient la garde).
  const texteSeul = sansAccents(`${titre} ${description}`);
  const texteHomme = RE_HOMME.test(texteSeul), texteFemme = RE_FEMME.test(texteSeul);
  if (GENRES_ENFANT.has(g)) ind.enfant.push(`genre « ${genre} »`);
  if (g === "homme" && !(texteFemme && !texteHomme)) ind.homme.push("genre « Homme »");
  if (g === "femme" && !(texteHomme && !texteFemme)) ind.femme.push("genre « Femme »");
  const o = sansAccents(Array.isArray(origine) ? origine.join(" > ") : origine);
  if (/^(enfants?|bebes?|kids?)\b/.test(o)) ind.enfant.push("catégorie d'origine Enfants");
  if (/^hommes?\b/.test(o)) ind.homme.push("catégorie d'origine Hommes");
  if (/^femmes?\b/.test(o)) ind.femme.push("catégorie d'origine Femmes");
  const texte = sansAccents(`${titre} ${description}`);
  // Un âge (« 10 ans », « 6 mois ») ou une taille en cm ne se lisent que dans
  // le TITRE et la TAILLE : « portée 2 mois » dans une description ne fait pas
  // un article d'enfant. Les mots (« enfant », « bébé », « kids ») partout.
  const titreTaille = sansAccents(`${titre} ${taille}`);
  for (const [re, quoi, ou] of [[RE_ENFANT_MOT, "mot", texte], [RE_ENFANT_AGE, "âge", titreTaille], [RE_ENFANT_CM, "taille en cm", titreTaille]]) {
    const m = ou.match(re);
    // « portée 2 mois », « achetée il y a 3 mois » : une durée, pas un âge.
    if (m && !(re === RE_ENFANT_AGE && RE_DUREE_AVANT.test(ou.slice(Math.max(0, m.index - 16), m.index)))) {
      ind.enfant.push(`${quoi} « ${m[0].trim()} »`);
    }
  }
  const mh = texte.match(RE_HOMME); if (mh) ind.homme.push(`« ${mh[0]} »`);
  const mf = texte.match(RE_FEMME); if (mf) ind.femme.push(`« ${mf[0]} »`);
  // Ce que dit le TEXTE seul (ni le genre de la fiche, ni la catégorie
  // d'origine) : un texte qui se dit enfant ET adulte est un article mixte.
  ind.texteEnfant = ind.enfant.some((x) => /^(mot|âge|taille en cm) /.test(x));
  ind.texteAdulte = !!(mh || mf);
  return ind;
}

// ── L'OBJET : VÊTEMENT, CHAUSSURE OU ACCESSOIRE ────────────────────────────
// Sur le mot de l'IA d'abord ; sinon sur le PREMIER de ces mots dans le titre
// (le nom en tête : « Short de basket », « Maillot de basket », « Baskets
// Nike » — un mot plus loin ne prend jamais le dessus). Liste fermée,
// français et anglais ; ce qui n'y est pas ne juge rien.
const MOTS = {
  chaussure: ["baskets?", "sneakers?", "trainers?", "chaussures?", "chaussons?", "bottes?", "bottines?", "boots?", "sandales?", "sandals?",
    "escarpins?", "mocassins?", "loafers?", "tongs?", "claquettes?", "slides?", "derbys?", "derbies", "richelieus?", "espadrilles?",
    "ballerines?", "mules?", "sabots?", "crocs", "shoes?", "heels?", "pumps?", "converses?", "slippers?", "flip-?flops?"],
  vetement: ["shorts?", "bermudas?", "pantalons?", "jeans?", "jupes?", "robes?", "t-?shirts?", "tee-?shirts?", "sweats?", "sweat-?shirts?",
    "hoodies?", "pulls?", "pull-?overs?", "gilets?", "cardigans?", "vestes?", "manteaux", "manteau", "blousons?", "doudounes?", "parkas?",
    "chemises?", "chemisiers?", "polos?", "debardeurs?", "tops?", "crop-?tops?", "leggings?", "joggings?", "joggers?", "survetements?",
    "combinaisons?", "salopettes?", "pyjamas?", "maillots?", "bodys?", "brassieres?", "chaussettes?", "collants?", "culottes?", "slips?",
    "boxers?", "calecons?", "costumes?", "blazers?", "kimonos?", "ponchos?", "tuniques?", "pantacourts?", "jumpsuits?", "dress(?:es)?",
    "jackets?", "coats?", "jumpers?", "sweaters?", "shirts?", "trousers?", "pants", "skirts?", "socks?", "tracksuits?", "jerseys?",
    "peignoirs?", "deguisements?", "grenouilleres?", "blouses?", "corsets?", "bikinis?", "tankinis?"],
  accessoire: ["sacs?", "sacoches?", "pochettes?", "portefeuilles?", "porte-?monnaies?", "ceintures?", "casquettes?", "bonnets?", "chapeaux",
    "chapeau", "echarpes?", "foulards?", "gants?", "lunettes?", "montres?", "bijoux", "bijou", "colliers?", "bracelets?", "bagues?",
    "bags?", "belts?", "caps?", "hats?", "beanies?", "scarf", "scarves", "gloves?", "sunglasses", "watch(?:es)?", "wallets?", "backpacks?"],
};
const RE_FAMILLE = Object.fromEntries(Object.entries(MOTS).map(([k, l]) => [k, new RegExp(`(?:^|[^a-z0-9])(${l.join("|")})(?![a-z0-9])`, "g")]));

function premierMot(texte) {
  const t = sansAccents(texte);
  let meilleur = null;
  for (const [famille, re] of Object.entries(RE_FAMILLE)) {
    re.lastIndex = 0;
    const m = re.exec(t);
    if (!m) continue;
    const pos = m.index + (m[0].length - m[1].length);
    if (!meilleur || pos < meilleur.pos) meilleur = { famille, mot: m[1], pos };
  }
  return meilleur;
}

/** La famille de l'objet : le mot de l'IA d'abord, puis le nom en tête du titre. */
export function familleObjetDepop({ titre = "", objet = "" } = {}) {
  const parIa = objet ? premierMot(objet) : null;
  if (parIa) return { famille: parIa.famille, mot: parIa.mot, source: "objet_ia" };
  const parTitre = premierMot(titre);
  if (parTitre) return { famille: parTitre.famille, mot: parTitre.mot, source: "titre" };
  return { famille: null, mot: null, source: null };
}

// ── LES DÉPARTEMENTS PLAUSIBLES, PUIS LES CANDIDATES ───────────────────────
const MODE = ["menswear", "womenswear", "kidswear"];
/**
 * @param {{ enfant: string[], homme: string[], femme: string[] }} ind
 * @param {{ horsMode?: boolean|null }} o  true = objet hors mode (table de
 *   l'icône), false = mode, null = on ne sait pas.
 */
export function departementsDepop(ind, { horsMode = null } = {}) {
  if (horsMode === true) return ["everything-else"];
  const deps = [];
  const h = ind.homme.length > 0;
  const f = ind.femme.length > 0;
  if (ind.enfant.length) deps.push("kidswear");
  if (h && !f) deps.push("menswear");
  else if (f && !h) deps.push("womenswear");
  else if (!ind.enfant.length || (h && f)) deps.push("menswear", "womenswear");
  if (horsMode == null) deps.push("everything-else");
  return deps;
}
/** (18/10) Le rayon que la catégorie d'ORIGINE nomme seule (Hommes / Femmes / Enfants), sinon null. */
export function departementDeLOrigine(origine) {
  const o = sansAccents(Array.isArray(origine) ? origine.join(" > ") : origine ?? "").trim();
  if (/^(enfants?|bebes?|kids?)\b/.test(o)) return "kidswear";
  if (/^hommes?\b/.test(o)) return "menswear";
  if (/^femmes?\b/.test(o)) return "womenswear";
  return null;
}
/** Les feuilles OFFICIELLES de ces départements, sous leurs libellés corrigés. */
export function candidatsRayonDepop(departements) {
  const deps = new Set(departements);
  return FEUILLES_DEPOP
    .filter((f) => f.officielle && deps.has(f.id.split("/")[0]))
    .map((f) => ({ chemin: libellesRayonDepop(f.id), id: f.id }));
}

const GROUPES_VETEMENT = new Set(["tops", "bottoms", "dresses", "coats-jackets", "jumpsuit-and-playsuit", "suits", "nightwear",
  "underwear", "swim-beach-wear", "sleepsuits-and-bodysuits", "bundles", "fancy-dress"]);

/**
 * Le verdict des garde-fous sur une feuille proposée.
 * @returns {{ ok: true } | { ok: false, motif: string, detail: string }}
 */
export function jugerRayonDepop(id, { indices, famille, departements }) {
  const f = PAR_ID.get(String(id ?? ""));
  if (!f) return { ok: false, motif: "feuille_inconnue", detail: `${id} n'est pas une feuille Depop relevée` };
  const [dep, groupe] = f.id.split("/");
  if (departements && !departements.includes(dep)) return { ok: false, motif: "departement_non_propose", detail: `${dep} n'était pas proposé` };
  const fam = famille?.famille ?? null;
  if (groupe === "footwear" && fam === "vetement") {
    return { ok: false, motif: "vetement_en_chaussures", detail: `« ${famille.mot} » est un vêtement, ${texteRayonDepop(id)} est un rayon de chaussures` };
  }
  if (GROUPES_VETEMENT.has(groupe) && fam === "chaussure") {
    return { ok: false, motif: "chaussure_en_vetement", detail: `« ${famille.mot} » est une chaussure, ${texteRayonDepop(id)} est un rayon de vêtements` };
  }
  if (dep === "kidswear" && !indices.enfant.length) {
    return { ok: false, motif: "enfant_sans_indice", detail: "aucun indice d'âge enfant dans la fiche" };
  }
  if ((dep === "menswear" || dep === "womenswear") && indices.enfant.length && !indices.homme.length && !indices.femme.length) {
    return { ok: false, motif: "adulte_pour_enfant", detail: `article d'enfant (${indices.enfant[0]}) rangé en ${texteRayonDepop(id)}` };
  }
  if (dep === "menswear" && indices.femme.length && !indices.homme.length) {
    return { ok: false, motif: "genre_contraire", detail: `article femme (${indices.femme[0]}) rangé en Homme` };
  }
  if (dep === "womenswear" && indices.homme.length && !indices.femme.length) {
    return { ok: false, motif: "genre_contraire", detail: `article homme (${indices.homme[0]}) rangé en Femme` };
  }
  return { ok: true };
}

/**
 * La question « Rayon Depop » (needsUserField, choix fermés en français) :
 * les feuilles des départements plausibles, réduites à la famille de l'objet
 * quand elle est connue. Le libellé choisi revient dans `depopCategorie`
 * (idDepuisReponseRayonDepop le traduit en identifiant).
 */
export function questionRayonDepop({ departements, famille }) {
  const fam = famille?.famille ?? null;
  const garder = (id) => {
    const g = id.split("/")[1];
    if (fam === "chaussure") return g === "footwear";
    if (fam === "vetement") return GROUPES_VETEMENT.has(g);
    if (fam === "accessoire") return g === "accessories";
    return true;
  };
  let choix = candidatsRayonDepop(departements).filter((c) => garder(c.id));
  if (!choix.length) choix = candidatsRayonDepop(departements);
  const textes = choix.map((c) => c.chemin.join(" › "));
  const autres = textes.filter((t) => / › Autre$/.test(t));
  return {
    field_key: CLE_QUESTION_RAYON_DEPOP,
    field_label: "Rayon Depop",
    input_type: "select",
    allowed_values: [...textes.filter((t) => !/ › Autre$/.test(t)), ...autres].slice(0, 120),
    explication: "Choisis le rayon où ton article sera rangé sur Depop.",
    target: { root: null, key: CLE_QUESTION_RAYON_DEPOP },
  };
}

/** Le message du job quand le rayon Depop se demande. */
export const MESSAGE_RAYON_DEPOP =
  "Choisis le rayon Depop de cet article : rien n'est parti, la publication repart toute seule dès que c'est fait.";

/**
 * LE MOTEUR. `demanderIA(corps)` appelle resolve-categorie (l'app : supabase.
 * functions.invoke ; le serveur : fetch + x-cron-secret) et rend sa réponse
 * ({ choix: { depop: { id, chemin } }, motif? }).
 * @param {{ titre?: string, description?: string, genre?: string, origine?: string[]|string|null,
 *           objet?: string, horsMode?: boolean|null, taille?: string, marque?: string, user_id?: string|null }} ctx
 * @returns {Promise<{ id: string, chemin: string[], libelles: string[], source: string, indices, famille, departements }
 *          | { question: object, motif: string, detail?: string, rejete?: string|null, indices, famille, departements, iaIndisponible?: boolean }>}
 */
export async function resoudreRayonDepop(ctx, demanderIA) {
  const indices = indicesAgeGenre(ctx);
  const famille = familleObjetDepop(ctx);
  let departements = departementsDepop(indices, { horsMode: ctx.horsMode ?? null });
  // L'article se dit, dans son propre texte, enfant ET adulte (un lot « Enfant
  // XL / S Homme ») : aucun rayon unique n'est sûr par le texte.
  // (18/10, « zéro friction ») … sauf si la catégorie d'ORIGINE (le choix du
  // vendeur sur sa plateforme : Vinted « Hommes › Vêtements › … ») nomme UN seul
  // rayon : c'est lui — « Enfant XL » n'y était qu'une équivalence de taille. La
  // personne ne choisit que si l'origine manque ou ne tranche pas.
  if (indices.texteEnfant && indices.texteAdulte) {
    const dep = departementDeLOrigine(ctx.origine);
    if (!dep) {
      const base0 = { indices, famille, departements };
      return { ...base0, question: questionRayonDepop(base0), motif: "enfant_et_adulte", detail: `l'article se dit à la fois enfant (${indices.enfant[0]}) et adulte (${[...indices.homme, ...indices.femme][0]})`, rejete: null };
    }
    departements = [dep];
  }
  const candidats = candidatsRayonDepop(departements);
  const base = { indices, famille, departements };
  const dire = (l) => (l.length ? l.join(", ") : "");
  const attributs = {
    description: String(ctx.description ?? "").replace(/\s+/g, " ").trim(),
    genre: ctx.genre || "",
    "âge enfant": dire(indices.enfant),
    "genre dit": [indices.homme.length ? "homme" : "", indices.femme.length ? "femme" : ""].filter(Boolean).join(" et "),
    objet: ctx.objet || famille.mot || "",
    "catégorie d'origine": Array.isArray(ctx.origine) ? ctx.origine.join(" > ") : (ctx.origine || ""),
    taille: ctx.taille || "",
    marque: ctx.marque || "",
  };
  let rep = null;
  try {
    rep = await demanderIA({
      titre: String(ctx.titre ?? ""),
      attributs,
      candidats: { depop: candidats },
      max_candidats: Math.max(candidats.length, 20),
      ...(ctx.user_id ? { user_id: ctx.user_id } : {}),
    });
  } catch (e) {
    return { ...base, question: questionRayonDepop(base), motif: "ia_injoignable", detail: String(e?.message ?? e).slice(0, 160), rejete: null, iaIndisponible: true };
  }
  const choisi = rep?.choix?.depop?.id ?? null;
  if (!choisi) {
    const indispo = rep?.motif === "ia_indisponible" || rep?.error != null;
    return { ...base, question: questionRayonDepop(base), motif: indispo ? "ia_indisponible" : "ia_aucune", rejete: null, iaIndisponible: indispo };
  }
  const v = jugerRayonDepop(choisi, base);
  if (!v.ok) return { ...base, question: questionRayonDepop(base), motif: v.motif, detail: v.detail, rejete: choisi };
  return { ...base, id: choisi, chemin: choisi.split("/"), libelles: libellesRayonDepop(choisi), source: "ia" };
}

/** La trace posée sur le job (`platform_fields.depop_rayon`). */
export function traceRayonDepop(r, { par }) {
  return {
    version: VERSION_RAYON_DEPOP,
    le: new Date().toISOString(),
    par,
    ...(r.id ? { id: r.id, source: r.source } : { question: true, motif: r.motif, ...(r.detail ? { detail: r.detail } : {}), ...(r.rejete ? { rejete: r.rejete } : {}) }),
    famille: r.famille?.famille ?? null,
    mot: r.famille?.mot ?? null,
    departements: r.departements,
    indices: { enfant: r.indices.enfant.slice(0, 3), homme: r.indices.homme.slice(0, 2), femme: r.indices.femme.slice(0, 2) },
  };
}

/**
 * Le job porte-t-il un rayon Depop qui peut partir ? Rendu par CE moteur (trace
 * `depop_rayon` à jour, même identifiant), ou choisi par la personne
 * (`categorie_source` « choix_humain » : carte Rayon de l'app, réponse à la
 * question). Toujours une feuille relevée.
 */
export function rayonDepopAJour(pf) {
  const chemin = Array.isArray(pf?.depopCategoryPath) && pf.depopCategoryPath.length === 3 ? pf.depopCategoryPath.join("/") : null;
  if (!chemin || !PAR_ID.has(chemin)) return false;
  if (pf?.categorie_source === "choix_humain") return true;
  const t = pf?.depop_rayon;
  return !!(t && typeof t === "object" && Number(t.version) >= VERSION_RAYON_DEPOP && t.id === chemin);
}

/** L'identifiant répondu à la question « Rayon Depop » (`depopCategorie`), ou null. */
export function reponseRayonDepop(pf) {
  const brut = pf?.[CLE_QUESTION_RAYON_DEPOP];
  return brut == null ? null : idDepuisReponseRayonDepop(brut);
}
