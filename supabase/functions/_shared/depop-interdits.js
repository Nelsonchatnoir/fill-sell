// ═══════════════════════════════════════════════════════════════════════════
// LES ARTICLES QUE DEPOP INTERDIT — UNE SEULE TABLE (09/10/2026 soir, Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Depop interdit la plupart des objets électriques et électroniques, et
// d'autres familles : une annonce refusée peut valoir une sanction au compte
// Depop de la personne. Autant ne jamais la déposer.
//
// SOURCES — centre d'aide officiel, version anglaise (aucune version française
// n'existe : locales en-gb et en-us seulement), lues le 09/10/2026 :
//   [TECH] « Technology and Electronics Policy » (modifiée le 02/02/2026)
//     https://depophelp.zendesk.com/hc/en-gb/articles/22500114413841-Technology-and-Electronics-Policy
//   [RH]   « Restricted and Hazardous Content Policy » (modifiée le 29/07/2026)
//     https://depophelp.zendesk.com/hc/en-gb/articles/22503846834833-Restricted-and-Hazardous-Content-Policy
//   [PI]   « What are Depop's prohibited items? » (affiche « Last Update: May
//     2025 », modifiée le 29/07/2026 selon le centre d'aide)
//     https://depophelp.zendesk.com/hc/en-gb/articles/360001792167-What-are-Depop-s-prohibited-items
//
// LA RÈGLE (Nico) : on juge la CATÉGORIE de l'article — l'icône de
// detectObjectIcon (src/utils/shared.js), la même que celle qui choisit les
// rayons — jamais un mot du titre isolé. Aucune catégorie de MODE n'est dans
// cette table (selftest:depop-interdits le vérifie). Une catégorie AMBIGUË
// (électrique ou non selon l'objet) n'est PAS bloquée : elle est listée dans
// DEPOP_A_VERIFIER, avec la raison.
//
// UN SEUL fichier, lu des deux côtés (même patron que beebs-interdits.js) :
//   · l'app (src/utils/platformCompat.js) : la carte Depop est GRISÉE avec la
//     phrase ci-dessous ; le lot exclut Depop pour ces articles et le dit ;
//   · le serveur (get-pending-jobs) : filet sur TOUT job Depop (publication,
//     republication, remise en vente, ancienne version de l'app) — il ne part
//     jamais vers l'extension : needs_user avec la même phrase.
// ES module SANS import : chargé tel quel par Vite (app) et par Deno.
// ═══════════════════════════════════════════════════════════════════════════

export const DEPOP_SOURCES = Object.freeze({
  tech: { titre: "Technology and Electronics Policy", url: "https://depophelp.zendesk.com/hc/en-gb/articles/22500114413841-Technology-and-Electronics-Policy", modifiee: "2026-02-02" },
  rh: { titre: "Restricted and Hazardous Content Policy", url: "https://depophelp.zendesk.com/hc/en-gb/articles/22503846834833-Restricted-and-Hazardous-Content-Policy", modifiee: "2026-07-29" },
  pi: { titre: "What are Depop's prohibited items?", url: "https://depophelp.zendesk.com/hc/en-gb/articles/360001792167-What-are-Depop-s-prohibited-items", modifiee: "2026-07-29" },
});
export const DEPOP_INTERDITS_LUS_LE = "2026-10-09";

// Les familles de refus, et la phrase écrite à la personne (courte, claire).
export const DEPOP_REGLES = Object.freeze({
  electrique: {
    source: "tech",
    citation: "Items that use electrical power (including batteries and solar power) are not allowed.",
    fr: "Depop n'accepte pas les objets électriques ou électroniques.",
    en: "Depop doesn't accept electrical or electronic items.",
  },
  puericulture: {
    source: "pi",
    citation: "Restricted products for children and infants: infant sleep furniture […], children's and infants' car seats […], prams, pushchairs and strollers […]",
    fr: "Depop n'accepte pas ce matériel de puériculture (sièges auto, poussettes, couchage bébé).",
    en: "Depop doesn't accept this baby equipment (car seats, prams, infant sleep items).",
  },
});

// icône → { regle, quoi (ce que la catégorie contient), citation exacte }.
const I = (regle, quoi, citation) => Object.freeze({ regle, quoi, citation });
export const DEPOP_INTERDITS_PAR_ICONE = Object.freeze({
  // ── Électrique et électronique [TECH] « Please do not list: » ─────────────
  "📱": I("electrique", "téléphones", "Mobile phones"),
  "💻": I("electrique", "ordinateurs portables", "Computers, laptops, tablets and E-readers"),
  "🖥️": I("electrique", "ordinateurs, écrans, composants", "Computers, laptops, tablets and E-readers"),
  "📲": I("electrique", "tablettes", "Computers, laptops, tablets and E-readers"),
  "📇": I("electrique", "liseuses", "Computers, laptops, tablets and E-readers"),
  "⌨️": I("electrique", "claviers d'ordinateur", "Chargers, USB cables and other electronic accessories"),
  "🖱️": I("electrique", "souris d'ordinateur", "Chargers, USB cables and other electronic accessories"),
  "🖨️": I("electrique", "imprimantes, scanners", "Computers, laptops, tablets, E-readers and related accessories"),
  "⏱️": I("electrique", "montres connectées, bracelets d'activité", "Smartwatches and fitness watches or fitness trackers"),
  "🎧": I("electrique", "casques, écouteurs", "Speakers or headphones"),
  "🔊": I("electrique", "enceintes, barres de son", "Speakers or headphones"),
  "📡": I("electrique", "enceintes connectées, assistants vocaux", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  "🎮": I("electrique", "consoles et manettes", "Games consoles and controllers"),
  "📺": I("electrique", "télévisions, projecteurs", "Televisions and DVD players"),
  "🔌": I("electrique", "chargeurs, câbles, batteries externes", "Battery banks, chargers, USB cables and hard drives"),
  "🛸": I("electrique", "drones", "Items that use electrical power (including batteries and solar power) are not allowed."),
  "🚁": I("electrique", "jouets télécommandés", "Electronic toys"),
  "📟": I("electrique", "babyphones", "Items that use electrical power (including batteries and solar power) are not allowed."),
  "💇": I("electrique", "sèche-cheveux, lisseurs, boucleurs", "Cosmetic electronics such as hair dryers or styling tools"),
  "🪒": I("electrique", "tondeuses, rasoirs, épilateurs", "Cosmetic electronics such as hair stylers, clippers and trimmers"),
  "💡": I("electrique", "lampes, luminaires, ampoules", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  // Électroménager : [TECH] « kitchen appliances », [PI] « appliances ».
  "⚡": I("electrique", "électroménager", "Home and lifestyle electronics such as lighting, virtual assistants and appliances"),
  "🧺": I("electrique", "lave-linge, sèche-linge, lave-vaisselle", "Home and lifestyle electronics such as lighting, virtual assistants and appliances"),
  "☕": I("electrique", "machines à café", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  "🧹": I("electrique", "aspirateurs", "Home and lifestyle electronics such as lighting, virtual assistants and appliances"),
  "🧊": I("electrique", "réfrigérateurs, congélateurs", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  "♨️": I("electrique", "fours, micro-ondes", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  "🥣": I("electrique", "mixeurs, robots de cuisine", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  "🍞": I("electrique", "grille-pain", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  "🍟": I("electrique", "friteuses", "Home & lifestyle electronics such as lighting, virtual assistants and kitchen appliances"),
  "🌀": I("electrique", "ventilateurs, climatiseurs, purificateurs", "Home and lifestyle electronics such as lighting, virtual assistants and appliances"),
  "🌡️": I("electrique", "radiateurs, chauffages d'appoint", "Home and lifestyle electronics such as lighting, virtual assistants and appliances"),
  "🧵": I("electrique", "machines à coudre", "Home and lifestyle electronics such as lighting, virtual assistants and appliances"),
  // ── Puériculture [PI] « RESTRICTED PRODUCTS FOR CHILDREN AND INFANTS » ────
  "👶": I("puericulture", "poussettes, landaus", "Prams, pushchairs and strollers, and their replacement parts"),
  "💺": I("puericulture", "sièges auto", "Children's and infants' car seats and car seat restraint straps"),
  "🚼": I("puericulture", "lits bébé, berceaux, cododos (et tables à langer, rangées avec eux)", "Infant sleep furniture and accessories, including cribs, cots, bassinets, moses baskets, infant mattresses"),
});

// Les catégories que le texte ne tranche PAS : jamais bloquées, dites au rapport.
export const DEPOP_A_VERIFIER = Object.freeze({
  "🎮 (jeux)": "jeux vidéo en disque ou cartouche : aucune page ne les nomme (seuls consoles, manettes et « related accessories »). Depop n'a aucun rayon jeux vidéo.",
  "📀": "DVD, Blu-ray, VHS : seuls « DVD players and related products » sont nommés.",
  "💿": "vinyles autorisés, mais la catégorie contient aussi les platines (électriques).",
  "🎹": "pianos, claviers, synthés : électriques le plus souvent, pas tous.",
  "🎤": "micros : non nommés.",
  "🎸": "guitares : électriques ou acoustiques ; l'instrument lui-même ne se branche pas toujours.",
  "🕰️": "horloges, réveils : à pile le plus souvent (interdit) ; mécaniques (autorisé). Seules les montres-bracelets sont une exception écrite.",
  "🛴": "trottinettes (manuelles) et hoverboards, gyroroues (électriques) dans la même catégorie.",
  "🏃": "tapis de course (électrique), rameurs (souvent mécaniques).",
  "🫖": "bouilloires (électriques) et théières (non) dans la même catégorie.",
  "🧼": "fers à repasser (électriques) et tables à repasser (non) dans la même catégorie.",
  "🪛": "perceuses (électriques) et tournevis (non) dans la même catégorie.",
  "🪚 ✂️": "scies, taille-haies, sécateurs : « Knives and sharp implements of any type » [RH] laisse penser que c'est interdit, sans les nommer.",
  "🌱 🔥": "tondeuses à gazon, barbecues : électriques, thermiques ou à gaz selon l'objet.",
  "🍼": "biberons : non nommés (seuls « Infant teething items » et « Infant formula »).",
  "🚲 🚗": "vélos et voitures : la version électrique n'est pas distinguée par la catégorie.",
  "hors catégorie": "couteaux, alcool, tabac et vapotage, médicaments, nourriture, contrefaçons : interdits par Depop, mais l'app n'a aucune catégorie qui les isole — rien n'est bloqué par catégorie.",
});

/**
 * Le refus Depop d'un article, ou null (autorisé, ou à vérifier).
 * @param {string} icon     l'icône de detectObjectIcon
 * @param {string|null} familleJeu  pour 🎮 seulement : la famille de
 *   familleJeuVideo (src/utils/jeuxVideo.js) — « jeu » n'est PAS bloqué
 *   (texte muet), « console », « accessoire » ou inconnue le sont.
 * @returns {{ regle, quoi, citation, icone }|null}
 */
export function verdictDepopInterdit(icon, familleJeu = null, titre = "") {
  const e = DEPOP_INTERDITS_PAR_ICONE[icon];
  if (!e) return null;
  if (icon === "🎮" && familleJeu === "jeu") return null;
  // EXCEPTION ÉCRITE PAR DEPOP [TECH] : « Mobile phone & laptop cases, covers,
  // folios and holders » sont AUTORISÉS. Mesuré le 09/10 : 162 des 295
  // « téléphones » en stock sont des coques. Lue sur le TITRE seul (une
  // description qui dit « coque offerte » ne libère jamais un téléphone), et
  // seulement pour LIBÉRER — jamais pour bloquer.
  if (ICONES_AVEC_ETUIS.has(icon) && ETUI_RE.test(normaliser(titre))) return null;
  return { regle: e.regle, quoi: e.quoi, citation: e.citation, icone: icon };
}

const ICONES_AVEC_ETUIS = new Set(["📱", "💻", "📲", "📇"]);
const normaliser = (s) => String(s ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
const ETUI_RE = /\b(coques?|housses?|etuis?|folios?|cases?|sleeves?|supports?|porte[ -]?telephones?)\b/;

/** La phrase écrite à la personne. */
export function messageDepopInterdit(verdict, lang = "fr") {
  const r = DEPOP_REGLES[verdict?.regle] ?? DEPOP_REGLES.electrique;
  return lang === "en" ? r.en : r.fr;
}
