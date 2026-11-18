-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (18/11/2026, ordre de Nico, point 3A) UNE VENTE ANTÉRIEURE AU SUIVI N'EST JAMAIS ANNONCÉE — ni mail, ni push
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- ⛔ NON APPLIQUÉE. Feu vert NOMMÉ de Nico exigé. Essai : base JETABLE seulement
--   (npm run selftest:vente-avant-suivi-pg ; statique : npm run selftest:vente-avant-suivi).
-- Diagnostic (prod, lecture seule, 18/11 ; rapport .tmp-terminal/t2/p3/RAPPORT.md, à verser dans docs/enquetes/) :
--   30 jours de push_ventes : 10 mails, 10 comptes, 29 ventes ANTÉRIEURES au suivi annoncées (02/11 → 18/11).
--   · chemin « commande » (13 ventes, 4 comptes eBay neufs, dont 4e0a80fe 4e0a80fe : vente du 16/11 15:22, inscription
--     16/11 23:51, mail vente:13033 le 17/11 00:00:37) — push_trg_ventes('releve') ne borne que « vendu_le < 24 h » :
--     le PREMIER relevé d'un compte neuf lit tout son historique et les ventes des 24 dernières heures partaient en mail ;
--   · chemin « job » (16 ventes, 6 comptes) — push_trg_job ne borne que l'âge de la LECTURE de la preuve : un « Achat
--     en cours » Leboncoin déjà là au premier relevé (rattrapage lecture_fraiche_2410), ou le compteur « vendus: 1 »
--     d'eBay lu au premier contrôle d'une tâche importée (vente du 16/11, compte inscrit le 18/11).
--   Rien ne lisait l'inscription ni le premier relevé de la plateforme.
-- La règle : public.vente_avant_suivi (nouvelle, lecture seule, bornée : une ligne par table, index existants).
--   Début du suivi = le plus tard de l'inscription et du PREMIER relevé de la plateforme (vinted_sync_runs) — à défaut
--   la connexion eBay (eBay), sinon l'inscription ; jamais now(). Motifs : avant_suivi:date, avant_suivi:etat_initial,
--   avant_suivi:vente_relevee.
-- Branchée là où naissent TOUTES les notes de vente :
--   · push_noter (déclencheurs ventes / cross_post_jobs / inventaire / annonces_plateforme) ;
--   · push_noter_commande_vinted (commande Vinted en lot, vente_vinted_lot_eclater).
--   La note naît « ignoree » (motif avant_suivi:…, traite_le posé) : aucun appel à push-ventes, aucun mail, aucun push.
--   Une panne de la garde = le comportement d'avant (bloc d'exception).
-- Inchangés : la vente, ses retraits, push_trg_ventes, push_trg_job, push_ventes_a_envoyer, la rafale, push-ventes,
--   la cadence de republication, Stripe. Aucune donnée écrite, aucun cron.
-- Définitions de départ relues EN PROD le 18/11 (pg_get_functiondef, md5 du texte rendu, sans CR) :
--   push_noter(uuid,text,text,bigint,bigint,uuid,text,text,text,numeric,text,timestamp with time zone,boolean)
--                                                                                  31f8991857f493e5ec277eb399689679
--   push_noter_commande_vinted(uuid,text,bigint,jsonb,numeric,text,timestamp with time zone)
--                                                                                  2cf1bb10fe432f2b29a2677ec3b671cf
-- Appliquer (APRÈS le feu vert, et après avoir relu ces deux md5 en prod) :
--   npx supabase db query --linked -f supabase/migrations/20261118233000_vente_avant_suivi.sql
--   npx supabase migration repair --linked --status applied 20261118233000
-- Inverse : supabase/rollbacks/20261118233000_vente_avant_suivi_INVERSE.sql (prod mot pour mot).
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
set lock_timeout = '3s';

BEGIN;

CREATE OR REPLACE FUNCTION public.vente_avant_suivi(p_user uuid, p_pf text, p_vendu_le timestamp with time zone, p_job uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
-- (18/11/2026, ordre de Nico, point 3A) UNE VENTE ANTÉRIEURE AU SUIVI N'EST JAMAIS ANNONCÉE (ni mail, ni push).
-- Rend NULL (vente nouvelle, ou rien de prouvé) ou le motif qui la tient hors des annonces :
--   avant_suivi:date          — date de vente LUE (commande) antérieure au début du suivi ;
--   avant_suivi:etat_initial  — l'état vendu / « Achat en cours » était déjà là au PREMIER relevé de la plateforme
--                               (sale_evidence.rattrapage.premiere_lecture ≤ fin de ce relevé) ;
--   avant_suivi:vente_relevee — preuve de JOB sans numéro de commande à elle, dont l'annonce (numéro EXACT, jamais un
--                               titre) porte une vente relevée antérieure au début du suivi, et aucune depuis.
-- Début du suivi d'une plateforme pour un compte = le plus tard de : l'inscription ; le PREMIER relevé de cette
-- plateforme (vinted_sync_runs, toute sorte, démarré) — à défaut de relevé : la connexion eBay (eBay), sinon
-- l'inscription. Jamais now() : un compte sans relevé ne perd jamais ses mails.
-- Bornée : au plus une ligne lue par table (profiles par clé ; vinted_sync_runs par vinted_sync_runs_user_date
-- parcouru à l'envers, arrêt à la première ligne de la plateforme ; cross_post_jobs par clé ; ventes par
-- ventes_annonce_idx). Une note sans date ni job (origines vinted / annonce) ne lit rien.
-- Ne touche à rien : ni vente, ni retrait, ni note (lecture seule).
declare
  v_pf      text := public.plateforme_normalisee(p_pf);
  v_inscrit timestamptz;
  v_premier timestamptz;
  v_fin     timestamptz;
  v_debut   timestamptz;
  v_annonce text;
  v_pfj     jsonb;
  v_lu      timestamptz;
begin
  if p_user is null or v_pf is null then return null; end if;
  if p_vendu_le is null and p_job is null then return null; end if;
  select p.created_at into v_inscrit from public.profiles p where p.id = p_user;
  select r.started_at, coalesce(r.finished_at, r.updated_at, r.started_at)
    into v_premier, v_fin
    from public.vinted_sync_runs r
   where r.user_id = p_user and r.platform = v_pf and r.started_at is not null
   order by r.started_at asc
   limit 1;
  if v_premier is null and v_pf = 'ebay' then
    select e.connected_at into v_premier from public.ebay_accounts e where e.user_id = p_user and e.revoked_at is null;
  end if;
  v_debut := greatest(v_inscrit, coalesce(v_premier, v_inscrit));
  if v_debut is null then return null; end if;

  -- 1. Une date de vente lue (commande) : elle seule décide.
  if p_vendu_le is not null then
    if p_vendu_le < v_debut then return 'avant_suivi:date'; end if;
    return null;
  end if;

  select nullif(btrim(coalesce(j.platform_listing_id, '')), ''), coalesce(j.platform_fields, '{}'::jsonb)
    into v_annonce, v_pfj
    from public.cross_post_jobs j
   where j.id = p_job and j.user_id = p_user;
  if not found then return null; end if;

  -- 2. L'état était déjà là quand FillSell a regardé cette plateforme pour la première fois.
  v_lu := public._ts_ou_null(v_pfj #>> '{sale_evidence,rattrapage,premiere_lecture}');
  if v_lu is not null and v_fin is not null and v_lu <= v_fin then return 'avant_suivi:etat_initial'; end if;

  -- 3. Une preuve sans commande à elle (compteur « vendus » d'eBay, annonce close) : la vente de CETTE annonce que
  -- le relevé connaît est antérieure au suivi, et aucune depuis. Une vraie vente nouvelle de la même annonce (2e
  -- exemplaire) porte sa commande : elle passe ici, ou par le relevé des commandes (push_trg_ventes) si elle n'est
  -- pas encore relevée — jamais une vente sans mail.
  if v_annonce is not null
     and nullif(btrim(coalesce(v_pfj #>> '{sale_evidence,order_id}', '')), '') is null
     and nullif(btrim(coalesce(v_pfj #>> '{vente_commande_ebay,commande}', '')), '') is null
     and exists (select 1 from public.ventes v
                  where v.user_id = p_user and v.plateforme_code = v_pf and v.annonce_id = v_annonce
                    and v.source = 'releve' and v.vendu_le < v_debut)
     and not exists (select 1 from public.ventes w
                      where w.user_id = p_user and w.plateforme_code = v_pf and w.annonce_id = v_annonce
                        and w.vendu_le >= v_debut) then
    return 'avant_suivi:vente_relevee';
  end if;
  return null;
end;
$function$
;
REVOKE ALL ON FUNCTION public.vente_avant_suivi(uuid, text, timestamp with time zone, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.vente_avant_suivi(uuid, text, timestamp with time zone, uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.push_noter(p_user uuid, p_origine text, p_pf text, p_vente bigint DEFAULT NULL::bigint, p_inv bigint DEFAULT NULL::bigint, p_job uuid DEFAULT NULL::uuid, p_commande text DEFAULT NULL::text, p_annonce text DEFAULT NULL::text, p_titre text DEFAULT NULL::text, p_prix numeric DEFAULT NULL::numeric, p_devise text DEFAULT NULL::text, p_vendu_le timestamp with time zone DEFAULT NULL::timestamp with time zone, p_declaree boolean DEFAULT false)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_cles text[] := '{}';
  v_q    integer;
  v_pf   text := nullif(btrim(coalesce(p_pf, '')), '');
  v_preuve text := nullif(btrim(coalesce(current_setting('fillsell.push_preuve', true), '')), '');
  v_motif  text;
begin
  -- (06/10 soir) La preuve posée par le déclencheur ne vaut que pour CET appel.
  if v_preuve is not null then perform set_config('fillsell.push_preuve', '', true); end if;
  -- Point d'essai : la preuve « un échec d'envoi ne bloque pas la vente ».
  if coalesce(current_setting('fillsell.push_essai_panne', true), '') = '1' then
    raise exception 'panne simulée (essai)';
  end if;
  if p_user is null then return; end if;
  -- (06/10) Plus de sortie « sans téléphone » : la note porte aussi le mail.

  if p_commande is not null and v_pf is not null then
    v_cles := v_cles || ('commande:' || v_pf || ':' || p_commande);
  end if;
  if p_annonce is not null and v_pf is not null then
    v_cles := v_cles || ('annonce:' || v_pf || ':' || p_annonce);
  end if;
  if p_job is not null then
    v_cles := v_cles || ('job:' || p_job::text);
  end if;
  -- La fiche n'identifie la vente que pour un article à pièce unique : deux
  -- ventes d'une fiche en plusieurs exemplaires sont deux ventes.
  if p_inv is not null then
    select coalesce(i.quantite, 1) into v_q from public.inventaire i where i.id = p_inv;
    if coalesce(v_q, 1) <= 1 or p_declaree then
      v_cles := v_cles || ('fiche:' || p_inv::text);
    end if;
  end if;

  -- (11/10, Louis) Une annonce vendue ne se signale qu'une fois : vente déjà
  -- enregistrée, ou même annonce / même commande déjà annoncée → la note naît
  -- « doublon » (ni push, ni mail, ni ligne « à confirmer »).
  if not p_declaree then
    v_motif := public.push_vente_deja_signalee(p_user, v_pf, v_cles, now(), null, false);
    -- (18/11/2026, ordre de Nico, point 3A) Une vente ANTÉRIEURE au début du suivi de sa plateforme (inscription,
    -- premier relevé) est notée — c'est la trace — mais jamais annoncée : ni mail, ni push (statut « ignoree »,
    -- motif avant_suivi:…). Une panne de la garde rend le comportement d'avant : jamais une vraie vente sans mail.
    if v_motif is null then
      begin
        v_motif := public.vente_avant_suivi(p_user, v_pf, p_vendu_le, p_job);
      exception when others then
        v_motif := null;
      end;
    end if;
  end if;

  insert into public.push_ventes (
    user_id, origine, plateforme, vente_id, inventaire_id, job_id, commande_ref, annonce_id,
    titre, prix, devise, vendu_le, cles, statut, motif, traite_le, lot, preuve_recente
  ) values (
    p_user, case when p_declaree then 'declaree' else p_origine end, v_pf, p_vente, p_inv, p_job,
    p_commande, p_annonce, left(p_titre, 200), p_prix, p_devise, p_vendu_le, v_cles,
    case when p_declaree then 'declaree' when v_motif like 'avant_suivi:%' then 'ignoree'
         when v_motif is not null then 'doublon' else 'a_envoyer' end,
    v_motif, case when v_motif is not null then now() end,
    pg_current_xact_id()::text::bigint,
    case when p_declaree then null else left(v_preuve, 120) end
  );

  -- Un seul appel par transaction ; pg_net ne part qu'après la validation.
  if not p_declaree and v_motif is null and coalesce(current_setting('fillsell.push_relance', true), '') <> '1' then
    perform set_config('fillsell.push_relance', '1', true);
    perform net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
      headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
      body    := '{"trigger":"push_noter"}'::jsonb,
      timeout_milliseconds := 60000
    );
  end if;
end;
$function$
;

CREATE OR REPLACE FUNCTION public.push_noter_commande_vinted(p_user uuid, p_ref text, p_vente bigint, p_articles jsonb, p_total numeric, p_devise text, p_vendu_le timestamp with time zone)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_xact   bigint := pg_current_xact_id()::text::bigint;
  v_n      integer;
  v_cles   text[] := ARRAY[]::text[];
  a        jsonb;
  v_ka     text[];
  v_motif  text;
  v_statut text;
  v_titre  text;
  v_id     bigint;
BEGIN
  IF p_user IS NULL OR p_ref IS NULL OR jsonb_typeof(p_articles) IS DISTINCT FROM 'array' THEN RETURN NULL; END IF;
  v_n := jsonb_array_length(p_articles);
  IF v_n = 0 THEN RETURN NULL; END IF;
  -- Aucun article suivi par FillSell : pas de mail (la vente et la question restent).
  IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements(p_articles) x WHERE (x ->> 'inventaire_id') IS NOT NULL) THEN RETURN NULL; END IF;
  -- Une note de CETTE commande existe déjà : jamais deux.
  IF EXISTS (SELECT 1 FROM push_ventes o WHERE o.user_id = p_user AND o.statut <> 'ignoree'
              AND o.cles @> ARRAY['commande:vinted:' || p_ref]) THEN
    RETURN NULL;
  END IF;
  -- Ne décident que les articles NEUFS : vendus par CETTE commande (jamais une vente
  -- adoptée, déjà enregistrée) et jamais annoncés avant (leur annonce).
  FOR a IN SELECT value FROM jsonb_array_elements(p_articles) LOOP
    CONTINUE WHEN coalesce(a ->> 'decision', '') IN ('adoptee', 'supprimee_par_la_personne');
    v_ka := ARRAY(SELECT jsonb_array_elements_text(CASE WHEN jsonb_typeof(a -> 'cles') = 'array' THEN a -> 'cles' ELSE '[]'::jsonb END));
    IF cardinality(v_ka) > 0 AND NOT EXISTS (
         SELECT 1 FROM push_ventes o
          WHERE o.user_id = p_user AND o.lot IS DISTINCT FROM v_xact
            AND (o.part_le IS NOT NULL OR o.statut IN ('envoyee', 'en_envoi', 'declaree'))
            AND o.cles && ARRAY(SELECT k FROM unnest(v_ka) k WHERE k LIKE 'annonce:%')) THEN
      v_cles := v_cles || v_ka;
    END IF;
  END LOOP;
  -- Tout était déjà annoncé article par article : rien de neuf à dire.
  IF NOT EXISTS (SELECT 1 FROM unnest(v_cles) k WHERE k LIKE 'annonce:vinted:%') THEN RETURN NULL; END IF;
  v_cles := ARRAY(SELECT DISTINCT k FROM unnest(v_cles || ('commande:vinted:' || p_ref)) AS k);
  v_titre := CASE WHEN v_n = 1 THEN coalesce(p_articles -> 0 ->> 'titre', 'Article Vinted')
                  ELSE 'Commande Vinted : ' || v_n || ' articles' END;
  v_motif := push_vente_deja_signalee(p_user, 'vinted', v_cles, now(), NULL, false);
  -- (18/11/2026, ordre de Nico, point 3A) Une commande ANTÉRIEURE au début du suivi : notée, jamais annoncée.
  IF v_motif IS NULL THEN
    BEGIN
      v_motif := vente_avant_suivi(p_user, 'vinted', p_vendu_le, NULL);
    EXCEPTION WHEN others THEN
      v_motif := NULL;
    END;
  END IF;
  v_statut := CASE WHEN v_motif IS NULL THEN 'a_envoyer' WHEN v_motif LIKE 'avant_suivi:%' THEN 'ignoree' ELSE 'doublon' END;
  INSERT INTO push_ventes (user_id, origine, plateforme, vente_id, inventaire_id, job_id, commande_ref, annonce_id, titre,
                           prix, devise, vendu_le, cles, statut, motif, traite_le, lot, preuve_recente, articles)
  VALUES (p_user, 'commande', 'vinted', p_vente,
          CASE WHEN v_n = 1 THEN nullif(p_articles -> 0 ->> 'inventaire_id', '')::bigint END, NULL, p_ref,
          CASE WHEN v_n = 1 THEN p_articles -> 0 ->> 'item_id' END,
          left(v_titre, 200), CASE WHEN p_total > 0 THEN p_total END, p_devise, p_vendu_le, v_cles, v_statut, v_motif,
          CASE WHEN v_motif IS NOT NULL THEN now() END, v_xact,
          left('commande:' || coalesce(to_char(p_vendu_le AT TIME ZONE 'Europe/Paris', 'YYYY-MM-DD"T"HH24:MI'), '?'), 120),
          (SELECT jsonb_agg(jsonb_build_object('titre', x ->> 'titre', 'prix', x -> 'prix',
                                               'inventaire_id', x -> 'inventaire_id', 'connu', (x ->> 'inventaire_id') IS NOT NULL)
                            ORDER BY o)
             FROM jsonb_array_elements(p_articles) WITH ORDINALITY AS t(x, o)))
  RETURNING id INTO v_id;
  -- Un seul appel par transaction ; pg_net ne part qu'après la validation.
  IF v_statut = 'a_envoyer' AND coalesce(current_setting('fillsell.push_relance', true), '') <> '1' THEN
    PERFORM set_config('fillsell.push_relance', '1', true);
    PERFORM net.http_post(
      url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
      headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
      body    := '{"trigger":"push_noter_commande_vinted"}'::jsonb,
      timeout_milliseconds := 60000
    );
  END IF;
  RETURN v_id;
END;
$function$
;

COMMIT;
