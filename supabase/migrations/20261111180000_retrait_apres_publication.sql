-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- (11/11/2026, L1 — chemins résiduels, relecture : points 14 et 4) LE CHOIX DE LA PERSONNE À LA SUPPRESSION, ET LE LIEN
-- TARDIF D'UNE ANNONCE PARTIE APRÈS LE RETRAIT DE SON ARTICLE
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Rapport : docs/enquetes/retrait-comptes-relies-1111/RAPPORT.md § 9. Règle : docs/regles/ventes-et-retraits.md (11/11).
-- Le filet SERVEUR du chemin 1 (update-job-status, _shared/publication-apres-retrait.js) arme le retrait d'une annonce
-- publiée par une tâche dont l'article a été retiré pendant qu'elle travaillait. Deux faits lui manquaient, que seule la
-- base peut saisir au bon moment :
--
-- 1. (point 14) LE CHOIX DE LA PERSONNE QUAND LA SUPPRESSION ANNULE LA TÂCHE. L'app (executerSuppression) et le filet
--    (inventaire_arme_retraits_avant_suppression) annulent les tâches de la fiche avec le MÊME texte, puis la fiche part
--    (clé étrangère SET NULL) : après coup, rien ne dit plus si la personne a choisi « Retirer aussi les annonces … et
--    supprimer » ou une suppression sans retrait (aucune annonce en ligne). À L'INSTANT de l'annulation, la fiche est
--    encore là : ce déclencheur y pose la marque `annulee_par_suppression` — `avec_retrait` = un retrait de CETTE fiche
--    était armé à cet instant (l'app l'insère quelques secondes avant d'annuler, le filet aussi ; fenêtre de 2 min, celle de
--    L1 — décision de Nico : un retrait par le logo de 10 min, encore en file, ne fait pas d'une suppression « simple » une
--    suppression « avec retrait »), `par` = l'app (geste direct) ou le filet (dans la suppression). Le filet A n'arme un
--    retrait que si `avec_retrait` est vrai. ⚠️ Reste ouvert : un retrait par le logo armé MOINS de 2 min avant compte encore
--    (l'insert du logo et celui de l'app sont identiques) — à fermer par une marque côté app, à la prochaine OTA.
--    Il ne lit que la ligne en cours et un index (cross_post_jobs_inventaire) ; il n'écrit que NEW.platform_fields.
--
-- 2. (point 4) LE LIEN QUI ARRIVE PLUS TARD. Une annonce partie sans lien ni numéro porte la marque
--    `retrait_apres_publication_attendu` (update-job-status). Ce déclencheur arme son retrait — la voie ordinaire, une
--    tâche « delete » par lien et numéro — quand le lien arrive, SEULEMENT si l'identité est PROUVÉE dans la même écriture :
--    `lien_retrouve_par_identifiant` (le relevé, par l'identifiant) ou `preuve_identifiant_beebs_acceptee` (update-job-status,
--    « Mes annonces » avant / après). ⛔ Jamais un lien retrouvé par le TITRE (recoverMissingListingUrls :
--    listing_url_recovery ; le filet anti-doublon de l'extension : staleJobExistingListingUrl) — règle absolue : jamais un
--    retrait sur un titre seul. Ceux-là gardent la marque et le disent (`lien_non_prouve`). Jamais l'ANCIENNE annonce d'une
--    republication (old_*). Jamais un second retrait de la même annonce. Une erreur ne fait JAMAIS échouer l'écriture du lien.
--    Déclencheur AFTER (la ligne est écrite) ; clause WHEN étroite : la marque présente, le lien qui apparaît.
--
-- EN AJOUT SEULEMENT : deux fonctions et deux déclencheurs neufs sur cross_post_jobs ; aucune fonction existante n'est
-- réécrite, aucune donnée n'est écrite par la migration. Coût : les deux clauses WHEN se lisent sur la ligne (aucune
-- lecture) ; les fonctions ne tournent que sur la transition visée (annulation par la suppression ; lien d'une tâche
-- marquée) — aucun balayage. Essai : base JETABLE seulement (scripts/essais/20261111180000_banc.mjs, définitions de prod).
-- Verrou : npm run selftest:publication-apres-retrait (§ 3). Inverse :
-- supabase/rollbacks/20261111180000_retrait_apres_publication_INVERSE.sql.
-- ⛔ pose_par ne contient pas « armer_retrait_job » ; chemin ne commence pas par « vente_ ».

SET lock_timeout = '5s';

-- ── 1. La marque du choix, à l'instant où la suppression annule la tâche ───────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cross_post_jobs_annulee_par_suppression()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_avec boolean := false;
begin
  begin
    select exists (
      select 1 from public.cross_post_jobs d
       where d.user_id = old.user_id and d.inventaire_id = old.inventaire_id and d.action = 'delete'
         and d.status in ('pending', 'processing', 'needs_user')
         and d.created_at > now() - interval '2 minutes')
      into v_avec;
    new.platform_fields := coalesce(new.platform_fields, '{}'::jsonb) || jsonb_build_object('annulee_par_suppression', jsonb_build_object(
      'le', now(), 'fiche', old.inventaire_id::text, 'avec_retrait', coalesce(v_avec, false),
      'par', case when pg_trigger_depth() > 1 then 'filet' else 'app' end, 'statut_avant', old.status));
  exception when others then
    -- Jamais une annulation bloquée : sans marque, le filet A ne retire rien (le choix reste inconnu).
    raise warning 'cross_post_jobs_annulee_par_suppression (tâche %) : %', old.id, sqlerrm;
  end;
  return new;
end;
$function$;

-- Le dernier des déclencheurs BEFORE (ordre alphabétique) : il voit le statut et le texte définitifs.
DROP TRIGGER IF EXISTS zzz_annulee_par_suppression ON public.cross_post_jobs;
CREATE TRIGGER zzz_annulee_par_suppression
  BEFORE UPDATE OF status ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (old.status IN ('pending', 'processing', 'needs_user') AND new.status = 'cancelled'
        AND old.inventaire_id IS NOT NULL AND coalesce(new.action, 'publish') <> 'delete'
        AND new.error IN ('Annulé : l''article a été supprimé du stock', 'Cancelled: the item was deleted from stock'))
  EXECUTE FUNCTION public.cross_post_jobs_annulee_par_suppression();

-- ── 2. Le lien tardif d'une annonce partie après le retrait de son article ────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.cross_post_jobs_retrait_apres_publication_lien()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET lock_timeout TO '3s'
AS $function$
declare
  v_pose    constant text := 'cross_post_jobs_retrait_apres_publication_lien (serveur)';
  v_chemin  constant text := 'publication_apres_retrait';
  v_le      text := to_char(now() at time zone 'utc', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"');
  v_pfn     jsonb := coalesce(new.platform_fields, '{}'::jsonb);
  v_pfo     jsonb := coalesce(old.platform_fields, '{}'::jsonb);
  v_att     jsonb := coalesce(v_pfn -> 'retrait_apres_publication_attendu', v_pfo -> 'retrait_apres_publication_attendu', '{}'::jsonb);
  v_url     text := nullif(btrim(coalesce(new.listing_url, '')), '');
  v_num     text := nullif(btrim(coalesce(new.platform_listing_id, '')), '');
  v_anciens text[];
  v_preuve  text;
  v_existant uuid;
  v_del     uuid;
  v_statut  text;
  v_pfr     jsonb;
begin
  begin
    -- Un numéro sûr : celui que la plateforme donne dans le lien prime (republication : la colonne a pu rester).
    if v_url is not null then
      v_num := coalesce(nullif(btrim(coalesce(public.identifiant_annonce_depuis_lien(new.platform, v_url), '')), ''), v_num);
    end if;
    -- Jamais l'ANCIENNE annonce d'une republication (celle que la personne retirait).
    v_anciens := array_remove(array[
      nullif(btrim(coalesce(v_pfn ->> 'old_platform_listing_id', v_pfo ->> 'old_platform_listing_id', '')), ''),
      public.identifiant_annonce_depuis_lien(new.platform, coalesce(v_pfn ->> 'old_listing_url', v_pfo ->> 'old_listing_url')),
      nullif(btrim(coalesce(v_pfn -> 'republish_snapshot' ->> 'platform_listing_id', v_pfo -> 'republish_snapshot' ->> 'platform_listing_id', '')), ''),
      public.identifiant_annonce_depuis_lien(new.platform, coalesce(v_pfn -> 'republish_snapshot' ->> 'listing_url', v_pfo -> 'republish_snapshot' ->> 'listing_url'))
    ], null);
    if v_num is null or v_num = any (v_anciens) then
      return null;
    end if;
    -- L'identité PROUVÉE dans cette écriture : par l'identifiant (relevé) ou par « Mes annonces » avant / après (Beebs).
    v_preuve := case
      when (v_pfn -> 'lien_retrouve_par_identifiant') is not null
           and (v_pfn -> 'lien_retrouve_par_identifiant') is distinct from (v_pfo -> 'lien_retrouve_par_identifiant') then 'lien_retrouve_par_identifiant'
      when (v_pfn -> 'preuve_identifiant_beebs_acceptee') is not null
           and (v_pfn -> 'preuve_identifiant_beebs_acceptee') is distinct from (v_pfo -> 'preuve_identifiant_beebs_acceptee') then 'preuve_identifiant_beebs_acceptee'
    end;
    if v_preuve is null then
      -- Lien retrouvé par le TITRE, ou d'origine non prouvée : jamais un retrait ; la marque reste et le dit.
      update public.cross_post_jobs
         set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('retrait_apres_publication_attendu',
               v_att || jsonb_build_object('lien_non_prouve', jsonb_build_object('le', v_le, 'numero', v_num,
                 'titre', (v_pfn -> 'listing_url_recovery') is distinct from (v_pfo -> 'listing_url_recovery'))))
       where id = new.id;
      return null;
    end if;
    if v_url is null and new.platform = 'leboncoin' and v_num ~ '^\d{6,}$' then
      v_url := 'https://www.leboncoin.fr/ad/vetements/' || v_num;
    elsif v_url is null and new.platform = 'vinted' and v_num ~ '^\d{6,}$' then
      v_url := 'https://www.vinted.fr/items/' || v_num;
    end if;
    -- Jamais un second retrait de la même annonce (par sa clé).
    select d.id into v_existant
      from public.cross_post_jobs d
     where d.user_id = new.user_id and d.platform = new.platform and d.action = 'delete'
       and d.status in ('pending', 'processing', 'needs_user')
       and (d.platform_listing_id = v_num or (v_url is not null and d.listing_url = v_url))
     limit 1;
    if v_existant is null then
      v_pfr := jsonb_build_object('arme_par', jsonb_build_object('chemin', v_chemin, 'motif', coalesce(v_att ->> 'motif', ''),
                 'le', now(), 'depot', new.id, 'pose_par', v_pose, 'preuve_identite', v_preuve));
      if new.platform = 'vinted' and nullif(btrim(coalesce(v_pfn ->> 'vinted_account_id', '')), '') is not null then
        v_pfr := v_pfr || jsonb_build_object('vinted_account_id', btrim(v_pfn ->> 'vinted_account_id'));
      end if;
      if new.platform = 'depop' and coalesce(v_pfn ->> 'depop_product_id', '') ~ '^[0-9]+$' then
        v_pfr := v_pfr || jsonb_build_object('depop_product_id', v_pfn -> 'depop_product_id');
      end if;
      insert into public.cross_post_jobs
        (user_id, inventaire_id, platform, action, status, photo_option, title, listing_url, platform_listing_id, platform_fields)
      values
        (new.user_id, new.inventaire_id, new.platform, 'delete', 'pending', 'original', left(coalesce(new.title, ''), 200), v_url, v_num, v_pfr)
      returning id, status into v_del, v_statut;
      -- Les gardes d'insertion ont le dernier mot : une ligne née close n'est pas un retrait armé.
      if v_del is null or v_statut not in ('pending', 'needs_user') then
        update public.cross_post_jobs
           set platform_fields = coalesce(platform_fields, '{}'::jsonb) || jsonb_build_object('retrait_apres_publication_attendu',
                 v_att || jsonb_build_object('retrait_ne_clos', jsonb_build_object('le', v_le, 'retrait', v_del, 'statut', v_statut)))
         where id = new.id;
        return null;
      end if;
    else
      v_del := v_existant;
    end if;
    update public.cross_post_jobs
       set platform_fields = (coalesce(platform_fields, '{}'::jsonb) - 'retrait_apres_publication_attendu')
             || jsonb_build_object('pending_removal', false,
                  'retrait_arme', jsonb_build_object('job', v_del, 'le', v_le, 'chemin', v_chemin),
                  'retrait_apres_publication', jsonb_build_object('le', v_le, 'motif', coalesce(v_att ->> 'motif', ''), 'retrait', v_del,
                    'par', v_pose, 'preuve_identite', v_preuve, 'deja_ouvert', v_existant is not null))
     where id = new.id;
    if v_existant is null then
      insert into public.usage_logs (user_id, feature, metadata)
      values (new.user_id, 'retrait_annonces', jsonb_build_object('chemin', v_chemin, 'plateformes', jsonb_build_array(new.platform),
        'n_annonces', 1, 'n_articles', 1, 'article_id', new.inventaire_id::text, 'motif', coalesce(v_att ->> 'motif', ''),
        'depot', new.id, 'retrait', v_del, 'par', v_pose, 'preuve_identite', v_preuve));
    end if;
  exception when others then
    -- Jamais l'écriture du lien bloquée : la marque reste, le prochain lien prouvé réessaiera.
    raise warning 'cross_post_jobs_retrait_apres_publication_lien (tâche %) : %', new.id, sqlerrm;
  end;
  return null;
end;
$function$;

DROP TRIGGER IF EXISTS zzz_retrait_apres_publication_lien ON public.cross_post_jobs;
CREATE TRIGGER zzz_retrait_apres_publication_lien
  AFTER UPDATE OF listing_url, platform_listing_id ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (new.status = 'published' AND coalesce(new.action, 'publish') IN ('publish', 'republish')
        AND (coalesce(old.platform_fields, '{}'::jsonb) ? 'retrait_apres_publication_attendu'
             OR coalesce(new.platform_fields, '{}'::jsonb) ? 'retrait_apres_publication_attendu')
        AND NOT (coalesce(new.platform_fields, '{}'::jsonb) ? 'retrait_apres_publication')
        AND (nullif(btrim(coalesce(new.listing_url, '')), '') IS NOT NULL OR nullif(btrim(coalesce(new.platform_listing_id, '')), '') IS NOT NULL)
        AND (new.listing_url IS DISTINCT FROM old.listing_url OR new.platform_listing_id IS DISTINCT FROM old.platform_listing_id))
  EXECUTE FUNCTION public.cross_post_jobs_retrait_apres_publication_lien();

-- Serveur seulement (un déclencheur n'a pas besoin du droit EXECUTE de l'appelant).
REVOKE ALL ON FUNCTION public.cross_post_jobs_annulee_par_suppression() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.cross_post_jobs_retrait_apres_publication_lien() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cross_post_jobs_annulee_par_suppression() TO service_role;
GRANT EXECUTE ON FUNCTION public.cross_post_jobs_retrait_apres_publication_lien() TO service_role;

RESET lock_timeout;
