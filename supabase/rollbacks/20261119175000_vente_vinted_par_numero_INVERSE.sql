-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de 20261119175000_vente_vinted_par_numero (19/11/2026, terminal t5)
-- ═══════════════════════════════════════════════════════════════════════════
-- Remet À L'OCTET vente_prouvee_fiche_liee(bigint,text) relue en prod le 19/11 (md5 ecdc2abb172975c78f0fc9d12cd94b6e), retire le déclencheur et
-- les deux fonctions nouvelles. Aucune donnée réécrite : un retrait déjà armé par la règle suit son cours (il s'annule
-- par l'app, ou par l'inverse de la reprise pour ceux de la reprise).
-- Appliquer : npx supabase db query --linked -f supabase/rollbacks/20261119175000_vente_vinted_par_numero_INVERSE.sql
BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DROP TRIGGER IF EXISTS vinted_commande_retire_nos_depots ON public.vinted_commandes_articles;
DROP FUNCTION IF EXISTS public.vinted_commande_retire_nos_depots();

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
$function$
;

DROP FUNCTION IF EXISTS public.vente_vinted_prouvee_par_numero(bigint, text);

COMMIT;
