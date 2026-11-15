-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION 15/11/2026 (lot de Nico, point 2) — LE SCAN EBAY UNIQUE RENDU AUX 10 ARTICLES REFUSÉS AVANT APPEL
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- À jouer APRÈS le déploiement d'ebay-api-worker portant la règle (il lit le marqueur « rendu » comme libre) :
--   npx supabase db query --linked -f scripts/reparations/20261115_scan_ebay_rendu_refus_avant_appel.sql
-- puis la relecture : scripts/reparations/20261115_scan_ebay_rendu_refus_avant_appel_VERIFIER.sql (SELECT seulement).
-- Inverse : scripts/reparations/20261115_scan_ebay_rendu_refus_avant_appel_INVERSE.sql.
--
-- CE QUI S'EST PASSÉ (lecture seule du 15/11, heure de Paris). Le worker eBay ne fait qu'UN identify Lens par article
-- (inventaire.attributs.lens_scan, réservé avant l'appel, gardé « échec compris »). lens-analysis a répondu
-- 429 « identify_unavailable » — le plafond IA, AVANT tout débit et tout appel à l'IA (lens-analysis/index.ts : filet de
-- dépense lignes 2168-2180 ; avant le 14/11, plafond global de 3 000 identify par jour au même endroit) — et le worker a
-- écrit « echec » : le scan unique de ces articles était perdu, rien n'avait été payé.
-- Les 10 marqueurs « echec / HTTP 429 identify_unavailable » de la base, et aucun autre :
--   compte    article            date du marqueur      job        (titre)
--   8ac5bbda  1793651578883      02/11 21:50:07        fa58b6ef   Lee Taille FR 34 Femme Jean Noir
--   521b7f89  1793653451585      02/11 22:20:05        74a798a3   Carhartt WIP Sweat Zippé à Capuche Noir S
--   521b7f89  1793654205757      02/11 22:20:05        74a798a3   Sweat zippé à capuche noir taille S (marqueur recopié
--                                                                 de 1793653451585 : même job, même horodatage)
--   521b7f89  1793657936423      02/11 23:22:03        7037574d   Chemise bleue manches courtes XL
--   521b7f89  1793658309470      02/11 23:28:03        d3c7d6c7   Sac à dos beige et kaki
--   f8aa02a5  1794675210902      14/11 17:56:06        a42e72c9   Chemise Massimo Dutti blanche (vendue, job annulé)
--   f8aa02a5  1794675610237      14/11 18:02:09        a0db2ab3   Mini jupe grise Trafaluc, taille S
--   13e274de  1794615766169017   14/11 19:42:17        0ce4d395   Pantalon chic Zara Woman bleu marine
--   13e274de  1794615766169016   14/11 19:42:21        fff288b1   Lot 4 jeux de construction supermarché
--   e5be98ba  1794627032481      14/11 20:02:06        86f5cd5f   Mini caméra de surveillance WiFi Q18
-- LA RÈGLE (dans le code, pour tous les comptes) : _shared/lens-scan-refus-avant-appel.js, branchée dans ebay-api-worker
-- (scannerLensSiNecessaire) ; verrou scripts/ebay-scan-refus-avant-appel-selftest.mjs.
--
-- CE QUE FAIT CE SCRIPT : remplace le marqueur « echec » de ces 10 fiches par le marqueur « rendu » de la règle (celui
-- qu'écrit le worker sur un refus avant appel : statut « rendu », raison « plafond_ia », rendu_le, le détail d'origine
-- gardé) — rien d'autre : aucun autre attribut, aucune annonce, aucune tâche, aucun quota. Le scan repartira au prochain
-- job eBay normal de l'article (s'il manque encore couleur, matière ou taille).
-- Écriture AVEC les déclencheurs (inventaire_attributs_fusion_trg remplace la valeur d'une clé présente et garde les
-- autres, comme pour chaque marqueur écrit par le worker) : aucun déclencheur coupé.
-- ⛔ Gardes : jamais deux fois (sauvegarde présente) ; exactement 10 marqueurs, et exactement 10 dans toute la base ;
--    chaque fiche n'est écrite que si son marqueur est ENCORE exactement celui de la sauvegarde ; 10 lignes touchées,
--    sinon rien n'est écrit.
-- Sauvegarde : public._backup_1511_lens_scan_rendu (id, user_id, ancienne valeur de attributs->'lens_scan' ; RLS, aucun
-- accès client).
BEGIN;
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1511_lens_scan_rendu') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1511_lens_scan_rendu AS
SELECT now() AS sauve_le, i.id, i.user_id, a.job, i.attributs -> 'lens_scan' AS lens_scan_avant
  FROM public.inventaire i
  JOIN (VALUES
    (1793651578883::bigint,    '8ac5bbda-0947-4612-82fd-effdaa3ca84a'::uuid, 'fa58b6ef-0afe-444e-80e6-93873604c139'),
    (1793653451585::bigint,    '521b7f89-d94c-4a33-8399-a650a89d3f14'::uuid, '74a798a3-ec26-4867-8e3c-947359abc098'),
    (1793654205757::bigint,    '521b7f89-d94c-4a33-8399-a650a89d3f14'::uuid, '74a798a3-ec26-4867-8e3c-947359abc098'),
    (1793657936423::bigint,    '521b7f89-d94c-4a33-8399-a650a89d3f14'::uuid, '7037574d-2c30-42c8-8977-bd1aec4f889e'),
    (1793658309470::bigint,    '521b7f89-d94c-4a33-8399-a650a89d3f14'::uuid, 'd3c7d6c7-0ea9-411b-9f67-fe2d134e6d23'),
    (1794675210902::bigint,    'f8aa02a5-23cb-4325-bba8-127f61a75741'::uuid, 'a42e72c9-4fa4-4510-ace4-6ffeec07e174'),
    (1794675610237::bigint,    'f8aa02a5-23cb-4325-bba8-127f61a75741'::uuid, 'a0db2ab3-7e01-4416-bd79-7d8b5b2d1052'),
    (1794615766169017::bigint, '13e274de-7af1-4368-8c31-afe214252ca2'::uuid, '0ce4d395-1b00-41ac-b05a-ae5038505a67'),
    (1794615766169016::bigint, '13e274de-7af1-4368-8c31-afe214252ca2'::uuid, 'fff288b1-67ad-4254-8d44-fd9094a45101'),
    (1794627032481::bigint,    'e5be98ba-725d-4a22-ad28-4797a13d9cdf'::uuid, '86f5cd5f-74c1-40b7-a09b-d7cfa8517208')
  ) AS a(id, user_id, job) ON a.id = i.id AND a.user_id = i.user_id
 WHERE i.attributs -> 'lens_scan' -> 'v' ->> 'statut' = 'echec'
   AND i.attributs -> 'lens_scan' -> 'v' ->> 'mode' = 'identify'
   AND i.attributs -> 'lens_scan' -> 'v' ->> 'motif' = 'ebay_api'
   AND i.attributs -> 'lens_scan' -> 'v' ->> 'detail' = 'HTTP 429 identify_unavailable'
   AND i.attributs -> 'lens_scan' -> 'v' ->> 'job' = a.job;
ALTER TABLE public._backup_1511_lens_scan_rendu ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1511_lens_scan_rendu FROM PUBLIC, anon, authenticated;

DO $ecrire$
DECLARE
  v_prevues integer;
  v_base integer;
  v_n integer;
BEGIN
  SELECT count(*) INTO v_prevues FROM public._backup_1511_lens_scan_rendu;
  SELECT count(*) INTO v_base FROM public.inventaire
   WHERE attributs -> 'lens_scan' -> 'v' ->> 'statut' = 'echec'
     AND attributs -> 'lens_scan' -> 'v' ->> 'detail' LIKE 'HTTP 429 identify_unavailable%';
  -- relu le 15/11 : 10 marqueurs, tous dans la liste ; un autre nombre = quelque chose a changé : relire avant d'écrire
  IF v_prevues <> 10 OR v_base <> 10 THEN
    RAISE EXCEPTION 'pas les 10 marqueurs attendus (% sauvegardés, % dans la base) : rien n''est écrit, à relire', v_prevues, v_base;
  END IF;
  UPDATE public.inventaire i
     SET attributs = jsonb_build_object('lens_scan', jsonb_build_object(
           'v', (b.lens_scan_avant -> 'v') || jsonb_build_object('statut', 'rendu', 'raison', 'plafond_ia', 'rendu_le', now(), 'reparation', '20261115'),
           'source', 'lens', 'at', b.lens_scan_avant ->> 'at'))
    FROM public._backup_1511_lens_scan_rendu b
   WHERE i.id = b.id AND i.user_id = b.user_id
     AND i.attributs -> 'lens_scan' = b.lens_scan_avant;   -- la valeur EXACTE encore présente, sinon rien
  GET DIAGNOSTICS v_n = ROW_COUNT;
  IF v_n <> v_prevues THEN
    RAISE EXCEPTION 'lignes touchées : % sur % prévues (un marqueur a changé) : rien n''est écrit, à relire', v_n, v_prevues;
  END IF;
  RAISE NOTICE 'scan rendu (marqueur « rendu ») sur % fiches (sur % prévues)', v_n, v_prevues;
END $ecrire$;

-- Compte d'après, en une sortie : 10 sauvegardées, 10 « rendu », les autres attributs gardés, 0 marqueur 429 restant.
SELECT (SELECT count(*) FROM public._backup_1511_lens_scan_rendu) AS sauvegardees,
       (SELECT count(*) FROM public.inventaire i JOIN public._backup_1511_lens_scan_rendu b ON b.id = i.id
         WHERE i.attributs -> 'lens_scan' -> 'v' ->> 'statut' = 'rendu' AND i.attributs -> 'lens_scan' -> 'v' ->> 'reparation' = '20261115') AS rendus,
       (SELECT count(*) FROM public.inventaire
         WHERE attributs -> 'lens_scan' -> 'v' ->> 'statut' = 'echec'
           AND attributs -> 'lens_scan' -> 'v' ->> 'detail' LIKE 'HTTP 429 identify\_unavailable%') AS marqueurs_429_restants;
COMMIT;
