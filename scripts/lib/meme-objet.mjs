// ═══════════════════════════════════════════════════════════════════════════
// « EST-CE LE MÊME OBJET ? » — LA RÉFÉRENCE JS DU MOTEUR SQL (2026-09-25)
// ═══════════════════════════════════════════════════════════════════════════
// Miroir EXACT des fonctions SQL des migrations 20260925150000 (titre_jetons,
// titre_nombres, titre_marque_utile, titres_variantes_exclusives) et
// 20260925151000 (titre_quantite_marquee, meme_objet_signaux,
// meme_objet_niveau). Il sert à trois choses :
//   · recenser les doublons du parc à blanc (scripts/doublons-recensement.mjs) ;
//   · prouver, cas par cas, que la règle ne fusionne jamais deux objets
//     différents (scripts/doublons-selftest.mjs) ;
//   · comparer le JS au SQL sur les mêmes paires (même verdict attendu).
// ⛔ Toute modification ici se reporte dans le SQL, et inversement : le
//    selftest compare les listes (mots vides, marques vides) à l'octet.
import { titreNorm } from "../../src/utils/rapprochementJumeau.js";
import { couleursDuTitre } from "../../src/utils/variantesTitre.js";

// ⟦mots-vides:début⟧
export const MOTS_VIDES = ['pour', 'avec', 'sans', 'par', 'sur', 'les', 'des', 'une', 'aux', 'est', 'dans', 'tres', 'bon', 'etat', 'neuf', 'neuve', 'taille', 'occasion', 'the', 'and', 'for', 'with', 'tbe', 'excellent', 'parfait', 'comme', 'ans', 'mois', 'vintage'];
// ⟦mots-vides:fin⟧
// ⟦marques-vides:début⟧
export const MARQUES_VIDES = ['', 'sans marque', 'sans', 'autre', 'autres', 'vintage', 'fait main', 'handmade', 'artisanal', 'artisanale', 'artisanat', 'inconnue', 'inconnu', 'marque inconnue', 'no brand', 'non marque', 'non marquee', 'unbranded', 'generique', 'marque generique', 'aucune', 'none', 'other', 'divers'];
// ⟦marques-vides:fin⟧
const VIDES = new Set(MOTS_VIDES);
const MARQUES = new Set(MARQUES_VIDES);

/** Une décennie écrite en toutes lettres ou à l'anglaise devient une année. */
function decennie(mots, i) {
  const m = mots[i];
  if (/^[1-9]0s$/.test(m)) return "19" + m.slice(0, 2);
  if (/^[1-9]0$/.test(m) && i > 0 && /^annees?$/.test(mots[i - 1])) return "19" + m;
  return m;
}

/** Miroir de public.titre_nombres (décennies lues). Trié, dédoublonné. */
export function nombresDuTitre(t) {
  const mots = titreNorm(t).split(" ").filter(Boolean);
  const out = new Set();
  for (let i = 0; i < mots.length; i++) { const n = decennie(mots, i); if (/^[0-9]+$/.test(n)) out.add(n); }
  return [...out].sort();
}

/** Miroir de public.titre_jetons. Trié, dédoublonné. */
export function jetonsDuTitre(t) {
  const mots = titreNorm(t).split(" ").filter(Boolean);
  const out = new Set();
  for (let i = 0; i < mots.length; i++) {
    const m = mots[i];
    const d = decennie(mots, i);
    let j;
    if (d !== m) j = d;
    else if (/^[0-9]+$/.test(m)) j = m;
    else if (m.length > 4 && /[sx]$/.test(m)) j = m.slice(0, -1);
    else j = m;
    if (/^[0-9]+$/.test(j)) { if (j.length >= 3) out.add(j); }
    else if (m.length >= 3 && !VIDES.has(m)) out.add(j);
  }
  return [...out].sort();
}

/** Miroir de public.titre_marque_utile. */
export function marqueUtile(m) {
  const n = titreNorm(m ?? "");
  return MARQUES.has(n) ? "" : n;
}

/** Miroir de public.titre_quantite_marquee : le titre annonce-t-il un LOT ? */
export function quantiteMarquee(t) {
  const n = titreNorm(t);
  return / (lot|lots|paire|paires|duo|trio|deux|trois|quatre|cinq|six|sept|huit|dix|douze) /.test(` ${n} `)
    || /^[1-9][0-9]? [a-z]/.test(n)
    || / [1-9][0-9]? ?x /.test(` ${n} `);
}

const inclus = (a, b) => a.every((x) => b.includes(x));
const memes = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

/**
 * Miroir de public.meme_objet_signaux. `empreintes` = { a: [{dhash,phash}], b: [...] }
 * (celles du cache, déjà lues) ; distance = la paire la plus proche.
 */
export function signaux({ titreA, titreB, marqueA, marqueB, prixA, prixB, photoA = null, photoB = null, distancePhoto = null }) {
  const ja = jetonsDuTitre(titreA), jb = jetonsDuTitre(titreB);
  const communs = ja.filter((x) => jb.includes(x)).length;
  const min = Math.min(ja.length, jb.length);
  const ov = min ? communs / min : 0;
  const na = titreNorm(titreA), nb = titreNorm(titreB);
  const exact = na !== "" && na === nb;
  const ca = couleursDuTitre(titreA), cb = couleursDuTitre(titreB);
  const couleur = ca.length && cb.length && !memes(ca, cb) ? "conflit" : "ok";
  const nA = nombresDuTitre(titreA), nB = nombresDuTitre(titreB);
  const nombre = !nA.length || !nB.length || memes(nA, nB) ? "ok" : (inclus(nA, nB) || inclus(nB, nA)) ? "partiel" : "conflit";
  const ma = marqueUtile(marqueA), mb = marqueUtile(marqueB);
  const marque = !ma || !mb ? "inconnue" : (ma === mb || mb.includes(ma) || ma.includes(mb)) ? "egale" : "conflit";
  const pa = Number(prixA), pb = Number(prixB);
  const prixConnus = prixA != null && prixB != null && pa > 0 && pb > 0;
  const prix = !prixConnus ? "inconnu" : Math.abs(pa - pb) < 0.01 ? "egal" : Math.abs(pa - pb) / Math.max(pa, pb) <= 0.15 ? "proche" : "different";
  const ratio = prixConnus ? Math.max(pa, pb) / Math.min(pa, pb) : 1;
  const lot = quantiteMarquee(titreA) !== quantiteMarquee(titreB) && ratio > 1.8 ? "lot_contre_unite" : "ok";
  let photo = { verdict: "inconnue" };
  if (distancePhoto && Number.isFinite(distancePhoto.dhash)) {
    const d = distancePhoto.dhash, p = distancePhoto.phash;
    photo = { dhash: d, phash: p, verdict: d <= 5 && p <= 8 ? "identique" : d <= 10 ? "proche" : "differente" };
  }
  return { ov: Math.round(ov * 100) / 100, communs, exact, couleur, nombre, marque, prix, photo, lot };
}

/**
 * Miroir de public.meme_objet_niveau : le verdict d'une paire, sans le
 * contexte (statuts, quantités, plateformes, unicité) que l'appelant ajoute.
 * Rend { niveau: 'certain'|'probable'|'ecarte', motif }.
 */
export function niveau(s) {
  if (s.couleur === "conflit") return { niveau: "ecarte", motif: "couleur" };
  if (s.nombre === "conflit") return { niveau: "ecarte", motif: "nombre" };
  if (s.marque === "conflit") return { niveau: "ecarte", motif: "marque" };
  const v = s.photo.verdict;
  const certainPhoto = v === "identique" && s.ov >= 0.75;
  const certainTexte = v === "inconnue" && s.exact && s.prix === "egal";
  if ((certainPhoto || certainTexte) && s.nombre === "ok" && s.lot === "ok") {
    return { niveau: "certain", motif: certainPhoto ? "photo_identique" : "titre_exact_prix_egal" };
  }
  const probable = (v === "identique" && s.ov >= 0.4)
    || (v === "proche" && s.ov >= 0.6)
    || (s.exact && v !== "differente")
    || (v === "inconnue" && s.ov >= 0.75 && (s.prix === "egal" || s.prix === "proche"))
    // Un titre PRÉCIS reste une question même quand les photos diffèrent
    // (re-photographié ou détouré : le pichet de Jocabroc, dHash 22).
    || ((v === "differente" || v === "inconnue") && s.ov >= 0.8 && (s.communs ?? 0) >= 5);
  if (probable) {
    return { niveau: "probable", motif: s.lot !== "ok" ? "lot_contre_unite" : s.nombre === "partiel" ? "nombres_partiels" : v === "identique" ? "photo_identique" : s.exact ? "titre_exact" : v === "proche" ? "photo_proche" : (v === "differente" || v === "inconnue") && s.ov >= 0.8 && (s.communs ?? 0) >= 5 ? "titre_precis" : "titre_proche" };
  }
  return { niveau: "ecarte", motif: v === "differente" ? "photos_differentes" : "preuves_insuffisantes" };
}
