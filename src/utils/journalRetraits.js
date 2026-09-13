// ── Journal des gestes IRRÉVERSIBLES : suppressions et retraits (2026-09-13) ──
//
// POURQUOI. Soirée du 13/09, compte corbier.charline : 30 jobs `action='delete'`
// vinted créés en rafale, dont 6 exécutés pour de bon (API Vinted HTTP 200
// « Ok » — les annonces sont parties du dressing). En face, dans usage_logs :
// RIEN. Deux lignes seulement pour la soirée, une sync et une republication.
// Il a fallu remonter la FK `cross_post_jobs_inventaire_id_fkey` (ON DELETE
// SET NULL) pour établir que les 30 jobs venaient de suppressions d'articles,
// et le rythme des inserts (3 à 7 s) pour établir que c'était bien un humain et
// pas une boucle. Des heures pour répondre à « est-ce elle ? ».
//
// La raison de ce silence : `track()` (src/analytics/analytics.js) ne fait
// qu'un `window.dataLayer.push` — du Google Tag Manager, côté navigateur, zéro
// écriture en base. Les trois chemins de retrait l'appelaient (ou n'appelaient
// rien du tout) et laissaient donc l'ardoise vide.
//
// RÈGLE. Un geste qui retire une annonce d'une plateforme, ou qui supprime un
// article, doit laisser une ligne DANS LA BASE : qui, quand, par quel chemin,
// sur quelles plateformes, combien d'annonces. C'est du journal d'audit, pas de
// l'analytics — il ne part pas chez GTM, il reste chez nous.
//
// TROIS CHEMINS, FERMÉS (toute nouvelle voie de retrait DOIT s'ajouter ici) :
//   bandeau_hors_ligne  — armRemovals (App.jsx), le bandeau « ces annonces ne
//                         sont plus en ligne » : l'utilisateur confirme le
//                         retrait d'un LOT ;
//   logo_stock          — armRemoveJob (StockTab.jsx), retrait d'UNE annonce
//                         par le logo de plateforme sur la fiche ;
//   suppression_article — performItemDeletion (App.jsx), suppression d'un
//                         article du stock, qui arme le retrait de toutes ses
//                         annonces en ligne.
//
// ⚠️ ON JOURNALISE CE QUI EST FAIT, PAS CE QUI EST VOULU. L'appel se place
// APRÈS l'écriture en base, et `nAnnonces` compte les lignes RÉELLEMENT
// insérées (retour du .select()), jamais la longueur du tableau qu'on
// s'apprêtait à insérer. Un insert refusé par la RLS ne doit pas laisser croire
// qu'une annonce est partie.
//
// ⚠️ `suppression_article` se journalise MÊME À ZÉRO ANNONCE. C'est justement
// ce qui manquait le 13/09 : savoir que 30 ARTICLES avaient été supprimés. Un
// article sans annonce en ligne reste une suppression irréversible.
//
// Best-effort, comme toute la télémétrie du projet : un échec d'écriture est
// journalisé en console et n'interrompt JAMAIS le geste de l'utilisateur —
// refuser une suppression parce que le journal est indisponible serait pire
// que le trou qu'on bouche.
import { supabase } from '../lib/supabase';

export const RETRAIT_FEATURE = 'retrait_annonces';

export const CHEMINS_RETRAIT = Object.freeze({
  BANDEAU: 'bandeau_hors_ligne',
  LOGO_STOCK: 'logo_stock',
  SUPPRESSION_ARTICLE: 'suppression_article',
});

/**
 * @param {string}   userId
 * @param {string}   chemin       une valeur de CHEMINS_RETRAIT
 * @param {object}   p
 * @param {string[]} p.plateformes plateformes réellement visées (dédoublonnées)
 * @param {number}   p.nAnnonces   nombre de jobs delete réellement insérés
 * @param {number}  [p.nArticles]  articles concernés (lot du bandeau, sinon 1)
 * @param {string}  [p.articleId]  inventaire.id quand le geste porte sur UN article
 * @param {object}  [p.extra]      contexte additionnel, jamais de donnée perso
 */
export function logRetrait(userId, chemin, { plateformes = [], nAnnonces = 0, nArticles = 1, articleId = null, extra = null } = {}) {
  if (!userId || !chemin) return Promise.resolve();
  // Dédoublonnage + tri : la métadonnée se lit et se groupe en SQL, elle ne
  // doit pas dépendre de l'ordre des jobs rendus par PostgREST.
  const pfs = [...new Set((plateformes || []).filter(Boolean).map(String))].sort();
  return supabase.from('usage_logs').insert({
    user_id: userId,
    feature: RETRAIT_FEATURE,
    metadata: {
      chemin,
      plateformes: pfs,
      n_annonces: Number(nAnnonces) || 0,
      n_articles: Number(nArticles) || 0,
      ...(articleId ? { article_id: String(articleId) } : {}),
      ...(extra || {}),
    },
  }).then(({ error }) => {
    if (error) console.warn('[retrait_annonces] geste NON journalisé:', error.message);
  }).catch((e) => {
    console.warn('[retrait_annonces] geste NON journalisé:', e?.message ?? e);
  });
}
