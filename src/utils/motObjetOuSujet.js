// ═══════════════════════════════════════════════════════════════════════════
// LE MOT DÉCRIT-IL L'OBJET, OU SON SUJET ? (2026-09-20)
// ═══════════════════════════════════════════════════════════════════════════
// LE CAS FONDATEUR, mesuré le 20/09 : « La Méthode Delavier de MUSCULATION
// pour la Femme » — un LIVRE — est parti sur Opla au rayon
// « Sport > Fitness, course à pied et yoga > Musculation ».
// L'arbre Opla a bien une branche « Culture et Loisirs > Livres » avec ses
// onze feuilles, dont « Non-fiction ». Elle n'a jamais été regardée.
//
// POURQUOI LA CASCADE S'EST TROMPÉE, exactement :
//   · le mot « musculation » EST une feuille de l'arbre → correspondance
//     EXACTE → certitude posée, plus aucun recours ;
//   · le garde-fou de FAMILLE n'a rien vu : chez Opla « Sport » et « Culture
//     et Loisirs » sont tous les deux de la famille « loisirs ». Un haltère
//     et un livre y sont la même chose.
// Le mot décrivait le SUJET du livre, pas l'OBJET vendu. C'est la distinction
// que `valeurDecritLObjet` porte déjà ailleurs ; elle manquait ici.
//
// DEUXIÈME DÉFAUT, du même nid, mesuré sur les 3 livres publiés sur Opla :
// tous les trois rangés en « Livres SONORES » — des livres papier. Ce n'est
// pas une erreur de l'IA : la liste de candidates qu'on lui donne pour le mot
// « livre » ne contient QUE « Livres sonores » et « Livres pour bébé », les
// deux seules feuilles qui répètent le mot. « Romans pour adultes »,
// « Fictions », « Non-fiction » n'y sont jamais. **La bonne réponse n'était
// pas dans la liste.** L'IA a choisi le moins faux.
//
// CE QUE CE MODULE APPORTE, et rien d'autre :
//   1. `noeudDuMot` — le mot nomme-t-il un NŒUD de l'arbre (« Livres ») et
//      pas seulement une feuille ? Alors la maison de l'objet, ce sont les
//      feuilles de ce nœud.
//   2. `feuillesDuNoeud` — les feuilles de cette maison, à donner comme
//      candidates. C'est le correctif du défaut nº2 : la bonne réponse entre
//      enfin dans la liste.
//   3. `sortDeLaMaison` — une feuille trouvée ailleurs, alors qu'on SAIT où
//      l'objet habite, décrit le sujet et pas l'objet. C'est le correctif du
//      défaut nº1.
//
// ⛔ CE MODULE NE DÉCIDE RIEN TOUT SEUL. Il répond à des questions ; c'est la
//    résolution qui en tire les conséquences, et elle ne s'en sert que quand
//    la maison de l'objet est connue par une source CERTAINE.
// ⛔ PÉRIMÈTRE VOLONTAIREMENT ÉTROIT : la seule maison déclarée aujourd'hui
//    est celle des LIVRES, parce que c'est la seule dont on ait la preuve
//    (famille « livres_medias » de la fiche, posée par le Lens, ou catégorie
//    « Livres »). Élargir demanderait la même preuve pour chaque famille —
//    et une maison devinée ferait exactement le dégât qu'on répare.
// ⛔ UN RAYON CHOISI PAR LA PERSONNE N'EST JAMAIS RECALCULÉ : rien ici n'est
//    appelé sur un `choix_humain`, la surcouche du lot B passe après.

import { feuillesDe, jetonsStricts } from './categorieParMot';

const memeMot = (a, b) => {
  const ja = jetonsStricts(a);
  const jb = jetonsStricts(b);
  return ja.length > 0 && ja.length === jb.length && ja.every((t, i) => t === jb[i]);
};

/**
 * Le NŒUD de l'arbre dont le libellé est exactement ce mot — c'est-à-dire un
 * segment de chemin qui n'est pas la feuille. Rend le chemin du nœud (préfixe),
 * ou null. Le nœud le plus PROCHE de la racine gagne : « Livres » sous
 * « Culture et Loisirs » est la maison, pas un sous-rayon qui le répéterait.
 */
export async function noeudDuMot(mot, plateforme) {
  if (!String(mot ?? '').trim()) return null;
  const feuilles = await feuillesDe(plateforme);
  if (!feuilles.length) return null;
  let meilleur = null;
  for (const f of feuilles) {
    const c = f.chemin ?? [];
    // On s'arrête avant la feuille : `c.length - 1`. Une FEUILLE qui porte le
    // mot n'est pas une maison, c'est une réponse — et c'est déjà le métier de
    // resoudreParMot.
    for (let i = 0; i < c.length - 1; i++) {
      if (!memeMot(mot, c[i])) continue;
      const prefixe = c.slice(0, i + 1);
      if (!meilleur || prefixe.length < meilleur.length) meilleur = prefixe;
      break;
    }
  }
  return meilleur;
}

/** Toutes les feuilles sous ce nœud, dans l'ordre de l'arbre. */
export async function feuillesDuNoeud(prefixe, plateforme) {
  if (!Array.isArray(prefixe) || !prefixe.length) return [];
  const feuilles = await feuillesDe(plateforme);
  return feuilles.filter((f) => {
    const c = f.chemin ?? [];
    return c.length > prefixe.length && prefixe.every((s, i) => s === c[i]);
  });
}

/** Ce chemin sort-il de la maison de l'objet ? (null si on ne sait pas.) */
export function sortDeLaMaison(chemin, maison) {
  if (!Array.isArray(maison) || !maison.length) return null;
  if (!Array.isArray(chemin) || !chemin.length) return null;
  return !maison.every((s, i) => s === chemin[i]);
}

/**
 * La maison d'un LIVRE sur cette plateforme — le nœud « Livres » de son arbre.
 * Rend null quand l'arbre n'en a pas (eBay range les livres autrement) : dans
 * ce cas on ne conclut RIEN, comme partout ailleurs.
 */
export async function maisonDesLivres(plateforme) {
  // Deux orthographes suffisent : nos cinq arbres écrivent « Livres » (Opla,
  // Vinted, Leboncoin, Beebs) ou « Livres et médias » (Vinted, racine).
  // On cherche le nœud le plus profond qui soit exactement « Livres ».
  return (await noeudDuMot('livres', plateforme)) ?? (await noeudDuMot('livre', plateforme));
}
