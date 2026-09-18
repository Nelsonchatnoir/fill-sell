// ── ISBN : une seule table de vérité (2026-09-18, mur « Maquillage » de Xewer) ─
//
// POURQUOI CE FICHIER. L'ISBN vivait en TROIS exemplaires : la normalisation
// dans le content script (vinted.js, 2026-08-25), le filtre « valeur de
// remplissage » recopié dans background.js (construireJobRecreation), et rien
// du tout côté serveur — qui sert pourtant les jobs et décide de les
// distribuer. Le 18/09, cette absence a coûté une annonce : job 839f1077
// (xxewwer, « Maquillage Fabienne Sévigné », catégorie « Livres et médias >
// Livres > Non-fiction »), annonce SUPPRIMÉE à 17:42 et jamais recréée —
// HTTP 400 `{"field":"isbn"}` — alors que l'ISBN était écrit en toutes lettres
// dans sa propre description : « ✅ ISBN 2-902634-36-6 ».
//
// ES module SANS import : chargé tel quel par Deno (Edge Functions) et par
// Vite (app), même contrat que [[erreurs-archivees.js]].

/**
 * Un chapelet du MÊME chiffre n'est pas un ISBN, c'est « je ne sais pas ».
 *
 * Vinted stocke « 0000000000000 » sur les annonces dont le livre n'a jamais
 * été identifié — ce n'est pas nous qui le fabriquons. Sa clé de contrôle est
 * valide (somme de zéros → clé 0), donc AUCUNE validation d'ISBN ne l'écarte :
 * il faut le nommer. Même règle que « prix d'achat VIDE ≠ ZÉRO » — un champ
 * inconnu ne se remplit pas de zéros.
 */
export function estIsbnDeRemplissage(brut) {
  return /^(\d)\1{9,}$/.test(String(brut ?? "").replace(/[\s-]/g, ""));
}

/**
 * Normalise et VALIDE : tirets/espaces retirés, ISBN-10 converti en ISBN-13
 * (préfixe 978 + clé RECALCULÉE), clé de contrôle vérifiée dans les deux
 * formats. Invalide → { ok:false } et on ne pose RIEN : un ISBN inventé est
 * pire qu'un ISBN absent.
 *
 * ⚠️ Miroir EXACT de normalizeIsbn (chrome-extension/content-scripts/vinted.js).
 * Les deux doivent rendre la même chose sur la même entrée, sinon le serveur
 * accepterait une valeur que le formulaire refuse — ou l'inverse.
 *
 * @returns {{ok:true,isbn13:string}|{ok:false,raison:string}}
 */
export function normalizeIsbn(brut) {
  const s = String(brut ?? "").replace(/[\s-]/g, "").toUpperCase();
  if (estIsbnDeRemplissage(s)) return { ok: false, raison: `valeur de remplissage, pas un ISBN (« ${s} »)` };
  const cle13 = (douze) => {
    let somme = 0;
    for (let i = 0; i < 12; i++) somme += (i % 2 ? 3 : 1) * Number(douze[i]);
    return String((10 - (somme % 10)) % 10);
  };
  if (/^\d{13}$/.test(s)) {
    if (cle13(s) !== s[12]) return { ok: false, raison: `clé de contrôle ISBN-13 invalide (${s})` };
    return { ok: true, isbn13: s };
  }
  if (/^\d{9}[\dX]$/.test(s)) {
    let somme = 0;
    for (let i = 0; i < 10; i++) somme += (10 - i) * (s[i] === "X" ? 10 : Number(s[i]));
    if (somme % 11 !== 0) return { ok: false, raison: `clé de contrôle ISBN-10 invalide (${s})` };
    const douze = "978" + s.slice(0, 9);
    return { ok: true, isbn13: douze + cle13(douze) };
  }
  if (!s) return { ok: false, raison: "ISBN vide" };
  return { ok: false, raison: `format inattendu (« ${s} », ${s.length} caractères)` };
}

// Deux façons SÛRES de reconnaître un ISBN dans une phrase, et deux seulement :
//   · il est ANNONCÉ — « ISBN 2-902634-36-6 », « EAN : 9782811600174 » ;
//   · il commence par 978/979 — le préfixe réservé au livre.
// Tout autre chapelet de chiffres d'une description (dimensions, année,
// référence, numéro de lot) ne doit JAMAIS être pris pour un ISBN : la clé de
// contrôle d'un ISBN-10 a UNE chance sur 11 de tomber juste par hasard, ce
// n'est pas une preuve suffisante à elle seule. D'où l'ancrage obligatoire.
const ISBN_ANNONCE = /(?:isbn|ean)\s*(?:-?\s*1[03])?\s*[:.–-]?\s*((?:97[89][\s-]?)?[\dX][\d\sX-]{8,18}[\dX])/gi;
const ISBN_PREFIXE = /\b(97[89][\s-]?\d[\d\s-]{8,16}\d)\b/g;

/**
 * Cherche un ISBN VALIDE dans un texte libre (description, titre).
 *
 * Rend le premier candidat que normalizeIsbn accepte, en ISBN-13, avec la
 * forme exacte trouvée dans le texte (pour pouvoir le citer à la personne) —
 * ou null. Ne rend JAMAIS un candidat non validé.
 *
 * @returns {{isbn13:string, trouve:string, motif:'annonce'|'prefixe'}|null}
 */
export function isbnDansTexte(texte) {
  const t = String(texte ?? "");
  if (!t) return null;
  for (const [motif, re] of [["annonce", ISBN_ANNONCE], ["prefixe", ISBN_PREFIXE]]) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(t)) !== null) {
      const brut = String(m[1] ?? "").trim();
      const norme = normalizeIsbn(brut);
      if (norme.ok) return { isbn13: norme.isbn13, trouve: brut, motif };
    }
  }
  return null;
}

/**
 * L'ISBN d'un article, cherché dans TOUTES ses sources, de la plus sûre à la
 * plus déduite — pour ne JAMAIS poser à quelqu'un une question dont on a déjà
 * la réponse sous les yeux (consigne Nico, 18/09 : « l'ISBN est dans sa
 * description, on va pas le lui faire remplir à la main, il a rien demandé »).
 *
 * Ordre, et il compte :
 *   1. `reponse`      — ce que la personne a tranché (vintedAspects.isbn) ;
 *   2. `capture`      — l'ISBN de l'annonce d'origine, SAUF remplissage ;
 *   3. `article`      — inventaire.attributs.isbn, SAUF remplissage ;
 *   4. `description`  — annoncé dans le texte de l'annonce ← le cas Xewer ;
 *   5. `titre`        — dernier recours, même exigence d'ancrage.
 *
 * @param {{reponse?:unknown, capture?:unknown, article?:unknown, description?:unknown, titre?:unknown}} sources
 * @returns {{isbn13:string, source:string, trouve:string}|null}
 */
export function resoudreIsbn(sources) {
  for (const cle of ["reponse", "capture", "article"]) {
    const brut = String(sources?.[cle] ?? "").trim();
    if (!brut) continue;
    const norme = normalizeIsbn(brut);
    if (norme.ok) return { isbn13: norme.isbn13, source: cle, trouve: brut };
  }
  for (const cle of ["description", "titre"]) {
    const trouve = isbnDansTexte(sources?.[cle]);
    if (trouve) return { isbn13: trouve.isbn13, source: cle, trouve: trouve.trouve };
  }
  return null;
}
