-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC — migration 20261017141000_dressing_garde_commande_annulee
-- Rien n'est écrit : ROLLBACK final (aucune fiche, aucun job, aucun mail).
-- ═══════════════════════════════════════════════════════════════════════════
-- Déroulé, dans UNE transaction. Les écritures « client » se font sous le rôle
-- authenticated, avec les claims de Nico — comme la synchro du dressing :
--   A. AVANT  — la définition de prod est celle lue le 17/10 à 14:05 (md5) ; le
--               déclencheur est noté ; compteurs email_logs et push_ventes du compte
--               de Nico ; données d'essai sur le compte de Nico SEULEMENT (fiches
--               « [ESSAI 17/10] » à 999 €, en stock, annonces Vinted fictives
--               90171014 1x « sold » la veille) ; le défaut REJOUÉ avec la garde du
--               11/10 : une fiche rendue au stock pour commande annulée repasse
--               « vendu » au dressing, sans vente ;
--   B. LA MIGRATION — son contenu exact (garde md5 + définition) ;
--   C. APRÈS  — C1 annulée, jamais revue en ligne → gardée en stock (statut,
--               quantité, état d'annonce) ; C2 annulée puis revue EN LIGNE après
--               l'annulation → « vendu » permis ; C3 job vivant → règle du 11/10
--               inchangée (fiche en stock, signal sur le job) ; C4 fiche sans
--               annulation → « vendu » direct inchangé ; C5 vente écrite → le statut
--               suit ; C6 écriture du serveur → jamais retenue ; C7 la définition
--               nouvelle est en place ; C8 le déclencheur (WHEN) n'a pas bougé ;
--               C9 email_logs et push_ventes inchangés.
-- Lancement (par le coordinateur) :
--   npx supabase db query --linked -f scripts/essais/20261017141000_essai.sql
-- Lecture : la dernière requête rend une ligne par contrôle (cas, attendu, obtenu,
-- ok) ; tout doit être ok = true.
-- La partie B est identique, octet pour octet, au corps de la migration (contrôlé par
-- scripts/dressing-garde-commande-annulee-selftest.mjs).

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';

CREATE TEMP TABLE _res (ordre serial, cas text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;
CREATE TEMP TABLE _avant (cle text PRIMARY KEY, valeur text) ON COMMIT DROP;

-- ═══ A. AVANT LA MIGRATION ═══════════════════════════════════════════════════

-- A1. La prod est celle lue le 17/10 à 14:05 (sinon l'essai ne prouve rien).
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A1 avant : définition de prod inventaire_vendu_vinted_par_la_vente (md5)', 'a63b6f1128757a0b767dd2852a094f57',
       md5(pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)),
       md5(pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)) = 'a63b6f1128757a0b767dd2852a094f57';

-- A2. Le déclencheur et les compteurs du compte de Nico, relus en C8 et C9.
INSERT INTO _avant (cle, valeur)
SELECT 'declencheur', pg_get_triggerdef(t.oid) FROM pg_trigger t
 WHERE t.tgrelid = 'public.inventaire'::regclass AND t.tgname = 'inventaire_0_vendu_vinted_par_la_vente';
INSERT INTO _avant (cle, valeur)
SELECT 'mails', count(*)::text FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
INSERT INTO _avant (cle, valeur)
SELECT 'notes', count(*)::text FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A2 avant : le déclencheur de la garde existe (stock → vendu, « sold », client)', '1 déclencheur',
       count(*) || ' déclencheur', count(*) = 1
FROM _avant WHERE cle = 'declencheur' AND valeur LIKE '%BEFORE UPDATE OF statut ON public.inventaire%';

-- A3. Données d'essai, compte de Nico : fiches 9017101410000 à …006, EN STOCK
--     (quantité 1), annonces Vinted fictives 901710141n relevées « sold » la veille.
--     Tout disparaît au ROLLBACK.
--     n = 0 : annulée, jamais revue en ligne — rejouée AVANT la migration (A4) ;
--     n = 1 : annulée, jamais revue en ligne (C1) ;
--     n = 2 : annulée il y a 3 jours, revue EN LIGNE il y a 2 jours (C2) ;
--     n = 3 : job Vinted VIVANT sur l'annonce, annulation notée (C3) ;
--     n = 4 : aucune annulation, aucun job vivant — import pur (C4) ;
--     n = 5 : annulation notée MAIS une vente écrite pour la fiche (C5) ;
--     n = 6 : annulée, jamais revue — écriture du SERVEUR, pas du client (C6).
DO $donnees$
DECLARE
  u     uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  f     bigint := 9017101410000;
  n     integer;
  v_lid text;
  v_titre text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id BETWEEN f AND f + 99)
     OR EXISTS (SELECT 1 FROM public.inventaire WHERE user_id = u AND vinted_item_id LIKE '901710141%')
     OR EXISTS (SELECT 1 FROM public.vinted_listing_snapshots WHERE user_id = u AND vinted_item_id LIKE '901710141%')
     OR EXISTS (SELECT 1 FROM public.ventes_supprimees WHERE user_id = u AND annonce_id LIKE '901710141%') THEN
    RAISE EXCEPTION 'essai : des données d''essai 901710141… existent déjà — essai arrêté, rien n''est écrit';
  END IF;

  FOR n IN 0..6 LOOP
    v_lid := '901710141' || n;
    v_titre := '[ESSAI 17/10] Garde du dressing ' || n || ' — ne pas publier';
    INSERT INTO public.inventaire (id, user_id, titre, prix_vente, statut, quantite, plateforme, vinted_item_id, vinted_status, photos)
    VALUES (f + n, u, v_titre, 999, 'stock', 1, 'vinted', v_lid,
            CASE WHEN n IN (0, 1, 6) THEN 'closed' ELSE 'active' END,
            jsonb_build_array('https://example.invalid/essai-1710-141-' || n || '.jpg'));

    -- Le job : vivant pour n = 3, clos par l'annulation partout ailleurs (n = 4 : jamais vendu, clos).
    INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price,
                                        platform_listing_id, listing_url, published_at, error, platform_fields)
    VALUES (u, f + n, 'vinted', 'publish', CASE WHEN n = 3 THEN 'published' ELSE 'cancelled' END, 'original', v_titre, 999,
            v_lid, 'https://www.vinted.fr/items/' || v_lid, now() - interval '20 days',
            CASE WHEN n IN (3, 4) THEN NULL ELSE 'Commande Vinted annulée (essai)' END,
            jsonb_build_object('essai_1710_141000', true)
              || CASE WHEN n IN (3, 4) THEN '{}'::jsonb
                      ELSE jsonb_build_object('vente_annulee', jsonb_build_object('le', now() - interval '2 days', 'statut', 'failed', 'annonce', 'fermee')) END);

    -- La commande annulée notée (comme vente_commande_annulee_vinted la note).
    IF n <> 4 THEN
      INSERT INTO public.ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, supprimee_le, source, motif)
      VALUES (u, 'vinted', '90171014190' || n, v_lid, v_titre, 999,
              CASE WHEN n = 2 THEN now() - interval '3 days' ELSE now() - interval '2 days' END,
              'releve_vinted', 'commande_failed');
    END IF;

    -- Le relevé du dressing : « sold » la veille ; n = 2 revue EN LIGNE il y a 2 jours.
    INSERT INTO public.vinted_listing_snapshots (user_id, vinted_item_id, inventaire_id, captured_at, captured_on, price, status)
    VALUES (u, v_lid, f + n, now() - interval '1 day', ((now() - interval '1 day') AT TIME ZONE 'Europe/Paris')::date, 999, 'sold');
    IF n = 2 THEN
      INSERT INTO public.vinted_listing_snapshots (user_id, vinted_item_id, inventaire_id, captured_at, captured_on, price, status)
      VALUES (u, v_lid, f + n, now() - interval '2 days', ((now() - interval '2 days') AT TIME ZONE 'Europe/Paris')::date, 999, 'active');
    END IF;

    -- n = 5 : une vente écrite pour la fiche.
    IF n = 5 THEN
      INSERT INTO public.ventes (user_id, titre, prix_vente, plateforme, plateforme_code, statut, quantite, date, inventaire_id, source)
      VALUES (u, v_titre, 999, 'Vinted', 'vinted', 'vendu', 1, (now() AT TIME ZONE 'Europe/Paris')::date, f + n, 'manuel');
    END IF;
  END LOOP;
END
$donnees$;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A3 avant : données d''essai posées (compte de Nico)', '7 fiches en stock, 1 job vivant, 6 annulations notées',
       (SELECT count(*) FROM public.inventaire WHERE id BETWEEN 9017101410000 AND 9017101410006 AND statut = 'stock') || ' fiches en stock, '
       || (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 9017101410000 AND 9017101410006 AND status = 'published') || ' job vivant, '
       || (SELECT count(*) FROM public.ventes_supprimees WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND annonce_id LIKE '901710141%') || ' annulations',
       (SELECT count(*) FROM public.inventaire WHERE id BETWEEN 9017101410000 AND 9017101410006 AND statut = 'stock') = 7
       AND (SELECT count(*) FROM public.cross_post_jobs WHERE inventaire_id BETWEEN 9017101410000 AND 9017101410006 AND status = 'published') = 1
       AND (SELECT count(*) FROM public.ventes_supprimees WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND annonce_id LIKE '901710141%') = 6;

-- A4. Le défaut, REJOUÉ avec la garde du 11/10 (n = 0) : la synchro du dressing (client)
--     repasse « vendu » une fiche rendue au stock pour commande annulée — sans vente.
DO $a4$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'role', 'authenticated')::text, true);
  EXECUTE 'SET LOCAL ROLE authenticated';
  UPDATE public.inventaire SET statut = 'vendu', vinted_status = 'sold' WHERE id = 9017101410000;
  EXECUTE 'RESET ROLE';
  INSERT INTO _res (cas, attendu, obtenu, ok)
  SELECT 'A4 avant : garde du 11/10 — fiche annulée repassée « vendu » par le dressing, sans vente',
         'défaut prouvé : vendu/sold, 0 vente', i.statut || '/' || coalesce(i.vinted_status, '∅') || ', '
           || (SELECT count(*) FROM public.ventes v WHERE v.inventaire_id = i.id) || ' vente',
         i.statut = 'vendu' AND i.vinted_status = 'sold' AND NOT EXISTS (SELECT 1 FROM public.ventes v WHERE v.inventaire_id = i.id)
  FROM public.inventaire i WHERE i.id = 9017101410000;
END
$a4$;

-- ═══ B. LA MIGRATION (son contenu exact, sans BEGIN/COMMIT) ═══════════════════

-- ═══ CORPS DE LA MIGRATION (repris à l'octet par l'essai à blanc) ═══════════
-- ── 0. La définition de prod n'a pas bougé depuis sa lecture (17/10 14:05) ──
DO $garde$
BEGIN
  IF md5(pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure))
     IS DISTINCT FROM 'a63b6f1128757a0b767dd2852a094f57' THEN
    RAISE EXCEPTION 'inventaire_vendu_vinted_par_la_vente a changé en prod depuis le 17/10 14:05 : migration arrêtée, rien n''est écrit';
  END IF;
END
$garde$;

-- ── 1. inventaire_vendu_vinted_par_la_vente : une commande annulée ne repasse pas la fiche « vendue » ──
CREATE OR REPLACE FUNCTION public.inventaire_vendu_vinted_par_la_vente()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_id  text := nullif(btrim(coalesce(new.vinted_item_id, '')), '');
  v_job uuid;
  v_pf  jsonb;
begin
  begin
    if v_id is null then return new; end if;
    -- Le job Vinted VIVANT de cette annonce exacte (numéro, jamais le titre).
    select c.id, c.platform_fields into v_job, v_pf
      from public.cross_post_jobs c
     where c.user_id = new.user_id and c.platform = 'vinted' and c.status = 'published'
       and coalesce(c.action, 'publish') in ('publish', 'republish')
       and (btrim(coalesce(c.platform_listing_id, '')) = v_id
            or substring(coalesce(c.listing_url, '') from '/items/([0-9]+)') = v_id)
     order by c.created_at desc
     limit 1
     for update;
    -- (17/10) UNE COMMANDE VINTED ANNULÉE NE REPASSE PAS LA FICHE « VENDUE » : après
    -- une commande « failed », Vinted garde l'annonce d'origine « sold » (is_closed +
    -- item_closing_action 'sold') — 4 cas sur 4 relevés au 17/10. Sans job vivant, tant
    -- que CETTE annonce n'a pas été revue en ligne depuis l'annulation et qu'aucune
    -- vente n'est écrite pour la fiche ou l'annonce, la fiche garde son statut, sa
    -- quantité et son état d'annonce (le dressing du 17/10 01:18 avait défait le retour
    -- au stock du lot de Louis, sans vente ni journal). Job vivant : règle du 11/10.
    if v_job is null
       and exists (select 1 from public.ventes_supprimees s
                    where s.user_id = new.user_id and s.plateforme_code = 'vinted' and s.annonce_id = v_id
                      and s.source = 'releve_vinted' and left(s.motif, 9) = 'commande_'
                      and not exists (select 1 from public.vinted_listing_snapshots x
                                       where x.user_id = new.user_id and x.vinted_item_id = v_id
                                         and x.status in ('active', 'reserved', 'hidden')
                                         and x.captured_at > s.supprimee_le))
       and not exists (select 1 from public.ventes v
                        where v.user_id = new.user_id and (v.inventaire_id = new.id or v.annonce_id = v_id)) then
      new.statut := old.statut;
      new.quantite := old.quantite;
      new.vinted_status := coalesce(old.vinted_status, 'closed');
      raise log 'inventaire_vendu_vinted_par_la_vente : fiche % (annonce %) gardée en stock — commande Vinted annulée, annonce jamais revue en ligne',
        new.id, v_id;
      return new;
    end if;
    if v_job is null then return new; end if;            -- import pur : comportement du 03/08
    -- Une vente déjà écrite pour cette fiche ou cette annonce : le statut suit.
    if exists (select 1 from public.ventes v
                where v.user_id = new.user_id and (v.inventaire_id = new.id or v.annonce_id = v_id))
       or exists (select 1 from public.ventes_operations o
                   where o.user_id = new.user_id
                     and o.cle in ('annonce:vinted:' || v_id, coalesce(v_pf ->> 'vente_operation_cle', ''))) then
      return new;
    end if;
    -- Le signal part sur le job, comme l'extension le voulait (D'ABORD : s'il
    -- échoue, la fiche n'est pas touchée et l'écriture d'origine passe).
    if coalesce(v_pf ->> 'sale_signal', '') <> 'sold' then
      update public.cross_post_jobs
         set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
               'sale_signal', 'sold',
               'unavailable_since', coalesce(platform_fields ->> 'unavailable_since',
                                             to_char(now() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')),
               'sale_signal_pose_par', jsonb_build_object(
                 'par', 'inventaire_vendu_vinted_par_la_vente', 'le', now(),
                 'motif', 'dressing_sold_fiche_vendue_par_le_client'))
       where id = v_job;
    end if;
    -- Puis la fiche reste en stock : la vente l'écrira (ligne, stock, retraits).
    new.statut := old.statut;
    new.quantite := old.quantite;
    raise log 'inventaire_vendu_vinted_par_la_vente : fiche % (annonce %) gardée en stock, signal sur le job %',
      new.id, v_id, v_job;
  exception when others then
    -- Jamais une synchro cassée par la garde : en cas d'erreur, l'écriture
    -- d'origine passe telle quelle (comportement d'avant).
    raise warning 'inventaire_vendu_vinted_par_la_vente (fiche %) : %', new.id, sqlerrm;
    return new;
  end;
  return new;
end;
$function$
;
-- ═══ FIN DU CORPS DE LA MIGRATION ═══════════════════════════════════════════

-- ═══ C. APRÈS LA MIGRATION ═══════════════════════════════════════════════════

-- C1 à C5 : la même écriture que la synchro du dressing, sous le rôle authenticated.
DO $c$
DECLARE n integer;
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'role', 'authenticated')::text, true);
  FOR n IN 1..5 LOOP
    EXECUTE 'SET LOCAL ROLE authenticated';
    UPDATE public.inventaire SET statut = 'vendu', vinted_status = 'sold' WHERE id = 9017101410000 + n;
    EXECUTE 'RESET ROLE';
  END LOOP;
END
$c$;

-- C6 : la même écriture, faite par le SERVEUR (fonction de vente, réparation) : jamais retenue.
UPDATE public.inventaire SET statut = 'vendu', vinted_status = 'sold' WHERE id = 9017101410006;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C1 après : annulée, jamais revue en ligne — gardée en stock (statut, quantité, état d''annonce)',
       'stock ×1 closed', i.statut || ' ×' || coalesce(i.quantite::text, '∅') || ' ' || coalesce(i.vinted_status, '∅'),
       i.statut = 'stock' AND i.quantite = 1 AND i.vinted_status = 'closed'
FROM public.inventaire i WHERE i.id = 9017101410001;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C2 après : annulée puis revue EN LIGNE après l''annulation — « vendu » permis (règle du 03/08)',
       'vendu sold', i.statut || ' ' || coalesce(i.vinted_status, '∅'),
       i.statut = 'vendu' AND i.vinted_status = 'sold'
FROM public.inventaire i WHERE i.id = 9017101410002;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C3 après : job vivant — règle du 11/10 inchangée (fiche en stock, signal sur le job, posé par la garde)',
       'stock sold ; signal sold ; inventaire_vendu_vinted_par_la_vente',
       i.statut || ' ' || coalesce(i.vinted_status, '∅') || ' ; signal ' || coalesce(j.platform_fields ->> 'sale_signal', '∅')
         || ' ; ' || coalesce(j.platform_fields #>> '{sale_signal_pose_par,par}', '∅'),
       i.statut = 'stock' AND i.vinted_status = 'sold' AND j.platform_fields ->> 'sale_signal' = 'sold'
       AND j.platform_fields #>> '{sale_signal_pose_par,par}' = 'inventaire_vendu_vinted_par_la_vente'
FROM public.inventaire i
JOIN public.cross_post_jobs j ON j.inventaire_id = i.id AND j.status = 'published'
WHERE i.id = 9017101410003;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C4 après : aucune annulation, aucun job vivant — « vendu » direct inchangé (03/08)',
       'vendu sold', i.statut || ' ' || coalesce(i.vinted_status, '∅'),
       i.statut = 'vendu' AND i.vinted_status = 'sold'
FROM public.inventaire i WHERE i.id = 9017101410004;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C5 après : annulation notée mais vente écrite pour la fiche — le statut suit',
       'vendu sold', i.statut || ' ' || coalesce(i.vinted_status, '∅'),
       i.statut = 'vendu' AND i.vinted_status = 'sold'
FROM public.inventaire i WHERE i.id = 9017101410005;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C6 après : écriture du serveur — jamais retenue',
       'vendu sold', i.statut || ' ' || coalesce(i.vinted_status, '∅'),
       i.statut = 'vendu' AND i.vinted_status = 'sold'
FROM public.inventaire i WHERE i.id = 9017101410006;

-- C7. La définition nouvelle est en place.
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C7 après : définition nouvelle (garde des commandes annulées)', 'md5 ≠ a63b6f11… ; garde présente',
       left(md5(pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)), 8) || '… ; '
         || CASE WHEN position('annonce jamais revue en ligne' IN pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)) > 0
                 THEN 'garde présente' ELSE 'garde absente' END,
       md5(pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)) <> 'a63b6f1128757a0b767dd2852a094f57'
       AND position('annonce jamais revue en ligne' IN pg_get_functiondef('public.inventaire_vendu_vinted_par_la_vente()'::regprocedure)) > 0;

-- C8. Le déclencheur (événement, WHEN) n'a pas bougé.
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C8 après : déclencheur inventaire_0_vendu_vinted_par_la_vente inchangé', 'identique',
       CASE WHEN pg_get_triggerdef(t.oid) = a.valeur THEN 'identique' ELSE 'CHANGÉ' END,
       pg_get_triggerdef(t.oid) = a.valeur
FROM pg_trigger t, _avant a
WHERE t.tgrelid = 'public.inventaire'::regclass AND t.tgname = 'inventaire_0_vendu_vinted_par_la_vente' AND a.cle = 'declencheur';

-- C9. Aucun mail, aucune note de vente pour le compte de Nico.
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C9 après : email_logs et push_ventes du compte de Nico inchangés',
       m.valeur || ' mails / ' || n.valeur || ' notes',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') || ' mails / '
         || (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18') || ' notes',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18')::text = m.valeur
       AND (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18')::text = n.valeur
FROM _avant m, _avant n WHERE m.cle = 'mails' AND n.cle = 'notes';

SELECT ordre, cas, attendu, obtenu, ok FROM _res ORDER BY ordre;

ROLLBACK;
