-- ═══════════════════════════════════════════════════════════════════════════
-- REPRISE DE L'HISTORIQUE EN BROUILLONS — ÉCRITE, **PAS APPLIQUÉE** (16/09)
--
-- ⛔ CE FICHIER N'A PAS ÉTÉ EXÉCUTÉ EN PROD. Il attend UN MOT de Nico, et il
--    est expliqué ci-dessous pourquoi il ne pouvait pas partir tout seul.
--
-- ── CE QUE LE LOT DEMANDE ──────────────────────────────────────────────────
-- « 263 lignes sur 73 comptes basculent en brouillon », avec la définition
-- STRICTE des trois états exclusifs (src/utils/brouillon.js) :
--     BROUILLON  fiches_annonce.brouillon = true ET aucun job
--     EN STOCK   l'utilisateur a cliqué « Ajouter au stock » (brouillon→false)
--     EN LIGNE   au moins un job est parti
-- et la consigne : « au moindre doute sur une ligne, tu la laisses à false et
-- tu la comptes à part ».
--
-- ── CE QUE LA BASE DIT, LE 16/09 ───────────────────────────────────────────
-- `brouillon` n'existe QUE sur public.fiches_annonce. Relevé exhaustif :
--     source                   brouillon   lignes  comptes  SANS job
--     lens_unifie              true             4        2         4
--     lens_unifie_rattrapage   true            34       21        34
--     stepper                  FALSE           17        3      ⇒ 0
-- Les 17 seules lignes à `brouillon = false` ont TOUTES un job : elles sont
-- EN LIGNE, donc exactement à leur place. Appliquée à la lettre, la définition
-- stricte désigne **0 ligne à basculer** — pas 263.
--
-- Les 263/73 ne peuvent donc pas être des lignes fiches_annonce. Ce sont des
-- lignes `inventaire` sans fiche, et « basculer » voudrait alors dire CRÉER une
-- fiche brouillon, pas faire un UPDATE (le lot parle d'« UPDATE » et de
-- « sauvegarde des id AVANT »). Aucune définition testée ne retombe sur
-- 263/73 — mesuré sur inventaire (origine NULL, statut 'stock', aucun job,
-- aucune fiche) :
--     socle total .............................. 1 320 lignes / 279 comptes
--     sans prix d'achat ........................    57 lignes /  50 comptes
--     avec photos ..............................    14 lignes /  12 comptes
--     génération facturée à ±1 h de la création    290 lignes /  91 comptes
--     génération facturée à ±10 min ............   107 lignes /  86 comptes
--     depuis le 19/08 ..........................   358 lignes /  70 comptes
-- Le plus proche (290/91) n'est ni le compte de lignes ni celui de comptes.
-- ⚠️ À comparer : pour le lot 3, les mesures du 15/09 se rejouent AU CHIFFRE
--    PRÈS (31 scans récupérables, 2 825 photos / 970 Mo / 453 comptes). Ici,
--    rien ne tombe juste — donc je ne sais pas QUELLES lignes Nico a validées,
--    et basculer une population approchante ferait sauter dans « Brouillons »
--    des articles que des gens ont rangés eux-mêmes.
--
-- ── CE QU'IL FAUT POUR L'ALLUMER ───────────────────────────────────────────
-- Une phrase de Nico qui dit ce que compte le 263 (la requête, ou « c'est le
-- socle », ou « ce sont celles avec une génération facturée »). Le
-- `WHERE` ci-dessous est alors le SEUL endroit à toucher, et le fichier part.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LA SAUVEGARDE, AVANT TOUT UPDATE ────────────────────────────────────
-- Même forme que profiles_ebay_voie_api_backup_20260908 : l'identifiant ET la
-- valeur d'AVANT. Créée une seule fois, jamais écrasée — elle photographie
-- l'état d'avant, ce n'est pas une vue.
CREATE TABLE IF NOT EXISTS public.fiches_brouillon_backup_20260916 AS
  SELECT f.inventaire_id, f.user_id, f.brouillon, now() AS sauvegarde_le
  FROM public.fiches_annonce f;

ALTER TABLE public.fiches_brouillon_backup_20260916 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.fiches_brouillon_backup_20260916 FROM anon, authenticated;

-- ── 2. LA BASCULE ──────────────────────────────────────────────────────────
-- IDEMPOTENTE : `brouillon = false` dans le WHERE — rejouée, 0 ligne réécrite,
-- aucun trigger réveillé, aucun updated_at déplacé.
-- ⛔ PAS DE RETOUR ARRIÈRE STOCK → BROUILLON : la seule chose qui distingue
--    « EN STOCK » de « BROUILLON » est un geste, et ce geste n'a laissé qu'une
--    trace — ce `false`. On ne peut donc basculer que des lignes dont on sait
--    qu'elles ne sont dans AUCUN des deux autres états. D'où la clause « aucun
--    job » ci-dessous, et d'où le blocage expliqué en tête de fichier : sans
--    savoir lesquelles, on ne peut pas prouver qu'elles ne sont pas EN STOCK.
UPDATE public.fiches_annonce f
SET brouillon = true
WHERE f.brouillon = false
  -- pas EN LIGNE
  AND NOT EXISTS (
    SELECT 1 FROM public.cross_post_jobs j WHERE j.inventaire_id = f.inventaire_id)
  -- ⚠️ ET ICI la clause « jamais explicitement rangée », à écrire quand Nico
  --    aura dit ce que comptent les 263. En l'état, `false` la neutralise : le
  --    fichier est sans effet même s'il est rejoué par erreur.
  AND false;
