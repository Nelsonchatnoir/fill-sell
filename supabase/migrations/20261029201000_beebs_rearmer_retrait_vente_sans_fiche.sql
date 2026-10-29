-- 20261029201000 — (29/10, lot B 4.9 B) UN RETRAIT BEEBS REVU EN LIGNE SE RÉARME AUSSI QUAND LA FICHE EST SUPPRIMÉE.
-- ⛔ NON APPLIQUÉE. À appliquer seulement sur feu vert NOMMÉ de Nico, après l'essai à blanc :
--   npx supabase db query --linked -f supabase/migrations/20261029201000_beebs_rearmer_retrait_vente_sans_fiche.sql
--   npx supabase migration repair --linked --status applied 20261029201000
-- Inverse : supabase/rollbacks/20261029201000_beebs_rearmer_retrait_vente_sans_fiche_INVERSE.sql (md5 relu).
-- Essai : scripts/essais/20261029201000_essai.sql (20261029201000_generer.sh : migration + tests, ROLLBACK).
--
-- CONSTAT : Sébastien (48dd94f7), retrait cfed66ca (copie Beebs 34219819, jamais en ligne), armé le 25/10 à 09:57 par
-- la vente Vinted 286083 (10500161434) ; la fiche a été supprimée : inventaire_id NULL sur le dépôt 803df781, le retrait
-- et la vente. Le filet retraits_beebs_rearmer_revus (un retrait Beebs clos « deleted » puis revu EN LIGNE par un relevé
-- repart) exigeait une fiche « vendu » par jointure sur inventaire : il ne réarmerait JAMAIS ce retrait si Beebs publiait
-- l'annonce tard — double vente possible.
-- RÈGLE (R4) : fiche présente → inchangé (fiche « vendu ») ; fiche supprimée (inventaire_id NULL sur le dépôt ET le
-- retrait) → la vente prouvée par SA ligne ventes : même compte, sans fiche elle non plus, autre plateforme que Beebs,
-- pas annulée, née à l'instant où elle a armé ce retrait (platform_fields.arme_par.le ± 2 min — la règle du 18/10 qui
-- relie une vente à ses retraits pour les remises en vente), et aucune annulation posée sur le dépôt
-- (vente_annulee_remise). Le chemin d'armement (arme_par.chemin vente_article_serveur / vente_copie_prouvee), le
-- plafond de 3 réarmements, le relevé « en ligne » après la clôture : inchangés. Jamais un titre.
-- CPU : la nouvelle branche ne se lit que pour un retrait Beebs « deleted » revu en ligne SANS fiche (rare) ; lecture
-- des ventes du compte par ventes_user_idx, bornée à ± 2 min. 20 retraits par appel (inchangé).
-- Corps repris de pg_get_functiondef EN PROD le 29/10 (md5 0756d52c09e79dedc45a66971a8ebf2c) ; un seul changement :
-- la condition « fiche vendue ».

BEGIN;

DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.retraits_beebs_rearmer_revus(uuid)'::regprocedure)) <> '0756d52c09e79dedc45a66971a8ebf2c' THEN
    RAISE EXCEPTION 'retraits_beebs_rearmer_revus a changé en prod depuis sa lecture du 29/10 : régénérer 20261029201000 depuis pg_get_functiondef';
  END IF;
END
$garde$;

CREATE OR REPLACE FUNCTION public.retraits_beebs_rearmer_revus(p_user uuid)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare d record; n integer := 0;
begin
  for d in
    select j.id, j.platform_fields as pf, a.id as annonce, a.vu_le, a.run_id
      from public.cross_post_jobs j
      join public.annonces_plateforme a
        on a.user_id = j.user_id and a.platform = 'beebs' and a.listing_id = btrim(j.platform_listing_id)
       and a.statut_plateforme = 'en_ligne' and a.disparu_le is null
     where j.user_id = p_user and j.platform = 'beebs' and j.action = 'delete' and j.status = 'deleted'
       and btrim(coalesce(j.platform_listing_id, '')) ~ '^\d+$'
       and j.platform_fields #>> '{arme_par,chemin}' in ('vente_article_serveur', 'vente_copie_prouvee')
       and coalesce((j.platform_fields -> 'delete_trace')::text, '') !~* 'confirmation (envoy|re[cç]u)'
       and coalesce((j.platform_fields #>> '{rearme_revu_en_ligne,n}')::int, 0) < 3
       and a.vu_le > greatest(j.created_at,
                              coalesce(public._ts_ou_null(j.platform_fields ->> 'processing_since'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{delete_preuve,lu_le}'), '-infinity'::timestamptz),
                              coalesce(public._ts_ou_null(j.platform_fields #>> '{rearme_revu_en_ligne,le}'), '-infinity'::timestamptz))
                     + interval '10 minutes'
       and not exists (select 1 from public.cross_post_jobs o
                        where o.user_id = j.user_id and o.platform = 'beebs' and o.action = 'delete'
                          and o.status in ('pending', 'processing', 'needs_user')
                          and btrim(coalesce(o.platform_listing_id, '')) = btrim(j.platform_listing_id))
       and exists (select 1 from public.cross_post_jobs dep
                    where (j.platform_fields #>> '{arme_par,depot}') ~ '^[0-9a-fA-F-]{36}$'
                      and dep.id = (j.platform_fields #>> '{arme_par,depot}')::uuid
                      and (exists (select 1 from public.inventaire i
                                    where i.id = dep.inventaire_id and i.user_id = dep.user_id and i.statut = 'vendu')
                           -- (29/10, lot B 4.9 B — Sébastien 48dd94f7, retrait cfed66ca, copie 34219819) FICHE SUPPRIMÉE :
                           -- inventaire_id NULL sur le dépôt, le retrait et la vente — la jointure sur la fiche ne
                           -- réarmait jamais ce retrait si Beebs publiait tard. La vente est alors prouvée par SA ligne
                           -- ventes : même compte, sans fiche elle non plus, autre plateforme que Beebs, pas annulée, née
                           -- à l'instant où elle a armé ce retrait (arme_par.le ± 2 min, la règle du 18/10 des remises en
                           -- vente) ; et aucune annulation de vente posée sur le dépôt (vente_annulee_remise). Jamais un titre.
                           or (dep.inventaire_id is null and j.inventaire_id is null and dep.user_id = j.user_id
                               and not (coalesce(dep.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise')
                               and public._ts_ou_null(j.platform_fields #>> '{arme_par,le}') is not null
                               and exists (select 1 from public.ventes v
                                            where v.user_id = j.user_id and v.inventaire_id is null
                                              and v.created_at between public._ts_ou_null(j.platform_fields #>> '{arme_par,le}') - interval '2 minutes'
                                                                   and public._ts_ou_null(j.platform_fields #>> '{arme_par,le}') + interval '2 minutes'
                                              and lower(coalesce(v.statut, '')) not in ('annule', 'annulé', 'annulée', 'cancelled', 'canceled')
                                              and lower(coalesce(nullif(v.plateforme_code, ''), nullif(v.plateforme, ''), '')) not in ('', 'beebs')))))
     limit 20
  loop
    update public.cross_post_jobs set
           status = 'pending',
           error = 'Revue en ligne sur Beebs après la clôture de son retrait : l''article est vendu, FillSell la retire.',
           platform_fields = (platform_fields - array['processing_since', 'next_action_after', 'delete_confirmed_by',
                                                      'delete_preuve', 'beebs_en_moderation'])
             || jsonb_build_object('rearme_revu_en_ligne', jsonb_build_object('le', now(), 'vu_le', d.vu_le,
                  'releve', d.run_id, 'n', coalesce((d.pf #>> '{rearme_revu_en_ligne,n}')::int, 0) + 1,
                  'trace_precedente', d.pf -> 'delete_trace'))
     where id = d.id and status = 'deleted';
    if found then
      update public.annonces_plateforme set retiree_le = null, retrait_job_id = null, updated_at = now()
       where id = d.annonce and retrait_job_id = d.id;
      n := n + 1;
    end if;
  end loop;
  return n;
end $function$
;

COMMIT;
