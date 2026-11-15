-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 15/11/2026 (décision (b) de Nico, point 4 — ventes effacées) : LES DOUTES DE LA RESTAURATION, TRANCHÉS PAR LES NUMÉROS
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- La restauration du 15/11 12:27:54 (20261115_ventes_reinitialisation_restaurees.sql) a gardé de côté 42 ventes
-- (« doute_titre ») : une vente du même titre, sur la même plateforme, était déjà en base. Règle de Nico (b) :
--   · numéro de commande présent ET différent de celui de la vente déjà en base : deux ventes distinctes → REMISE ;
--   · sans numéro de commande, ou même numéro qu'une vente présente : NON remise, listée.
-- Les ventes déjà en base au même titre (Ludovic, ressaisies le 15/11 à 10:21) n'ont PAS de numéro de commande : on les
-- compare par l'autre numéro qu'elles portent, celui de l'annonce Vinted de leur fiche (inventaire.vinted_item_id).
--   · même numéro d'annonce que la vente présente → la MÊME vente, déjà là → non remise (26, Ludovic) ;
--   · numéro d'annonce absent ou différent, et chaque vente présente du même titre est déjà l'annonce d'un autre doute
--     → vente distincte → REMISE (14, Ludovic : 2024, 2025, 05/06/26 et 07/10/26) ;
--   · sans numéro de commande → non remise (2, ayadi007).
-- Jamais un titre seul : le titre ne sert qu'à trouver les ventes à comparer ; la décision vient des numéros.
--
-- Mêmes garde-fous que la restauration : id d'origine ; AUCUN déclencheur (désactivés DANS la transaction, réactivés
-- avant le COMMIT, relus) ; push_ventes, cross_post_jobs, inventaire et email_logs des comptes relus avant/après :
-- identiques, sinon rien n'est écrit ; pierres tombales MARQUÉES, jamais supprimées. Rejoué : refusé.
-- Sauvegarde : public._backup_1511b_ventes_doutes (les 42, la décision de chacun). Inverse : …_INVERSE.sql.
-- Contrôle : …_VERIFIER.sql (lecture seule).
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '60s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1511b_ventes_doutes') IS NOT NULL THEN
    RAISE EXCEPTION 'déjà joué (_backup_1511b_ventes_doutes existe) : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1511b_ventes_doutes AS
WITH d AS (
  SELECT b.supprimee_id, b.user_id, b.vente_id, b.plateforme_code, b.commande_ref, b.annonce_id, b.titre, b.prix_vente, b.vendu_le
    FROM public._backup_1511_ventes_reinitialisation b
   WHERE b.decision = 'doute_titre'
),
p AS (  -- les ventes présentes du même titre (candidates à comparer), avec leur numéro d'annonce (la leur, sinon celui de leur fiche)
  SELECT d.vente_id AS doute, v.id, v.commande_ref, coalesce(v.annonce_id, i.vinted_item_id) AS num
    FROM d
    JOIN public.ventes v ON v.user_id = d.user_id
     AND coalesce(v.plateforme_code, public.plateforme_normalisee(v.plateforme)) = d.plateforme_code
     AND lower(btrim(v.titre)) = lower(btrim(d.titre))
    LEFT JOIN public.inventaire i ON i.id = v.inventaire_id
),
reclames AS (  -- les ventes présentes dont le numéro d'annonce est celui d'un doute du même groupe
  SELECT DISTINCT p.id FROM p JOIN d ON d.vente_id = p.doute WHERE d.annonce_id IS NOT NULL AND p.num = d.annonce_id
)
SELECT now() AS sauve_le, d.*,
       (SELECT min(p.id) FROM p WHERE p.doute = d.vente_id AND d.annonce_id IS NOT NULL AND p.num = d.annonce_id) AS vente_presente,
       CASE
         WHEN d.commande_ref IS NULL THEN 'sans_commande'
         WHEN EXISTS (SELECT 1 FROM public.ventes v WHERE v.user_id = d.user_id AND v.commande_ref = d.commande_ref) THEN 'meme_commande'
         WHEN EXISTS (SELECT 1 FROM p WHERE p.doute = d.vente_id AND d.annonce_id IS NOT NULL AND p.num = d.annonce_id) THEN 'deja_la'
         WHEN EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = d.vente_id) THEN 'id_pris'
         WHEN d.annonce_id IS NOT NULL THEN 'remise'
         WHEN NOT EXISTS (SELECT 1 FROM p WHERE p.doute = d.vente_id AND p.id NOT IN (SELECT id FROM reclames)) THEN 'remise'
         ELSE 'ambigu'
       END AS decision
  FROM d;
ALTER TABLE public._backup_1511b_ventes_doutes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1511b_ventes_doutes FROM PUBLIC, anon, authenticated;

DO $remettre$
DECLARE
  -- Les 14 ventes relues le 15/11 à 14:45 : une autre liste = quelque chose a changé depuis — relire avant d'écrire.
  v_attendues constant bigint[] := ARRAY[586559, 586577, 586677, 586765, 586768, 586872, 586920, 586928, 586929, 586938, 586939,
                                         587295, 587297, 587301];
  v_lues bigint[];
  v_bilan jsonb;
  v_comptes uuid[];
  v_n integer;
  v_avant jsonb;
  v_apres jsonb;
  v_desactives integer;
BEGIN
  SELECT array_agg(vente_id ORDER BY vente_id) INTO v_lues FROM public._backup_1511b_ventes_doutes WHERE decision = 'remise';
  SELECT jsonb_object_agg(decision, n) INTO v_bilan FROM (SELECT decision, count(*) n FROM public._backup_1511b_ventes_doutes GROUP BY 1) x;
  IF v_lues IS DISTINCT FROM v_attendues OR v_bilan IS DISTINCT FROM '{"deja_la": 26, "remise": 14, "sans_commande": 2}'::jsonb THEN
    RAISE EXCEPTION 'pas les décisions attendues (% ; %) : rien n''est écrit, à relire', v_bilan, v_lues;
  END IF;
  SELECT array_agg(DISTINCT user_id) INTO v_comptes FROM public._backup_1511b_ventes_doutes;
  SELECT jsonb_build_object(
    'push_ventes', (SELECT count(*) FROM public.push_ventes WHERE user_id = ANY (v_comptes)),
    'cross_post_jobs', (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = ANY (v_comptes)),
    'inventaire', (SELECT count(*) || ':' || coalesce(sum(hashtext(id::text || coalesce(statut, ''))), 0) FROM public.inventaire WHERE user_id = ANY (v_comptes)),
    'email_logs', (SELECT count(*) FROM public.email_logs WHERE user_id = ANY (v_comptes))) INTO v_avant;
  ALTER TABLE public.ventes DISABLE TRIGGER USER;
  INSERT INTO public.ventes (id, created_at, titre, prix_vente, date, user_id, plateforme, quantite, inventaire_id, statut,
                             plateforme_code, vendu_le, commande_ref, source, devise, annonce_id)
  SELECT b.vente_id, now(), b.titre, b.prix_vente, (b.vendu_le AT TIME ZONE 'Europe/Paris')::date, b.user_id, b.plateforme_code, 1,
         NULL, 'vendu', b.plateforme_code, b.vendu_le, b.commande_ref, 'releve',
         CASE WHEN b.plateforme_code IN ('vinted', 'leboncoin', 'beebs') THEN 'EUR' END, b.annonce_id
    FROM public._backup_1511b_ventes_doutes b
   WHERE b.decision = 'remise';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  ALTER TABLE public.ventes ENABLE TRIGGER USER;
  SELECT count(*) INTO v_desactives FROM pg_trigger WHERE tgrelid = 'public.ventes'::regclass AND NOT tgisinternal AND tgenabled <> 'O';
  IF v_desactives <> 0 THEN RAISE EXCEPTION 'déclencheurs de ventes non réactivés (%) : rien n''est écrit', v_desactives; END IF;
  SELECT jsonb_build_object(
    'push_ventes', (SELECT count(*) FROM public.push_ventes WHERE user_id = ANY (v_comptes)),
    'cross_post_jobs', (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = ANY (v_comptes)),
    'inventaire', (SELECT count(*) || ':' || coalesce(sum(hashtext(id::text || coalesce(statut, ''))), 0) FROM public.inventaire WHERE user_id = ANY (v_comptes)),
    'email_logs', (SELECT count(*) FROM public.email_logs WHERE user_id = ANY (v_comptes))) INTO v_apres;
  IF v_apres IS DISTINCT FROM v_avant THEN
    RAISE EXCEPTION 'la remise a fait bouger autre chose (% → %) : rien n''est écrit', v_avant, v_apres;
  END IF;
  IF v_n <> 14 THEN RAISE EXCEPTION 'ventes remises : % sur 14 prévues : rien n''est écrit', v_n; END IF;
  UPDATE public.ventes_supprimees s
     SET source = coalesce(s.source, 'reinitialisation_inventaire'),
         motif  = 'restauree 15/11 (doute levé par les numéros : scripts/reparations/20261115_ventes_doutes_remises.sql)'
    FROM public._backup_1511b_ventes_doutes b
   WHERE b.supprimee_id = s.id AND b.decision = 'remise';
  RAISE NOTICE 'doutes remis : % ; aucun push, aucune tâche, aucun article, aucun mail (avant = après : %)', v_n, v_apres;
END
$remettre$;

SELECT left(b.user_id::text, 8) AS compte, b.decision, count(*) AS n,
       (SELECT count(*) FROM public.ventes v WHERE v.user_id = b.user_id) AS ventes_maintenant
  FROM public._backup_1511b_ventes_doutes b GROUP BY b.user_id, b.decision ORDER BY 1, 2;
COMMIT;
