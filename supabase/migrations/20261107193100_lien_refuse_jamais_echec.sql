-- 20261107193100 — Un dépôt qui a LU son numéro n'est jamais « jamais réussi à récupérer son lien » (07/11 soir, rouges
-- famille 3/4 : 7e7f0769 d71db658, 187d5102 af37fa49 ; même chaîne pour a705b36c de63ca45, arrêté ensuite par la personne)
--
-- Constat vérifié en lecture le 07/11 soir (prod) :
--   · la personne remet l'article en ligne elle-même sur Vinted (« Republier » de la commande annulée) ; la synchro du
--     dressing en fait une fiche NEUVE (origine vinted_sync) avec son job de suivi publié (c3d14b37 05/11 10:22:37 →
--     10667288621 ; 9ab7e738 05/11 19:47:16 → 10677685596, VENDU depuis le 06/11 19:30) ;
--   · la remise en vente (remises_en_vente_tick, 10:25:00 / 19:50:00) crée la publication ; l'extension retrouve l'annonce
--     née du geste du vendeur (republier.nouvel_item, source « geste_du_vendeur ») et propose son numéro ;
--   · cross_post_jobs_lien_jamais_croise refuse le lien (lien_refuse : annonce_portee_par_un_autre_article — le job de
--     suivi de la fiche neuve le porte) → publication « published » sans lien ni numéro ;
--   · fail_publish_without_listing_url (cron 10, 03:30 UTC, 06/11) la clôt « failed » : « on n'a jamais réussi à récupérer
--     son lien … AVANT DE REPUBLIER … » — FAUX : le numéro était lu, l'article était en ligne (puis vendu pour af37fa49).
-- Parc : 3 dépôts en 60 jours (les trois ci-dessus) ; aucun dépôt « published » sans lien ne porte ce refus aujourd'hui.
--
-- LA RÈGLE (tous comptes, toutes plateformes) : fail_publish_without_listing_url n'écrit plus ce faux échec quand la
-- publication porte lien_refuse (portée / rattachée à un autre article) et qu'une fiche du compte porte encore ce numéro
-- (lien_refuse_fiche_porteuse : une autre fiche, ou la sienne après le « Oui » de la personne) : la publication n'est pas touchée (rien n'est écrit, rien n'est rendu), elle est
-- comptée « numero_lu_porte_ailleurs ». La question « Est-ce le même article ? », le recollage après le « Oui » et la
-- clôture quand l'annonce est vendue appartiennent à UN seul auteur, la règle du dépôt retrouvé de handler-watch
-- (_shared/depot-retrouve-releve.js, depot_retrouve_par_releve_0711, préparée en parallèle le 07/11 soir) : cette
-- migration n'en écrit pas une seconde version. Pour d71db658, la question existe déjà (a52891f4, posée par
-- remise_annulee_questions le 07/11 à 17:15). Tout autre cas (aucun lien_refuse, un « Non » de la personne sur la paire,
-- un numéro que plus aucune fiche ne porte) : les lignes d'avant, inchangées, et la boucle Leboncoin (72 h) aussi.
-- Les publications déjà « failed » ne sont pas réécrites ici (la règle du dépôt retrouvé les rejuge, 30 jours).
-- CPU : un appel de lien_refuse_fiche_porteuse par publication sans lien de plus de 2 h (Vinted) / 48 h — la boucle
-- existante, une fois par jour (mesure en lecture dans le rapport).
-- Définition réécrite depuis pg_get_functiondef EN PRODUCTION (07/11 soir, md5 c1b3e41d036c71cefc983b69a45015a6, sans CR) :
-- chaque ligne gardée, une ligne changée (le bilan), deux insertions ; inverse :
-- supabase/rollbacks/20261107193100_lien_refuse_jamais_echec_INVERSE.sql ; preuve (Postgres jetable) :
-- PREUVE_PG=embarque node scripts/preuve-lien-refuse-jamais-echec.mjs
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite, après le feu vert.

-- ── Garde : la prod est celle lue le 07/11 soir (ou cette migration est déjà passée) ──
DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.fail_publish_without_listing_url(timestamp with time zone)'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> 'c1b3e41d036c71cefc983b69a45015a6' AND position('lien_refuse_fiche_porteuse' IN v_d) = 0 THEN
    RAISE EXCEPTION 'fail_publish_without_listing_url a changé en prod depuis le 07/11 soir : repartir de pg_get_functiondef';
  END IF;
  -- Le déclencheur dont la règle lit la marque : inchangé depuis la lecture (motifs, clé lien_refuse.id_propose).
  SELECT replace(pg_get_functiondef('public.cross_post_jobs_lien_jamais_croise()'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> '504c016ab32df97242fd9fe5ec464e07' THEN
    RAISE EXCEPTION 'cross_post_jobs_lien_jamais_croise a changé en prod depuis le 07/11 soir : relire la marque lien_refuse';
  END IF;
END
$garde$;

-- ── 1. La fiche qui porte le numéro que le DÉPÔT a lu (NULL = la règle ne s'applique pas) ──
-- Le numéro : lien_refuse.id_propose, posé par cross_post_jobs_lien_jamais_croise quand il a refusé le lien parce qu'une
-- AUTRE fiche le porte (motifs annonce_portee_par_un_autre_article / annonce_rattachee_a_un_autre_article ; jamais
-- identifiant_certain_different). La porteuse, AUJOURD'HUI : un AUTRE dépôt publié ou vendu qui le désigne, l'annonce
-- relevée rattachée à une fiche, ou (Vinted) la fiche dont c'est le numéro ; fiche fondue → sa gardée. Ce peut être la
-- fiche du dépôt elle-même (après le « Oui » de la personne, la fusion lui a donné l'annonce : l'article est en ligne sur
-- SA fiche). Une AUTRE fiche que la personne a dite différente (« Non », fusion défaite) ne compte pas : le numéro lu
-- n'était pas cet article. Jamais un titre, jamais une photo : le numéro seul.
CREATE OR REPLACE FUNCTION public.lien_refuse_fiche_porteuse(p_job uuid)
 RETURNS bigint
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  WITH j AS (
    SELECT c.id, c.user_id, c.platform, c.inventaire_id,
           NULLIF(btrim(COALESCE(c.platform_fields #>> '{lien_refuse,id_propose}', '')), '') AS n
      FROM public.cross_post_jobs c
     WHERE c.id = p_job AND c.inventaire_id IS NOT NULL
       AND jsonb_typeof(c.platform_fields -> 'lien_refuse') = 'object'
       AND c.platform_fields #>> '{lien_refuse,motif}' IN ('annonce_portee_par_un_autre_article', 'annonce_rattachee_a_un_autre_article')
  ),
  porteuses AS (
    SELECT o.inventaire_id AS fiche
      FROM j JOIN public.cross_post_jobs o
        ON o.user_id = j.user_id AND o.platform = j.platform AND o.id <> j.id AND o.inventaire_id IS NOT NULL
       AND o.status IN ('published', 'sold') AND COALESCE(o.action, 'publish') IN ('publish', 'republish')
       AND public.listing_designe(j.n, o.listing_url, o.platform_listing_id)
    UNION
    SELECT a.inventaire_id
      FROM j JOIN public.annonces_plateforme a
        ON a.user_id = j.user_id AND a.platform = j.platform AND a.listing_id = j.n AND a.inventaire_id IS NOT NULL
       AND a.retiree_le IS NULL AND a.ignoree_le IS NULL
    UNION
    SELECT x.id
      FROM j JOIN public.inventaire x
        ON j.platform = 'vinted' AND x.user_id = j.user_id AND btrim(x.vinted_item_id) = j.n
  )
  SELECT f.id
    FROM j
    JOIN porteuses p ON true
    JOIN public.inventaire f0 ON f0.id = p.fiche AND f0.user_id = j.user_id
    JOIN public.inventaire f ON f.id = COALESCE(f0.fusionne_dans, f0.id) AND f.user_id = j.user_id AND f.fusionne_dans IS NULL
   WHERE j.n IS NOT NULL AND length(j.n) >= 4
     AND (f.id = j.inventaire_id OR (NOT EXISTS (SELECT 1 FROM public.inventaire_doublons q
                      WHERE q.user_id = j.user_id AND q.decide_par = 'utilisateur' AND q.statut = 'refusee'
                        AND least(q.garde, q.absorbe) = least(f.id, j.inventaire_id)
                        AND greatest(q.garde, q.absorbe) = greatest(f.id, j.inventaire_id))
     AND NOT EXISTS (SELECT 1 FROM public.inventaire_fusions u
                      WHERE u.user_id = j.user_id AND u.defait_le IS NOT NULL
                        AND least(u.garde, u.absorbe) = least(f.id, j.inventaire_id)
                        AND greatest(u.garde, u.absorbe) = greatest(f.id, j.inventaire_id))))
   ORDER BY (f.id <> j.inventaire_id) DESC, (f.statut = 'stock') DESC, f.id
   LIMIT 1;
$function$;
REVOKE ALL ON FUNCTION public.lien_refuse_fiche_porteuse(uuid) FROM PUBLIC, anon, authenticated, service_role;

-- ── 2. fail_publish_without_listing_url : définition de PROD du 07/11 soir, chaque ligne gardée ──
CREATE OR REPLACE FUNCTION public.fail_publish_without_listing_url(p_publie_apres timestamp with time zone DEFAULT NULL::timestamp with time zone)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j        record;
  v_ref    jsonb;
  v_url    text;
  n_jobs   integer := 0;
  n_rendu  integer := 0;
  n_liens  integer := 0;
  n_ailleurs integer := 0;
  v_ailleurs jsonb;
  n_numero_lu integer := 0;   -- (07/11 soir) dépôts dont le numéro lu est porté par une autre fiche : pas un échec
BEGIN
  FOR j IN
    SELECT id, user_id, platform, platform_listing_id, inventaire_id,
           COALESCE(published_at, created_at) AS repere
    FROM cross_post_jobs
    WHERE status = 'published'
      AND action = 'publish'
      AND listing_url IS NULL
      -- (1) L'IDENTIFIANT SUFFIT A NOMMER L'ANNONCE : un job qui l'a n'est
      --     jamais « sans lien ». Il peut suivre sa vente et la retirer.
      AND platform_listing_id IS NULL
      AND (p_publie_apres IS NULL OR COALESCE(published_at, created_at) >= p_publie_apres)
      AND COALESCE(published_at, created_at) < now() - (
        CASE
          WHEN platform = 'vinted' THEN interval '2 hours'
          WHEN platform = 'beebs'  THEN interval '7 days'
          ELSE interval '48 hours'
        END
      )
    ORDER BY COALESCE(published_at, created_at)
    FOR UPDATE SKIP LOCKED
  LOOP
    -- (2) LE LIEN DORT PEUT-ETRE DANS LE RELEVE DU COMPTE. On ne conclut pas
    --     a l'absence avant d'avoir regarde la ou il est le plus souvent.
    SELECT ap.url INTO v_url
    FROM annonces_plateforme ap
    WHERE ap.user_id = j.user_id
      AND ap.platform = j.platform
      AND ap.job_id = j.id
      AND ap.statut_plateforme = 'en_ligne'
      AND ap.url IS NOT NULL
    LIMIT 1;

    IF v_url IS NOT NULL THEN
      UPDATE cross_post_jobs SET
        listing_url = v_url,
        platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
          'lien_retrouve_au_balayage', jsonb_build_object(
            'at', now(), 'url', v_url,
            'source', 'annonces_plateforme (releve du compte)'
          )
        )
      WHERE id = j.id;
      n_liens := n_liens + 1;
      CONTINUE;
    END IF;

    -- (2 bis) BEEBS : LA MODÉRATION NE SE JUGE PAS (27/09, décision de Nico).
    --     « Une annonce Beebs sans lien, c'est normal : la modération se fait,
    --     le lien arrive ensuite. » Le lien est posé ci-dessus s'il est connu ;
    --     sinon le dépôt reste tel quel — jamais « non confirmé », jamais clos.
    IF j.platform = 'beebs' THEN
      CONTINUE;
    END IF;

    -- (24/10, point 6 — Short Okaïdi de louis-seller) L'article est EN LIGNE sur cette plateforme : sous une autre
    -- annonce de la MÊME fiche, ou par la fiche jumelle d'un compte FillSell relié (boutique partagée : la plateforme
    -- refuse le doublon). Même clôture que trancher_publications_sans_lien : sans rouge, sans inviter à republier.
    -- La publication est rendue comme avant (refund_publish_unconfirmed, inchangé).
    v_ailleurs := article_en_ligne_ailleurs(j.user_id, j.platform, j.inventaire_id, ARRAY[]::text[]);
    IF v_ailleurs IS NOT NULL THEN
      v_ref := refund_publish_unconfirmed(j.id);
      IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
      UPDATE cross_post_jobs SET status = 'cancelled',
        error = CASE WHEN v_ailleurs->>'issue' = 'article_en_ligne_ailleurs'
          THEN 'Ce dépôt n''a jamais été retrouvé en ligne sur ' || initcap(j.platform) || ', mais ton article y est en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ' : rien à refaire, rien n''est vendu.'
          ELSE 'Ce dépôt n''a pas été mis en ligne par ' || initcap(j.platform) || ' : ton article y est DÉJÀ en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ', publiée par ton compte FillSell relié — ' || initcap(j.platform)
               || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'repere', j.repere, 'source', 'sans_lien_48h', 'issue', v_ailleurs->>'issue',
            'annonce_en_ligne', v_ailleurs->>'listing_id', 'refund', v_ref))
       WHERE id = j.id AND status = 'published';
      n_ailleurs := n_ailleurs + 1;
      CONTINUE;
    END IF;
    -- ⛔ (07/11 soir, rouges famille 3/4 — 7e7f0769 d71db658, 187d5102 af37fa49) LE DÉPÔT A LU SON NUMÉRO : jamais
    --     « jamais réussi à récupérer son lien ». L'extension a lu le numéro de l'annonce qu'elle a publiée (ou que la
    --     personne a remise en ligne par « Republier »), le déclencheur cross_post_jobs_lien_jamais_croise l'a refusé parce
    --     qu'une AUTRE fiche du compte le porte (lien_refuse : annonce_portee_par_un_autre_article /
    --     annonce_rattachee_a_un_autre_article — la synchro avait fait une fiche neuve). L'article EST en ligne (ou vendu)
    --     sous ce numéro : ce n'est pas un échec, rien n'est écrit ici, aucune publication n'est rendue. La suite (question
    --     « Est-ce le même article ? », recollage après le « Oui », clôture si l'annonce est vendue) appartient à la règle
    --     du dépôt retrouvé (handler-watch, depot_retrouve_par_releve_0711), un seul auteur. Un « Non » de la personne sur
    --     la paire, ou un numéro que plus aucune fiche ne porte : la ligne d'avant, inchangée.
    IF public.lien_refuse_fiche_porteuse(j.id) IS NOT NULL THEN
      n_numero_lu := n_numero_lu + 1;
      CONTINUE;
    END IF;

    -- (3) La seulement : ni lien, ni identifiant, ni trace dans le releve.
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;

    UPDATE cross_post_jobs SET
      status = 'failed',
      error  =
        'Publication non confirmée : ton annonce n''a pas pu être retrouvée en ligne sur '
        || initcap(platform)
        || ' — on n''a jamais réussi à récupérer son lien, donc on ne peut ni suivre sa vente ni la retirer pour toi. '
        || 'Cette publication ne compte pas dans tes limites. '
        || '⚠️ AVANT DE REPUBLIER, va vérifier tes annonces sur ' || initcap(platform)
        || ' : si elle y est déjà, republier en créerait une deuxième.',
      platform_fields = COALESCE(platform_fields, '{}'::jsonb) || jsonb_build_object(
        'listing_url_abandon', jsonb_build_object(
          'at', now(),
          'repere', j.repere,
          'refund', v_ref
        )
      )
    WHERE id = j.id;
    n_jobs := n_jobs + 1;
  END LOOP;

  -- (09/10, chantier E) LEBONCOIN : UN DÉPÔT ACCEPTÉ (identifiant rendu au
  -- dépôt) MAIS JAMAIS VU EN LIGNE CONCLUT AU BOUT DE 72 H. La boucle ci-dessus
  -- écarte tout job qui porte son identifiant (« il peut suivre sa vente ») :
  -- un refus de modération Leboncoin ne concluait donc JAMAIS (sonde de
  -- l'extension : 1 417 passages bredouilles en 48 h sur la G-Shock de Nico,
  -- puis plus rien ; relevés d'import sur geste seulement depuis le 05/10).
  -- Preuve exigée, toutes réunies : aucun lien, jamais revue par la veille
  -- (vu_en_ligne_le), absente de TOUT relevé du compte, et la sonde de
  -- modération a lu « Mes annonces » COMPLÈTE au moins 3 fois sans elle, la
  -- dernière ≥ 2 h après le dépôt. Sinon : rien n'est écrit. Borné : 200 jobs.
  FOR j IN
    SELECT c.id, c.user_id, c.platform, c.platform_listing_id, c.inventaire_id, COALESCE(c.published_at, c.created_at) AS repere,
           c.platform_fields
      FROM cross_post_jobs c
     WHERE c.status = 'published' AND c.action IN ('publish', 'republish')
       AND c.platform = 'leboncoin'
       AND c.listing_url IS NULL AND c.vu_en_ligne_le IS NULL
       AND NOT (COALESCE(c.platform_fields, '{}'::jsonb) ? 'unavailable_since')   -- question déjà ouverte : réparation sur GO
       AND NULLIF(btrim(c.platform_listing_id), '') IS NOT NULL
       AND COALESCE(c.published_at, c.created_at) < now() - interval '72 hours'
       AND COALESCE((c.platform_fields #>> '{moderation_probe,misses}')::int, 0) >= 3
       AND _ts_ou_null(c.platform_fields #>> '{moderation_probe,last_miss_at}') >= COALESCE(c.published_at, c.created_at) + interval '2 hours'
       AND NOT EXISTS (SELECT 1 FROM annonces_plateforme ap
                        WHERE ap.user_id = c.user_id AND ap.platform = c.platform
                          AND ap.listing_id = ANY (ARRAY[NULLIF(btrim(c.platform_listing_id), ''),
                                                        c.platform_fields #>> '{lbc_depot,adsubmit,id}',
                                                        c.platform_fields #>> '{lbc_depot,sans_adsubmit,id}']))
     ORDER BY COALESCE(c.published_at, c.created_at)
     LIMIT 200
     FOR UPDATE SKIP LOCKED
  LOOP
    -- (24/10, point 6 — Short Okaïdi de louis-seller) L'article est EN LIGNE sur cette plateforme : sous une autre
    -- annonce de la MÊME fiche, ou par la fiche jumelle d'un compte FillSell relié (boutique partagée : la plateforme
    -- refuse le doublon). Même clôture que trancher_publications_sans_lien : sans rouge, sans inviter à republier.
    -- La publication est rendue comme avant (refund_publish_unconfirmed, inchangé).
    v_ailleurs := article_en_ligne_ailleurs(j.user_id, j.platform, j.inventaire_id, ARRAY[NULLIF(btrim(j.platform_listing_id), ''), j.platform_fields #>> '{lbc_depot,adsubmit,id}', j.platform_fields #>> '{lbc_depot,sans_adsubmit,id}']);
    IF v_ailleurs IS NOT NULL THEN
      v_ref := refund_publish_unconfirmed(j.id);
      IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
      UPDATE cross_post_jobs SET status = 'cancelled',
        error = CASE WHEN v_ailleurs->>'issue' = 'article_en_ligne_ailleurs'
          THEN 'Ce dépôt n''a jamais été retrouvé en ligne sur ' || initcap(j.platform) || ', mais ton article y est en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ' : rien à refaire, rien n''est vendu.'
          ELSE 'Ce dépôt n''a pas été mis en ligne par ' || initcap(j.platform) || ' : ton article y est DÉJÀ en ligne sous l''annonce '
               || (v_ailleurs->>'listing_id') || ', publiée par ton compte FillSell relié — ' || initcap(j.platform)
               || ' refuse les doublons. Rien à refaire, rien n''est vendu.' END,
        platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since','pas_encore_visible'])
          || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
            'le', now(), 'repere', j.repere, 'source', 'sonde_moderation_72h', 'issue', v_ailleurs->>'issue',
            'annonce_en_ligne', v_ailleurs->>'listing_id', 'refund', v_ref))
       WHERE id = j.id AND status = 'published';
      n_ailleurs := n_ailleurs + 1;
      CONTINUE;
    END IF;
    v_ref := refund_publish_unconfirmed(j.id);
    IF (v_ref->>'rembourse')::int > 0 THEN n_rendu := n_rendu + (v_ref->>'rembourse')::int; END IF;
    UPDATE cross_post_jobs SET
      status = 'failed',
      -- (27/10) Le motif dit l'absence constatée par la sonde, jamais « refusée par sa modération » (une déduction).
      error = 'Cette annonce est absente de tes annonces Leboncoin (« Mes annonces » relu en entier '
        || (j.platform_fields #>> '{moderation_probe,misses}') || ' fois depuis le dépôt), et Leboncoin n''a rien affiché à FillSell. Leboncoin refuse parfois une annonce juste après son dépôt, par exemple quand une annonce semblable est déjà en ligne : son motif est dans le mail « Votre annonce … a été refusée » qu''il t''a envoyé. '
        || 'Rien n''est vendu, ton article reste dans ton stock, et cette publication ne compte pas dans tes limites.',
      platform_fields = (COALESCE(platform_fields, '{}'::jsonb) - ARRAY['sale_signal','unavailable_since','unavailable_pending_since'])
        || jsonb_build_object('depot_jamais_en_ligne', jsonb_build_object(
          'le', now(), 'repere', j.repere, 'issue', 'refus_moderation_probable', 'source', 'sonde_moderation_72h',
          'sonde', j.platform_fields -> 'moderation_probe', 'refund', v_ref))
    WHERE id = j.id AND status = 'published';
    n_jobs := n_jobs + 1;
  END LOOP;

  RETURN jsonb_build_object('jobs_echoues', n_jobs, 'quotas_rendus', n_rendu, 'liens_retrouves', n_liens, 'en_ligne_ailleurs', n_ailleurs,
                            'numero_lu_porte_ailleurs', n_numero_lu);
END;
$function$;
REVOKE ALL ON FUNCTION public.fail_publish_without_listing_url(timestamp with time zone) FROM PUBLIC, anon, authenticated, service_role;
