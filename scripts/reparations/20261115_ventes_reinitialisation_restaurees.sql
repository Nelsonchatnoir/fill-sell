-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION 15/11/2026 (complément du lot (2) de Nico, point 4) — LES VENTES EFFACÉES PAR « RÉINITIALISER MON
-- INVENTAIRE » RENDUES À LEURS COMPTES, SANS RIEN DÉCLENCHER
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- À jouer : npx supabase db query --linked -f scripts/reparations/20261115_ventes_reinitialisation_restaurees.sql
-- Relecture : scripts/reparations/20261115_ventes_reinitialisation_restaurees_VERIFIER.sql (SELECT seulement).
-- Inverse  : scripts/reparations/20261115_ventes_reinitialisation_restaurees_INVERSE.sql.
--
-- LA CAUSE (rapport docs/enquetes/lot-1511-3-ventes-effacees/RAPPORT.md) : Réglages › Mon compte › « Réinitialiser mon
-- inventaire » appelle supprimer_mon_stock_sans_retrait(), qui fait `delete from ventes where user_id = auth.uid()` puis
-- vide l'inventaire — TOUTES les ventes du compte, en une transaction (même instant supprimee_le à la milliseconde). Chaque
-- vente effacée laisse une ligne ventes_supprimees, que le relevé lit comme « supprimée par la personne, ne revient
-- jamais » : la synchro suivante ne les ramène pas.
-- LES NEUF RÉINITIALISATIONS, six comptes (instant exact de la transaction, heure UTC) :
--   43dfb277 goks2725            25/10 11:07:54.957 (1 569) et 28/10 13:49:05.551 (18)
--   9148e867 van-breugel.sandra  25/10 12:14:07.123 (409)
--   0a24c951 jocaille270779      26/10 06:33:09.923 (175)
--   cfdfda6f ayadi007            08/11 10:00:38.924 (746)
--   ae27133d jlovertab           08/11 17:12:45.176 (17)
--   2c89e573 noubliejamais       13/11 18:14:53.225 (1 732), 14/11 18:31:51.048 (7), 14/11 21:33:40.285 (12)
--
-- CE QUE FAIT CE SCRIPT, en UNE transaction :
--   1. la sauvegarde public._backup_1511_ventes_reinitialisation : chaque ligne effacée de ces neuf instants, sa décision
--      (« restauree », « doute_titre », « deja_la », « doublon_interne », « id_pris ») ;
--   2. remet dans `ventes` les seules « restauree » : son ID D'ORIGINE (vente_id), titre, prix de vente, date de vente,
--      plateforme, commande, annonce ; statut « vendu », prix d'achat INCONNU (NULL : jamais 0), frais et marge
--      inconnus. Sandra seulement : prix d'achat, frais, marque, type, description, source repris de sa sauvegarde
--      complète du 02/10 (_backup_0210_ventes_rattrapage, même id) ;
--   3. ⛔ AUCUN DÉCLENCHEUR : `alter table ventes disable trigger user` DANS la transaction (push_trg_ventes,
--      ventes_garde_annonce_de_la_vente, ventes_suppression_trace), réactivés avant le COMMIT — les autres sessions ne
--      voient jamais la table sans ses déclencheurs (DDL transactionnel, verrou le temps de l'insertion). Les clés
--      étrangères (internes) restent actives. Preuve écrite : compteurs de push_ventes, cross_post_jobs, inventaire et
--      email_logs des six comptes relus avant et après l'insertion — un seul qui bouge et RIEN n'est écrit ;
--   4. les lignes ventes_supprimees des ventes rendues sont MARQUÉES (source « reinitialisation_inventaire », motif
--      « restauree 15/11 … ») — aucune n'est supprimée ;
--   5. jamais deux fois (sauvegarde présente → refus), jamais un doublon : une vente déjà présente (même plateforme et
--      même commande, ou même annonce, ou même id) n'est pas remise ; une vente dont un titre identique existe déjà sur la
--      même plateforme (Ludovic : 40, ayadi007 : 2) n'est PAS remise — doute, liste au rapport (jamais un rapprochement
--      sur un titre seul).
BEGIN;
SET LOCAL lock_timeout = '10s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1511_ventes_reinitialisation') IS NOT NULL THEN
    RAISE EXCEPTION 'script déjà passé (sauvegarde présente) : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1511_ventes_reinitialisation AS
WITH resets(user_id, t) AS (
  SELECT a.id, x.t FROM (VALUES
    ('43dfb277', '2026-10-25 11:07:54.957+00'::timestamptz), ('43dfb277', '2026-10-28 13:49:05.551+00'),
    ('9148e867', '2026-10-25 12:14:07.123+00'), ('0a24c951', '2026-10-26 06:33:09.923+00'),
    ('cfdfda6f', '2026-11-08 10:00:38.924+00'), ('ae27133d', '2026-11-08 17:12:45.176+00'),
    ('2c89e573', '2026-11-13 18:14:53.225+00'), ('2c89e573', '2026-11-14 18:31:51.048+00'), ('2c89e573', '2026-11-14 21:33:40.285+00')
  ) x(u, t) JOIN auth.users a ON left(a.id::text, 8) = x.u
),
cand AS (
  SELECT s.* FROM public.ventes_supprimees s JOIN resets r ON r.user_id = s.user_id
   AND s.supprimee_le >= r.t AND s.supprimee_le < r.t + interval '1 millisecond'
),
rang AS (
  SELECT c.*, row_number() OVER (PARTITION BY c.user_id, c.plateforme_code, coalesce(c.commande_ref, 'annonce:' || c.annonce_id)
                                 ORDER BY c.supprimee_le, c.id) AS rn
  FROM cand c
)
SELECT now() AS sauve_le, r.id AS supprimee_id, r.user_id, r.vente_id, r.plateforme_code, r.commande_ref, r.annonce_id, r.titre,
       r.prix_vente, r.vendu_le, r.supprimee_le, r.source AS source_avant, r.motif AS motif_avant,
       CASE
         WHEN r.rn > 1 THEN 'doublon_interne'
         WHEN EXISTS (SELECT 1 FROM public.ventes v WHERE v.id = r.vente_id) THEN 'id_pris'
         WHEN EXISTS (SELECT 1 FROM public.ventes v WHERE v.user_id = r.user_id
                        AND coalesce(v.plateforme_code, public.plateforme_normalisee(v.plateforme)) = r.plateforme_code
                        AND ((r.commande_ref IS NOT NULL AND v.commande_ref = r.commande_ref)
                             OR (r.annonce_id IS NOT NULL AND v.annonce_id = r.annonce_id))) THEN 'deja_la'
         WHEN EXISTS (SELECT 1 FROM public.ventes v WHERE v.user_id = r.user_id
                        AND coalesce(v.plateforme_code, public.plateforme_normalisee(v.plateforme)) = r.plateforme_code
                        AND lower(btrim(v.titre)) = lower(btrim(r.titre))) THEN 'doute_titre'
         ELSE 'restauree'
       END AS decision
FROM rang r;
ALTER TABLE public._backup_1511_ventes_reinitialisation ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1511_ventes_reinitialisation FROM PUBLIC, anon, authenticated;

DO $restaurer$
DECLARE
  v_attendus constant jsonb := '{"0a24c951":175,"2c89e573":1711,"43dfb277":1587,"9148e867":409,"ae27133d":17,"cfdfda6f":744}';
  v_comptes uuid[];
  v_lu jsonb;
  v_n integer;
  v_avant jsonb;
  v_apres jsonb;
  v_desactives integer;
BEGIN
  -- Les nombres relus par l'aperçu du 15/11 : un autre nombre = quelque chose a changé depuis — relire avant d'écrire.
  SELECT jsonb_object_agg(left(user_id::text, 8), n) INTO v_lu
    FROM (SELECT user_id, count(*) n FROM public._backup_1511_ventes_reinitialisation WHERE decision = 'restauree' GROUP BY 1) x;
  IF v_lu IS DISTINCT FROM v_attendus THEN
    RAISE EXCEPTION 'pas les ventes attendues (% au lieu de %) : rien n''est écrit, à relire', v_lu, v_attendus;
  END IF;
  SELECT array_agg(DISTINCT user_id) INTO v_comptes FROM public._backup_1511_ventes_reinitialisation;

  -- Ce que la restauration ne doit JAMAIS faire bouger, relu avant.
  SELECT jsonb_build_object(
    'push_ventes', (SELECT count(*) FROM public.push_ventes WHERE user_id = ANY (v_comptes)),
    'cross_post_jobs', (SELECT count(*) FROM public.cross_post_jobs WHERE user_id = ANY (v_comptes)),
    'inventaire', (SELECT count(*) || ':' || coalesce(sum(hashtext(id::text || coalesce(statut, ''))), 0) FROM public.inventaire WHERE user_id = ANY (v_comptes)),
    'email_logs', (SELECT count(*) FROM public.email_logs WHERE user_id = ANY (v_comptes))) INTO v_avant;

  ALTER TABLE public.ventes DISABLE TRIGGER USER;

  INSERT INTO public.ventes (id, created_at, titre, prix_achat, prix_vente, benefice, date, user_id, marque, type, description,
                             emplacement, plateforme, quantite, inventaire_id, statut, selling_fees, plateforme_code,
                             plateforme_origine, vendu_le, commande_ref, source, releve_le, devise, frais_plateforme, annonce_id)
  SELECT b.vente_id, now(), b.titre,
         k.prix_achat, b.prix_vente, k.benefice,
         coalesce((b.vendu_le AT TIME ZONE 'Europe/Paris')::date, k.date),
         b.user_id, k.marque, k.type, k.description, k.emplacement,
         coalesce(k.plateforme, b.plateforme_code), coalesce(k.quantite, 1), NULL, 'vendu', k.selling_fees, b.plateforme_code,
         k.plateforme_origine, b.vendu_le, b.commande_ref,
         coalesce(k.source, CASE WHEN b.commande_ref IS NOT NULL THEN 'releve' END), k.releve_le,
         coalesce(k.devise, CASE WHEN b.plateforme_code IN ('vinted', 'leboncoin', 'beebs') THEN 'EUR' END), k.frais_plateforme, b.annonce_id
  FROM public._backup_1511_ventes_reinitialisation b
  LEFT JOIN public._backup_0210_ventes_rattrapage k ON k.id = b.vente_id AND k.user_id = b.user_id
  WHERE b.decision = 'restauree';
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
    RAISE EXCEPTION 'la restauration a fait bouger autre chose (% → %) : rien n''est écrit', v_avant, v_apres;
  END IF;
  IF v_n <> 4643 THEN RAISE EXCEPTION 'lignes remises : % sur 4643 prévues : rien n''est écrit', v_n; END IF;

  -- Les lignes ventes_supprimees des ventes rendues : MARQUÉES, jamais supprimées.
  UPDATE public.ventes_supprimees s
     SET source = coalesce(s.source, 'reinitialisation_inventaire'),
         motif  = 'restauree 15/11 (scripts/reparations/20261115_ventes_reinitialisation_restaurees.sql)'
    FROM public._backup_1511_ventes_reinitialisation b
   WHERE b.supprimee_id = s.id AND b.decision = 'restauree';

  RAISE NOTICE 'ventes remises : % ; aucun push, aucune tâche, aucun article, aucun mail (avant = après : %)', v_n, v_apres;
END
$restaurer$;

-- Le bilan, en une sortie : par compte, ventes remises, doutes, ventes au total maintenant.
SELECT left(b.user_id::text, 8) AS compte,
       count(*) FILTER (WHERE b.decision = 'restauree') AS remises,
       count(*) FILTER (WHERE b.decision = 'doute_titre') AS doutes_titre,
       count(*) FILTER (WHERE b.decision NOT IN ('restauree', 'doute_titre')) AS ecartees,
       (SELECT count(*) FROM public.ventes v WHERE v.user_id = b.user_id) AS ventes_maintenant
  FROM public._backup_1511_ventes_reinitialisation b GROUP BY b.user_id ORDER BY 1;
COMMIT;
