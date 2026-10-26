// ══════════════════════════════════════════════════════════════════════════
// LES CHAMPS REQUIS QUI SE REMPLISSENT SEULS QUAND UNE SOURCE FIABLE EXISTE (25/10 soir, décisions de Nico)
// ══════════════════════════════════════════════════════════════════════════
// Règle commune (Nico) : « on ne devine JAMAIS. Pas de source fiable → on revient au comportement actuel (la question
// est posée). Le pire cas autorisé, c'est « on demande comme aujourd'hui », jamais « on met une valeur fausse ». »
// Diagnostic (7 jours au 25/10) : 418 questions sur 26 comptes, dont Beebs Taille 135, Beebs Âge 52, Beebs Matière 11,
// eBay Matière 8 (docs/enquetes/soir-2510/CHAMPS-REQUIS.md). Chaque fonction est PURE et rend
// { valeur, source, motif } (posée, jamais bloquante, tracée « option_du_texte »), { doute } ou null (question).
// La pointure vit dans pointure-du-texte.js. ES module pur (Deno + Node + Vite), sans dépendance.

const nfc = (t) => String(t ?? "").normalize("NFC");
const plier = (t) => nfc(t).normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[’']/g, "'");
const cheminTexte = (chemin) => plier(Array.isArray(chemin) ? chemin.join(" > ") : chemin);
const dansListe = (valeur, liste) => (Array.isArray(liste) ? liste : []).map(String).find((o) => plier(o) === plier(valeur)) ?? null;

// ── a) MATIÈRE BEEBS ─────────────────────────────────────────────────────────────────────────────────────────────
// Les 10 rayons Beebs qui l'exigent ont tous la même liste : Plastique, Bois, Caoutchouc, Tissu, Carton, Autre.
// Ordre : la matière de la FICHE (le vendeur, Vinted, une étiquette) quand elle se traduit en une seule entrée de la
// liste → la règle du RAYON (décision de Nico : « jouet électronique → Plastique, peluche → Tissu… ») → « Autre ».
// ⛔ Jamais le texte libre (« livrée dans sa boîte en carton » n'est pas la matière du jouet).
const MATIERE_FICHE = [
  [/\b(coton|polyester|laine|velours|lin|tissu|textile|feutrine|polaire|satin|peluche|acrylique|viscose|elasthanne|soie)\b/, "Tissu"],
  [/\b(plastique|plastic|pvc|vinyle?|abs|polypropylene|polyethylene)\b/, "Plastique"],
  [/\b(bois|wood|wooden|bambou|hetre|chene)\b/, "Bois"],
  [/\b(caoutchouc|silicone|latex|rubber)\b/, "Caoutchouc"],
  [/\b(carton|papier|cartonne)\b/, "Carton"],
];
// Le rayon qui dit sa matière (mesuré le 25/10 sur 90 jours d'annonces publiées : Figurines « Plastique » 15 sur 17,
// jouets électroniques 2 sur 2) ; les autres rayons (formes, Montessori, puzzles, voitures, jouets de bain) → « Autre ».
const MATIERE_RAYON = [
  [/\bdoudous?\b/, "Tissu"],
  [/\bpeluches?\b/, "Tissu"],
  [/jouets electroniques pour bebe/, "Plastique"],
  [/jouets en bois/, "Bois"],
  [/\bfigurines?\b/, "Plastique"],
];
/** @returns {{valeur:string, source:string, motif:string} | null} */
export function matiereBeebsAuto({ chemin = null, valeurFiche = "", allowedValues = [] } = {}) {
  const autre = dansListe("Autre", allowedValues);
  if (!autre) return null;                      // pas la liste attendue : on ne pose rien
  const f = plier(valeurFiche);
  if (f.trim()) {
    const lus = [...new Set(MATIERE_FICHE.filter(([re]) => re.test(f)).map(([, v]) => v))];
    if (lus.length === 1 && dansListe(lus[0], allowedValues)) {
      return { valeur: dansListe(lus[0], allowedValues), source: "matiere_de_la_fiche", motif: `matière de la fiche (« ${nfc(valeurFiche).trim()} »)` };
    }
    if (lus.length > 1) return { valeur: autre, source: "matiere_autre", motif: "plusieurs matières sur la fiche" };
  }
  const c = cheminTexte(chemin);
  const r = MATIERE_RAYON.find(([re]) => re.test(c));
  if (r && dansListe(r[1], allowedValues)) return { valeur: dansListe(r[1], allowedValues), source: "matiere_du_rayon", motif: `rayon ${nfc(Array.isArray(chemin) ? chemin[chemin.length - 1] : chemin)}` };
  return { valeur: autre, source: "matiere_autre", motif: "aucune matière sûre : « Autre »" };
}

// ── c) ÂGE BEEBS ─────────────────────────────────────────────────────────────────────────────────────────────────
// Ordre : l'âge ÉCRIT (« dès 3 ans », « à partir de 18 mois », « 3+ », une tranche exacte « 4-6 ans ») → le classement
// PEGI / USK d'un jeu vidéo (écrit, ou lu sur la fiche) → un livre / magazine / film ADULTE → « 16 ans et + ».
// ⛔ Un livre JEUNESSE n'est JAMAIS mis en « 16 ans et + » : le moindre signe jeunesse (rayon « Romans pour enfant »,
// « jeunesse », « enfant », « album », « conte », un âge écrit…) l'écarte ; adulte ET jeunesse indécidables → question.
// Jouets : un défaut par rayon seulement quand les publications réelles le prouvent — mesuré le 25/10 sur 6 mois de
// publications Beebs : AUCUN rayon de jouets n'a d'âge dominant (Figurines 24 %, Peluches 25 %, Puzzles 33 %) : la table
// reste vide, l'âge écrit sur la boîte ou dans le texte est lu, sinon la question reste.
export const AGE_PAR_RAYON_JOUETS = Object.freeze({});
const TRANCHES = ["0-6 mois", "6-12 mois", "12-24 mois", "2 ans - 3 ans", "3 ans - 4 ans", "4 ans - 6 ans", "6 ans - 8 ans", "8 ans - 12 ans", "12 ans - 16 ans", "16 ans et +"];
const trancheDuMinimum = ({ mois = null, ans = null }) => {
  if (mois != null) {
    if (mois < 6) return "0-6 mois";
    if (mois < 12) return "6-12 mois";
    if (mois < 24) return "12-24 mois";
    ans = Math.floor(mois / 12);
  }
  if (ans == null) return null;
  if (ans < 2) return null;
  if (ans < 3) return "2 ans - 3 ans";
  if (ans < 4) return "3 ans - 4 ans";
  if (ans < 6) return "4 ans - 6 ans";
  if (ans < 8) return "6 ans - 8 ans";
  if (ans < 12) return "8 ans - 12 ans";
  if (ans < 16) return "12 ans - 16 ans";
  return "16 ans et +";
};
// Les tranches EXACTES écrites (« 4-6 ans », « 6/12 mois », « 8 à 12 ans ») : seulement si elles sont celles de Beebs.
const TRANCHE_EXACTE = /(?<![\p{N}])(\d{1,2})\s?(?:-|–|\/|a|à)\s?(\d{1,2})\s?(ans|mois)\b/giu;
const MINIMUMS = [
  [/(?:des|dès|a partir de|à partir de|a partir d'|des l'age de|dès l'âge de|age minimum|âge minimum)\s?:?\s?(\d{1,2})\s?(ans|mois)\b/giu, null],
  [/(?<![\p{L}\p{N}])(\d{1,2})\s?(ans|mois)\s?(?:et\s?\+|et plus|\+)/giu, null],
  [/(?<![\p{L}\p{N}+])\+\s?(\d{1,2})\s?(ans|mois)\b/giu, null],
  [/(?<![\p{L}\p{N}])(\d{1,2})\s?\+(?![\p{L}\p{N}])/giu, "ans"],      // « 3+ » sur une boîte
];
/** Les âges ÉCRITS dans les textes (pur) : la liste des tranches Beebs qu'ils désignent. */
export function agesEcrits(textes) {
  const out = new Set();
  for (const t of (Array.isArray(textes) ? textes : [textes])) {
    const s = plier(t);
    if (!s.trim()) continue;
    for (const m of s.matchAll(TRANCHE_EXACTE)) {
      const [a, b, u] = [Number(m[1]), Number(m[2]), m[3]];
      const ecrite = u === "mois" ? `${a}-${b} mois` : (a === 2 && b === 3 ? "2 ans - 3 ans" : `${a} ans - ${b} ans`);
      const t2 = TRANCHES.find((x) => plier(x) === plier(ecrite));
      out.add(t2 ?? `?${a}-${b} ${u}`);   // une fourchette qui n'est pas une tranche Beebs : un doute
    }
    for (const [re, unite] of MINIMUMS) {
      for (const m of s.matchAll(re)) {
        const n = Number(m[1]); const u = unite ?? m[2];
        if (n > 18) continue;
        const tr = trancheDuMinimum(u === "mois" ? { mois: n } : { ans: n });
        if (tr) out.add(tr);
      }
    }
  }
  return [...out];
}
const RE_JEUNESSE = /\b(jeunesse|enfants?|junior|kids?|bebes?|bebe|album|contes?|comptines?|ados?|adolescents?|maternelle|imagier|coloriages?|gommettes|autocollants|premiers? (pas|mots|livres?)|petit ours brun|t'?choupi|disney|pat'? ?patrouille|bibliotheque (rose|verte)|folio junior|j'aime lire|okapi|wapiti|picsou|scolaire|cp|ce1|ce2|cm1|cm2|livre (sonore|puzzle|anime|pop-?up)|tout[- ]carton|cartonne)\b|\b\d{1,2}\s?(ans|mois)\b/;
const RE_ADULTE_LIVRE = /\b(polar|thriller|policier|roman noir|essai|biographie|autobiographie|temoignage|philosophie|psychologie|developpement personnel|cuisine|recettes|guide du routard|roman graphique|erotique|pour adultes?|adulte|litterature (francaise|etrangere|contemporaine)|poesie|seinen|interdit aux moins de 1[68] ans|magazine (de )?(mode|deco|decoration|cuisine|auto|moto|people|feminin|masculin|d'art|photo)|vogue|marie claire|antidote|paris match|le monde|l'express|le point|telerama)\b/;
const RAYONS_LIVRES_FILMS = /\b(autres livres|bds?|mangas?|dvd|livres?)\b/;
const RAYONS_JEUNESSE = /(romans pour enfant|livres sonores et musicaux)/;
/** @returns {{valeur:string, source:string, motif:string} | {doute:string} | null} */
export function ageBeebsAuto({ chemin = null, textes = [], classement = "", ageClassement = null, allowedValues = [] } = {}) {
  const liste = Array.isArray(allowedValues) ? allowedValues : [];
  if (!liste.length) return null;
  const c = cheminTexte(chemin);
  // 1. L'âge écrit : une seule tranche Beebs, sinon doute.
  const ecrits = agesEcrits(textes);
  if (ecrits.length > 1 || ecrits.some((x) => x.startsWith("?"))) return { doute: `âges écrits différents ou hors tranches (${ecrits.join(", ")})` };
  if (ecrits.length === 1 && dansListe(ecrits[0], liste)) {
    const v = dansListe(ecrits[0], liste);
    // Un livre jeunesse ne finit jamais en « 16 ans et + », même écrit (« 16 ans » d'un âge de lecture ? doute).
    if (v === "16 ans et +" && RAYONS_JEUNESSE.test(c)) return { doute: "« 16 ans et + » sur un rayon jeunesse" };
    return { valeur: v, source: "age_ecrit", motif: `âge écrit par le vendeur (${v})` };
  }
  // 2. Un jeu vidéo : le classement PEGI / USK écrit ou lu sur la fiche (table BEEBS_AGE_PAR_CLASSEMENT de l'app).
  if (/jeux video/.test(c)) {
    const pegi = /\b(pegi|usk)\s?(3|6|7|12|16|18)\b/i.exec(`${nfc(classement)} ${(Array.isArray(textes) ? textes : [textes]).map(nfc).join(" ")}`);
    // (26/10, D1) Un classement ESRB RÉPONDU (la liste de Vinted) qui dit un âge minimum : même table que l'app
    // (src/utils/jeuxVideo.js, BEEBS_AGE_PAR_CLASSEMENT). Jamais lu dans le texte libre (une lettre seule y est ambiguë).
    const esrb = { "E10+": "8 ans - 12 ans", T: "12 ans - 16 ans", M: "16 ans et +", AO: "16 ans et +" }[(/^(E10\+|T|M|AO)\s*[–-]/.exec(nfc(classement).trim()) ?? [])[1]] ?? null;
    if (!pegi && esrb && dansListe(esrb, liste)) return { valeur: dansListe(esrb, liste), source: "age_pegi", motif: `classement ${nfc(classement).trim()}` };
    const tranche = ageClassement ?? (pegi ? null : null);
    const t = tranche ?? (pegi ? ({ pegi: { 3: "3 ans - 4 ans", 7: "6 ans - 8 ans", 12: "12 ans - 16 ans", 16: "16 ans et +", 18: "16 ans et +" }, usk: { 6: "6 ans - 8 ans", 12: "12 ans - 16 ans", 16: "16 ans et +", 18: "16 ans et +" } }[pegi[1].toLowerCase()]?.[pegi[2]] ?? null) : null);
    if (t && dansListe(t, liste)) return { valeur: dansListe(t, liste), source: "age_pegi", motif: `classement ${pegi ? pegi[0].toUpperCase() : nfc(classement)}` };
    return null;
  }
  // 3. Un livre, un magazine, un film ADULTE : signe adulte ET aucun signe jeunesse (rayon compris).
  if (RAYONS_LIVRES_FILMS.test(c) && !RAYONS_JEUNESSE.test(c)) {
    const t = plier((Array.isArray(textes) ? textes : [textes]).join(" \n "));
    const jeune = RE_JEUNESSE.test(t);
    const adulte = RE_ADULTE_LIVRE.test(t);
    if (adulte && !jeune && dansListe("16 ans et +", liste)) return { valeur: dansListe("16 ans et +", liste), source: "age_adulte", motif: "livre, magazine ou film pour adultes (aucun signe jeunesse)" };
    if (adulte && jeune) return { doute: "signes adulte ET jeunesse" };
    return null;
  }
  // 4. Jouets : défaut prouvé par le rayon (table vide au 25/10 : aucun rayon ne le prouve).
  const def = Object.entries(AGE_PAR_RAYON_JOUETS).find(([r]) => c.includes(plier(r)));
  if (def && dansListe(def[1], liste)) return { valeur: dansListe(def[1], liste), source: "age_du_rayon", motif: `défaut du rayon ${def[0]}` };
  return null;
}

// ── e) BIJOUX BEEBS HORS BAGUES → « Ajustable » ──────────────────────────────────────────────────────────────────
// « Bijoux (femme) » exige une « Taille » qui est une grille de BAGUES (14,1 mm … 22,6 mm) + « Ajustable ». Un collier,
// un bracelet, des boucles d'oreilles n'ont pas de taille de bague : « Ajustable » (décision de Nico). Une bague (ou un
// mot de bague : « anneau », « alliance », « chevalière ») garde sa question ; un type de bijou inconnu aussi ; une
// « parure » (qui peut compter une bague) aussi.
const RE_BAGUE = /\b(bagues?|anneaux?|alliances?|chevalieres?|rings?|solitaires?)\b/;
const RE_HORS_BAGUE = /\b(colliers?|bracelets?|boucles? d'oreilles?|boucles? d oreilles?|creoles?|broches?|pendentifs?|chaines?|chainettes?|sautoirs?|chevilleres?|pin'?s|barrettes?|charms?|medaillons?|gourmettes?|manchettes?|ras du cou|clous d'oreilles?|puces d'oreilles?|bijoux? de (cheveux|sac|telephone))\b/;
/** @returns {{valeur:string, source:string, motif:string} | null} */
export function tailleBijouBeebsAuto({ chemin = null, textes = [], allowedValues = [] } = {}) {
  if (!/\bbijoux\b/.test(cheminTexte(chemin))) return null;
  const ajustable = dansListe("Ajustable", allowedValues);
  if (!ajustable) return null;
  const t = plier((Array.isArray(textes) ? textes : [textes]).join(" \n "));
  if (RE_BAGUE.test(t) || /\bparures?\b/.test(t)) return null;
  const m = RE_HORS_BAGUE.exec(t);
  if (!m) return null;
  return { valeur: ajustable, source: "bijou_hors_bague", motif: `${m[0]} : pas une bague` };
}

// ── f) MONTRES : « Taille » = le DIAMÈTRE DU BOÎTIER (26/10 nuit, point 1 — la G-Shock GA-2100 de Nico) ──────────
// Vinted (« Montres », « Montres connectées ») et Beebs (« Montres (homme|femme) ») exigent une « Taille » qui est une
// grille de diamètres de boîtier (Jusqu'à 30 mm, 31/30–38 mm, 39–42 mm, 43–46 mm, 47 mm et plus) + « Taille unique ».
// Le lot de Nico demandait cette « Taille » (sélecteur de vêtements) et l'IA, ailleurs, en posait une au hasard
// (« 39 mm - 42 mm » sans aucune source). Règle : le diamètre ÉCRIT par le vendeur, collé à un mot du boîtier
// (« boîtier 42 mm », « diamètre de 40 mm », « cadran 38 mm », « 45 mm de diamètre ») → sa tranche ; aucun diamètre
// écrit → « Taille unique » (une montre se règle au poignet : la grille la propose pour ça, et l'extension Beebs pose
// déjà la neutre quand la copie n'a rien — règle du 21/09). Jamais deviné : « bracelet 20 mm » n'est pas le boîtier ;
// deux diamètres différents → la question.
const RE_DIAMETRE_AVANT = /\b(?:boitier|cadran|diametre|lunette)(?:\s+(?:de|d'environ|environ|d'un|du|:|=))*\s*(\d{2}(?:[.,]\d{1,2})?)\s?mm\b/g;
const RE_DIAMETRE_APRES = /\b(\d{2}(?:[.,]\d{1,2})?)\s?mm\s+(?:de\s+)?diametre\b/g;
/** Les tranches de la grille : [min, max[ en mm, lues dans SES libellés (jamais une table à nous). */
function tranchesDiametre(allowedValues) {
  const out = [];
  for (const v of (Array.isArray(allowedValues) ? allowedValues : []).map(String)) {
    const p = plier(v).replace(/[–—]/g, "-");
    let m;
    if ((m = /^jusqu'a\s*(\d{2})\s*mm$/.exec(p))) out.push({ v, min: 0, max: Number(m[1]) + 1 });
    else if ((m = /^(\d{2})\s*(?:mm)?\s*-\s*(\d{2})\s*mm$/.exec(p))) out.push({ v, min: Number(m[1]), max: Number(m[2]) + 1 });
    else if ((m = /^(\d{2})\s*mm\s*et\s*plus$/.exec(p))) out.push({ v, min: Number(m[1]), max: Infinity });
  }
  return out;
}
/** @returns {{valeur:string, source:string, motif:string} | {doute:string} | null} */
export function tailleMontreAuto({ chemin = null, textes = [], allowedValues = [] } = {}) {
  if (!/\bmontres?\b/.test(cheminTexte(chemin))) return null;
  const tranches = tranchesDiametre(allowedValues);
  const unique = dansListe("Taille unique", allowedValues);
  if (tranches.length < 3 || !unique) return null; // pas la grille des diamètres : la règle ne joue pas
  const t = plier((Array.isArray(textes) ? textes : [textes]).join(" \n "));
  const lus = new Set();
  for (const re of [RE_DIAMETRE_AVANT, RE_DIAMETRE_APRES]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) lus.add(Number(String(m[1]).replace(",", ".")));
  }
  if (lus.size > 1) return { doute: `diamètres écrits différents (${[...lus].join(", ")} mm)` };
  if (lus.size === 1) {
    const d = [...lus][0];
    // Un diamètre entre deux tranches (38,5 mm entre « 30–38 » et « 39–42 ») prend celle dont il passe le bas.
    const tr = tranches.filter((x) => d >= x.min).sort((a, b) => b.min - a.min)[0];
    if (!tr) return { doute: `diamètre ${d} mm hors de la grille` };
    return { valeur: tr.v, source: "diametre_ecrit", motif: `diamètre du boîtier écrit par le vendeur (${d} mm)` };
  }
  return { valeur: unique, source: "montre_sans_diametre", motif: "aucun diamètre de boîtier écrit : la taille unique de la grille" };
}

// ── b) MATIÈRE eBAY (prudence : une matière inventée = litige « non conforme ») ──────────────────────────────────
// Lens ne donne AUCUNE confiance pour la matière (sa confiance est celle de l'identification entière) : le seul signal
// SÛR est une COMPOSITION LUE sur l'étiquette, avec un pourcentage (« 70% coton, 30% nylon » : 73 scans sur 678 en
// 30 jours). Sinon la valeur NEUTRE qu'eBay propose VRAIMENT pour cette catégorie (relu le 25/10 dans ebay_item_aspects :
// une seule existe, « Inconnue », en 175758 lits) ; sinon la question, comme aujourd'hui.
const NEUTRES_EBAY = ["inconnue", "inconnu", "non applicable", "ne s'applique pas", "sans objet", "non specifie", "non specifiee", "autre"];
/** @returns {{valeur:string, source:string, motif:string} | null} */
export function matiereEbayAuto({ composition = "", allowedValues = [] } = {}) {
  const comp = nfc(composition).replace(/\s+/g, " ").trim();
  if (comp && /\d{1,3}\s?%/.test(comp) && comp.length <= 65) {
    return { valeur: comp, source: "composition_lue", motif: "composition lue sur l'étiquette (avec pourcentages)" };
  }
  const neutre = (Array.isArray(allowedValues) ? allowedValues : []).map(String).find((v) => NEUTRES_EBAY.includes(plier(v).trim()));
  if (neutre) return { valeur: neutre, source: "matiere_neutre", motif: `valeur neutre proposée par eBay (« ${neutre} »)` };
  return null;
}
