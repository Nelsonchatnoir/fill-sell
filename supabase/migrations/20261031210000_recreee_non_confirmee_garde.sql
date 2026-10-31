-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261031210000 — UNE REMISE EN LIGNE « RECRÉÉE » PAS ENCORE REVUE EN LIGNE : RIEN NE TRAITE L'ARTICLE (72 H AU PLUS)
-- (31/10, lot I point 6 — Johan / tiblancdeshaut, 29/10)
-- Le cas : republications Leboncoin 7ff873c5 (jean Lee) et 098cab75 (casquette Georgia), passées « published » à l'étape
-- « recreated » les 26 et 27/10, nouvelles annonces 3296005486 et 3296315778 écrites par le dépôt lui-même
-- (annonces_plateforme.source_rapprochement = 'job', run_id NULL) et JAMAIS revues par un relevé. constater_absences_releve
-- les a datées disparues (29/10 17:43 et 19:51) et cross_post_jobs_alerte_tenue a posé « Vendue ? » sur les NOUVELLES
-- annonces — levé par handler-watch le 30/10. La garde « republication engagée » (20261022200000 puis 20261031150000) ne
-- couvre que les statuts non terminés (pending, processing, needs_user) : une republication « published » à l'étape
-- « recreated » était hors garde ; et la règle « jamais vue en ligne = jamais Vendue ? » (20261020220000,
-- cross_post_jobs_vue_ou_pas_encore_visible) ne vise que les DÉPÔTS (publish).
-- La règle : republication_recreee_non_confirmee — action republish, statut published, étape recreated, publiée depuis
-- moins de 72 h, ni vue par la veille (vu_en_ligne_le) ni par un relevé de son compte (ligne annonces_plateforme avec
-- run_id, en ligne ou vendue, vue après la recréation) ; cherchée par fiche, par numéro ou par job. Ajoutée aux trois
-- gardes : constater_absences_releve (relevés), cross_post_jobs_alerte_tenue (« Vendue ? », y compris sur le job
-- lui-même) et inventaire_disparu_garde_republication (dressing Vinted). Au-delà de 72 h sans être revue, tout reprend
-- comme avant (aucun article gelé). Coût mesuré (SELECT équivalent, XEWER, 1 095 jobs publiés) : 7 ms, index
-- cross_post_jobs_user_status.
-- Fonctions réécrites depuis pg_get_functiondef relu en production le 31/10 (md5 constater db3ae937e360, alerte_tenue
-- 3f3c294391c3, garde bbd1f4417a67). Aucune donnée réécrite. Inverse :
-- supabase/rollbacks/20261031210000_recreee_non_confirmee_garde_INVERSE.sql
-- Application (feu vert NOMMÉ de Nico) : npx supabase db query --linked -f <ce fichier>
--   puis npx supabase migration repair --linked --status applied 20261031210000
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.republication_recreee_non_confirmee(p_user uuid, p_platform text, p_fiche bigint, p_numero text, p_job uuid)
 returns uuid
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  select j.id from public.cross_post_jobs j
   where j.user_id = p_user and j.platform = p_platform
     and j.action = 'republish' and j.status = 'published'
     and coalesce(j.platform_fields ->> 'republish_step', '') = 'recreated'
     and j.vu_en_ligne_le is null
     and coalesce(j.published_at, j.created_at) > now() - interval '72 hours'
     and ((p_fiche is not null and j.inventaire_id = p_fiche)
          or (p_job is not null and j.id = p_job)
          or (nullif(btrim(p_numero), '') is not null
              and btrim(p_numero) in (nullif(btrim(j.platform_listing_id), ''),
                                      nullif(btrim(j.platform_fields ->> 'new_platform_listing_id'), ''),
                                      nullif(btrim(j.platform_fields ->> 'new_vinted_item_id'), ''),
                                      public.annonce_id_de_job(j.platform_listing_id, j.listing_url))))
     -- Revue en ligne par un relevé de son compte APRÈS la recréation (jamais la ligne que le dépôt écrit lui-même).
     and not exists (select 1 from public.annonces_plateforme a
                      where a.user_id = j.user_id and a.platform = j.platform and a.run_id is not null
                        and a.statut_plateforme in ('en_ligne', 'vendue')
                        and a.vu_le >= coalesce(j.published_at, j.created_at) - interval '5 minutes'
                        and (a.job_id = j.id or a.listing_id = public.annonce_id_de_job(j.platform_listing_id, j.listing_url)))
   order by j.created_at desc
   limit 1
$function$;
revoke all on function public.republication_recreee_non_confirmee(uuid, text, bigint, text, uuid) from public, anon, authenticated;
grant execute on function public.republication_recreee_non_confirmee(uuid, text, bigint, text, uuid) to service_role;

CREATE OR REPLACE FUNCTION public.constater_absences_releve(p_run uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE r vinted_sync_runs%ROWTYPE; precedent vinted_sync_runs%ROWTYPE;
 a record; n integer:=0; debut timestamptz:=clock_timestamp();
BEGIN
 IF NOT releve_preuve_absence(p_run) THEN RETURN jsonb_build_object('disparues',0,'motif','releve_non_probant'); END IF;
 SELECT * INTO r FROM vinted_sync_runs WHERE id=p_run;
 IF r.platform='beebs' THEN RETURN jsonb_build_object('disparues',0,'motif','moderation_beebs'); END IF;
 -- Deux cycles distincts, sans recouvrement, lus pour le même compte.
 SELECT s.* INTO precedent FROM
   (SELECT * FROM vinted_sync_runs WHERE user_id=r.user_id AND started_at<r.started_at
    ORDER BY started_at DESC LIMIT 50) s
 WHERE s.platform=r.platform AND s.kind=r.kind
   AND s.vinted_user_id IS NOT DISTINCT FROM r.vinted_user_id
   AND s.finished_at<=r.started_at AND s.started_at<=r.started_at-interval '5 minutes'
   AND releve_preuve_absence(s.id)
 ORDER BY s.started_at DESC LIMIT 1;
 IF precedent.id IS NULL THEN RETURN jsonb_build_object('disparues',0,'motif','second_releve_attendu'); END IF;
 FOR a IN
   SELECT ap.id,ap.listing_id,ap.inventaire_id,ap.vu_le FROM annonces_plateforme ap
   WHERE ap.user_id=r.user_id AND ap.platform=r.platform
     AND ap.run_id IS DISTINCT FROM r.id AND ap.run_id IS DISTINCT FROM precedent.id
     AND ap.vu_le<precedent.started_at
     AND NOT EXISTS (SELECT 1 FROM cross_post_jobs recent WHERE recent.user_id=r.user_id
       AND recent.inventaire_id=ap.inventaire_id AND recent.platform=r.platform
       AND recent.action IN ('publish','republish') AND recent.status='published'
       AND COALESCE(recent.published_at,recent.created_at)>precedent.started_at-interval '4 hours'
       AND listing_designe(ap.listing_id,recent.listing_url,recent.platform_listing_id))
     AND NOT EXISTS (SELECT 1 FROM rapprochements q WHERE q.annonce_id=ap.id
       AND q.detail->>'absence_confirmee_revision'='20260928'
       AND (q.detail->>'derniere_vue')::timestamptz>=ap.vu_le)
     -- (22/10 soir, point 5) Un article en cours de republication n'est jamais compté disparu.
     AND public.republication_engagee(r.user_id, ap.inventaire_id, r.platform) IS NULL
     -- (31/10, décision 7a de Nico) …ni une annonce VISÉE par une republication engagée, quelle que soit sa fiche.
     AND public.republication_engagee_numero(r.user_id, r.platform, ap.listing_id) IS NULL
     -- (31/10, lot I point 6) …ni pendant qu'une remise en ligne « recréée » n'a pas encore été revue en ligne (72 h au plus).
     AND public.republication_recreee_non_confirmee(r.user_id, r.platform, ap.inventaire_id, ap.listing_id, ap.job_id) IS NULL
   ORDER BY ap.vu_le DESC,ap.id LIMIT 25 FOR UPDATE OF ap SKIP LOCKED
 LOOP
   EXIT WHEN clock_timestamp()-debut>interval '1 second';
   UPDATE annonces_plateforme SET disparu_le=COALESCE(disparu_le,r.finished_at),updated_at=now() WHERE id=a.id;
   -- Le signal existant ouvre la question de l'app. Ce n'est ni une vente,
   -- ni une annulation du dépôt historique, ni un retrait sur une plateforme.
   UPDATE cross_post_jobs j SET platform_fields=COALESCE(j.platform_fields,'{}'::jsonb)
     || jsonb_build_object('sale_signal','unavailable','unavailable_since',r.finished_at,
          'absence_releves',jsonb_build_object('premier',precedent.id,'second',r.id,'listing_id',a.listing_id,'le',now()))
   WHERE j.inventaire_id=a.inventaire_id AND j.user_id=r.user_id AND j.platform=r.platform
     AND j.status='published' AND j.action IN ('publish','republish')
     AND j.platform_fields->>'sale_signal' IS DISTINCT FROM 'sold'
     AND listing_designe(a.listing_id,j.listing_url,j.platform_listing_id);
   INSERT INTO rapprochements(user_id,annonce_id,inventaire_id,decision,par,score,detail)
   VALUES(r.user_id,a.id,a.inventaire_id,'aucune','auto',0,
     jsonb_build_object('absence_confirmee_revision','20260928','derniere_vue',a.vu_le,'premier',precedent.id,'second',r.id));
   n:=n+1;
 END LOOP;
 RETURN jsonb_build_object('disparues',n,'premier',precedent.id,'second',r.id);
END;
$function$;

CREATE OR REPLACE FUNCTION public.cross_post_jobs_alerte_tenue()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_constat boolean;
  v_rep uuid;
  v_suiv record;
  v_jum record;
  v_retire text[] := array['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'];
  v_nom text;
begin
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  if not (coalesce(new.platform_fields, '{}'::jsonb) ? 'unavailable_since')
     or coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since'
     or coalesce(new.platform_fields ->> 'sale_signal', 'unavailable') <> 'unavailable'
     or new.status is distinct from 'published'
     or coalesce(new.action, 'publish') not in ('publish', 'republish')
     or new.inventaire_id is null then
    return new;
  end if;
  v_nom := case new.platform when 'leboncoin' then 'Leboncoin' when 'beebs' then 'Beebs' when 'ebay' then 'eBay'
                             when 'depop' then 'Depop' when 'vinted' then 'Vinted' when 'opla' then 'Opla' else new.platform end;
  -- Le constat de deux relevés complets (constater_absences_releve) pose absence_releves dans la même écriture.
  v_constat := new.platform_fields ? 'absence_releves'
               and (new.platform_fields -> 'absence_releves') is distinct from (coalesce(old.platform_fields, '{}'::jsonb) -> 'absence_releves');

  -- (1) En cours de republication.
  -- (31/10, décision 7a de Nico) …par sa fiche, ou par le NUMÉRO de l'annonce (rattachée à une autre fiche).
  v_rep := coalesce(public.republication_engagee(new.user_id, new.inventaire_id, new.platform),
                    public.republication_engagee_numero(new.user_id, new.platform, public.annonce_id_de_job(new.platform_listing_id, new.listing_url)));
  if v_rep is not null and v_rep <> new.id then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('alerte_ecartee', jsonb_build_object('le', now(), 'motif', 'republication_en_cours',
           'republication', v_rep, 'constat', v_constat));
    return new;
  end if;

  -- (1 bis) (31/10, lot I point 6 — Johan, 29/10) Une remise en ligne « recréée » pas encore revue en ligne par un relevé
  -- (72 h au plus) : ni sa NOUVELLE annonce (ce job lui-même), ni une autre annonce de la fiche ne reçoit « Vendue ? ».
  v_rep := public.republication_recreee_non_confirmee(new.user_id, new.platform, new.inventaire_id,
             public.annonce_id_de_job(new.platform_listing_id, new.listing_url), new.id);
  if v_rep is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('alerte_ecartee', jsonb_build_object('le', now(), 'motif', 'recreation_non_confirmee',
           'republication', v_rep, 'constat', v_constat));
    return new;
  end if;

  -- (1b) Remplacé par sa propre republication.
  select r.id, btrim(r.platform_listing_id) as annonce into v_suiv
    from public.cross_post_jobs r
   where r.user_id = new.user_id and r.inventaire_id = new.inventaire_id and r.platform = new.platform
     and r.action = 'republish' and r.status = 'published' and r.id <> new.id
     and r.platform_fields ->> 'republish_source_job_id' = new.id::text
     and nullif(btrim(coalesce(r.platform_listing_id, '')), '') is not null
     and btrim(r.platform_listing_id) is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
   order by r.created_at desc limit 1;
  if v_suiv.id is not null then
    new.platform_fields := (new.platform_fields - v_retire - 'absence_releves')
      || jsonb_build_object('republished_pending', true,
           'remplacee_par_republication', jsonb_build_object('le', now(), 'job', v_suiv.id, 'annonce', v_suiv.annonce));
    new.status := 'cancelled';
    new.error := 'Annonce remplacée par sa republication (nouvelle annonce ' || v_suiv.annonce || ') — ce n''est pas une vente.';
    return new;
  end if;

  -- (3) Boutique partagée : la fiche jumelle du compte relié est en ligne sur cette plateforme.
  if new.platform <> 'vinted' then
    select o.listing_id, o.compte into v_jum
      from public.jumelle_occupe_plateformes(new.user_id, new.inventaire_id) o
     where o.platform = new.platform and o.statut in ('en_ligne', 'en_verification', 'published')
       and o.listing_id is distinct from nullif(btrim(coalesce(new.platform_listing_id, '')), '')
     limit 1;
    if v_jum.listing_id is not null then
      if v_constat then
        new.platform_fields := (new.platform_fields - v_retire)
          || jsonb_build_object('copie_remplacee_par_compte_relie', jsonb_build_object('le', now(),
               'annonce', v_jum.listing_id, 'compte', v_jum.compte));
        new.status := 'cancelled';
        new.error := 'Cette annonce ' || v_nom || ' n''est plus en ligne ; ton article reste en vente sur ' || v_nom
          || ' sous l''annonce ' || v_jum.listing_id || ' de ton compte FillSell relié (même boutique). Rien à refaire.';
      else
        new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
          || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
               'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'jumelle_en_ligne',
                 'annonce', v_jum.listing_id));
      end if;
      return new;
    end if;
  end if;

  -- (2) Alerte de la veille déjà démentie par un relevé sur cette annonce.
  if not v_constat and new.platform <> 'vinted'
     and coalesce(old.platform_fields, '{}'::jsonb) ? 'revue_en_ligne_par_releve' then
    new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'detected_price'])
      || jsonb_build_object('unavailable_pending_since', new.platform_fields ->> 'unavailable_since',
           'alerte_a_confirmer_par_releve', jsonb_build_object('le', now(), 'motif', 'dementie_par_releve',
             'dementie_le', old.platform_fields #>> '{revue_en_ligne_par_releve,at}'));
    return new;
  end if;
  return new;
exception when others then
  raise warning 'cross_post_jobs_alerte_tenue : job % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $function$;

CREATE OR REPLACE FUNCTION public.inventaire_disparu_garde_republication()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare v_rep uuid;
begin
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  if new.disparu_le is null or old.disparu_le is not null then return new; end if;
  -- (31/10, décision 7a de Nico) …par la fiche, ou par le NUMÉRO Vinted de la fiche (visé depuis une autre fiche).
  v_rep := coalesce(public.republication_engagee(new.user_id, new.id, 'vinted'),
                    public.republication_engagee_numero(new.user_id, 'vinted', new.vinted_item_id::text));
  -- (31/10, lot I point 6) …ni pendant qu'une remise en ligne Vinted « recréée » n'a pas encore été revue en ligne (72 h au plus).
  v_rep := coalesce(v_rep, public.republication_recreee_non_confirmee(new.user_id, 'vinted', new.id, new.vinted_item_id::text, null));
  if v_rep is not null then
    raise log 'inventaire_disparu_garde_republication : fiche % — republication Vinted % en cours, disparition non datée', new.id, v_rep;
    new.disparu_le := null;
  end if;
  return new;
exception when others then
  raise warning 'inventaire_disparu_garde_republication : fiche % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $function$;

commit;
