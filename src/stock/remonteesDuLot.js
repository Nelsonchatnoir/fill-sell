// ═══════════════════════════════════════════════════════════════════════════
// LA REMONTÉE EN LOT QUAND IL N'Y A PAS ASSEZ DE REMONTÉES (04/11/2026, décision de Nico — grille à 3 jauges)
// ═══════════════════════════════════════════════════════════════════════════
// La feuille « Republier N articles » du Stock (RepublishSheet), SEULEMENT avec la grille et quand le lot demande plus
// de remontées qu'il n'en reste : elle propose d'envoyer d'abord les PLUS ANCIENNES, dans la limite exacte de ce qui
// reste, avec le nombre exact (« Remonter les 3 plus anciennes (6 remontées sur Vinted et Leboncoin) ») ; les autres
// attendent la remise à zéro.
//   · Un article compte 1 remontée PAR plateforme cochée qui le concerne : il part sur TOUTES ses plateformes cochées
//     ou pas du tout — jamais à moitié.
//   · « Les plus anciennes » : la date du Stock (datesParPlateforme, _shared/mise-en-ligne.js — la même que la
//     pastille, le menu « … », la fiche et « Remonter mes annonces »), plateforme par plateforme : la dernière
//     publication ou remontée de l'annonce en ligne. Un article sur plusieurs plateformes cochées prend la PLUS
//     ANCIENNE des siennes (celle qui perd en visibilité, comme « Anciennes » du Stock). Date inconnue : à la fin.
//     À date égale, l'ordre de la sélection.
//   · Les N plus anciennes = un DÉBUT de la liste triée : on s'arrête au premier article qui ne tient plus (sinon
//     « les 3 plus anciennes » serait faux).
// ⛔ CADENCE INTOUCHABLE : ce module ne fait que CHOISIR, avant l'envoi, un sous-ensemble de la sélection de la
//    personne. L'envoi reste celui d'aujourd'hui (onConfirm → lancerRepublication / lancerRepublicationLot, dans
//    l'ordre de la sélection), avec ses créneaux, ses plafonds et une remontée par annonce et par jour.
// Pur : aucune lecture, aucun DOM. Gardé par scripts/ecarts-0411-selftest.mjs.

/**
 * @param {Array<{ plateformes?: string[], datesPf?: Record<string, number|null> }>} items  les articles de la feuille,
 *        dans l'ordre de la sélection ; datesPf : plateforme → date (ms) de l'annonce en ligne (absente = inconnue).
 * @param {string[]} cochees  les plateformes cochées dans la feuille.
 * @param {number} restantes  les remontées qu'il reste ce mois-ci (quotas_etat).
 * @returns {{ choisis: number[], cout: number, total: number, nbArticles: number, plateformes: string[] }}
 *   choisis : les INDICES (dans `items`) des articles qui partent ; cout : leurs remontées ; total : ce que le lot
 *   entier demanderait ; nbArticles : les articles concernés par les cases cochées ; plateformes : celles des choisis,
 *   dans l'ordre des cases.
 */
export function plusAnciennesDuLot(items, cochees, restantes) {
  const r = Math.max(0, Math.floor(Number(restantes) || 0));
  const cases = Array.isArray(cochees) ? cochees : [];
  const concernes = (Array.isArray(items) ? items : []).map((it, i) => {
    const pfs = (Array.isArray(it?.plateformes) && it.plateformes.length ? it.plateformes : ['vinted']).filter((p) => cases.includes(p));
    const dates = pfs.map((p) => Number(it?.datesPf?.[p])).filter((d) => Number.isFinite(d));
    return { i, pfs, cle: dates.length ? Math.min(...dates) : Infinity };
  }).filter((x) => x.pfs.length > 0);
  const tries = [...concernes].sort((a, b) => {
    if (a.cle === b.cle) return a.i - b.i;
    if (a.cle === Infinity) return 1;
    if (b.cle === Infinity) return -1;
    return a.cle - b.cle;
  });
  const choisis = [];
  let cout = 0;
  for (const x of tries) {
    if (cout + x.pfs.length > r) break;
    cout += x.pfs.length;
    choisis.push(x);
  }
  const vues = new Set(choisis.flatMap((x) => x.pfs));
  return {
    choisis: choisis.map((x) => x.i),
    cout,
    total: concernes.reduce((n, x) => n + x.pfs.length, 0),
    nbArticles: concernes.length,
    plateformes: cases.filter((p) => vues.has(p)),
  };
}

/** « Vinted », « Vinted et Leboncoin », « Vinted, Leboncoin et Beebs » (en : « and »). */
export function listeDesNoms(noms, lang = 'fr') {
  const l = (Array.isArray(noms) ? noms : []).filter(Boolean);
  if (l.length <= 1) return l.join('');
  const et = lang === 'en' ? ' and ' : ' et ';
  return `${l.slice(0, -1).join(', ')}${et}${l[l.length - 1]}`;
}
