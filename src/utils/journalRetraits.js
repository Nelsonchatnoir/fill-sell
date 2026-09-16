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
// CINQ CHEMINS, FERMÉS (toute nouvelle voie de retrait DOIT s'ajouter ici) :
//   bandeau_hors_ligne  — armRemovals (App.jsx), le bandeau « ces annonces ne
//                         sont plus en ligne » : l'utilisateur confirme le
//                         retrait d'un LOT ;
//   logo_stock          — armRemoveJob (StockTab.jsx), retrait d'UNE annonce
//                         par le logo de plateforme sur la fiche ;
//   suppression_article — performItemDeletion (App.jsx), suppression d'un
//                         article du stock, qui arme le retrait de toutes ses
//                         annonces en ligne.
// Et deux chemins SERVEUR (2026-09-16), qui écrivent la MÊME ligne avec les
// MÊMES clés de métadonnées — sans passer par ce module, mais nommés ici pour
// que la liste reste fermée et lisible en un seul endroit :
//   suppression_article_filet_serveur — trigger
//                         inventaire_arme_retraits_avant_suppression : au
//                         DELETE d'un article, arme les retraits que le plan
//                         de l'app n'a pas armés (republish, chemins sans plan) ;
//   vente_beebs_sans_lien — orchestrateSale (sale-orchestration.ts) : à la
//                         vente, arme le retrait d'un dépôt Beebs encore en
//                         vérification, que le bandeau ne peut pas proposer.
//
// ⚠️ ON JOURNALISE CE QUI EST FAIT, PAS CE QUI EST VOULU. L'appel se place
// APRÈS l'écriture en base, et `nAnnonces` compte les lignes RÉELLEMENT
// insérées (retour du .select()), jamais la longueur du tableau qu'on
// s'apprêtait à insérer. Un insert refusé par la RLS ne doit pas laisser croire
// qu'une annonce est partie.
//
// ⚠️ UNE SUPPRESSION D'ARTICLE SE JOURNALISE MÊME À ZÉRO ANNONCE. C'est
// justement ce qui manquait le 13/09 : savoir que 30 ARTICLES avaient été
// supprimés. Un article sans annonce en ligne reste une suppression
// irréversible. Depuis le 16/09 elle part sous sa PROPRE feature
// (`suppression_article`, cf. logSuppressionArticle) et non plus sous
// `retrait_annonces`, qui promettait un retrait d'annonces qui n'avait pas eu
// lieu.
//
// Best-effort, comme toute la télémétrie du projet : un échec d'écriture est
// journalisé en console et n'interrompt JAMAIS le geste de l'utilisateur —
// refuser une suppression parce que le journal est indisponible serait pire
// que le trou qu'on bouche.
import { supabase } from '../lib/supabase';

// ── DEUX GESTES, DEUX COMPTEURS (2026-09-16) ────────────────────────────────
// `retrait_annonces` mesurait deux choses qui n'ont rien à voir :
//   · « je supprime un article de mon stock » — geste LOCAL, irréversible, qui
//     peut ne toucher AUCUNE plateforme (cas relevés le 16/09 : deux comptes
//     supprimant des articles jamais publiés, journalisés sous un nom qui
//     annonce un retrait d'annonces) ;
//   · « je retire mes annonces des plateformes » — geste DISTANT, qui crée de
//     vrais jobs `delete` et fait disparaître des annonces.
// Le `chemin` les distinguait dans les métadonnées. Le NOM DE LA FEATURE ne les
// distinguait pas — et c'est le nom qu'on lit dans les mesures.
//
// ⚠️ FRONTIÈRE DE LECTURE. Les 76 lignes écrites avant ce jour gardent leur
// nom : c'est la trace, on n'y touche pas. Toute requête qui traverse le 16/09
// doit donc lire, pour la période d'AVANT :
//     feature='retrait_annonces' AND metadata->>'chemin'='suppression_article'
// et, pour la période d'APRÈS, `feature='suppression_article'`. Et sur l'avant,
// dédoublonner les rafales (même user + mêmes métadonnées à moins de 10 s) :
// `suppression_article` y compte 56 lignes pour 34 gestes réels (+65 %), défaut
// corrigé le 16/09 — cf. docs/DIAGNOSTIC_RETRAIT_ANNONCES_16-09.md.
export const RETRAIT_FEATURE = 'retrait_annonces';
export const SUPPRESSION_FEATURE = 'suppression_article';

export const CHEMINS_RETRAIT = Object.freeze({
  BANDEAU: 'bandeau_hors_ligne',
  LOGO_STOCK: 'logo_stock',
  SUPPRESSION_ARTICLE: 'suppression_article',
  // Chemins SERVEUR — jamais appelés d'ici, listés pour la lecture SQL
  // (cf. en-tête). Les changer ici ne change rien en base : la valeur est
  // écrite par le trigger / la fonction, c'est la doc qui doit suivre.
  FILET_SERVEUR: 'suppression_article_filet_serveur',
  VENTE_BEEBS_SANS_LIEN: 'vente_beebs_sans_lien',
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
  // ⛔ AUCUNE ANNONCE RETIRÉE ⇒ AUCUNE LIGNE `retrait_annonces`. C'est toute la
  // séparation : ce compteur ne doit contenir que des gestes qui ont fait
  // disparaître quelque chose d'une plateforme. La suppression d'un article
  // sans annonce, elle, reste journalisée — par logSuppressionArticle, sous son
  // propre nom.
  if (!(Number(nAnnonces) > 0)) return Promise.resolve();
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

/**
 * L'ATTRITION DU STOCK — émise à CHAQUE suppression d'article, annonce ou pas.
 *
 * C'est la moitié du geste que `retrait_annonces` ne doit plus porter. Un
 * article supprimé sans jamais avoir été publié est une suppression
 * irréversible, elle mérite sa ligne — mais sous un nom qui ne promet pas
 * qu'une annonce est partie d'une plateforme.
 *
 * Un article publié sur 3 plateformes émet donc DEUX lignes : celle-ci (1
 * article) et une `retrait_annonces` (3 annonces). Chaque compteur se lit seul,
 * sans filtrer sur `chemin`.
 *
 * @param {string}  userId
 * @param {object}  p
 * @param {string}  p.chemin      une valeur de CHEMINS_RETRAIT (voie empruntée)
 * @param {string} [p.articleId]  inventaire.id
 * @param {number} [p.nAnnonces]  annonces retirées DANS LE MÊME GESTE (0 si aucune)
 * @param {object} [p.extra]      contexte additionnel, jamais de donnée perso
 */
export function logSuppressionArticle(userId, { chemin, articleId = null, nAnnonces = 0, extra = null } = {}) {
  if (!userId || !chemin) return Promise.resolve();
  return supabase.from('usage_logs').insert({
    user_id: userId,
    feature: SUPPRESSION_FEATURE,
    metadata: {
      chemin,
      // Gardé ICI aussi, et ce n'est pas une redite : il dit si CETTE
      // suppression a entraîné un retrait, sans avoir à recoller les deux
      // lignes en SQL sur un horodatage.
      n_annonces: Number(nAnnonces) || 0,
      ...(articleId ? { article_id: String(articleId) } : {}),
      ...(extra || {}),
    },
  }).then(({ error }) => {
    if (error) console.warn('[suppression_article] geste NON journalisé:', error.message);
  }).catch((e) => {
    console.warn('[suppression_article] geste NON journalisé:', e?.message ?? e);
  });
}
