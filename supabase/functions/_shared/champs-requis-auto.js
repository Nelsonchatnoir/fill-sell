// ══════════════════════════════════════════════════════════════════════════
// LES CHAMPS REQUIS QUI SE REMPLISSENT SEULS QUAND UNE SOURCE FIABLE EXISTE (25/10 soir, décisions de Nico)
// ══════════════════════════════════════════════════════════════════════════
// Règle commune (Nico) : « on ne devine JAMAIS. Pas de source fiable → on revient au comportement actuel (la question
// est posée). Le pire cas autorisé, c'est « on demande comme aujourd'hui », jamais « on met une valeur fausse ». »
// Diagnostic (7 jours au 25/10) : 418 questions sur 26 comptes, dont Beebs Taille 135, Beebs Âge 52, Beebs Matière 11,
// eBay Matière 8 (docs/enquetes/soir-2510/CHAMPS-REQUIS.md). Chaque fonction est PURE et rend
// { valeur, source, motif } (posée, jamais bloquante, tracée « option_du_texte »), { doute } ou null (question).
// La pointure vit dans pointure-du-texte.js. ES module pur (Deno + Node + Vite) ; seule dépendance, relative : le
// dictionnaire des tailles (taille-du-texte.js → tailles.js), pour la taille unique des accessoires (05/11 soir).

import { estTailleUniqueEcrite, tailleEcriteDansLeTexte } from "./taille-du-texte.js";

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
  // 5. (14/11, lot « zéro friction », A1 — Nico) La POINTURE d'un enfant écrite par le vendeur dit son âge (« rollers du
  //    32 au 35 », « pointure 28 ») : certaine quand toute la plage tombe dans UNE tranche Beebs (sinon : probable, plus bas).
  const p = ageDeLaPointure(textes);
  if (p && !p.plusieurs && dansListe(p.tranche, liste)) return { valeur: dansListe(p.tranche, liste), source: "age_de_la_pointure", motif: `pointure enfant écrite (${p.ecrite})` };
  return null;
}

// ── c bis) L'ÂGE PAR LA POINTURE D'UN ENFANT (14/11, A1 — « Rollers et protections du 32 au 35 ») ──────────────────
// Table des pointures EU enfant (grilles de chaussures enfant usuelles : 19 ≈ 12 mois, 24 ≈ 2-3 ans, 28 ≈ 4-5 ans,
// 31 ≈ 6-7 ans, 33 ≈ 8 ans, 35 ≈ 10 ans, 37 ≈ 12 ans) → la tranche Beebs. Seulement un nombre COLLÉ à un mot de
// pointure (« pointure », « taille », « du 32 au 35 », « P32 », « 32/35 » près de chaussures, rollers, patins) : un
// nombre nu n'est jamais une pointure. Au-delà de 37 : pas un enfant, rien.
const TRANCHE_PAR_POINTURE = [
  [16, 19, "6-12 mois"], [20, 23, "12-24 mois"], [24, 26, "2 ans - 3 ans"], [27, 27, "3 ans - 4 ans"],
  [28, 30, "4 ans - 6 ans"], [31, 32, "6 ans - 8 ans"], [33, 36, "8 ans - 12 ans"], [37, 37, "12 ans - 16 ans"],
];
const trancheDeLaPointure = (n) => (TRANCHE_PAR_POINTURE.find(([a, b]) => n >= a && n <= b) ?? [])[2] ?? null;
const RE_POINTURE_PLAGE = /\b(?:du|de|pointures?|tailles?|p)\s?(\d{2})\s?(?:au|a|à|-|\/)\s?(\d{2})\b/g;
const RE_POINTURE_UNE = /\b(?:pointure|p)\s?:?\s?(\d{2})\b/g;
const RE_OBJET_A_POINTURE = /\b(chaussures?|chaussons?|baskets?|bottes?|bottines?|sandales?|rollers?|patins?|chaussettes?|ballerines?|tennis|mocassins?|derbies|espadrilles?|crampons?|protections?)\b/;
/** La pointure enfant ÉCRITE et sa tranche Beebs (pur) : { tranche, ecrite, plusieurs } | null. */
export function ageDeLaPointure(textes) {
  const t = plier((Array.isArray(textes) ? textes : [textes]).join(" \n "));
  if (!t.trim()) return null;
  const lus = [];
  for (const m of t.matchAll(RE_POINTURE_PLAGE)) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    // « taille 51/54 cm » (un tour de tête), « de 10 à 12 » : une plage de pointure enfant seulement (16 → 37, a ≤ b).
    if (a < 16 || b > 37 || a > b || /^\s?cm\b/.test(t.slice(m.index + m[0].length, m.index + m[0].length + 4))) continue;
    if (!/pointure|^p/.test(m[0]) && !RE_OBJET_A_POINTURE.test(t)) continue;
    lus.push({ a, b, ecrite: m[0].trim() });
  }
  for (const m of t.matchAll(RE_POINTURE_UNE)) {
    const n = Number(m[1]);
    if (n < 16 || n > 37) continue;
    if (!/pointure/.test(m[0]) && !RE_OBJET_A_POINTURE.test(t)) continue;   // « P32 » seulement près d'une chaussure
    lus.push({ a: n, b: n, ecrite: m[0].trim() });
  }
  if (!lus.length) return null;
  const tranches = new Set(lus.flatMap(({ a, b }) => [trancheDeLaPointure(a), trancheDeLaPointure(b)]).filter(Boolean));
  if (!tranches.size) return null;
  // Une plage à cheval sur deux tranches (32 → 35) : la tranche du MILIEU de la plage (probable, jamais certaine).
  const milieu = Math.round((Math.min(...lus.map((x) => x.a)) + Math.max(...lus.map((x) => x.b))) / 2);
  const tranche = tranches.size === 1 ? [...tranches][0] : trancheDeLaPointure(milieu);
  return tranche ? { tranche, ecrite: lus.map((x) => x.ecrite).join(", "), plusieurs: tranches.size > 1 } : null;
}

// ── c ter) L'ÂGE PROBABLE (14/11, lot « zéro friction », A1 + A3 — Nico) ─────────────────────────────────────────
// Règle de Nico (14/11) : « jamais de valeur inventée au hasard. Si la valeur est certaine → posée sans rien demander.
// Si elle est seulement probable → pré-remplie avec la meilleure valeur et un choix en 1 tap, jamais un champ vide qui
// bloque. » ageBeebsAuto (plus haut) rend ce qui est CERTAIN ; ceci rend le PROBABLE — appelé seulement quand rien de
// certain n'existe, et toujours montré à la personne (« FillSell a choisi … — change-la si besoin »).
// Mesuré sur 7 jours au 13/11 : « Âge » Beebs 324 questions / 99 abandons, dont 205 / 80 sur « Livres > Autres livres »
// (magazines, essais, romans, santé : des lectures d'adultes) et 37 sur CD / DVD.
//   · un LIVRE (hors rayons jeunesse), un MAGAZINE, un CD, un DVD sans AUCUN signe jeunesse → « 16 ans et + » ;
//   · une pointure enfant à cheval sur deux tranches → la tranche du milieu ;
//   · un jeu de société / de cartes / un puzzle qui dit s'adresser aux adultes (« adultes », « soirée », « apéro »,
//     « culture générale », « 18+ », un puzzle de 500 pièces et plus) → « 16 ans et + » (puzzle : « 12 ans - 16 ans ») ;
//   · rien de tout ça (une figurine, un jouet sans indice) → null : la question reste (elle ne bloque plus les autres
//     plateformes). ⛔ Jamais par-dessus un signe jeunesse, jamais sur un rayon jeunesse (« Romans pour enfant »…).
const RAYONS_SANS_JEUNESSE_ECRITE = /(autres livres|\bcd\b|\bdvd\b|livres scolaires|magazines?)/;
const RE_JEU_ADULTE = /\b(pour adultes?|adultes?|soirees?|aperos?|apéro|entre amis|culture generale|18\s?\+|\+\s?18|16\s?\+|\+\s?16|trivial pursuit|quiz|blind test|poker|tarot|belote|scrabble|times up|codenames|loup[- ]garou)\b/;
const RE_PUZZLE_PIECES = /\b(\d{3,4})\s?(?:pieces|pcs|morceaux)\b/;
/** @returns {{valeur:string, source:string, motif:string, probable:true} | null} */
export function ageBeebsProbable({ chemin = null, textes = [], allowedValues = [] } = {}) {
  const liste = Array.isArray(allowedValues) ? allowedValues : [];
  if (!liste.length) return null;
  const c = cheminTexte(chemin);
  if (RAYONS_JEUNESSE.test(c) || /(livres pour bebe|imagiers|livres d'activites|livres sonores)/.test(c)) return null;
  const t = plier((Array.isArray(textes) ? textes : [textes]).join(" \n "));
  const jeune = RE_JEUNESSE.test(t);
  const p = ageDeLaPointure(textes);
  if (p && dansListe(p.tranche, liste)) return { valeur: dansListe(p.tranche, liste), source: "age_probable_pointure", motif: `pointure enfant écrite (${p.ecrite})`, probable: true };
  if (jeune) return null;
  const seize = dansListe("16 ans et +", liste);
  if (seize && RAYONS_SANS_JEUNESSE_ECRITE.test(c)) {
    return { valeur: seize, source: "age_probable_sans_jeunesse", motif: "lecture, musique ou film sans aucun signe jeunesse", probable: true };
  }
  if (/(jeux de societe|jeux de cartes)/.test(c) && RE_JEU_ADULTE.test(t) && seize) {
    return { valeur: seize, source: "age_probable_jeu_adulte", motif: "jeu présenté pour les adultes", probable: true };
  }
  if (/\bpuzzles?\b/.test(c)) {
    const m = RE_PUZZLE_PIECES.exec(t);
    const ado = dansListe("12 ans - 16 ans", liste);
    if (m && Number(m[1]) >= 500 && ado) return { valeur: ado, source: "age_probable_puzzle", motif: `puzzle de ${m[1]} pièces`, probable: true };
  }
  return null;
}

// ── c quater) UN LIVRE ADULTE NE RESTE PAS DANS UN RAYON BEEBS POUR ENFANTS (14/11, A1 — Nico) ─────────────────────
// Beebs a « Romans pour adultes » et « Livres de recettes » (aucun « Âge » demandé) ; l'IA rangeait des romans d'adulte
// dans « Autres livres » (qui exige l'« Âge ») ou « Romans pour enfant ». Rangement déterministe, APRÈS l'IA :
//   · « Autres livres » + un roman / une romance (mot du TEXTE) sans aucun signe jeunesse → « Romans pour adultes » ;
//   · « Romans pour enfant » + un signe ADULTE explicite (« new adult », « dark romance », « pour adultes », thriller,
//     polar, érotique…) sans aucun signe jeunesse → « Romans pour adultes » ;
//   · « Autres livres » + recettes / cuisine / pâtisserie sans signe jeunesse → « Livres de recettes ».
// ⛔ Le moindre signe jeunesse garde le rayon de l'IA (« roman jeunesse », « 8 ans », « J'aime lire »…).
const BEEBS_LIVRES = ["Jeux, jouets et loisirs", "Livres"];
const RE_ROMAN = /\b(romans?|romance|new adult|dark romance|saga|thriller|polar|roman policier|roman noir|chick lit|feel good)\b/;
const RE_ROMAN_ADULTE_EXPLICITE = /\b(new adult|dark romance|pour adultes?|adulte|thriller|polar|roman noir|erotique|seinen|chick lit)\b/;
const RE_RECETTES = /\b(recettes?|cuisine|patisseries?|livre de cuisine|cookbook|thermomix|cookeo|robot cuiseur)\b/;
/** @returns {{chemin: string[], motif: string} | null} */
export function rayonBeebsDuLivre({ chemin = null, textes = [] } = {}) {
  const ch = Array.isArray(chemin) ? chemin.map(String) : (chemin ? String(chemin).split(/\s*>\s*/) : []);
  if (ch.length !== 3 || plier(ch[0]) !== plier(BEEBS_LIVRES[0]) || plier(ch[1]) !== plier(BEEBS_LIVRES[1])) return null;
  const feuille = plier(ch[2]);
  const t = plier((Array.isArray(textes) ? textes : [textes]).join(" \n "));
  if (!t.trim() || RE_JEUNESSE.test(t)) return null;
  if (feuille === "autres livres" && RE_RECETTES.test(t) && !RE_ROMAN.test(t)) {
    return { chemin: [...BEEBS_LIVRES, "Livres de recettes"], motif: "livre de recettes (aucun signe jeunesse)" };
  }
  if (feuille === "autres livres" && RE_ROMAN.test(t)) {
    return { chemin: [...BEEBS_LIVRES, "Romans pour adultes"], motif: "roman sans aucun signe jeunesse" };
  }
  if (feuille === "romans pour enfant" && RE_ROMAN_ADULTE_EXPLICITE.test(t)) {
    return { chemin: [...BEEBS_LIVRES, "Romans pour adultes"], motif: "roman présenté pour les adultes" };
  }
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

// ── e bis) (14/11, 13e274de) « UNIQUE » N'EST PAS UNE TAILLE DE BIJOU ────────────────────────────────────────────────
// La rédaction pose « Unique » comme taille partagée de tout accessoire (fiches_annonce.sharedFields.taille) : la copie
// Beebs d'un bracelet portait « Unique », hors de la grille des bagues → ligne « invalide », bloquante, et la règle e)
// ci-dessus (qui ne voit que les cases VIDES) ne jouait jamais — 37 questions « Taille » chez 13e274de le 14/11, 16 fiches.
// Une TAILLE UNIQUE (Unique, TU, Taille unique, One size… : taille-du-texte.estTailleUniqueEcrite) face à une grille qui
// n'en a pas n'est pas une taille : on rejoue la règle du champ vide (bijou hors bague → « Ajustable ») ; bague, parure,
// type inconnu : la question, comme avant. Une vraie taille (« M », « 17,3 mm ») n'est jamais recouverte ; une grille qui
// a sa taille unique (montres) se traduit déjà au juge — rien à faire ici.
/** @returns {{valeur:string, source:string, motif:string} | null} */
export function tailleUniqueHorsGrille({ valeur = "", chemin = null, textes = [], allowedValues = [] } = {}) {
  if (!estTailleUniqueEcrite(valeur)) return null;
  const opts = (Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v ?? "").trim()).filter(Boolean);
  if (!opts.length || opts.some(estTailleUniqueEcrite)) return null;
  const b = tailleBijouBeebsAuto({ chemin, textes, allowedValues: opts });
  if (!b?.valeur) return null;
  return { valeur: b.valeur, source: "taille_unique_bijou", motif: `« ${nfc(valeur).trim()} » hors de la grille — ${b.motif}` };
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

// ── g) LES ACCESSOIRES SANS TAILLE → « Taille unique » (05/11 soir, demande de Nico — PMF Vito) ─────────────────────
// Une casquette, un chapeau, un bonnet, un sac, une pochette, une écharpe, des lunettes, un parapluie, un portefeuille,
// une valise n'ont pas de taille à dire. Quand le RAYON en exige une (Vinted « Casquettes », Beebs « Chapeaux et
// casquettes (homme) »…) et que ni la fiche, ni la copie, ni le texte n'en disent (l'appelant ne vient ici qu'à ce
// moment, et on le revérifie), l'option « taille unique » de LA grille du rayon, telle qu'elle l'écrit (« Taille
// unique », « Taille Unique », « Universel », « One size » — le dictionnaire de tailles.js, jamais recopié) — une seule.
// ⛔ Jamais par-dessus une taille écrite par le vendeur (« Medium-Large », « taille 58 », « T M », « 24 mois ») ou
//    portée par la fiche ; jamais un vêtement, une chaussure, une ceinture ou des gants (leur taille compte), un bijou
//    (« Ajustable » a sa règle), une montre (son diamètre a sa règle) ; une grille sans option unique, ou à deux options
//    uniques → null : la question, comme avant.
const RAYON_SANS_TAILLE = /\b(casquettes?|chapeaux?|bonnets?|bobs?|berets?|bandeaux?|sacs?|sacoches?|pochettes?|cabas|besaces?|cartables?|portefeuilles?|porte-?monnaies?|porte-?cartes?|echarpes?|foulards?|etoles?|chales?|lunettes?|parapluies?|valises?|bagages?)\b/;
const RAYON_AVEC_TAILLE = /\b(ceintures?|gants?|moufles?|chaussures?|bottes?|baskets?|chaussettes?|collants?|bijoux|bagues?|montres?|vetements?|pyjamas?|maillots?|deguisements?)\b/;
/** @returns {{valeur:string, source:string, motif:string} | null} */
export function tailleUniqueAccessoire({ chemin = null, textes = [], allowedValues = [], tailleFiche = "" } = {}) {
  const liste = (Array.isArray(chemin) ? chemin.map(String).join(" > ") : String(chemin ?? "")).split(/\s*[>›]\s*/);
  const feuille = plier(String(liste[liste.length - 1] ?? "")).trim();
  if (!feuille || !RAYON_SANS_TAILLE.test(feuille) || RAYON_AVEC_TAILLE.test(feuille)) return null;
  if (nfc(tailleFiche).trim() && !estTailleUniqueEcrite(tailleFiche)) return null;   // la fiche dit une taille
  if (tailleEcriteDansLeTexte(Array.isArray(textes) ? textes : [textes], chemin)) return null; // le vendeur en a écrit une
  const uniques = [...new Set((Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v).trim()).filter(estTailleUniqueEcrite))];
  if (uniques.length !== 1) return null;
  return { valeur: uniques[0], source: "accessoire_sans_taille", motif: `${nfc(liste[liste.length - 1]).trim()} : un accessoire sans taille, la taille unique de la grille` };
}

// ── g bis) (06/11, Nico, point 4 b — reco validée) UNE VRAIE TAILLE RESTE UNE TAILLE ; « TAILLE UNIQUE » SEULEMENT SI
// LA GRILLE DU RAYON N'OFFRE QUE ÇA ──────────────────────────────────────────────────────────────────────────────────
// « Medium-Large » d'une casquette, « taille 58 » d'un chapeau, « 3 ans » : une taille écrite ne devient jamais « taille
// unique » quand la grille propose des tailles (la question, une fois — règle g ci-dessus, inchangée). Mais quand la
// grille de CE rayon n'a QUE « taille unique » (toutes ses options sont la taille unique : « Taille unique »,
// « Universel », « One size »… — le dictionnaire de tailles.js), il n'y a rien à demander : c'est la seule valeur que la
// plateforme accepte, quelle que soit la taille écrite, qui reste dans le titre et la description (la fiche ne change
// pas : la valeur est posée sur la COPIE de cette plateforme seule).
/** @returns {{valeur:string, source:string, motif:string} | null} */
export function tailleUniqueSeuleDeLaGrille({ allowedValues = [] } = {}) {
  const opts = [...new Set((Array.isArray(allowedValues) ? allowedValues : []).map((v) => String(v ?? "").trim()).filter(Boolean))];
  if (!opts.length || !opts.every(estTailleUniqueEcrite)) return null;
  return { valeur: opts[0], source: "grille_taille_unique_seule", motif: "la grille de ce rayon n'offre que la taille unique" };
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
