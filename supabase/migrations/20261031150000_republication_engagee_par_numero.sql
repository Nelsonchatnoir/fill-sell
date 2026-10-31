-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261031150000 — UNE ANNONCE VISÉE PAR UNE REPUBLICATION ENGAGÉE N'EST JAMAIS DATÉE DISPARUE, QUELLE QUE SOIT SA FICHE
-- (31/10, décision 7a de Nico : « Tant qu'une republication est engagée, à TOUTES ses étapes (captured comprise),
-- l'ancienne annonce ne doit jamais être datée disparue ni marquée hors ligne par un relevé. »)
-- Ce qui existait (migration 20261022200000, en production depuis le 22/10) : republication_engagee (captured,
-- deleted, retrait engagé) gardait les trois chemins de relevé — mais cherchée par FICHE seulement. Le trou (audit du
-- 31/10, docs/enquetes/cloture-fh-3110/RAPPORT.md § 7) : une annonce visée rattachée à une AUTRE fiche (fiche en double
-- créée par le moteur, défusion) ou à aucune n'était pas protégée. Aucun cas dans le parc le 31/10 (395 republications
-- engagées hors Vinted : annonce visée toujours sur la même fiche) : le trou est fermé avant d'avoir servi.
-- Le correctif : la même garde, cherchée aussi par le NUMÉRO de l'annonce visée (republication_engagee_numero), dans
-- constater_absences_releve, cross_post_jobs_alerte_tenue et inventaire_disparu_garde_republication.
-- Fonctions réécrites depuis pg_get_functiondef relu en production le 31/10 ; inverse :
-- supabase/rollbacks/20261031150000_republication_engagee_par_numero_INVERSE.sql. Aucune donnée réécrite.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════
begin;

create or replace function public.republication_engagee_numero(p_user uuid, p_platform text, p_numero text)
 returns uuid
 language sql
 stable security definer
 set search_path to 'public', 'pg_temp'
as $function$
  -- La republication ENGAGÉE (mêmes étapes que republication_engagee : captured, deleted, ou retrait engagé ; statut
  -- non terminal) dont l'annonce VISÉE porte ce numéro, sur cette plateforme — quelle que soit la fiche à laquelle
  -- l'annonce est rattachée. Le numéro visé : la colonne, l'ancien numéro, l'instantané, le numéro Vinted, le lien.
  select j.id from public.cross_post_jobs j
   where nullif(btrim(p_numero), '') is not null and j.user_id = p_user and j.platform = p_platform
     and j.action = 'republish' and j.status in ('pending', 'processing', 'needs_user')
     and (coalesce(j.platform_fields ->> 'republish_step', '') in ('captured', 'deleted')
          or public.republication_retrait_engage(j.platform_fields))
     and btrim(p_numero) in (nullif(btrim(j.platform_listing_id), ''),
                             nullif(btrim(j.platform_fields ->> 'old_platform_listing_id'), ''),
                             nullif(btrim(j.platform_fields #>> '{republish_snapshot,platform_listing_id}'), ''),
                             nullif(btrim(j.platform_fields ->> 'vinted_item_id'), ''),
                             public.annonce_id_de_job(j.platform_listing_id, j.listing_url))
   order by j.created_at desc
   limit 1
$function$;

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
  if v_rep is not null then
    raise log 'inventaire_disparu_garde_republication : fiche % — republication Vinted % en cours, disparition non datée', new.id, v_rep;
    new.disparu_le := null;
  end if;
  return new;
exception when others then
  raise warning 'inventaire_disparu_garde_republication : fiche % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $function$;

revoke all on function public.republication_engagee_numero(uuid, text, text) from public, anon, authenticated;

commit;
