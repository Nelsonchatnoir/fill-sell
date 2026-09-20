// ═══════════════════════════════════════════════════════════════════════════
// LE RAYON DE PUBLICATION — LE LIRE, L'ÉCRIRE, LE PROTÉGER (2026-09-20, lot B)
// ═══════════════════════════════════════════════════════════════════════════
// Le rayon, c'est l'endroit où l'article va tomber sur chaque plateforme. Il
// était calculé et jamais montré ; il est maintenant montré, et modifiable.
//
// 🚨 LA RÈGLE QUI TIENT TOUT CE FICHIER :
//
//        UN RAYON CHOISI PAR LA PERSONNE N'EST JAMAIS RECALCULÉ.
//
// Pourquoi c'est un vrai danger et pas une précaution : la résolution se
// recalcule dès que l'empreinte ne colle plus, et elle ne colle plus une fois
// sur deux (26 fiches sur 50 ont un titre retouché après génération). Tant que
// personne ne pouvait choisir son rayon, ça n'avait aucune conséquence. Dès
// qu'on peut le choisir, le scénario devient :
//
//     la personne corrige le rayon → elle retouche son titre →
//     l'empreinte ne colle plus → le calcul repart →
//     il repose SON rayon automatique par-dessus le choix.
//
// COMMENT ON S'EN PROTÈGE, SANS TOUCHER AU CALCUL. Le choix ne vit pas dans
// ce que la résolution produit : il vit à côté, sur la copie de la plateforme
// (`edited[p].rayon_choisi`). La résolution ne le lit pas, ne l'écrit pas, ne
// le connaît pas — elle continue exactement comme avant. C'est ICI, APRÈS
// elle, qu'on repose le choix par-dessus son résultat. Le calcul peut donc
// repartir autant de fois qu'il veut : il perd toujours, parce qu'il parle
// avant.
// ⛔ Aucune ligne de resolutionPublication.js n'est modifiée, ni l'empreinte,
//    ni le filet. Cette surcouche s'applique après eux, aux deux seuls
//    endroits qui consomment leur résultat.
//
// CE QUI EFFACE UN CHOIX : la personne qui en fait un autre, et elle seule.
// (Une REGÉNÉRATION le perd aussi — mergeFieldsWithLens reconstruit les copies
// à neuf. C'est cohérent : régénérer, c'est repartir de zéro, et c'est un
// geste payant, donc délibéré.)

/** Où chaque plateforme range son chemin de rayon dans platform_fields. */
export const CLE_CHEMIN = {
  vinted: 'categoryPath',
  leboncoin: 'lbcCategoryPath',
  beebs: 'beebsCategoryPath',
  ebay: 'ebayCategoryPath',
  opla: 'oplaCategoryPath',
};
/** Les deux plateformes qui naviguent par IDENTIFIANT, pas par libellé. */
export const CLE_ID = { ebay: 'ebayCategoryId', opla: 'oplaCategoryCode' };

/** Le rayon tel qu'il partira, pour l'afficher. `choisi` dit s'il vient de
 *  la personne — c'est ce qui change le mot à l'écran (« ton rayon » vs
 *  « rayon trouvé »), et rien d'autre. */
export function rayonDuChamp(pf, platform, choix = null) {
  if (choix?.chemin?.length) return { chemin: choix.chemin, id: choix.id ?? null, choisi: true, incertain: false };
  const chemin = pf?.[CLE_CHEMIN[platform]];
  if (!Array.isArray(chemin) || !chemin.length) return null;
  const cleId = CLE_ID[platform];
  // ⛔ QUAND L'APP N'EST PAS SÛRE, ELLE LE DIT (lot B2). Elle le SAVAIT déjà
  //    — `categorie_incertaine` est posé depuis le 07/09 et sert à laisser la
  //    suggestion de la plateforme gagner — mais l'écran n'en montrait rien :
  //    un rayon deviné à pile ou face s'affichait du même air qu'un rayon
  //    certain. Cas mesuré : l'icône 📚 range TOUS les livres en « Fiction »,
  //    alors que sur les 2 528 livres du parc les signaux de titre donnent
  //    222 non-fiction contre 220 fiction — un pile ou face exact. Inverser
  //    le défaut se tromperait autant ; le montrer, non.
  return {
    chemin,
    id: cleId ? (pf?.[cleId] ?? null) : null,
    choisi: false,
    incertain: Boolean(pf?.categorie_incertaine || pf?.lbcCategorieIncertaine
      || pf?.categorie_source === 'icone_non_confirmee' || pf?.categorie_source === 'hors_famille'),
  };
}

/** Le rayon en une ligne lisible. La FEUILLE d'abord : c'est elle qui compte,
 *  et à 400 px un chemin complet ne tient pas. */
export function libelleRayon(chemin) {
  if (!Array.isArray(chemin) || !chemin.length) return null;
  return String(chemin[chemin.length - 1]);
}

/** ⛔ LA FEUILLE SEULE PEUT MENTIR (trouvé en testant, 20/09).
 *  Un livre de musculation est parti sur eBay dans « Jouets et jeux ›
 *  Modélisme ferroviaire › Livres et guides › Livres ». La carte repliée
 *  affichait « Livres » : parfaitement rassurant, et complètement faux.
 *  C'est la RACINE qui trahit l'erreur, pas la feuille — on montre donc les
 *  deux dès que le chemin est assez profond pour cacher quelque chose. */
export function libelleRayonCourt(chemin) {
  if (!Array.isArray(chemin) || !chemin.length) return null;
  const feuille = String(chemin[chemin.length - 1]);
  if (chemin.length <= 2) return chemin.join(' › ');
  return `${chemin[0]} › … › ${feuille}`;
}
export function cheminComplet(chemin) {
  return Array.isArray(chemin) ? chemin.join(' › ') : '';
}
/** La clé du catalogue de champs (platform_category_aspects.category_key). */
export function cleCategorie(chemin) {
  return Array.isArray(chemin) && chemin.length ? chemin.join(' > ') : null;
}

/** ⛔ LE GESTE CENTRAL. Repose le choix de la personne PAR-DESSUS ce que la
 *  résolution vient de produire. Appelé aux deux seuls endroits qui
 *  consomment son résultat — donc appelé quoi qu'il arrive, que la résolution
 *  vienne du pré-calcul ou du filet.
 *  Sans choix : rend les champs tels quels, à l'octet près. */
export function appliquerRayonChoisi(pf, platform, choix) {
  if (!pf || !choix?.chemin?.length) return pf;
  const suite = { ...pf };
  suite[CLE_CHEMIN[platform]] = choix.chemin;
  const cleId = CLE_ID[platform];
  if (cleId) {
    if (choix.id) suite[cleId] = String(choix.id);
    // eBay navigue par identifiant : un chemin sans identifiant n'y mène
    // nulle part. On retire l'ancien plutôt que de publier un libellé qui ne
    // correspond pas à la catégorie visitée — le pire des deux mondes.
    else delete suite[cleId];
  }
  // Un choix humain est CERTAIN. Tout ce qui disait « on n'est pas sûrs » —
  // et qui ferait préférer la suggestion de la plateforme à ce choix — tombe.
  suite.categorie_source = 'choix_humain';
  suite.categorie_choisie = { chemin: choix.chemin, id: choix.id ?? null, le: choix.le ?? null };
  delete suite.categorie_incertaine;
  delete suite.lbcCategorieIncertaine;
  delete suite.categorie_a_choisir;
  delete suite.categorie_verification;
  delete suite.categorie_plausibilite;
  return suite;
}

/** La surcouche complète : les champs résolus, plus les choix de la personne.
 *  `edited` est la source de vérité des choix (il survit au brouillon et à la
 *  fiche en base). */
export function champsAvecRayonsChoisis(pfParPlateforme, edited, plateformes) {
  const sortie = {};
  for (const p of plateformes) {
    sortie[p] = appliquerRayonChoisi({ ...(pfParPlateforme?.[p] ?? {}) }, p, edited?.[p]?.rayon_choisi);
  }
  return sortie;
}

/** ── LE RAYON CHOISI NOMME L'OBJET (2026-09-20, passe 2) ───────────────────
 *  Cas d'Ornella : elle choisit « Enfants › Vêtements pour filles › Bébé
 *  filles › Combinaisons » sur Vinted, et l'écran Publier refuse TOUT le lot
 *  avec « On n'a pas reconnu l'objet dans "…" : nomme l'objet dans le titre
 *  ("combinaison", "dessous de plat", "veste"…) ». Elle venait de le nommer.
 *
 *  Le choix vivait sur UNE plateforme (`edited[p].rayon_choisi`) et les autres
 *  repartaient de leur propre titre. Ici, la FEUILLE du rayon choisi devient
 *  le mot de l'objet pour tout l'article : la cascade de résolution le traduit
 *  ensuite dans l'arbre de CHAQUE plateforme, exactement comme elle l'aurait
 *  fait avec un mot venu de l'IA ou du titre. Aucun mapping nouveau, aucune
 *  table de correspondance : on réutilise la traduction qui existe déjà.
 *
 *  ⛔ NE REMPLACE JAMAIS UN MOT DÉJÀ CONNU : ce n'est qu'un REPLI, appelé
 *     quand ni l'IA ni le titre n'ont nommé l'objet. Un mot certain gagne.
 *  ⛔ NE TOUCHE PAS LA PLATEFORME QUI A LE CHOIX : son rayon est reposé par
 *     `appliquerRayonChoisi` après la résolution, comme avant.
 *  ⛔ AU SINGULIER : les feuilles sont au pluriel (« Combinaisons »,
 *     « Jeans »), les mots-clés de la cascade au singulier. On enlève le « s »
 *     ou le « x » final, et RIEN d'autre — pas de lemmatisation maison.
 */
export function objetDuRayonChoisi(edited) {
  for (const p of Object.keys(edited ?? {})) {
    const chemin = edited[p]?.rayon_choisi?.chemin;
    if (!Array.isArray(chemin) || !chemin.length) continue;
    const feuille = String(chemin[chemin.length - 1] ?? '').trim();
    if (!feuille) continue;
    const mot = feuille.replace(/[sx]$/i, '');
    if (mot.length >= 3) return mot.toLowerCase();
  }
  return null;
}

/** Les plateformes sur lesquelles la personne a choisi son rayon. */
export function plateformesAvecRayonChoisi(edited) {
  return Object.keys(edited ?? {}).filter(p => edited[p]?.rayon_choisi?.chemin?.length);
}
