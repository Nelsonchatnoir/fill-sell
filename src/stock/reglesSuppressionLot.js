// ═══════════════════════════════════════════════════════════════════════════
// SUPPRIMER PLUSIEURS ARTICLES DU STOCK — LE RÉSUMÉ ET LES CHOIX (16/11/2026, point 8 — Marc, thecloset72000)
// ═══════════════════════════════════════════════════════════════════════════
// Ce module ne supprime RIEN : il lit le plan de chaque article (le même que la suppression d'UN article,
// App.jsx buildDeletePlan) et dit, avant le geste, ce qui va se passer :
//   · combien d'articles partent, combien d'annonces en ligne seraient retirées, et sur quelles plateformes ;
//   · les articles qui ont des ventes : elles RESTENT dans le tableau de bord (comme « Supprimer l'article
//     uniquement » d'un article vendu) ;
//   · les articles laissés de côté : une vente à confirmer (on ne supprime pas ce qui attend une réponse),
//     ou un plan illisible (on ne supprime jamais à l'aveugle) ;
//   · les choix : « Retirer aussi les annonces et supprimer », « Supprimer les fiches, laisser les annonces en ligne »
//     (les mêmes que pour un article), ou « Supprimer » quand rien n'est en ligne.
// Pur (Node + navigateur) : scripts/suppression-lot-selftest.mjs.

// Les noms des plateformes : la configuration du Stock, jamais écrits ici (règle de la refonte).
import { LIBELLE_PLATEFORME as NOMS_PLATEFORMES } from "../utils/stockFiltres.js";
export { NOMS_PLATEFORMES };

/**
 * @param {Array<{item:{id,title}, plan:{online:Array<{platform}>}|null, aDesVentes?:boolean, venteAConfirmer?:boolean, erreur?:string}>} entrees
 * @param {{oplaFermee?: boolean}} [o] — Opla n'est jamais retirée par FillSell (règle du 22/10) : jamais comptée.
 */
export function resumeSuppressionLot(entrees, { oplaFermee = true } = {}) {
  const aSupprimer = [];
  const exclus = [];
  const parPlateforme = {};
  let nAnnonces = 0;
  let nAvecVentes = 0;
  for (const e of Array.isArray(entrees) ? entrees : []) {
    if (!e?.item) continue;
    if (e.venteAConfirmer) { exclus.push({ id: e.item.id, titre: e.item.title ?? "", motif: "vente_a_confirmer" }); continue; }
    if (!e.plan || e.erreur) { exclus.push({ id: e.item.id, titre: e.item.title ?? "", motif: "plan_illisible" }); continue; }
    aSupprimer.push(e);
    if (e.aDesVentes) nAvecVentes++;
    for (const pub of e.plan.online ?? []) {
      if (oplaFermee && pub?.platform === "opla") continue;
      parPlateforme[pub.platform] = (parPlateforme[pub.platform] ?? 0) + 1;
      nAnnonces++;
    }
  }
  return { aSupprimer, exclus, parPlateforme, nAnnonces, nAvecVentes, nArticles: aSupprimer.length };
}

/** Les boutons de la confirmation, dans l'ordre (le premier est le choix par défaut, comme pour un article). */
export function choixSuppressionLot(resume) {
  if (!resume?.nArticles) return [];
  if (resume.nAnnonces > 0) return ["avec_retrait", "fiche_seule"];
  return ["simple"];
}

/** « Vinted 5, Leboncoin 3 » */
export function plateformesEnClair(parPlateforme, lang = "fr") {
  const fr = lang !== "en";
  return Object.entries(parPlateforme ?? {}).sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${NOMS_PLATEFORMES[p] ?? p} ${n}`).join(fr ? ", " : ", ");
}

/** Le mode transmis à la suppression : avec_retrait / simple → le chemin d'un article ; fiche_seule → la RPC sans retrait. */
export const modeDuChoix = (choix) => (choix === "fiche_seule" ? "fiche_seule" : "avec_retrait");

/** La phrase du bilan, après le geste. */
export function phraseBilanSuppressionLot(bilan, lang = "fr") {
  const fr = lang !== "en";
  if (!bilan || bilan.occupe) return fr ? "Une suppression est déjà en cours : attends qu'elle finisse." : "A deletion is already running: wait for it to finish.";
  const parts = [];
  const n = bilan.faits ?? 0;
  parts.push(fr ? `${n} article${n > 1 ? "s" : ""} supprimé${n > 1 ? "s" : ""}` : `${n} item${n > 1 ? "s" : ""} deleted`);
  if (bilan.annonces) parts.push(fr
    ? `${bilan.annonces} retrait${bilan.annonces > 1 ? "s" : ""} d'annonce en file (une à la fois)`
    : `${bilan.annonces} listing removal${bilan.annonces > 1 ? "s" : ""} queued (one at a time)`);
  if (bilan.laissees) parts.push(fr
    ? `${bilan.laissees} annonce${bilan.laissees > 1 ? "s" : ""} laissée${bilan.laissees > 1 ? "s" : ""} en ligne — à retrouver dans « Rattacher »`
    : `${bilan.laissees} listing${bilan.laissees > 1 ? "s" : ""} left online — find them under “Match”`);
  if (bilan.boutiques) parts.push(fr
    ? `${bilan.boutiques} annonce${bilan.boutiques > 1 ? "s" : ""} Vinted d'un autre compte laissée${bilan.boutiques > 1 ? "s" : ""} en ligne`
    : `${bilan.boutiques} Vinted listing${bilan.boutiques > 1 ? "s" : ""} from another account left online`);
  const e = bilan.echecs?.length ?? 0;
  if (e) parts.push(fr ? `${e} non supprimé${e > 1 ? "s" : ""} : réessaie depuis ${e > 1 ? "leur" : "sa"} fiche` : `${e} not deleted: try again from the item`);
  return `${parts.join(" · ")}.`;
}

/**
 * La boucle du lot, un article après l'autre — les gestes viennent de l'appelant (App.jsx), ceux d'UN article :
 *   · supprimerAvecPlan(item, plan) → { armes, boutiqueEtrangere } : executerSuppression, ventes GARDÉES ;
 *   · supprimerFicheSeule(item) → { annonces_laissees } : la RPC « laisser les annonces en ligne ».
 * « fiche_seule » ne vaut que pour un article qui a des annonces en ligne ; les autres suivent le chemin d'un article
 * sans annonce (rien à retirer). Un échec n'arrête pas le lot : il est nommé au bilan.
 */
export async function executerSuppressionLot(entrees, mode, { supprimerAvecPlan, supprimerFicheSeule, onProgression = null }) {
  const bilan = { faits: 0, annonces: 0, laissees: 0, boutiques: 0, echecs: [] };
  const liste = Array.isArray(entrees) ? entrees : [];
  for (let k = 0; k < liste.length; k++) {
    const { item, plan } = liste[k] ?? {};
    try {
      if (!item || !plan) throw new Error("plan_illisible");
      if (mode === "fiche_seule" && (plan.online?.length ?? 0) > 0) {
        const r = await supprimerFicheSeule(item);
        bilan.laissees += Number(r?.annonces_laissees ?? 0) || 0;
      } else {
        const r = await supprimerAvecPlan(item, plan);
        bilan.annonces += Number(r?.armes ?? 0) || 0;
        if (r?.boutiqueEtrangere) bilan.boutiques++;
      }
      bilan.faits++;
    } catch (e) {
      bilan.echecs.push({ titre: item?.title ?? "", erreur: String(e?.message ?? e) });
    }
    onProgression?.(k + 1, liste.length);
  }
  return bilan;
}
