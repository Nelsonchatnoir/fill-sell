-- ═══════════════════════════════════════════════════════════════════════════
-- UNE ANNONCE JAMAIS VUE EN LIGNE N'EST JAMAIS « PLUS EN LIGNE — VENDUE ? » (20/10 soir, Sébastien)
-- ═══════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/urgences-2010/RAPPORT.md, point 1.
--
-- Constat (20/10) : 13 dépôts Beebs de Sébastien (Pro), 09:10 → 11:13, jamais vus par aucun relevé Beebs (ni en
-- ligne, ni en vérification) ni par la veille ; leur page publique répond 404. La veille de l'extension lit le
-- lien du dépôt (posé dès le numéro, 30/09) : 404 deux fois → unavailable_since + sale_signal 'unavailable' →
-- « Annonces plus en ligne — Vendue ? ». Un « Oui » écrivait une fausse vente et retirait ses vraies annonces
-- ailleurs. La règle du 09/10 (un dépôt jamais vu en ligne est un échec, jamais une vente) ne couvrait que les
-- dépôts SANS lien (trancher_publications_sans_lien) ; Beebs, jamais jugé (27/09), restait à la merci de la veille.
--
-- Règle, pour tout le parc :
--   1. un dépôt (non Vinted) qui n'a JAMAIS été vu en ligne — ni par un relevé de son compte (en ligne / vendue),
--      ni par la veille (vu_en_ligne_le) — ne reçoit jamais la question : le drapeau « plus en ligne » est
--      remplacé par le marqueur platform_fields.pas_encore_visible (déclencheur, quel que soit l'écrivain) ;
--      l'app y lit « Beebs vérifie ton annonce » (message existant) ;
--   2. le marqueur s'efface dès que la veille ou un relevé voit l'annonce en ligne ;
--   3. toujours invisible après la grâce (72 h Beebs, 4 h ailleurs) et absent de deux relevés complets : échec
--      de publication (trancher_publications_sans_lien, nouvelle boucle des dépôts AVEC lien), ou clos sans rouge
--      si l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié — 20261020210000).
-- Inchangé : une annonce VUE en ligne puis disparue (question d'avant), une preuve de vente « sold », Vinted.
-- Dépend de 20261020210000 (jumelle_occupe_plateformes).
-- trancher_publications_sans_lien : corps relu en prod (pg_get_functiondef, 20/10 ≈ 22:45), ajouts seuls.
-- Inverse : supabase/rollbacks/20261020220000_jamais_vue_en_ligne_jamais_vendue_INVERSE.sql

-- Jamais vu en ligne : ni la veille, ni un relevé de son compte (en ligne ou vendue) sous un de ses identifiants
-- ou rattaché à lui.
create or replace function public.job_jamais_vu_en_ligne(p_job uuid, p_user uuid, p_platform text, p_vu_en_ligne timestamptz,
                                                         p_listing_id text, p_listing_url text, p_pf jsonb)
returns boolean language sql stable security definer set search_path to 'public', 'pg_temp' as $$
  select p_vu_en_ligne is null and not exists (
    select 1 from public.annonces_plateforme a
     where a.user_id = p_user and a.platform = p_platform
       and a.statut_plateforme in ('en_ligne', 'vendue')
       and (a.job_id = p_job
            or a.listing_id = any (array_remove(array[
                 nullif(btrim(p_listing_id), ''),
                 public.annonce_id_job(p_platform, p_listing_url),
                 nullif(btrim(p_pf #>> '{lbc_depot,adsubmit,id}'), ''),
                 nullif(btrim(p_pf #>> '{lbc_depot,sans_adsubmit,id}'), '')], null))))
$$;
revoke all on function public.job_jamais_vu_en_ligne(uuid, uuid, text, timestamptz, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.job_jamais_vu_en_ligne(uuid, uuid, text, timestamptz, text, text, jsonb) to service_role;

-- Le déclencheur. Nommé pour passer APRÈS cross_post_jobs_vu_en_ligne (les déclencheurs BEFORE d'une table passent
-- par ordre alphabétique : « vu_ » avant « vue_ ») : quand la veille voit l'annonce en ligne dans la même écriture,
-- vu_en_ligne_le est déjà posé ici, et le marqueur s'efface.
create or replace function public.cross_post_jobs_vue_ou_pas_encore_visible()
returns trigger language plpgsql security definer set search_path to 'public', 'pg_temp' as $$
declare
  v_pev jsonb;
begin
  -- Restauration par nous seuls (inverse d'une réparation) : même porte que fillsell.import_releve.
  if coalesce(current_setting('fillsell.restauration', true), '') = 'on' then return new; end if;
  -- Vue en ligne (la veille vient de la voir) : plus « pas encore visible ».
  if new.platform_fields ? 'pas_encore_visible' and new.vu_en_ligne_le is not null then
    new.platform_fields := new.platform_fields - 'pas_encore_visible';
    return new;
  end if;
  -- Un drapeau « plus en ligne » NEUF (pas une preuve de vente) sur un dépôt jamais vu en ligne : pas de question.
  if new.platform_fields ? 'unavailable_since'
     and not (coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since')
     and coalesce(new.platform_fields ->> 'sale_signal', 'unavailable') = 'unavailable'
     -- Les DÉPÔTS seulement : une recréation (republish) jamais revue a son propre circuit (« introuvable à confirmer »).
     and new.status = 'published' and coalesce(new.action, 'publish') = 'publish'
     and public.job_jamais_vu_en_ligne(new.id, new.user_id, new.platform, new.vu_en_ligne_le,
                                       new.platform_listing_id, new.listing_url, new.platform_fields) then
    v_pev := coalesce(old.platform_fields -> 'pas_encore_visible', '{}'::jsonb);
    new.platform_fields := (new.platform_fields - array['unavailable_since', 'sale_signal', 'unavailable_pending_since'])
      || jsonb_build_object('pas_encore_visible', jsonb_build_object(
           'depuis', coalesce(v_pev -> 'depuis', to_jsonb(now())),
           'lectures', coalesce((v_pev ->> 'lectures')::int, 0) + 1,
           'derniere', now(),
           'regle', 'jamais_vue_en_ligne_2010'));
  end if;
  return new;
exception when others then
  raise warning 'cross_post_jobs_vue_ou_pas_encore_visible : job % : % — écriture inchangée', new.id, sqlerrm;
  return new;
end $$;
revoke all on function public.cross_post_jobs_vue_ou_pas_encore_visible() from public, anon, authenticated;
drop trigger if exists cross_post_jobs_vue_ou_pas_encore_visible on public.cross_post_jobs;
create trigger cross_post_jobs_vue_ou_pas_encore_visible
  before update of platform_fields, last_checked_at, vu_en_ligne_le on public.cross_post_jobs
  for each row when (new.platform <> 'vinted' and (
        (new.platform_fields ? 'unavailable_since' and not (coalesce(old.platform_fields, '{}'::jsonb) ? 'unavailable_since'))
     or (new.platform_fields ? 'pas_encore_visible' and new.vu_en_ligne_le is not null)))
  execute function public.cross_post_jobs_vue_ou_pas_encore_visible();

CREATE OR REPLACE FUNCTION public.trancher_publications_sans_lien(p_user uuid, p_platform text, p_run_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_run vinted_sync_runs%ROWTYPE;
  v_precedent vinted_sync_runs%ROWTYPE;
  j record;
  v_ids text[];
  v_url text;
  v_refund jsonb;
  v_nom text;
  v_msg text;
  v_releve_txt text;
  n_refusees integer := 0; n_en_ligne integer := 0; n_attente integer := 0;
  v_vivante record; v_doublon record;
  v_jum_id text;
  v_grace interval;
  n_jumelle integer := 0; n_jamais_vues integer := 0; n_visibles integer := 0;
BEGIN
  IF p_user IS NULL OR p_platform IS NULL OR p_run_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  SELECT * INTO v_run FROM vinted_sync_runs
   WHERE id = p_run_id AND user_id = p_user AND kind = 'annonces' AND platform = p_platform;
  IF v_run.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'run_introuvable'); END IF;
  -- (20/10) « PAS ENCORE VISIBLE » LEVÉ PAR LE RELEVÉ : une annonce que le relevé de CE compte voit en ligne (ou
  -- vendue) n'est plus « pas encore visible » — le marqueur posé par cross_post_jobs_vue_ou_pas_encore_visible
  -- s'efface. Bornée aux jobs qui le portent ; aucune autre ligne réécrite.
  UPDATE cross_post_jobs c SET platform_fields = c.platform_fields - 'pas_encore_visible'
   WHERE c.user_id = p_user AND c.platform = p_platform AND c.platform_fields ? 'pas_encore_visible'
     AND EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.statut_plateforme IN ('en_ligne', 'vendue')
                    AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)));
  GET DIAGNOSTICS n_visibles = ROW_COUNT;

  IF NOT releve_preuve_absence(p_run_id) THEN
    RETURN jsonb_build_object('ok',true,'reason','releve_non_probant','refusees',0,'en_ligne',0,'en_attente',0);
  END IF;
  SELECT s.* INTO v_precedent FROM (
    SELECT * FROM vinted_sync_runs WHERE user_id=p_user AND started_at<v_run.started_at
    ORDER BY started_at DESC LIMIT 50
  ) s WHERE s.platform=p_platform AND s.kind='annonces'
    AND s.vinted_user_id IS NOT DISTINCT FROM v_run.vinted_user_id
    AND s.finished_at<=v_run.started_at AND s.started_at<=v_run.started_at-interval '5 minutes'
    AND releve_preuve_absence(s.id)
  ORDER BY s.started_at DESC LIMIT 1;
  v_nom := CASE p_platform WHEN 'leboncoin' THEN 'Leboncoin' WHEN 'beebs' THEN 'Beebs' WHEN 'ebay' THEN 'eBay' WHEN 'opla' THEN 'Opla' WHEN 'depop' THEN 'Depop' ELSE p_platform END;
  v_releve_txt := to_char(COALESCE(v_run.finished_at, v_run.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI');

  FOR j IN
    SELECT id, platform_listing_id, platform_fields, inventaire_id, vu_en_ligne_le, COALESCE(published_at, created_at) AS publie
      FROM cross_post_jobs
     WHERE user_id = p_user AND platform = p_platform
       AND status = 'published' AND action = 'publish' AND listing_url IS NULL
     ORDER BY COALESCE(published_at, created_at)
     LIMIT 25 FOR UPDATE SKIP LOCKED
  LOOP
    v_ids := ARRAY(
      SELECT DISTINCT x FROM unnest(ARRAY[
        NULLIF(btrim(j.platform_listing_id), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
        NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
      ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
    IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;

    -- EN LIGNE : l'identifiant est dans le relevé du compte, avec son lien.
    v_url := NULL;
    SELECT ap.url INTO v_url FROM annonces_plateforme ap
     WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)
       AND ap.url IS NOT NULL AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
     ORDER BY ap.vu_le DESC LIMIT 1;
    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_par_identifiant', jsonb_build_object('le', now(), 'run_id', p_run_id, 'url', v_url, 'identifiants', to_jsonb(v_ids)))
       WHERE id = j.id;
      n_en_ligne := n_en_ligne + 1; CONTINUE;
    END IF;

    -- Présente dans un relevé sous un autre statut : ce n'est pas un refus.
    IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                WHERE ap.user_id = p_user AND ap.platform = p_platform AND ap.listing_id = ANY(v_ids)) THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico). Le lien
    -- est posé ci-dessus quand le relevé le porte ; une absence du relevé ne
    -- fait jamais dire « refusée » ni « tu peux la relancer ».
    IF p_platform = 'beebs' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;

    -- Deux cycles complets après la grâce commune.
    IF v_precedent.id IS NULL OR v_precedent.started_at<j.publie+interval '4 hours' THEN
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- (09/10, chantier E) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE « VENTE
    -- POSSIBLE ». Depuis le 28/09 (point E), cette absence ouvrait la question
    -- « Plus en ligne — Vendue ? » : la G-Shock de Nico (3283733957), REFUSÉE
    -- par la modération Leboncoin 6 s après son dépôt, s'est retrouvée en
    -- bandeau « Vendue ? » le 08/10 ; 8 dépôts du parc ainsi depuis le 30/09.
    -- Ici l'annonce n'a JAMAIS été vue en ligne : aucun lien, jamais revue par
    -- la veille, absente de TOUT relevé (testé plus haut), absente de deux
    -- relevés complets après la grâce → ÉCHEC DE PUBLICATION, de notre côté
    -- (règle de Nico : un refus de modération est notre faute) : 'failed' avec
    -- son motif, publication rendue (refund_publish_unconfirmed, idempotent).
    -- Ni vente, ni stock touché, ni retrait, ni question.
    -- Une question « Vendue ? » déjà ouverte reste telle quelle (réparation sur GO).
    IF j.platform_fields ? 'unavailable_since' THEN
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    IF j.vu_en_ligne_le IS NOT NULL THEN
      -- Vue en ligne un jour par la veille : la question d'avant tient.
      UPDATE cross_post_jobs SET platform_fields=COALESCE(platform_fields,'{}'::jsonb)
        || jsonb_build_object('sale_signal','unavailable','unavailable_since',v_run.finished_at,
          'absence_releves',jsonb_build_object('premier',v_precedent.id,'second',v_run.id,
            'identifiants',to_jsonb(v_ids),'le',now()))
        WHERE id=j.id;
      n_attente:=n_attente+1; CONTINUE;
    END IF;
    -- L'article est EN LIGNE sur cette plateforme sous une autre annonce DE LA
    -- MÊME FICHE (lien prouvé par la fiche, jamais par un titre) : ce dépôt est
    -- sans objet — clos sans rouge, sans invitation à republier un doublon.
    v_vivante := NULL;
    SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
     WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
       AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
       AND ap.listing_id <> ALL(v_ids)
     ORDER BY ap.vu_le DESC LIMIT 1;
    -- Même PHOTO (empreinte identique) qu'une annonce EN LIGNE de ce compte sur
    -- cette plateforme : le doublon le plus probable du refus — dit dans le motif.
    v_doublon := NULL;
    SELECT ap.listing_id INTO v_doublon
      FROM inventaire i
      CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
      JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
      JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
        AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
      JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
     WHERE i.id = j.inventaire_id AND i.user_id = p_user
     LIMIT 1;
    IF v_vivante.listing_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a jamais été mis en ligne par ' || v_nom || ' (refusé à la vérification ou retiré), mais ton article y est en ligne sous l''annonce '
          || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'article_en_ligne_ailleurs', 'annonce_en_ligne', v_vivante.listing_id))
       WHERE id = j.id AND status = 'published';
      n_attente := n_attente + 1; CONTINUE;
    END IF;
    -- (20/10, Louis) Comptes reliés sur une boutique PARTAGÉE : la fiche JUMELLE y est en ligne (vue par le relevé
    -- du compte relié) — ce dépôt était le doublon, refusé par la plateforme : clos sans rouge, rien à refaire.
    v_jum_id := NULL;
    IF j.inventaire_id IS NOT NULL
       AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
      SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
       WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
    END IF;
    IF v_jum_id IS NOT NULL THEN
      UPDATE cross_post_jobs SET status='cancelled',
        error = 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
          || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.',
        platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'en_ligne_par_compte_relie', 'annonce_en_ligne', v_jum_id))
       WHERE id = j.id AND status = 'published';
      n_jumelle := n_jumelle + 1; n_attente := n_attente + 1; CONTINUE;
    END IF;
    v_refund := refund_publish_unconfirmed(j.id);
    v_msg := v_nom || ' n''a jamais mis cette annonce en ligne : elle a été refusée par sa modération (ou retirée avant sa mise en ligne). '
      || CASE WHEN v_doublon.listing_id IS NOT NULL
           THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne : ' || v_nom || ' refuse les doublons. '
           ELSE '' END
      || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. '
      || 'Absente de tes annonces aux relevés du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
      || ' et du ' || v_releve_txt || '.';
    UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
      platform_fields = (COALESCE(platform_fields,'{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
          'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund))
     WHERE id = j.id AND status = 'published';
    n_refusees := n_refusees + 1;
  END LOOP;

  -- ── (20/10, Sébastien) UN DÉPÔT JAMAIS VU EN LIGNE N'EST JAMAIS UNE VENTE — AUSSI QUAND IL A UN LIEN ────────
  -- La boucle ci-dessus ne lit que les dépôts SANS lien. Un dépôt Beebs a toujours son lien (numéro → /fr/p/,
  -- déclencheur du 30/09) ; Leboncoin, eBay, Depop souvent. Jamais vu en ligne (aucun relevé de ce compte ne l'a
  -- vu, sous aucun statut ; la veille non plus), il ne pose plus la question « Plus en ligne — Vendue ? »
  -- (cross_post_jobs_vue_ou_pas_encore_visible) : il reste « pas encore visible ». Toujours absent de deux
  -- relevés complets après la grâce — 72 h pour Beebs (sa vérification est humaine), 4 h ailleurs — c'est un
  -- ÉCHEC DE PUBLICATION, traité comme celui d'au-dessus : 'failed' + motif + publication rendue, ou clos sans
  -- rouge quand l'article est en ligne ailleurs (même fiche, ou fiche jumelle d'un compte relié). Ni vente, ni
  -- stock touché, ni retrait, ni question. Vinted jamais (sa preuve est le dressing). Une question déjà ouverte
  -- reste telle quelle. Bornée : 14 derniers jours, 25 par relevé.
  IF p_platform <> 'vinted' THEN
    v_grace := CASE WHEN p_platform = 'beebs' THEN interval '72 hours' ELSE interval '4 hours' END;
    FOR j IN
      SELECT c.id, c.platform_listing_id, c.listing_url, c.platform_fields, c.inventaire_id, c.vu_en_ligne_le,
             COALESCE(c.published_at, c.created_at) AS publie
        FROM cross_post_jobs c
       WHERE c.user_id = p_user AND c.platform = p_platform
         AND c.status = 'published' AND c.action = 'publish' AND c.listing_url IS NOT NULL
         AND c.vu_en_ligne_le IS NULL
         AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')
         AND COALESCE(c.published_at, c.created_at) > now() - interval '14 days'
         AND COALESCE(c.published_at, c.created_at) < now() - v_grace
         AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                          WHERE ap.user_id = p_user AND ap.platform = p_platform
                            AND ap.listing_id IN (btrim(c.platform_listing_id), annonce_id_job(p_platform, c.listing_url)))
       ORDER BY COALESCE(c.published_at, c.created_at)
       LIMIT 25 FOR UPDATE OF c SKIP LOCKED
    LOOP
      v_ids := ARRAY(
        SELECT DISTINCT x FROM unnest(ARRAY[
          NULLIF(btrim(j.platform_listing_id), ''),
          annonce_id_job(p_platform, j.listing_url),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
          NULLIF(btrim(j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), '')
        ]) AS x WHERE x IS NOT NULL AND x ~ '^[0-9]{6,}$');
      IF COALESCE(array_length(v_ids, 1), 0) = 0 THEN n_attente := n_attente + 1; CONTINUE; END IF;
      -- Vue par un relevé sous un de ses identifiants, ou rattachée au job (tout statut, « en vérification »
      -- compris) : ce n'est pas un refus — la plateforme l'examine encore, ou elle est en ligne.
      IF EXISTS (SELECT 1 FROM annonces_plateforme ap
                  WHERE ap.user_id = p_user AND ap.platform = p_platform
                    AND (ap.listing_id = ANY(v_ids) OR ap.job_id = j.id)) THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      IF v_precedent.id IS NULL OR v_precedent.started_at < j.publie + v_grace THEN
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_vivante := NULL;
      SELECT ap.listing_id, ap.url INTO v_vivante FROM annonces_plateforme ap
       WHERE j.inventaire_id IS NOT NULL AND ap.user_id = p_user AND ap.platform = p_platform
         AND ap.inventaire_id = j.inventaire_id AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL
         AND ap.listing_id <> ALL(v_ids)
       ORDER BY ap.vu_le DESC LIMIT 1;
      v_jum_id := NULL;
      IF v_vivante.listing_id IS NULL AND j.inventaire_id IS NOT NULL
         AND EXISTS (SELECT 1 FROM fiches_liees_comptes f WHERE f.fiche_a = j.inventaire_id OR f.fiche_b = j.inventaire_id) THEN
        SELECT o.listing_id INTO v_jum_id FROM jumelle_occupe_plateformes(p_user, j.inventaire_id) o
         WHERE o.platform = p_platform AND o.statut = 'en_ligne' AND coalesce(o.listing_id, '') <> ALL(v_ids) LIMIT 1;
      END IF;
      IF v_vivante.listing_id IS NOT NULL OR v_jum_id IS NOT NULL THEN
        UPDATE cross_post_jobs SET status = 'cancelled',
          error = CASE WHEN v_vivante.listing_id IS NOT NULL
            THEN 'Ce dépôt n''a jamais été mis en ligne par ' || v_nom || ' (refusé à la vérification ou retiré), mais ton article y est en ligne sous l''annonce '
                 || v_vivante.listing_id || ' : rien à refaire, rien n''est vendu.'
            ELSE 'Ce dépôt n''a pas été mis en ligne par ' || v_nom || ' : ton article y est DÉJÀ en ligne sous l''annonce '
                 || v_jum_id || ', publiée par ton compte FillSell relié — ' || v_nom || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
          platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
            || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
              'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
              'issue', CASE WHEN v_vivante.listing_id IS NOT NULL THEN 'article_en_ligne_ailleurs' ELSE 'en_ligne_par_compte_relie' END,
              'annonce_en_ligne', coalesce(v_vivante.listing_id, v_jum_id), 'avec_lien', true))
         WHERE id = j.id AND status = 'published';
        IF v_jum_id IS NOT NULL THEN n_jumelle := n_jumelle + 1; END IF;
        n_attente := n_attente + 1; CONTINUE;
      END IF;
      v_doublon := NULL;
      SELECT ap.listing_id INTO v_doublon
        FROM inventaire i
        CROSS JOIN LATERAL jsonb_array_elements(CASE WHEN jsonb_typeof(i.photos::jsonb)='array' THEN i.photos::jsonb ELSE '[]'::jsonb END) ph
        JOIN photo_empreintes e1 ON e1.url = ph->>'url' AND e1.dhash IS NOT NULL
        JOIN annonces_plateforme ap ON ap.user_id = p_user AND ap.platform = p_platform
          AND ap.statut_plateforme = 'en_ligne' AND ap.disparu_le IS NULL AND ap.listing_id <> ALL(v_ids)
        JOIN photo_empreintes e2 ON e2.url = ap.photo_url AND e2.dhash = e1.dhash
       WHERE i.id = j.inventaire_id AND i.user_id = p_user
       LIMIT 1;
      v_refund := refund_publish_unconfirmed(j.id);
      v_msg := v_nom || ' n''a jamais mis cette annonce en ligne : '
        || CASE WHEN p_platform = 'beebs'
             THEN 'trois jours après le dépôt, elle n''est ni en ligne ni « en vérification » dans tes annonces Beebs — refusée par sa vérification, ou retirée. '
             ELSE 'elle a été refusée par sa modération (ou retirée avant sa mise en ligne). ' END
        || CASE WHEN v_doublon.listing_id IS NOT NULL
             THEN 'Elle porte la même photo que ton annonce ' || v_doublon.listing_id || ', déjà en ligne : ' || v_nom || ' refuse les doublons. '
             ELSE '' END
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites. '
        || 'Absente de tes annonces aux relevés du ' || to_char(COALESCE(v_precedent.finished_at, v_precedent.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI')
        || ' et du ' || v_releve_txt || '.';
      UPDATE cross_post_jobs SET status = 'failed', error = v_msg,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'premier', v_precedent.id, 'second', v_run.id, 'identifiants', to_jsonb(v_ids),
            'issue', 'refus_moderation_probable', 'doublon_photo_de', v_doublon.listing_id, 'refund', v_refund, 'avec_lien', true))
       WHERE id = j.id AND status = 'published';
      n_jamais_vues := n_jamais_vues + 1;
    END LOOP;
  END IF;

  RETURN jsonb_build_object('ok', true, 'run_id', p_run_id, 'platform', p_platform,
                            'refusees', n_refusees + n_jamais_vues, 'en_ligne', n_en_ligne, 'en_attente', n_attente,
                            'jamais_vues_avec_lien', n_jamais_vues, 'compte_relie', n_jumelle, 'redevenues_visibles', n_visibles);
END;
$function$;
