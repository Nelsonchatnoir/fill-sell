// ═══════════════════════════════════════════════════════════════════════════
// LES ARTICLES LES PLUS PROCHES D'UNE ANNONCE (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// Un CLASSEMENT D'AFFICHAGE, et rien d'autre. Il ne rattache rien, ne décide
// rien, n'écrit rien : il met en haut de liste ce que l'utilisateur a le plus
// de chances de reconnaître, pour lui éviter de chercher.
//
// ⛔ IL NE REMPLACE PAS LE RAPPROCHEMENT AUTOMATIQUE et ne le modifie pas. Ce
//    que le moteur a su trancher n'arrive jamais jusqu'ici (l'annonce est déjà
//    rattachée). Ce qu'il a PROPOSÉ sans trancher (`a.proposition`) passe
//    devant tout le reste, avec son motif : c'est le seul avis qui vient du
//    serveur, on ne le noie pas dans un tri maison.
// ⛔ LA RECHERCHE LIBRE VOIT TOUT LE STOCK ; ce classement ne fait que
//    proposer, et il ne propose que ce qui tient debout.
//
// ── PLUS JAMAIS « PROBABLE » SUR QUELQUES MOTS COMMUNS (2026-09-26) ─────────
// labouquinerie85, 25/09 23:28 : l'écran a badgé « Le plus probable »
// « Les plus beaux poèmes de la langue française » pour l'annonce « Les plus
// belles pages de la poésie française » (3 mots communs : les, plus,
// française), et « SNSM les sauveteurs en mer » pour « Cent poèmes de la
// mer » (1 mot : mer). Deux livres différents, rattachés sur la foi du badge.
// Le serveur n'avait RIEN proposé : c'était ce tri-ci, qui listait tout
// article partageant un seul mot de plus de deux lettres.
// La règle, désormais :
//   · une suggestion maison exige un titre QUASI EXACT (les mêmes mots qui
//     comptent, pluriels et petits mots mis à part — la règle de
//     `public.titre_jetons`, au caractère près) ou le même ISBN ;
//   · l'inclusion d'un titre dans l'autre (jumeau, 20/09) reste proposée,
//     SAUF pour un livre : « Tome 1 » n'est pas « Tome 1 — L'intégrale » ;
//   · une proposition du serveur reste en tête ; pour un livre, un
//     rapprochement « au faisceau » ou « titre inclus » qui n'est ni quasi
//     exact ni même ISBN n'est plus montré ;
//   · le badge « Le plus probable » ne se pose que sur un candidat FORT (titre
//     exact côté serveur, quasi exact, ou même ISBN) — jamais sur un voisin.
// Plus aucune liste de « proches » au mot près : sans candidat qui tienne,
// l'écran le dit et la recherche libre prend le relais.
import { titreNorm, jumeauProbable } from '../utils/rapprochementJumeau.js';

export const MAX_CANDIDATS = 6;

// Les motifs du serveur qui reposent sur un titre EXACT (titre_norm égal) :
// premier tour de rapprocher_classer et garde des homonymes de l'import.
const MOTIFS_TITRE_EXACT = new Set([
  'titre_exact', 'prix_inconnu', 'prix_different', 'homonymes', 'plusieurs_candidats',
  'homonymes_tranches', 'homonyme_en_stock', 'photo_identique',
]);

// ── LES MOTS QUI COMPTENT — miroir de public.titre_jetons ──────────────────
// Mêmes mots vides, même racinisation (pluriel en s/x au-delà de 4 lettres),
// mêmes nombres (3 chiffres et plus ; « 90s » → 1990, « années 80 » → 1980).
// Si les deux divergeaient, l'écran dirait « même titre » là où la base dit
// l'inverse.
const MOTS_VIDES = new Set([
  'pour', 'avec', 'sans', 'par', 'sur', 'les', 'des', 'une', 'aux', 'est', 'dans', 'tres', 'bon', 'etat',
  'neuf', 'neuve', 'taille', 'occasion', 'the', 'and', 'for', 'with', 'tbe', 'excellent', 'parfait',
  'comme', 'ans', 'mois', 'vintage',
]);

export function titreJetons(t) {
  const mots = titreNorm(t).split(' ').filter(Boolean);
  const out = new Set();
  mots.forEach((m, k) => {
    let j;
    if (/^[1-9]0s$/.test(m)) j = `19${m.slice(0, 2)}`;
    else if (/^[1-9]0$/.test(m) && k > 0 && /^annees?$/.test(mots[k - 1])) j = `19${m}`;
    else if (/^[0-9]+$/.test(m)) j = m;
    else if (m.length > 4 && /[sx]$/.test(m)) j = m.slice(0, -1);
    else j = m;
    const garde = /^[0-9]+$/.test(j) ? j.length >= 3 : (m.length >= 3 && !MOTS_VIDES.has(m));
    if (garde) out.add(j);
  });
  return out;
}

/** Deux titres QUASI EXACTS : même titre normalisé, ou exactement les mêmes mots qui comptent. */
export function titresQuasiExacts(a, b) {
  const x = titreNorm(a);
  const y = titreNorm(b);
  if (!x || !y) return false;
  if (x === y) return true;
  const ja = titreJetons(a);
  const jb = titreJetons(b);
  if (!ja.size || ja.size !== jb.size) return false;
  for (const m of ja) if (!jb.has(m)) return false;
  return true;
}

// ── L'ISBN ─────────────────────────────────────────────────────────────────
// ISBN-13 (978/979 + 10 chiffres) ou ISBN-10 annoncé par « ISBN », tirets et
// espaces tolérés. Rendu en chiffres seuls (X final de l'ISBN-10 compris).
export function isbnsDe(...textes) {
  const out = new Set();
  const s = textes.filter(Boolean).map(String).join(' \n ');
  for (const m of s.matchAll(/\b97[89](?:[\s-]?\d){10}\b/g)) out.add(m[0].replace(/[^0-9]/g, ''));
  for (const m of s.matchAll(/isbn(?:-1[03])?\s*:?\s*((?:\d[\s-]?){9}[\dXx])\b/gi)) {
    const n = m[1].replace(/[^0-9Xx]/g, '').toUpperCase();
    if (n.length === 10) out.add(n);
  }
  return out;
}

const memeIsbn = (a, b) => {
  if (!a.size || !b.size) return false;
  for (const x of a) if (b.has(x)) return true;
  return false;
};

// ── EST-CE UN LIVRE ? ──────────────────────────────────────────────────────
// Ce qu'on sait sans deviner : la catégorie Leboncoin écrite dans l'URL
// (/ad/livres/), le type de la fiche, un ISBN. Un titre ne suffit pas à le
// dire — et ce n'est pas grave : hors livre, la règle reste stricte (plus de
// voisins au mot près), seule l'inclusion de titre y reste proposée.
export function estUnLivre(annonce, item) {
  if (/\/(livres?|books?)\//i.test(String(annonce?.url ?? ''))) return true;
  const type = String(item?.type ?? item?.categorie ?? '');
  if (/\b(livres?|books?|bd|mangas?|romans?)\b/i.test(type)) return true;
  return isbnsDe(annonce?.titre).size > 0 || isbnsDe(item?.title ?? item?.titre, item?.description ?? item?.desc).size > 0;
}

/**
 * Les articles du stock qu'on peut honnêtement proposer pour une annonce, du
 * plus sûr au moins sûr. `fort` = le badge « Le plus probable » est permis.
 *
 * @param {object} annonce  ligne d'annonces_plateforme (titre, prix, url, proposition)
 * @param {Array}  items    le stock tel que le Stock le tient déjà en mémoire
 * @returns {Array<{ item, score, source, fort }>} source: 'serveur' | 'quasi' | 'isbn' | 'jumeau'
 */
export function classerCandidats(annonce, items) {
  const liste = Array.isArray(items) ? items.filter((i) => i && i.statut !== 'vendu') : [];
  if (!liste.length) return [];

  const prop = annonce?.proposition && typeof annonce.proposition === 'object' ? annonce.proposition : null;
  const idPropose = prop?.inventaire_id != null ? String(prop.inventaire_id) : null;
  const motifServeurExact = MOTIFS_TITRE_EXACT.has(String(prop?.motif ?? ''));
  const isbnAnnonce = isbnsDe(annonce?.titre);
  const jumeau = jumeauProbable(annonce?.titre, liste);
  const idJumeau = jumeau?.id != null ? String(jumeau.id) : null;

  const notes = liste.map((item) => {
    const id = String(item.id);
    const titre = item.title ?? item.titre;
    const livre = estUnLivre(annonce, item);
    const quasi = titresQuasiExacts(annonce?.titre, titre);
    const isbn = memeIsbn(isbnAnnonce, isbnsDe(titre, item.description ?? item.desc));
    if (idPropose && id === idPropose) {
      const fort = motifServeurExact || quasi || isbn;
      // Un livre ne se propose pas au faisceau ni à l'inclusion de titre.
      if (livre && !fort) return null;
      return { item, score: 1000, source: 'serveur', fort };
    }
    if (isbn) return { item, score: 950, source: 'isbn', fort: true };
    if (quasi) return { item, score: 920, source: 'quasi', fort: true };
    if (idJumeau && id === idJumeau && !livre) return { item, score: 900, source: 'jumeau', fort: false };
    return null;
  }).filter(Boolean);

  notes.sort((a, b) => b.score - a.score);
  return notes.slice(0, MAX_CANDIDATS);
}

/** La recherche libre : tout le stock, sur le nom, sans classement ni seuil. */
export function chercherDansStock(items, requete) {
  const q = String(requete ?? '').trim().toLowerCase();
  const liste = Array.isArray(items) ? items.filter((i) => i && i.statut !== 'vendu') : [];
  if (!q) return liste.slice(0, 20);
  return liste.filter((i) => String(i.title ?? i.titre ?? '').toLowerCase().includes(q)).slice(0, 20);
}
