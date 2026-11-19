-- ═══════════════════════════════════════════════════════════════════════════
-- 20261119175000 — UNE VENTE VINTED PROUVÉE PAR LE NUMÉRO DE SA COMMANDE RETIRE NOS DÉPÔTS (P2, zéro double vente)
-- (19/11/2026, terminal t5, décision de Nico : « priorité n° 1 » — PRÉPARÉE, NON APPLIQUÉE : feu vert)
-- ═══════════════════════════════════════════════════════════════════════════
-- LE TROU (relu en prod le 19/11, lecture seule) : une fiche née du dressing Vinted SANS tâche Vinted (« import pur »)
-- passe « vendu » dès que le dressing lit l'annonce « sold » (inventaire_vendu_vinted_par_la_vente : « import pur :
-- comportement du 03/08 »), AVANT que la vente soit enregistrée (la commande est « waiting » tant que le colis n'est pas
-- livré). inventaire_vendu_retire_ses_copies tourne à ce moment-là, mais armer_retrait_job_pour exige une ligne de vente
-- (« Point A ») : AUCUN retrait de nos dépôts, aucune question pour eux (ils sont prouvés). Quand la vente arrive plus
-- tard, la fiche est déjà « vendu » : rien ne se rejoue. Nos annonces restent achetables ailleurs. Cas c385e244 : fiche
-- 1794665798832018 vendue sur Vinted (commande 24206260255 du 17/11, « waiting »), notre dépôt Beebs 34358308 vu en ligne
-- le 19/11 à 11:02, sans retrait. Parc du 19/11 : 613 fiches « vendu » sans vente avec une commande Vinted de moins de 30
-- jours (71 comptes) ; 1 dépôt publié ailleurs aujourd'hui (celui-ci).
--
-- LA RÈGLE (tous comptes ; Vinted est la plateforme de la vente, les retraits visent les AUTRES) : la vente d'une fiche
-- « vendu » (une pièce : quantité ≤ 1, non fondue) est PROUVÉE quand le NUMÉRO EXACT de son annonce Vinted porte une
-- commande Vinted (vinted_commandes_articles, statut waiting / needs_action / completed — jamais failed) ou une vente
-- Vinted non annulée (ventes.annonce_id, la vente relevée sans fiche du 14/11). Jamais un titre, jamais une photo.
--   1. vente_prouvee_fiche_liee (appelée par armer_retrait_job_pour seulement) reconnaît aussi cette preuve : le « Point
--      A » laisse passer le retrait ; TOUTES les autres gardes restent (retrait_job_prouve, rattachement_confirme, deux
--      annonces vivantes, sale_signal, Opla, doublon de retrait…). NOS DÉPÔTS SEULEMENT : une annonce importée est refusée
--      par la garde du 03/11 (annonce_importee ET pas de vente enregistrée après sa mise en ligne), comme avant — tracé
--      retrait_refuse_vente_avant_mise_en_ligne. Le corps de prod est réécrit À L'OCTET + un bloc ⟦19/11 P2⟧.
--   2. Quand la commande arrive APRÈS la fiche « vendu » (le cas fréquent) : déclencheur sur vinted_commandes_articles
--      (insertion, ou statut qui devient waiting / needs_action / completed), commande de moins de 30 jours, fiche du même
--      numéro « vendu » SANS vente enregistrée, avec au moins une tâche publiée hors Vinted → armer_retraits_copies(fiche,
--      'commande_vinted_serveur', sauf Vinted, sans délai : la commande est la preuve). Une erreur ici ne bloque jamais
--      l'écriture de la commande. Trace usage_logs « retrait_par_commande_vinted ».
-- Le stock déjà là : scripts/reparations/20261119_vente_vinted_par_numero_reprise.sql (+ INVERSE), sur feu vert.
-- Verrou : npm run selftest:vente-vinted-par-numero (banc Postgres jetable, corps de prod).
-- Inverse : supabase/rollbacks/20261119175000_vente_vinted_par_numero_INVERSE.sql.
-- Appliquer (feu vert) : npx supabase db query --linked -f supabase/migrations/20261119175000_vente_vinted_par_numero.sql
--                        npx supabase migration repair --linked --status applied 20261119175000
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $verif$
BEGIN
  IF md5(pg_get_functiondef('public.vente_prouvee_fiche_liee(bigint,text)'::regprocedure)) <> 'ecdc2abb172975c78f0fc9d12cd94b6e' THEN
    RAISE EXCEPTION 'vente_prouvee_fiche_liee a changé en prod depuis sa lecture du 19/11 (md5 attendu ecdc2abb172975c78f0fc9d12cd94b6e) : relire, reconstruire, jamais forcer';
  END IF;
END $verif$;

-- ── 1. LA PREUVE PAR LE NUMÉRO ─────────────────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vente_vinted_prouvee_par_numero(p_fiche bigint, p_platform text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT lower(COALESCE(p_platform, '')) <> 'vinted' AND EXISTS (
    SELECT 1 FROM public.inventaire i
     WHERE i.id = p_fiche AND i.statut = 'vendu' AND i.fusionne_dans IS NULL AND COALESCE(i.quantite, 1) <= 1
       AND NULLIF(btrim(COALESCE(i.vinted_item_id, '')), '') IS NOT NULL
       AND (EXISTS (SELECT 1 FROM public.vinted_commandes_articles c
                     WHERE c.user_id = i.user_id AND c.item_id = btrim(i.vinted_item_id)
                       AND c.statut IN ('waiting', 'needs_action', 'completed'))
            OR EXISTS (SELECT 1 FROM public.ventes v
                        WHERE v.user_id = i.user_id AND v.annonce_id = btrim(i.vinted_item_id)
                          AND lower(COALESCE(NULLIF(v.plateforme_code, ''), NULLIF(v.plateforme, ''), '')) = 'vinted'
                          AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled'))));
$function$;
REVOKE ALL ON FUNCTION public.vente_vinted_prouvee_par_numero(bigint, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vente_vinted_prouvee_par_numero(bigint, text) TO service_role;

-- ── 2. vente_prouvee_fiche_liee : le corps de PROD du 19/11 + le bloc ⟦19/11 P2⟧ ───────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vente_prouvee_fiche_liee(p_fiche bigint, p_platform text)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select exists (
    select 1
      from public.fiches_liees_comptes f
      join lateral (select case when f.fiche_a = p_fiche then f.fiche_b else f.fiche_a end as fiche,
                           case when f.fiche_a = p_fiche then f.user_b else f.user_a end as uid,
                           case when f.fiche_a = p_fiche then f.user_a else f.user_b end as moi) x on true
      join public.inventaire i on i.id = x.fiche and i.user_id = x.uid
      join public.ventes v on v.inventaire_id = x.fiche and v.user_id = x.uid
     where (f.fiche_a = p_fiche or f.fiche_b = p_fiche)
       and public.comptes_sont_lies(x.moi, x.uid)
       and i.statut = 'vendu'
       and lower(coalesce(v.statut, '')) not in ('annule', 'annulée', 'cancelled', 'canceled')
       and coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, '')) is not null
       and lower(coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, ''))) <> lower(coalesce(p_platform, '')))
  -- ⟦19/11 P2 — la vente de la FICHE prouvée par le NUMÉRO de sa commande Vinted (ou d'une vente Vinted du même numéro)
  or public.vente_vinted_prouvee_par_numero(p_fiche, p_platform)
  -- 19/11 P2⟧
$function$
;

-- ── 3. LA COMMANDE QUI ARRIVE APRÈS LA FICHE « VENDU » ───────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.vinted_commande_retire_nos_depots()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_fiche bigint; v_r jsonb;
BEGIN
  IF COALESCE(current_setting('fillsell.sans_retrait', true), '') = '1' THEN RETURN NEW; END IF;
  IF NEW.statut IS NULL OR NEW.statut NOT IN ('waiting', 'needs_action', 'completed') THEN RETURN NEW; END IF;
  IF TG_OP = 'UPDATE' AND OLD.statut IN ('waiting', 'needs_action', 'completed') THEN RETURN NEW; END IF;   -- déjà jugée
  IF NEW.commande_le IS NULL OR NEW.commande_le < now() - interval '30 days' THEN RETURN NEW; END IF;      -- jamais l'historique
  BEGIN
    SELECT i.id INTO v_fiche FROM public.inventaire i
     WHERE i.user_id = NEW.user_id AND i.vinted_item_id = btrim(NEW.item_id)
       AND i.statut = 'vendu' AND i.fusionne_dans IS NULL AND COALESCE(i.quantite, 1) <= 1;
    IF v_fiche IS NULL THEN RETURN NEW; END IF;
    -- une vente déjà enregistrée sur la fiche : son circuit a joué (retraits armés ou refusés), rien à rejouer
    IF EXISTS (SELECT 1 FROM public.ventes v WHERE v.user_id = NEW.user_id AND v.inventaire_id = v_fiche
                 AND lower(COALESCE(v.statut, '')) NOT IN ('annule', 'annulée', 'cancelled', 'canceled')) THEN RETURN NEW; END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cross_post_jobs j WHERE j.user_id = NEW.user_id AND j.inventaire_id = v_fiche
                     AND j.platform <> 'vinted' AND COALESCE(j.action, 'publish') IN ('publish', 'republish') AND j.status = 'published') THEN
      RETURN NEW;
    END IF;
    v_r := public.armer_retraits_copies(v_fiche, 'commande_vinted_serveur', NULL, 'vinted', interval '0');
    INSERT INTO public.usage_logs (user_id, feature, metadata)
    VALUES (NEW.user_id, 'retrait_par_commande_vinted', jsonb_build_object(
      'commande', NEW.commande_ref, 'annonce', NEW.item_id, 'statut', NEW.statut, 'article_id', v_fiche::text, 'bilan', v_r));
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'vinted_commande_retire_nos_depots (commande %, annonce %) : % — commande gardée', NEW.commande_ref, NEW.item_id, SQLERRM;
  END;
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.vinted_commande_retire_nos_depots() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS vinted_commande_retire_nos_depots ON public.vinted_commandes_articles;
CREATE TRIGGER vinted_commande_retire_nos_depots
  AFTER INSERT OR UPDATE OF statut ON public.vinted_commandes_articles
  FOR EACH ROW EXECUTE FUNCTION public.vinted_commande_retire_nos_depots();

COMMIT;
