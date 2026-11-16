// ═══════════════════════════════════════════════════════════════════════════
// UNE PLATEFORME RELIÉE VIDE : « PUBLIER TON STOCK SUR <PLATEFORME> » (16/11/2026, point 6 de Nico)
// ═══════════════════════════════════════════════════════════════════════════
// Cas fondateur (lizzaa, d5531b8e) : 214 articles en ligne sur Vinted, un Beebs neuf relié le 16/11. Elle appuie sur
// « Synchroniser » en croyant y copier son stock : le relevé Beebs finit « done », 0 annonce (12:36 puis 12:56, « [vide]
// aucune annonce en ligne sur cette plateforme »), et rien ne lui dit que Synchroniser LIT ses annonces sans les copier.
// Même chose pour son Leboncoin (relevé fait, 0 annonce).
// LA RÈGLE (tous les comptes) : une plateforme reliée est VIDE quand son dernier relevé a fini (« fait ») avec 0 annonce,
// que le serveur n'y connaît aucune annonce (annonces_plateforme : aucune présente), qu'aucun article du Stock n'y est
// occupé (en ligne, en file, en attente) — et que le Stock a des articles en ligne AILLEURS et des articles pas encore
// sur elle. Alors, une phrase vraie (« Ton Beebs est vide : Synchroniser relit tes annonces, il ne les copie pas. ») et
// un bouton « Publier ton stock sur Beebs » qui ouvre la publication de plusieurs articles (le lot), les articles pas
// encore sur cette plateforme pré-cochés, cette plateforme cochée.
// ⛔ Un relevé vide SIGNALÉ (t.vide : deux relevés vides d'affilée sur un compte qui AVAIT des annonces, releveVide.js)
//    n'est jamais « vide » ici : ce peut être une lecture ratée, et publier y ferait des doublons.
// ⛔ Rien ne part sans la confirmation de la personne : le bouton ouvre la sélection, puis le lot (ses règles, son quota).
// Pur (Vite + Node) : le Stock le calcule (mémorisé), le bloc de synchro l'affiche. Verrou :
// scripts/plateforme-vide-selftest.mjs.

const occupeesDe = (e) => (Array.isArray(e?.occupees) ? e.occupees : (Array.isArray(e?.enLigne) ? e.enLigne : []));

/**
 * Le résumé du Stock dont la règle a besoin, par plateforme (une passe, lu sur l'index d'état du Stock).
 * @param {{ stock: Array<{id}>, aPublier: Array<{id}>, index: Map<string, {enLigne?: string[], occupees?: string[]}>,
 *          plateformes: string[] }} p
 *   stock      : les articles du Stock (sans brouillons) ;
 *   aPublier   : ceux qui peuvent entrer dans un lot (articleSelectionnable) ;
 *   index      : indexEtatStock (enLigne, occupees par article) ;
 *   plateformes: les plateformes du lot pour ce compte.
 * @returns {{ occupees: Record<string, number>, enLigneAilleurs: Record<string, number>, aPublierSur: Record<string, number> }}
 */
export function resumeStockParPlateforme({ stock = [], aPublier = [], index = null, plateformes = [] } = {}) {
  const occupees = {}, enLigneAilleurs = {}, aPublierSur = {};
  for (const p of plateformes) { occupees[p] = 0; enLigneAilleurs[p] = 0; aPublierSur[p] = 0; }
  const lire = (i) => (index && typeof index.get === "function" ? index.get(String(i?.id)) : null);
  for (const i of stock ?? []) {
    const e = lire(i);
    if (!e) continue;
    const occ = occupeesDe(e);
    const enLigne = Array.isArray(e.enLigne) ? e.enLigne : [];
    for (const p of plateformes) {
      if (occ.includes(p)) occupees[p]++;
      if (enLigne.some((q) => q !== p)) enLigneAilleurs[p]++;
    }
  }
  for (const i of aPublier ?? []) {
    const occ = occupeesDe(lire(i));
    for (const p of plateformes) if (!occ.includes(p)) aPublierSur[p]++;
  }
  return { occupees, enLigneAilleurs, aPublierSur };
}

/**
 * Les plateformes reliées VIDES à qui proposer « Publier ton stock sur <plateforme> ».
 * @param {{ tuiles: Array<{ p: string, nom?: string, e: { phase: string, n: unknown }, vide?: boolean }>,
 *          compte: Record<string, { total?: number }> | null,
 *          stock: ReturnType<typeof resumeStockParPlateforme> | null }} p
 * @returns {Array<{ p: string, nom: string, nAPublier: number }>}
 */
export function plateformesVidesAProposer({ tuiles = [], compte = null, stock = null } = {}) {
  if (!stock) return [];
  return (tuiles ?? []).filter((t) => {
    if (!t?.p || t.vide) return false;
    if (t.e?.phase !== "fait" || Number(t.e?.n) !== 0 || t.e?.n === "" || t.e?.n == null) return false;
    if (Number(compte?.[t.p]?.total) > 0) return false;
    if (Number(stock.occupees?.[t.p]) > 0) return false;
    return Number(stock.enLigneAilleurs?.[t.p]) > 0 && Number(stock.aPublierSur?.[t.p]) > 0;
  }).map((t) => ({ p: t.p, nom: t.nom ?? t.p, nAPublier: Number(stock.aPublierSur[t.p]) }));
}

/**
 * Au geste : les articles à pré-cocher, EXACTEMENT ceux que le lot accepterait sur cette plateforme (la règle du lot,
 * `libres` = publication/lot/regles.plateformesLibres, injectée pour garder ce module sans import).
 */
export function idsAPublierSur(plateforme, { aPublier = [], jobsParArticle = {}, plateformes = [], libres } = {}) {
  if (typeof libres !== "function") return [];
  return (aPublier ?? []).filter((i) => libres(i, jobsParArticle?.[i.id] ?? [], plateformes).includes(plateforme)).map((i) => i.id);
}
