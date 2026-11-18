-- INVERSE de supabase/migrations/20261118233000_vente_avant_suivi.sql (18/11/2026, point 3A).
-- push_noter et push_noter_commande_vinted : définitions de PROD relues le 18/11 (pg_get_functiondef), mot pour mot
-- (md5 31f8991857f493e5ec277eb399689679 et 2cf1bb10fe432f2b29a2677ec3b671cf) ; vente_avant_suivi retirée.
-- Les notes déjà nées « ignoree » (motif avant_suivi:…) restent telles quelles : elles ne repartent pas.
set lock_timeout = '3s';

BEGIN;

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
  end if;

  insert into public.push_ventes (
    user_id, origine, plateforme, vente_id, inventaire_id, job_id, commande_ref, annonce_id,
    titre, prix, devise, vendu_le, cles, statut, motif, traite_le, lot, preuve_recente
  ) values (
    p_user, case when p_declaree then 'declaree' else p_origine end, v_pf, p_vente, p_inv, p_job,
    p_commande, p_annonce, left(p_titre, 200), p_prix, p_devise, p_vendu_le, v_cles,
    case when p_declaree then 'declaree' when v_motif is not null then 'doublon' else 'a_envoyer' end,
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
  v_statut := CASE WHEN v_motif IS NULL THEN 'a_envoyer' ELSE 'doublon' END;
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

DROP FUNCTION IF EXISTS public.vente_avant_suivi(uuid, text, timestamp with time zone, uuid);

COMMIT;
