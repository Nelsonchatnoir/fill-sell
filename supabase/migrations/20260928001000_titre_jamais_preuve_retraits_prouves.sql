-- ═══════════════════════════════════════════════════════════════════════════
-- UN TITRE N'EST JAMAIS UNE PREUVE D'IDENTITÉ — RÈGLE DÉFINITIVE (27/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- louis@ttfamily.fr (Business) duplique ses articles sur Beebs : mêmes titres,
-- articles différents. Ce soir, deux annonces Beebs ENCORE À VENDRE ont été
-- retirées :
--  · 34058194 (20:36) : rattachée par son TITRE à la fiche vendue
--    1789991180868 (chemin releve_fiche_vendue, rapprocher_importer) ;
--  · 32750442 (20:33) : DEUXIÈME annonce Beebs de la fiche vendue
--    1789991184800 (chemin vente_article_serveur : depuis le 27/09 matin,
--    armer_retraits_copies retirait TOUTES les annonces vivantes d'une fiche).
-- Aussi exécutés par le chemin releve_fiche_vendue : nicolas.menar ×4,
-- thomas.vinted590002 ×1. Les 6 encore en file ont été suspendus à la main
-- (44310spgl ×4, van-breugel.sandra ×2 : platform_fields.retrait_suspendu).
--
-- RÈGLE (Nico) : un titre n'est jamais une preuve d'identité. Une vente ne
-- retire que les copies de CET exemplaire sur les AUTRES plateformes, liées
-- par une preuve (dépôt FillSell, identifiant). Deux annonces sur la même
-- plateforme sont deux exemplaires.
--
-- CE QUE FAIT CETTE MIGRATION (définitions PROD reprises, rien n'est retiré) :
--  1. retrait_job_prouve(job) : l'annonce d'un job est liée à SA fiche par une
--     preuve — dépôt FillSell de la fiche, rattachement par identifiant,
--     annonce importée comme fiche propre, ou geste de la personne — et le job
--     n'a PAS été amené sur la fiche par une fusion automatique (titre ou
--     photos : recensement, balayage, support).
--  2. armer_retrait_job : refuse un job sans preuve, et refuse quand la fiche
--     porte DEUX annonces vivantes ou plus sur cette plateforme.
--  3. armer_retraits_copies : une annonce par plateforme (la plus récente
--     prouvée), jamais la plateforme de la vente, jamais une plateforme où la
--     fiche porte deux annonces vivantes.
--  4. rapprocher_importer : plus de rattachement à une fiche VENDUE par le
--     titre (releve_fiche_vendue) — l'annonce est importée comme sa fiche, et
--     la question « Déjà vendu ? » est posée.
--  5. rapprocher_traiter_annonce : la bande « certain » (titre exact + prix
--     égal) ne rattache plus : elle importe et pose « Est-ce le même
--     article ? ».
--  6. doublons_examiner_fiche : plus de fusion AUTOMATIQUE sur un motif de
--     titre ; elle devient une question.

CREATE OR REPLACE FUNCTION public.retrait_job_prouve(p_job uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE((
    SELECT NOT EXISTS (
             SELECT 1 FROM inventaire_fusions f
              WHERE f.defait_le IS NULL AND COALESCE(f.par, '') NOT LIKE 'utilisateur%'
                AND jsonb_typeof(f.deplacements -> 'cross_post_jobs') = 'array'
                AND (f.deplacements -> 'cross_post_jobs') ? j.id::text)
       AND (COALESCE(j.platform_fields ->> 'source', '') <> 'releve'
            OR COALESCE(j.platform_fields #>> '{rattachement,par}', '') = 'utilisateur'
            OR COALESCE(j.platform_fields #>> '{rattachement,motif}', '') = 'identifiant_depot_clos'
            OR COALESCE(j.platform_fields #>> '{rattachement,import}', '') = 'true')
      FROM cross_post_jobs j WHERE j.id = p_job), false);
$function$;
REVOKE ALL ON FUNCTION public.retrait_job_prouve(uuid) FROM PUBLIC;

-- Nombre d'annonces VIVANTES d'une fiche sur une plateforme (relevés).
CREATE OR REPLACE FUNCTION public.fiche_annonces_vivantes(p_inventaire bigint, p_platform text)
 RETURNS integer
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT count(DISTINCT ap.listing_id)::int FROM annonces_plateforme ap
   WHERE ap.inventaire_id = p_inventaire AND ap.platform = p_platform
     AND ap.disparu_le IS NULL AND ap.retiree_le IS NULL AND ap.ignoree_le IS NULL
     AND ap.statut_plateforme IN ('en_ligne', 'en_verification');
$function$;
REVOKE ALL ON FUNCTION public.fiche_annonces_vivantes(bigint, text) FROM PUBLIC;

CREATE OR REPLACE FUNCTION public.armer_retrait_job(p_job_id uuid, p_chemin text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  j        public.cross_post_jobs%rowtype;
  v_item   text;
  v_url    text;
  v_ident  text;
  v_sans_lien boolean;
  v_pf     jsonb;
  v_del    uuid;
  v_compte text;
begin
  select * into j from public.cross_post_jobs where id = p_job_id;
  if not found or j.inventaire_id is null
     or coalesce(j.action, 'publish') not in ('publish', 'republish')
     or j.status is distinct from 'published' then
    return null;
  end if;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : l'annonce doit être liée à
  -- SA fiche par une preuve, et la fiche ne doit pas porter deux annonces
  -- vivantes sur cette plateforme (deux annonces = deux exemplaires).
  if not public.retrait_job_prouve(j.id) then
    return null;
  end if;
  if public.fiche_annonces_vivantes(j.inventaire_id, j.platform) >= 2 then
    return null;
  end if;
  if coalesce(j.platform_fields ->> 'sale_signal', '') = 'sold' then
    return null;
  end if;
  v_url := nullif(btrim(coalesce(j.listing_url, '')), '');
  if j.platform = 'vinted' then
    v_item := coalesce(case when j.platform_listing_id ~ '^\d+$' then j.platform_listing_id end,
                       substring(v_url from '/items/(\d+)'));
    if v_item is not null and public.vinted_annonce_vendue(j.user_id, v_item) then
      return null;
    end if;
  end if;
  v_sans_lien := v_url is null and nullif(btrim(coalesce(j.platform_listing_id, '')), '') is null;
  if exists (
    select 1 from public.cross_post_jobs d
     where d.user_id = j.user_id and d.inventaire_id = j.inventaire_id
       and d.platform = j.platform and d.action = 'delete'
       and d.status in ('pending', 'processing', 'needs_user')
       and (v_sans_lien
            or public.listing_designe(coalesce(j.platform_listing_id, v_item, v_url), d.listing_url, d.platform_listing_id)
            or (v_url is not null and d.listing_url = v_url)
            or (j.platform_listing_id is not null and d.platform_listing_id = j.platform_listing_id))
  ) then
    return null;
  end if;
  v_pf := jsonb_build_object('arme_par', jsonb_build_object(
            'chemin', p_chemin, 'le', now(), 'depot', j.id,
            'pose_par', 'armer_retrait_job (serveur)'));
  if v_url is null then
    v_pf := v_pf || jsonb_build_object('removal_url_missing', true);
  end if;
  if j.platform = 'beebs' and v_sans_lien then
    v_pf := v_pf || jsonb_build_object('retrait_attend_lien', jsonb_build_object(
              'depuis', now(), 'motif', 'depot_beebs_en_verification_a_la_vente'));
  end if;
  if j.platform = 'vinted' then
    select nullif(btrim(i.vinted_account_id::text), '') into v_compte
      from public.inventaire i where i.id = j.inventaire_id;
    if v_compte is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', v_compte);
    end if;
  end if;
  if p_delai is not null and p_delai > interval '0' then
    v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
  end if;
  insert into public.cross_post_jobs
    (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
  values
    (j.user_id, j.inventaire_id, j.platform, 'delete', 'pending', 'original',
     j.title, v_url, nullif(btrim(coalesce(j.platform_listing_id, '')), ''), v_pf)
  returning id into v_del;
  update public.cross_post_jobs
     set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object(
           'pending_removal', false,
           'retrait_arme', jsonb_build_object('job', v_del, 'le', now(), 'chemin', p_chemin))
   where id = j.id;
  return v_del;
end;
$function$;

CREATE OR REPLACE FUNCTION public.armer_retraits_copies(p_inventaire_id bigint, p_chemin text, p_sauf_job uuid DEFAULT NULL::uuid, p_sauf_plateforme text DEFAULT NULL::text, p_delai interval DEFAULT '00:00:00'::interval)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_inv   public.inventaire%rowtype;
  v_pub   record;
  v_del   uuid;
  v_n     integer := 0;
  v_pl    text[] := '{}';
  v_url   text;
  v_pf    jsonb;
begin
  select * into v_inv from public.inventaire where id = p_inventaire_id;
  if not found or v_inv.fusionne_dans is not null then
    return jsonb_build_object('armes', 0);
  end if;
  -- (2026-09-27, audit synchro) une fiche peut porter PLUSIEURS annonces
  -- vivantes sur la même plateforme (rattachement de la personne, deux
  -- dépôts) : la plus récente par plateforme ET toute autre dont un relevé
  -- atteste qu'elle vit encore sur cette fiche. Avant : une seule par
  -- plateforme — la seconde restait en vente après la vente (Louis, Beebs,
  -- 27/09). armer_retrait_job ne double jamais un retrait de la même annonce.
  for v_pub in
    -- (27/09 soir) UNE annonce par plateforme, la plus récente PROUVÉE ;
    -- jamais la plateforme de la vente ; jamais une plateforme où la fiche
    -- porte deux annonces vivantes (deux exemplaires) — armer_retrait_job
    -- le vérifie aussi, pour tous ses appelants.
    select x.id, x.platform from (
      (select distinct on (j.platform) j.id, j.platform
         from public.cross_post_jobs j
        where j.user_id = v_inv.user_id and j.inventaire_id = p_inventaire_id
          and coalesce(j.action, 'publish') in ('publish', 'republish')
          and j.status = 'published'
          and (p_sauf_job is null or j.id <> p_sauf_job)
          and (p_sauf_plateforme is null or j.platform <> p_sauf_plateforme)
          and public.retrait_job_prouve(j.id)
          and public.fiche_annonces_vivantes(p_inventaire_id, j.platform) < 2
        order by j.platform, coalesce(j.published_at, j.created_at) desc, j.created_at desc)
    ) x
  loop
    v_del := public.armer_retrait_job(v_pub.id, p_chemin, p_delai);
    if v_del is not null then
      v_n := v_n + 1;
      v_pl := v_pl || v_pub.platform;
    end if;
  end loop;
  if v_inv.vinted_item_id ~ '^\d+$'
     and v_inv.disparu_le is null
     and v_inv.vinted_status = 'active'
     and (p_sauf_plateforme is distinct from 'vinted')
     and not ('vinted' = any (v_pl))
     and not public.vinted_annonce_vendue(v_inv.user_id, v_inv.vinted_item_id)
     and not exists (
       select 1 from public.cross_post_jobs d
        where d.user_id = v_inv.user_id and d.platform = 'vinted' and d.action = 'delete'
          and d.status in ('pending', 'processing', 'needs_user')
          and coalesce(case when d.platform_listing_id ~ '^\d+$' then d.platform_listing_id end,
                       substring(d.listing_url from '/items/(\d+)')) = v_inv.vinted_item_id)
     and not exists (
       select 1 from public.cross_post_jobs p
        where p.user_id = v_inv.user_id and p.inventaire_id = p_inventaire_id
          and p.platform = 'vinted' and p.status = 'published'
          and coalesce(p.action, 'publish') in ('publish', 'republish'))
  then
    select substring(j.listing_url from '^(https://[^/]+)/items/') into v_url
      from public.cross_post_jobs j
     where j.user_id = v_inv.user_id and j.platform = 'vinted'
       and j.listing_url ~ '^https://[^/]+/items/'
     order by j.created_at desc limit 1;
    v_pf := jsonb_build_object('arme_par', jsonb_build_object(
              'chemin', p_chemin, 'le', now(), 'depot', null, 'annonce_de_la_fiche', v_inv.vinted_item_id,
              'pose_par', 'armer_retraits_copies (serveur)'));
    if nullif(btrim(v_inv.vinted_account_id::text), '') is not null then
      v_pf := v_pf || jsonb_build_object('vinted_account_id', btrim(v_inv.vinted_account_id::text));
    end if;
    if p_delai is not null and p_delai > interval '0' then
      v_pf := v_pf || jsonb_build_object('next_action_after', to_jsonb(now() + p_delai));
    end if;
    insert into public.cross_post_jobs
      (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
    values
      (v_inv.user_id, v_inv.id, 'vinted', 'delete', 'pending', 'original', v_inv.titre,
       coalesce(v_url, 'https://www.vinted.fr') || '/items/' || v_inv.vinted_item_id,
       v_inv.vinted_item_id, v_pf);
    v_n := v_n + 1;
    v_pl := v_pl || 'vinted'::text;
  end if;
  if v_n > 0 then
    insert into public.usage_logs (user_id, feature, metadata)
    values (v_inv.user_id, 'retrait_annonces', jsonb_build_object(
      'chemin', p_chemin,
      'plateformes', (select coalesce(jsonb_agg(p order by p), '[]'::jsonb) from unnest(v_pl) as p),
      'n_annonces', v_n,
      'n_articles', 1,
      'article_id', v_inv.id::text));
  end if;
  return jsonb_build_object('armes', v_n, 'plateformes', to_jsonb(v_pl));
end;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_importer(p_user uuid, p_annonce_id uuid, p_par text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_cap jsonb; v_photos jsonb; v_attr jsonb; v_cle text;
  v_new_inv bigint; v_job uuid; v_titre text; v_prix numeric;
  v_tn text; v_jumeau bigint; v_jumeau_titre text;
  v_homo bigint; v_homo_titre text; v_homo_statut text; v_homo_n integer;
  v_q_inv bigint; v_q_motif text; v_q_preuves jsonb; v_q_posee boolean := false;
BEGIN
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id AND user_id = p_user FOR UPDATE;
  IF a.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'annonce_introuvable'); END IF;
  IF a.inventaire_id IS NOT NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'deja_rattachee'); END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : jamais d'article créé depuis
  --    une annonce que rien ne prouve être au vendeur — geste manuel compris
  --    (Louis, 19/09 : une balance Wii d'un autre vendeur importée à la main).
  IF releve_run_hors_liste(a.run_id) THEN RETURN jsonb_build_object('ok', false, 'reason', 'hors_liste'); END IF;
  v_titre := COALESCE(NULLIF(trim(a.titre), ''), 'Annonce ' || a.platform);
  v_prix := a.prix;

  -- ── LA GARDE DU JUMEAU (2026-09-20) ──────────────────────────────────────
  -- Le relevé du 19/09 a créé trois lignes d'inventaire neuves pour trois
  -- articles déjà présents : le faisceau compare les titres MOT À MOT, et un
  -- préfixe de référence (« FIG001 - Jeux/Jouets - ») fait tomber le
  -- recouvrement sous la barre. L'annonce finit dans la bande « aucune »,
  -- seule bande où l'import automatique crée sans demander.
  -- On ajoute l'inclusion d'un titre dans l'autre, aux frontières de mots,
  -- les deux normalisés à plus de 12 caractères. Mesuré sur 200 annonces non
  -- rattachées tirées au hasard : 3 gagnent un candidat, et les trois sont
  -- justes ; 108 avaient déjà un titre exact (inchangées) ; 89 ne bougent pas.
  -- ⛔ ON PRÉVIENT, ON N'INTERDIT PAS : au lieu de créer, on POSE la
  --    proposition sur l'annonce (motif `titre_inclus`) — l'écran de
  --    rattachement affiche « C'est peut-être… » avec son bouton.
  -- ⛔ Le geste MANUEL n'est pas touché ici (p_par = 'utilisateur').
  -- ⛔ Le refus est tracé UNE FOIS (decision 'refus_jumeau') : sans trace,
  --    « pourquoi celle-ci n'est pas entrée ? » redevient une reconstitution.
  -- ⛔ Le titre de SECOURS (« Annonce vinted ») ne reconnaît rien : on part du
  --    titre RÉEL, ou on ne cherche pas.
  v_tn := titre_norm(NULLIF(trim(a.titre), ''));

  -- ── L'IMPORT RECONNAÎT LES FICHES EXISTANTES, VENDUES COMPRISES (2026-09-26) ──
  -- labouquinerie85, relevé Opla du 24/09 : 9 fiches créées sous le titre exact
  -- d'un article VENDU, 1 sous celui d'un article en stock déjà publié. Le
  -- premier tour du moteur ne voit que le stock sans annonce sur la
  -- plateforme ; ces fiches existantes lui étaient invisibles.
  -- ⛔ ON NE CRÉE PAS, ON DEMANDE : même titre (titre_norm, ou mêmes mots qui
  --    comptent) qu'une fiche en stock OU vendue → proposition posée sur
  --    l'annonce ; la personne tranche. Jamais de rattachement automatique à
  --    une fiche vendue ou déjà publiée : un titre ne prouve pas l'exemplaire.
  -- ⛔ Le geste MANUEL n'est pas touché (p_par = 'utilisateur').
  IF p_par IS DISTINCT FROM 'utilisateur' AND COALESCE(v_tn, '') <> ''
     AND COALESCE(array_length(titre_jetons(a.titre), 1), 0) > 0 THEN
    SELECT i.id, i.titre, i.statut, count(*) OVER ()
      INTO v_homo, v_homo_titre, v_homo_statut, v_homo_n
      FROM inventaire i
     WHERE i.user_id = p_user AND i.fusionne_dans IS NULL AND i.statut IN ('stock', 'vendu')
       AND (titre_norm(i.titre) = v_tn OR titre_jetons(i.titre) = titre_jetons(a.titre))
     ORDER BY (i.statut = 'stock') DESC, (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    -- (2026-09-27, audit synchro) ON CRÉE, ET ON DEMANDE : l'annonce entre
    -- dans le stock ; la fiche de même titre (en stock ou VENDUE) devient la
    -- question « Est-ce le même article ? » posée sur la fiche créée. Retenir
    -- l'annonce hors du stock laissait des articles en ligne invisibles (784
    -- mesurées le 27/09) et, quand la fiche de même titre était vendue, une
    -- annonce en vente d'un objet déjà vendu que rien ne reliait à la vente.
    IF v_homo IS NOT NULL THEN
      v_q_inv := v_homo;
      v_q_motif := CASE WHEN v_homo_statut = 'vendu' THEN 'homonyme_vendu' ELSE 'homonyme_en_stock' END;
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_homo_titre,
                                        'statut_fiche', v_homo_statut, 'homonymes', v_homo_n,
                                        'signaux', jsonb_build_object('exact', titre_norm(v_homo_titre) = v_tn));
    END IF;
  END IF;

  -- (2026-09-27) La proposition du moteur (bande « propose » du relevé en
  -- cours, ou annonce retenue par un relevé passé) désigne la fiche à qui
  -- poser la question, faute d'homonyme exact.
  IF v_q_inv IS NULL AND p_par IS DISTINCT FROM 'utilisateur' AND a.proposition IS NOT NULL
     AND NULLIF(a.proposition ->> 'inventaire_id', '') IS NOT NULL THEN
    v_q_inv := (a.proposition ->> 'inventaire_id')::bigint;
    v_q_motif := COALESCE(NULLIF(a.proposition ->> 'motif', ''), 'proposition');
    v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'proposition', a.proposition,
                                      'signaux', jsonb_build_object(
                                        'ov', a.proposition -> 'signaux' -> 'recouvrement',
                                        'prix', CASE WHEN a.proposition -> 'signaux' ->> 'prix' = 'exact' THEN 'egal' END));
  END IF;
  IF v_q_inv IS NULL AND p_par IS DISTINCT FROM 'utilisateur' AND length(COALESCE(v_tn, '')) > 12 THEN
    SELECT i.id, i.titre INTO v_jumeau, v_jumeau_titre
      FROM inventaire i
     WHERE i.user_id = p_user
       AND i.statut = 'stock'
       AND i.disparu_le IS NULL
       AND i.fusionne_dans IS NULL
       AND length(titre_norm(i.titre)) > 12
       AND NOT titres_variantes_incompatibles(a.titre, i.titre) -- AJOUT 2026-09-24 : une autre couleur n'est pas un jumeau
       AND (' ' || v_tn || ' ' LIKE '% ' || titre_norm(i.titre) || ' %'
            OR ' ' || titre_norm(i.titre) || ' ' LIKE '% ' || v_tn || ' %')
     ORDER BY (titre_norm(i.titre) = v_tn) DESC, i.created_at ASC
     LIMIT 1;
    -- (2026-09-27) le titre inclus ne retient plus l'annonce : il se demande.
    IF v_jumeau IS NOT NULL THEN
      v_q_inv := v_jumeau; v_q_motif := 'titre_inclus';
      v_q_preuves := jsonb_build_object('titre_annonce', v_titre, 'titre_article', v_jumeau_titre,
                                        'signaux', jsonb_build_object('ov', 0.8));
    END IF;
  END IF;

  -- (2026-09-27, décision de Nico) DEUX ANNONCES SUR LA MÊME PLATEFORME SONT
  -- DEUX EXEMPLAIRES : la fiche candidate porte déjà une annonce (ou un
  -- dépôt) sur CETTE plateforme → aucune question, aucun rattachement.
  IF v_q_inv IS NOT NULL AND (
       EXISTS (SELECT 1 FROM cross_post_jobs x
                WHERE x.user_id = p_user AND x.inventaire_id = v_q_inv AND x.platform = a.platform
                  AND x.action IN ('publish', 'republish') AND x.status IN ('published', 'sold', 'pending', 'processing', 'needs_user'))
    OR EXISTS (SELECT 1 FROM annonces_plateforme ap2
                WHERE ap2.user_id = p_user AND ap2.inventaire_id = v_q_inv AND ap2.platform = a.platform AND ap2.disparu_le IS NULL)) THEN
    v_q_inv := NULL; v_q_motif := NULL; v_q_preuves := NULL;
  END IF;

  -- (2026-09-27, décision de Nico) UNE FICHE VENDUE EST COMPARÉE AU RELEVÉ :
  -- l'annonce d'une AUTRE plateforme qui porte EXACTEMENT le titre d'une fiche
  -- VENDUE, seule de ce titre sur le compte, est cet objet déjà vendu
  -- (labouquinerie85 : La présidente, Triominos, Solaris). Elle est rattachée à
  -- la fiche vendue et son RETRAIT est armé (vente prouvée) — jamais une
  -- nouvelle fiche « en stock » d'un objet déjà parti.
  -- (27/09 soir) RETIRÉ : le rattachement d'une annonce à une fiche VENDUE sur
  -- son seul titre (releve_fiche_vendue) — il a retiré deux annonces Beebs de
  -- Louis encore à vendre (mêmes titres, articles différents). L'annonce est
  -- importée comme sa propre fiche ; la question « Déjà vendu ? »
  -- (homonyme_vendu) est posée plus bas : la personne tranche.


  -- inventaire.id n'a pas de DEFAULT (convention du front : horodatage ms).
  v_new_inv := (extract(epoch FROM clock_timestamp()) * 1000)::bigint;
  WHILE EXISTS (SELECT 1 FROM inventaire WHERE id = v_new_inv) LOOP v_new_inv := v_new_inv + 1; END LOOP;
  v_cap := a.capture;
  v_photos := CASE
    WHEN jsonb_typeof(v_cap -> 'photos') = 'array' AND jsonb_array_length(v_cap -> 'photos') > 0 THEN v_cap -> 'photos'
    WHEN a.photo_url IS NOT NULL THEN jsonb_build_array(a.photo_url)
    ELSE NULL END;
  v_attr := '{}'::jsonb;
  FOR v_cle IN SELECT unnest(ARRAY['taille', 'etat', 'couleur', 'matiere', 'marque']) LOOP
    IF NULLIF(trim(v_cap ->> v_cle), '') IS NOT NULL THEN
      v_attr := v_attr || jsonb_build_object(v_cle, jsonb_build_object('v', trim(v_cap ->> v_cle), 'source', 'releve_' || a.platform, 'at', now()));
    END IF;
  END LOOP;
  INSERT INTO inventaire (id, user_id, titre, prix_vente, statut, plateforme, origine, quantite, photos, attributs,
                          description, marque, first_seen_at, last_synced_at, photos_a_rapatrier)
  VALUES (v_new_inv, p_user, v_titre, v_prix, 'stock', a.platform, 'releve_' || a.platform, 1,
          v_photos, v_attr,
          NULLIF(trim(v_cap ->> 'description'), ''), NULLIF(trim(v_cap ->> 'marque'), ''), now(), now(),
          -- La fiche entre dans la file dès qu'elle a une photo, quelle qu'en
          -- soit l'adresse : c'est handler-watch qui sait ce qui est à nous.
          v_photos IS NOT NULL);
  v_job := rapprocher_job_de_suivi(p_user, a.platform, v_new_inv, v_titre, v_prix, a.url, a.listing_id, p_par,
                                   jsonb_build_object('annonce_id', a.id, 'import', true));
  UPDATE annonces_plateforme
     SET inventaire_id = v_new_inv, job_id = v_job,
         source_rapprochement = CASE WHEN p_par = 'utilisateur' THEN 'manuel' ELSE 'automatique' END,
         proposition = NULL, ignoree_le = NULL, fiche_supprimee_le = NULL, updated_at = now()
   WHERE id = a.id;
  -- (2026-09-27) la question « Est-ce le même article ? », posée sur la fiche
  -- créée (jamais un rattachement : la personne tranche, « oui » fusionne).
  IF v_q_inv IS NOT NULL THEN
    v_q_posee := releve_poser_question(p_user, v_q_inv, v_new_inv, v_q_motif,
                   COALESCE(v_q_preuves, '{}'::jsonb) || jsonb_build_object('annonce_id', a.id, 'platform', a.platform,
                                                                         'listing_id', a.listing_id, 'url', a.url, 'prix', a.prix));
  END IF;
  INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
  VALUES (p_user, a.id, v_new_inv, 'import', p_par, 1, jsonb_build_object('job_id', v_job)
          || CASE WHEN v_q_inv IS NOT NULL
                  THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                  ELSE '{}'::jsonb END);
  RETURN jsonb_build_object('ok', true, 'decision', 'import', 'inventaire_id', v_new_inv, 'job_id', v_job)
         || CASE WHEN v_q_inv IS NOT NULL
                 THEN jsonb_build_object('question', jsonb_build_object('inventaire_id', v_q_inv, 'motif', v_q_motif, 'posee', v_q_posee))
                 ELSE '{}'::jsonb END;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rapprocher_traiter_annonce(p_annonce_id uuid, p_vus text[], p_import_ouvert boolean, p_rattrapage boolean DEFAULT false, p_second_releve_requis boolean DEFAULT true)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  a annonces_plateforme%ROWTYPE;
  v_user uuid; v_pf text; v_run uuid; v_trace jsonb;
  v_cl jsonb; v_bande text; v_job uuid; v_inv bigint; v_imp jsonb;
BEGIN
  -- Verrou de ligne : le relevé de l'extension et un rattrapage ne peuvent
  -- pas traiter la même annonce en même temps ; le second la trouve traitée.
  SELECT * INTO a FROM annonces_plateforme WHERE id = p_annonce_id FOR UPDATE;
  IF a.id IS NULL THEN RETURN 'introuvable'; END IF;
  IF a.inventaire_id IS NOT NULL OR a.ignoree_le IS NOT NULL THEN RETURN 'deja_traitee'; END IF;
  -- ⛔ HORS « MES ANNONCES » (2026-09-25 nuit) : lue par un relevé dont la
  --    page n'était pas la liste du compte — ni import, ni rattachement.
  IF releve_run_hors_liste(a.run_id) THEN RETURN 'hors_liste'; END IF;
  v_user := a.user_id; v_pf := a.platform; v_run := a.run_id;
  v_trace := jsonb_build_object('run_id', v_run)
             || CASE WHEN p_rattrapage THEN jsonb_build_object('rattrapage', true) ELSE '{}'::jsonb END;

  -- ── UNE NOTIFICATION N'EST PAS UNE ANNONCE (2026-09-19) — mot pour mot ──
  IF annonce_lien_notification(a.url) THEN
    UPDATE annonces_plateforme SET ignoree_le = now(), proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'ignore', 'auto', 0,
            v_trace || jsonb_build_object('motif', 'notification_plateforme', 'platform', v_pf, 'titre', a.titre,
                                          'ni_nt', substring(a.url from 'ni_nt(?:%3A|%3a|:|=)([A-Za-z0-9_]+)')));
    RETURN 'notification';
  END IF;

  v_cl := rapprocher_classer(v_user, v_pf, a.listing_id, a.url, a.titre, a.prix, p_vus);
  v_bande := v_cl ->> 'bande';
  v_job := NULLIF(v_cl ->> 'job_id', '')::uuid;
  v_inv := NULLIF(v_cl ->> 'inventaire_id', '')::bigint;

  -- ── JOB : l'identifiant est un dépôt FillSell ───────────────────────────
  IF v_bande = 'job' THEN
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1, v_trace || jsonb_build_object('job_id', v_job));
    IF a.statut_plateforme = 'en_ligne' THEN
      UPDATE cross_post_jobs
         SET platform_fields = (platform_fields - ARRAY['unavailable_since', 'unavailable_pending_since', 'sale_signal', 'detected_price', 'alerte_masquee_pour', 'alerte_masquee_le'])
                               || jsonb_build_object('revue_en_ligne_par_releve', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job AND (platform_fields ? 'unavailable_since' OR platform_fields ? 'unavailable_pending_since');
    END IF;
    RETURN 'job';
  END IF;

  -- ── JOB CLOS (2026-09-25) : l'identifiant est un dépôt FillSell annulé/vendu ──
  -- On RATTACHE à la fiche d'origine, jamais d'import. Le dépôt clos garde son
  -- histoire ; un job de suivi porte l'annonce vivante. Le STATUT de la fiche
  -- n'est jamais basculé ici (une vente en main propre a la même trace qu'un
  -- faux « vendu » : c'est la personne qui tranche) :
  --   · fiche 'vendu' → le job de suivi part 'cancelled' + pending_removal :
  --     le bandeau EXISTANT « Vendu — encore en ligne sur X, retirer ? » ;
  --   · fiche en stock → job de suivi 'published', comme un rattachement normal.
  IF v_bande = 'job_clos' THEN
    v_job := rapprocher_job_de_suivi(v_user, v_pf, v_inv, a.titre, a.prix, a.url, a.listing_id, 'auto',
               v_trace || jsonb_build_object('annonce_id', a.id, 'motif', 'identifiant_depot_clos',
                                             'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    IF (v_cl ->> 'statut_fiche') = 'vendu' THEN
      UPDATE cross_post_jobs
         SET status = 'cancelled',
             platform_fields = platform_fields || jsonb_build_object('pending_removal', true,
                               'vendu_encore_en_ligne', jsonb_build_object('run_id', v_run, 'at', now()))
       WHERE id = v_job;
    END IF;
    UPDATE annonces_plateforme SET inventaire_id = v_inv, job_id = v_job, source_rapprochement = 'job', proposition = NULL, updated_at = now() WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'attache', 'job', 1,
            v_trace || jsonb_build_object('job_id', v_job, 'motif', 'identifiant_depot_clos',
                                          'depot_clos', v_cl ->> 'job_id', 'statut_fiche', v_cl ->> 'statut_fiche'));
    RETURN 'job';
  END IF;

  -- ── CERTAIN : un seul candidat, titre exact, prix égal, aucun homonyme ──
  -- (2026-09-27, décision de Nico) « titre identique + même prix + un seul
  -- candidat » ne rattache qu'ENTRE PLATEFORMES DIFFÉRENTES. Un candidat qui
  -- est un dépôt de la MÊME plateforme, c'est un AUTRE exemplaire (les 11
  -- rangements de Louis sur Beebs) : l'annonce est importée comme sa propre
  -- fiche, jamais rattachée, jamais proposée à la fusion.
  IF v_bande = 'certain' AND v_job IS NOT NULL THEN
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      UPDATE annonces_plateforme SET proposition = NULL, updated_at = now() WHERE id = a.id;
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    END IF;
    RETURN 'aucune';
  END IF;
  -- (27/09 soir) UN TITRE N'EST JAMAIS UNE PREUVE : la bande « certain »
  -- (titre exact + prix égal + candidat unique) ne rattache plus. L'annonce
  -- entre dans le stock comme sa fiche, et rapprocher_importer pose la
  -- question « Est-ce le même article ? » — la personne tranche.
  IF v_bande = 'certain' THEN
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      UPDATE annonces_plateforme SET proposition = NULL, updated_at = now() WHERE id = a.id;
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    END IF;
    RETURN 'aucune';
  END IF;

  -- ── PROPOSE : rien sur les jobs, la proposition vit sur l'annonce ───────
  IF v_bande = 'propose' THEN
    -- (2026-09-27, audit synchro) Une annonce EN LIGNE n'attend plus une
    -- réponse HORS du stock : elle est importée plus bas, et la proposition
    -- devient une QUESTION posée sur la fiche importée (« Est-ce le même
    -- article ? »). Le rattrapage ne s'arrête sur « inchangée » que si
    -- l'import est impossible (interrupteur fermé, annonce pas en ligne,
    -- fiche supprimée exprès par la personne).
    IF p_rattrapage AND a.proposition IS NOT NULL
       AND NOT (p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL)
       AND (a.proposition ->> 'inventaire_id') IS NOT DISTINCT FROM v_inv::text
       AND (a.proposition ->> 'motif') IS NOT DISTINCT FROM (v_cl ->> 'motif') THEN
      RETURN 'propose_inchangee';
    END IF;
    UPDATE annonces_plateforme
       SET proposition = jsonb_build_object('inventaire_id', v_inv, 'job_id', v_job, 'motif', v_cl ->> 'motif', 'score', v_cl -> 'score',
                                            'candidats', COALESCE(v_cl -> 'candidats', '[]'::jsonb),
                                            'candidats_total', v_cl -> 'candidats_total',
                                            'signaux', v_cl -> 'signaux',
                                            'choix_arbitraire', v_cl -> 'choix_arbitraire',
                                            'run_id', v_run, 'at', now()),
           updated_at = now()
     WHERE id = a.id;
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, v_inv, 'propose', 'auto', (v_cl ->> 'score')::numeric, v_trace || jsonb_build_object('job_id', v_job, 'motif', v_cl ->> 'motif'));
    -- (2026-09-27) TOUTE annonce en ligne entre dans le stock : la ressemblance
    -- (titre, prix) ne rattache pas, elle se DEMANDE. rapprocher_importer lit la
    -- proposition posée ci-dessus et en fait la question de la fiche importée.
    IF p_import_ouvert AND a.statut_plateforme = 'en_ligne' AND a.fiche_supprimee_le IS NULL THEN
      v_imp := rapprocher_importer(v_user, a.id, 'auto');
      IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    END IF;
    RETURN 'propose';
  END IF;

  -- ── AUCUN CANDIDAT ──────────────────────────────────────────────────────
  IF NOT p_rattrapage THEN
    INSERT INTO rapprochements (user_id, annonce_id, inventaire_id, decision, par, score, detail)
    VALUES (v_user, a.id, NULL, 'aucune', 'auto', 0,
            v_trace || jsonb_build_object('motif', COALESCE(v_cl ->> 'motif', 'aucun_candidat'), 'platform', v_pf, 'titre', a.titre, 'prix', a.prix));
  END IF;
  -- IMPORT AUTOMATIQUE (point F, 18/09) — les trois conditions, ici.
  IF p_import_ouvert AND a.statut_plateforme = 'en_ligne'
     AND (NOT p_second_releve_requis
          OR EXISTS (SELECT 1 FROM rapprochements r
                      WHERE r.annonce_id = a.id AND r.decision = 'aucune'
                        AND COALESCE(r.detail ->> 'run_id', '') <> COALESCE(v_run::text, '')))
     -- ⛔ 2026-09-24 — QUATRIÈME CONDITION, PRÉCISE : jamais ressusciter une
     --    fiche que le vendeur a SUPPRIMÉE en gardant l'annonce en ligne
     --    (inventaire_supprimer_sans_retrait pose fiche_supprimee_le). C'est CE
     --    marqueur qui coupe la boucle de Louis — pas « déjà importée une fois »
     --    (23/09), qui bloquait aussi une annonce dont la fiche avait disparu
     --    par un autre chemin. Règle : tout ce qui est en ligne et absent du
     --    stock devient un article. Un rattachement ou un import MANUEL efface
     --    le marqueur (rapprochement_decider, rapprocher_importer).
     AND a.fiche_supprimee_le IS NULL
  THEN
    v_imp := rapprocher_importer(v_user, a.id, 'auto');
    IF COALESCE((v_imp ->> 'ok')::boolean, false) THEN RETURN 'import'; END IF;
    IF v_imp ->> 'reason' = 'jumeau_probable' THEN RETURN 'import_refuse'; END IF;
  END IF;
  RETURN 'aucune';
END;
$function$;

CREATE OR REPLACE FUNCTION public.doublons_examiner_fiche(p_fiche bigint)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_f inventaire%ROWTYPE; v_res jsonb; v_prec jsonb; v_jb text[]; v_cands jsonb; v_e jsonb; v_fus jsonb;
  n_fusions integer := 0; n_propositions integer := 0;
  v_debut timestamptz := clock_timestamp();
BEGIN
  SELECT resultat INTO v_res FROM inventaire_doublons_verifies WHERE inventaire_id = p_fiche FOR UPDATE;
  IF v_res IS NULL OR NOT (v_res ? 'en_cours') THEN
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'non_reservee');
  END IF;
  -- Ce que la fiche portait AVANT la réservation (vide pour un premier examen).
  v_prec := v_res - 'en_cours' - 'essais';

  SELECT * INTO v_f FROM inventaire WHERE id = p_fiche;
  IF v_f.id IS NULL OR v_f.fusionne_dans IS NOT NULL OR v_f.statut IS DISTINCT FROM 'stock' THEN
    -- fusionnée, vendue ou retirée du stock depuis : plus rien à examiner
    UPDATE inventaire_doublons_verifies SET verifie_le = now(), resultat = v_prec || jsonb_build_object('sans_objet', now())
     WHERE inventaire_id = p_fiche;
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'sans_objet');
  END IF;

  v_jb := titre_jetons(v_f.titre);
  IF NOT urls_resolues(fiche_photos_toutes(v_f.id)
                       || COALESCE((SELECT array_agg(u) FROM (
                            SELECT unnest(fiche_photos_toutes(j.id)) u FROM (
                              SELECT i.id FROM inventaire i
                               WHERE i.user_id = v_f.user_id AND i.id <> v_f.id AND i.fusionne_dans IS NULL AND i.statut = 'stock'
                                 AND (i.created_at < v_f.created_at OR (i.created_at = v_f.created_at AND i.id < v_f.id))
                                 AND titre_jetons(i.titre) && v_jb
                                 AND NOT titres_variantes_incompatibles(i.titre, v_f.titre)
                               LIMIT 10) j) z), '{}'::text[]))
     AND v_f.created_at > now() - interval '2 hours' THEN
    -- on attend les empreintes (au plus 2 h : au-delà on décide sans elles) :
    -- la réservation est rendue, la fiche reviendra comme avant.
    IF v_prec = '{}'::jsonb THEN
      DELETE FROM inventaire_doublons_verifies WHERE inventaire_id = p_fiche;
    ELSE
      UPDATE inventaire_doublons_verifies SET resultat = v_prec WHERE inventaire_id = p_fiche;
    END IF;
    RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'attente_photos');
  END IF;

  v_cands := inventaire_doublons_pour(v_f.id);
  v_fus := NULL;
  FOR v_e IN SELECT e FROM jsonb_array_elements(v_cands) e ORDER BY (e ->> 'niveau' = 'certain') DESC LOOP
    -- (27/09 soir) jamais de fusion AUTOMATIQUE sur un motif de titre : elle
    -- devient la question « Est-ce le même article ? ».
    IF v_e ->> 'niveau' = 'certain' AND v_fus IS NULL AND COALESCE(v_e ->> 'motif', '') NOT LIKE 'titre%' THEN
      v_fus := inventaire_fusionner_pour(v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint,
                                         'auto (doublon certain : ' || COALESCE(v_e ->> 'motif', '') || ')');
      IF COALESCE((v_fus ->> 'ok')::boolean, false) THEN
        n_fusions := n_fusions + 1;
        INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source, fusion_id, decide_le, decide_par)
        VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'certain', 'fusionnee', v_e ->> 'motif',
                v_e, 'balayage', NULLIF(v_fus ->> 'fusion_id', '')::uuid, now(), 'auto')
        ON CONFLICT DO NOTHING;
      END IF;
    ELSIF v_e ->> 'niveau' IN ('probable', 'certain') THEN
      INSERT INTO inventaire_doublons (user_id, garde, absorbe, niveau, statut, motif, preuves, source)
      VALUES (v_f.user_id, (v_e ->> 'garde')::bigint, (v_e ->> 'absorbe')::bigint, 'probable', 'proposee', v_e ->> 'motif', v_e, 'balayage')
      ON CONFLICT DO NOTHING;
      IF FOUND THEN n_propositions := n_propositions + 1; END IF;
    END IF;
  END LOOP;

  -- Enregistré comme avant : premier examen = le résultat ; revue = l'ancien
  -- résultat complété, horodaté revue_le.
  UPDATE inventaire_doublons_verifies
     SET verifie_le = now(),
         resultat = CASE WHEN v_prec = '{}'::jsonb
                         THEN jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus)
                         ELSE v_prec || jsonb_build_object('candidats', jsonb_array_length(v_cands), 'fusion', v_fus)
                                     || jsonb_build_object('revue_le', now()) END
   WHERE inventaire_id = p_fiche;

  RETURN jsonb_build_object('fiche', p_fiche, 'issue', 'examinee', 'candidats', jsonb_array_length(v_cands),
                            'fusions', n_fusions, 'propositions', n_propositions,
                            'duree_ms', round(extract(epoch FROM clock_timestamp() - v_debut) * 1000));
END;
$function$;
