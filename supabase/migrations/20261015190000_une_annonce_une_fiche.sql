-- ═══════════════════════════════════════════════════════════════════════════
-- 15/10 soir — UNE ANNONCE N'APPARTIENT JAMAIS À DEUX FICHES (Louis, règle de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas Louis (« Rangement Blanc et Bleu » / « Rangement Bleu et Blanc », 10 €) :
-- deux questions « Cette annonce Leboncoin est rattachée à 2 articles » sur les
-- republications 0015bdd9 (15/10 12:15) et 317adae1 (15/10 14:54).
-- CAUSE PROUVÉE :
--   1. 24/09 16:41 : le dépôt Leboncoin 7fe6a7b3 (fiche « Blanc et Bleu ») n'a
--      pas de lien ; l'extension (0.6.66) le retrouve sur « Mes annonces » PAR LE
--      TITRE et prend l'annonce 3275975415, déposée 27 s plus tôt par 801cc37f
--      pour la fiche « Bleu et Blanc » (adsubmit 201 → 3275975415) ;
--   2. 25/09 12:17 : le vrai dépôt de 7fe6a7b3 rend son identifiant
--      (sans_adsubmit 3276310850) : platform_listing_id le prend, listing_url
--      garde l'annonce de l'autre fiche — le job raconte DEUX annonces ;
--   3. 25/09 18:35 : le relevé rattache 3275975415 à la fiche de 7fe6a7b3
--      (lecture « lien d'abord » de l'époque) ;
--   4. 27/09 : la garde cross_post_jobs_lien_jamais_croise (UPDATE seulement)
--      et la réparation ne comparaient que platform_listing_id à l'identifiant
--      du dépôt — ce couple lien ≠ identifiant leur échappait ;
--   5. 15/10 14:54 : la republication automatique copie le couple incohérent
--      dans un job NEUF (INSERT, aucune garde) ; get-pending-jobs lit le lien
--      d'abord → « annonce partagée ».
-- LA RÈGLE :
--   1. le lien d'un job SUIT son identifiant (INSERT et UPDATE) : identifiant
--      certain du dépôt (Leboncoin), sinon l'identifiant écrit en dernier ; le
--      lien d'une autre annonce est remplacé par celui de l'annonce désignée
--      (ou vidé : l'extension le retrouve PAR L'IDENTIFIANT) ;
--   2. une annonce partagée se tranche SEULE : identifiants, puis photos, puis
--      l'IA (fonction rapprochement-ia, mode « annonces_partagees ») ; la
--      question n'est posée que si l'IA n'est pas sûre ;
--   3. annonce_partagee_reprendre / annonce_partagee_attribuer : la décision
--      s'applique par la fonction faite pour ça (defaire_croisement_annonce),
--      les jobs retenus repartent ; une republication capturée sur la MAUVAISE
--      annonce est recapturée (jamais recréée avec le contenu d'une autre).
-- Rien n'est retiré, aucune annonce modifiée, aucun crédit ne bouge.
-- Inverse : supabase/rollbacks/20261015190000_une_annonce_une_fiche.sql.

BEGIN;

-- ── 1. LE LIEN SUIT L'IDENTIFIANT ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cross_post_jobs_lien_suit_identifiant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_url_id     text;
  v_pid        text;
  v_cert       text;
  v_url        text;
  v_lien_avant text;
  v_url_change boolean;
  v_pid_change boolean;
BEGIN
  IF COALESCE(NEW.action, 'publish') NOT IN ('publish', 'republish') THEN RETURN NEW; END IF;
  v_url_id := annonce_id_job(NEW.platform, NEW.listing_url);
  v_pid := NULLIF(btrim(NEW.platform_listing_id), '');
  IF v_url_id IS NULL OR v_pid IS NULL OR v_url_id = v_pid THEN RETURN NEW; END IF;

  IF TG_OP = 'UPDATE' THEN
    v_url_change := NEW.listing_url IS DISTINCT FROM OLD.listing_url;
    v_pid_change := NEW.platform_listing_id IS DISTINCT FROM OLD.platform_listing_id;
  ELSE
    v_url_change := true; v_pid_change := true;
  END IF;

  -- L'identifiant certain : celui que Leboncoin a rendu au dépôt.
  IF NEW.platform = 'leboncoin' THEN
    v_cert := COALESCE(NULLIF(btrim(NEW.platform_fields #>> '{lbc_depot,adsubmit,id}'), ''),
                       NULLIF(btrim(NEW.platform_fields #>> '{lbc_depot,sans_adsubmit,id}'), ''));
    IF v_cert IS NOT NULL AND v_cert !~ '^\d{6,}$' THEN v_cert := NULL; END IF;
  END IF;
  -- Sinon, l'écriture la plus récente : un lien écrit SEUL emmène l'identifiant ;
  -- dans tous les autres cas (identifiant écrit seul, les deux, copie d'un job),
  -- c'est l'identifiant qui fait foi (même doctrine que listing_designe).
  IF v_cert IS NULL THEN
    v_cert := CASE WHEN v_url_change AND NOT v_pid_change THEN v_url_id ELSE v_pid END;
  END IF;

  v_lien_avant := NEW.listing_url;
  IF v_url_id <> v_cert THEN
    SELECT a.url INTO v_url
      FROM annonces_plateforme a
     WHERE a.user_id = NEW.user_id AND a.platform = NEW.platform AND a.listing_id = v_cert
       AND NULLIF(btrim(a.url), '') IS NOT NULL
     ORDER BY a.vu_le DESC NULLS LAST
     LIMIT 1;
    NEW.listing_url := v_url; -- inconnu : vide — l'extension le retrouve PAR L'IDENTIFIANT
  END IF;
  IF v_pid <> v_cert THEN NEW.platform_listing_id := v_cert; END IF;
  NEW.platform_fields := COALESCE(NEW.platform_fields, '{}'::jsonb) || jsonb_build_object('lien_suit_identifiant',
    jsonb_build_object('le', now(), 'op', TG_OP, 'retenu', v_cert, 'identifiant_avant', v_pid,
                       'lien_avant', v_lien_avant, 'lien_apres', NEW.listing_url));
  RAISE WARNING 'cross_post_jobs_lien_suit_identifiant : job % — lien % / identifiant % → %', NEW.id, v_url_id, v_pid, v_cert;
  RETURN NEW;
END
$function$;

-- Nom en « s » : après cross_post_jobs_lien_jamais_croise et lien_numero_beebs
-- (les déclencheurs BEFORE passent par ordre alphabétique) — la cohérence est
-- le dernier mot, quel que soit le chemin d'écriture.
DROP TRIGGER IF EXISTS cross_post_jobs_lien_suit_identifiant ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_lien_suit_identifiant
  BEFORE INSERT OR UPDATE OF listing_url, platform_listing_id ON public.cross_post_jobs
  FOR EACH ROW EXECUTE FUNCTION public.cross_post_jobs_lien_suit_identifiant();

-- ── 2. UN JOB RETENU PAR UNE ANNONCE PARTAGÉE REPART QUAND ELLE NE L'EST PLUS ──
-- Retenu = needs_user « annonce_partagee » (la question), ou pending avec
-- annonce_partagee.cascade.etat = 'a_trancher' (posé par get-pending-jobs le
-- temps que la cascade identifiants → photos → IA tranche).
CREATE OR REPLACE FUNCTION public.annonce_partagee_reprendre(p_job uuid, p_par text, p_raison text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j          record;
  v_lid      text;
  v_snap_url text;
  v_snap_pid text;
  v_n        integer;
  v_pf       jsonb;
  v_ap       jsonb;
  v_fusion   bigint;
  v_recap    boolean := false;
BEGIN
  SELECT * INTO j FROM cross_post_jobs WHERE id = p_job FOR UPDATE;
  IF j.id IS NULL THEN RETURN jsonb_build_object('ok', false, 'reason', 'introuvable'); END IF;
  IF NOT ((j.status = 'needs_user' AND j.platform_fields ->> 'needs_user_source' = 'annonce_partagee')
       OR (j.status = 'pending' AND j.platform_fields #>> '{annonce_partagee,cascade,etat}' IN ('a_trancher', 'incertain'))) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'pas_retenu', 'statut', j.status);
  END IF;
  v_lid := COALESCE(NULLIF(btrim(j.platform_listing_id), ''), annonce_id_job(j.platform, j.listing_url));
  v_pf := COALESCE(j.platform_fields, '{}'::jsonb);
  v_ap := COALESCE(v_pf -> 'annonce_partagee', '{}'::jsonb);

  -- La fiche du job a été fusionnée dans une autre : ce n'est plus un article à
  -- part — son geste n'a plus d'objet (la fiche gardée porte ses annonces).
  SELECT i.fusionne_dans INTO v_fusion FROM inventaire i WHERE i.id = j.inventaire_id;
  IF v_fusion IS NOT NULL THEN
    UPDATE cross_post_jobs SET
      status = 'cancelled',
      error = 'Cet article a été réuni avec une autre fiche : ce geste n''a plus d''objet. Rien n''a été retiré, ton annonce est intacte.',
      platform_fields = (v_pf - 'needs_user_source' - 'needsUserField' - 'needs_user_tick_le' - 'needs_user_actif_ms'
                         - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'next_action_after' - 'processing_since' - 'retenue_serveur')
        || jsonb_build_object('annonce_partagee', (v_ap - 'choix') || jsonb_build_object('tranche',
             jsonb_build_object('le', now(), 'par', 'fiche_fusionnee', 'garde', v_fusion, 'raison', p_raison)))
     WHERE id = j.id;
    RETURN jsonb_build_object('ok', true, 'issue', 'clos_fiche_fusionnee', 'fiche_gardee', v_fusion);
  END IF;

  IF v_lid IS NOT NULL THEN
    SELECT count(DISTINCT COALESCE(i.fusionne_dans, i.id)) INTO v_n
      FROM cross_post_jobs o
      JOIN inventaire i ON i.id = o.inventaire_id
     WHERE o.user_id = j.user_id AND o.platform = j.platform AND o.inventaire_id IS NOT NULL
       AND o.status IN ('pending', 'processing', 'published', 'needs_user')
       AND (listing_designe(v_lid, o.listing_url, o.platform_listing_id)
            OR annonce_id_job(o.platform, o.listing_url) = v_lid);
    IF v_n > 1 THEN RETURN jsonb_build_object('ok', false, 'reason', 'toujours_partagee', 'fiches', v_n, 'annonce', v_lid); END IF;
  END IF;

  -- Une republication capturée sur une AUTRE annonce que celle qu'elle désigne
  -- maintenant : la copie ne vaut rien, on relit la bonne (rien n'est retiré :
  -- étape 'captured', aucune suppression engagée).
  IF j.action = 'republish' AND COALESCE(v_pf ->> 'republish_step', 'a_capturer') = 'captured'
     AND v_pf ->> 'deleted_at' IS NULL THEN
    v_snap_url := annonce_id_job(j.platform, v_pf #>> '{republish_snapshot,listing_url}');
    v_snap_pid := NULLIF(btrim(v_pf #>> '{republish_snapshot,platform_listing_id}'), '');
    IF v_lid IS NULL OR (v_snap_url IS NOT NULL AND v_snap_url <> v_lid) OR (v_snap_pid IS NOT NULL AND v_snap_pid <> v_lid) THEN
      v_recap := true;
      v_pf := (v_pf - 'republish_snapshot' - 'capture_id' - 'republish_copie_servie' - 'champs_lus_sur_l_annonce'
               - 'champs_repris_de_l_annonce' - 'republish_etat_reel')
              || jsonb_build_object('republish_step', 'a_capturer',
                   'recapture_annonce_partagee', jsonb_build_object('le', now(), 'capture_sur', COALESCE(v_snap_url, v_snap_pid), 'annonce', v_lid));
    END IF;
  END IF;

  UPDATE cross_post_jobs SET
    status = 'pending',
    error = NULL,
    platform_fields = (v_pf - 'needs_user_source' - 'needsUserField' - 'needs_user_tick_le' - 'needs_user_actif_ms'
                       - 'needs_user_vu_le' - 'needs_user_vu_erreur' - 'next_action_after' - 'processing_since'
                       - 'retrait_bloque_url_partagee'
                       - CASE WHEN v_pf #>> '{retenue_serveur,motif}' = 'annonce_partagee_a_trancher' THEN 'retenue_serveur' ELSE '' END)
      || jsonb_build_object('annonce_partagee', (v_ap - 'choix') || jsonb_build_object(
           'cascade', jsonb_build_object('etat', 'tranche', 'le', now(), 'par', p_par, 'raison', p_raison),
           'tranche', jsonb_build_object('le', now(), 'par', p_par, 'annonce', v_lid, 'raison', p_raison)))
   WHERE id = j.id;
  RETURN jsonb_build_object('ok', true, 'issue', 'repris', 'annonce', v_lid, 'recapture', v_recap);
END
$function$;
REVOKE ALL ON FUNCTION public.annonce_partagee_reprendre(uuid, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annonce_partagee_reprendre(uuid, text, text) TO service_role;

-- ── 3. ATTRIBUER UNE ANNONCE PARTAGÉE À SA FICHE (décision de la cascade) ───
-- p_par : 'identifiant' | 'photo' | 'ia' — jamais la personne (sa réponse passe
-- par la question, get-pending-jobs). La fiche choisie doit être une des fiches
-- qui portent l'annonce. Le reste : defaire_croisement_annonce (les jobs des
-- autres fiches recâblés sur leur identifiant certain, sinon déliés ; un geste
-- destructeur sans identifiant annulé, rien n'est retiré), puis reprise des
-- jobs retenus.
CREATE OR REPLACE FUNCTION public.annonce_partagee_attribuer(
  p_user uuid, p_platform text, p_listing_id text, p_inventaire_garde bigint, p_par text, p_raison text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lid  text := NULLIF(btrim(p_listing_id), '');
  v_def  jsonb;
  v_rep  jsonb := '[]'::jsonb;
  r      record;
BEGIN
  IF p_user IS NULL OR v_lid IS NULL OR p_inventaire_garde IS NULL OR p_par NOT IN ('identifiant', 'photo', 'ia') THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'arguments');
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM cross_post_jobs o
     WHERE o.user_id = p_user AND o.platform = p_platform AND o.inventaire_id = p_inventaire_garde
       AND o.status IN ('pending', 'processing', 'published', 'needs_user', 'cancelled', 'sold')
       AND (listing_designe(v_lid, o.listing_url, o.platform_listing_id) OR annonce_id_job(o.platform, o.listing_url) = v_lid)) THEN
    RETURN jsonb_build_object('ok', false, 'reason', 'fiche_non_candidate');
  END IF;

  -- Les jobs retenus AVANT la décision (ceux qui seront recâblés n'y
  -- désigneront plus l'annonce ensuite).
  CREATE TEMP TABLE IF NOT EXISTS _ap_retenus (id uuid) ON COMMIT DROP;
  DELETE FROM _ap_retenus;
  INSERT INTO _ap_retenus
  SELECT o.id FROM cross_post_jobs o
   WHERE o.user_id = p_user AND o.platform = p_platform
     AND ((o.status = 'needs_user' AND o.platform_fields ->> 'needs_user_source' = 'annonce_partagee')
          OR (o.status = 'pending' AND o.platform_fields #>> '{annonce_partagee,cascade,etat}' IN ('a_trancher', 'incertain')))
     AND (o.platform_fields #>> '{annonce_partagee,annonce}' = v_lid
          OR listing_designe(v_lid, o.listing_url, o.platform_listing_id) OR annonce_id_job(o.platform, o.listing_url) = v_lid);

  v_def := defaire_croisement_annonce(p_user, p_platform, v_lid, p_inventaire_garde);
  -- defaire_croisement_annonce écrit « choix fait dans l'app » : ici c'est la cascade.
  UPDATE cross_post_jobs SET
    error = 'L''annonce visée est celle d''un autre article (' ||
            CASE p_par WHEN 'identifiant' THEN 'identifiant de l''annonce' WHEN 'photo' THEN 'photos identiques' ELSE 'vérifié par FillSell' END ||
            ') : rien n''a été retiré, ton annonce est intacte.'
   WHERE user_id = p_user AND platform = p_platform AND status = 'cancelled'
     AND platform_fields #>> '{lien_delie,annonce}' = v_lid
     AND (platform_fields #>> '{lien_delie,le}')::timestamptz >= now() - interval '1 minute';
  UPDATE annonces_plateforme SET
    source_rapprochement = CASE WHEN p_par = 'identifiant' THEN 'job' ELSE 'automatique' END,
    proposition = NULL, updated_at = now()
   WHERE user_id = p_user AND platform = p_platform AND listing_id = v_lid AND inventaire_id = p_inventaire_garde;

  FOR r IN SELECT id FROM _ap_retenus LOOP
    v_rep := v_rep || jsonb_build_object('job', r.id, 'resultat', annonce_partagee_reprendre(r.id, p_par, p_raison));
  END LOOP;
  RETURN jsonb_build_object('ok', true, 'annonce', v_lid, 'fiche', p_inventaire_garde, 'par', p_par, 'defaire', v_def, 'reprises', v_rep);
END
$function$;
REVOKE ALL ON FUNCTION public.annonce_partagee_attribuer(uuid, text, text, bigint, text, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.annonce_partagee_attribuer(uuid, text, text, bigint, text, text) TO service_role;

-- ── 4. LE TICK : la cascade passe aussi sur les annonces partagées ─────────
-- Les identifiants et les photos ne dépendent pas de l'interrupteur de l'IA
-- (rapprochement_ia_actif) ; l'étape IA, si (la fonction relit l'interrupteur).
-- Comptes actifs seulement, 3 par passage, aucun appel sans travail.
CREATE OR REPLACE FUNCTION public.rapprochement_ia_tick(p_comptes integer DEFAULT 3)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
declare
  r record;
  n integer := 0;
  ids jsonb := '[]'::jsonb;
  n_ap integer := 0;
  ids_ap jsonb := '[]'::jsonb;
  v_actif boolean := coalesce((select value from coin_config where key = 'rapprochement_ia_actif'), '0') = '1';
begin
  -- Annonces partagées (une annonce, deux fiches) : la cascade, puis la question.
  for r in
    select j.user_id
      from cross_post_jobs j
     where ((j.status = 'needs_user' and j.platform_fields ->> 'needs_user_source' = 'annonce_partagee'
             and coalesce(j.platform_fields #>> '{annonce_partagee,cascade,etat}', '') not in ('incertain'))
            or (j.status = 'pending' and j.platform_fields #>> '{annonce_partagee,cascade,etat}' = 'a_trancher'))
       and j.user_id in (select user_id from comptes_actifs(7))
     group by j.user_id
     order by min(j.created_at)
     limit 3
  loop
    perform net.http_post(
      url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/rapprochement-ia',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
      body := jsonb_build_object('user_id', r.user_id, 'mode', 'annonces_partagees'),
      timeout_milliseconds := 150000);
    n_ap := n_ap + 1;
    ids_ap := ids_ap || to_jsonb(r.user_id);
  end loop;

  if not v_actif then
    return jsonb_build_object('actif', false, 'annonces_partagees', n_ap, 'ids_ap', ids_ap);
  end if;
  for r in
    select d.user_id
      from inventaire_doublons d
     where d.statut = 'proposee'
       and d.motif not in ('annonce_en_double', 'deux_annonces_meme_plateforme', 'photo_meme_plateforme',
                           'meme_photo_deux_annonces_meme_plateforme', 'photo_deux_annonces', 'plusieurs_exemplaires_vivants',
                           'annonce_remplacee', 'remise_en_ligne_titre_court', 'copie_non_prouvee', 'homonyme_vendu')
       and not exists (
         select 1 from rapprochement_ia_verdicts v
          where v.user_id = d.user_id
            and v.paire = case when d.garde::text collate "C" < d.absorbe::text collate "C"
                               then d.garde::text || '|' || d.absorbe::text
                               else d.absorbe::text || '|' || d.garde::text end)
       and d.user_id in (select user_id from comptes_actifs(7))
     group by d.user_id
     order by min(d.created_at)
     limit greatest(1, least(p_comptes, 10))
  loop
    perform net.http_post(
      url := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/rapprochement-ia',
      headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', public.cron_secret()),
      body := jsonb_build_object('user_id', r.user_id, 'mode', 'appliquer', 'limite', 20),
      timeout_milliseconds := 150000);
    n := n + 1;
    ids := ids || to_jsonb(r.user_id);
  end loop;
  return jsonb_build_object('actif', true, 'comptes', n, 'ids', ids, 'annonces_partagees', n_ap, 'ids_ap', ids_ap);
end;
$function$;

-- ── 5. LA RÈGLE SUR L'EXISTANT : les liens incohérents du parc ──────────────
-- Relevé du 15/10 soir : 3 jobs vivants où le lien et l'identifiant désignent
-- deux annonces (Louis 7fe6a7b3 et 317adae1 ; josephinecerni df5db313, dont le
-- lien est l'ANCIENNE annonce supprimée à la republication du 04/10). On les
-- touche : le déclencheur ci-dessus les remet d'accord (trace lien_suit_identifiant).
UPDATE cross_post_jobs j SET listing_url = j.listing_url
 WHERE j.inventaire_id IS NOT NULL AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
   AND j.status IN ('published', 'pending', 'processing', 'needs_user')
   AND annonce_id_job(j.platform, j.listing_url) IS NOT NULL
   AND NULLIF(btrim(j.platform_listing_id), '') IS NOT NULL
   AND annonce_id_job(j.platform, j.listing_url) <> btrim(j.platform_listing_id);

-- L'annonce 3275975415 de Louis : le relevé du 25/09 l'avait rattachée à la
-- fiche de 7fe6a7b3 par le lien croisé. Son identifiant certain (adsubmit 201
-- du dépôt 801cc37f) la donne à « Rangement Bleu et Blanc » : la cascade
-- l'appliquera au premier passage (étape « identifiant ») ; rien n'est fait à
-- la main ici.

COMMIT;
