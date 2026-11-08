-- 20261108143000 — « Réinitialiser » clôt les lignes de ses fiches ; une annonce n'a qu'UNE ligne vivante (08/11, ayadi007)
--
-- Constat (prod, 08/11, lecture seule) : ayadi007 réinitialise son inventaire à 11:00:38 puis 11:26:08 (rpc
-- supprimer_mon_stock_sans_retrait). La fonction efface ventes et fiches ; la clé cross_post_jobs.inventaire_id est en
-- ON DELETE SET NULL : chaque ligne d'annonce (dépôts, imports, republications) reste « published » ou « pending » SANS
-- fiche. Le « Synchroniser » suivant importe les mêmes annonces sur des fiches neuves : 111 annonces Leboncoin et 104
-- Vinted portent deux lignes (une orpheline, une rattachée), 11 et 10 en portent trois. Aucune action double (vente :
-- seule la ligne rattachée compte ; retrait : par fiche ; republication sans fiche : jamais servie par get-pending-jobs),
-- mais 455 lignes « vivantes » que plus aucun écran ne montre, que la veille croit surveiller, et deux republications du
-- 06/11 (eb3cfcf1, 1031480e, étape « captured ») restées « pending » à vie sur des annonces revenues dans le stock.
-- Plus grave, un trou : le filet inventaire_arme_retraits_avant_suppression, qui annule les tâches en file d'un article
-- supprimé, s'efface devant la garde fillsell.sans_retrait — une publication en file au moment de « Réinitialiser »
-- partirait sans fiche (get-pending-jobs sert une publication orpheline).
-- Mesure (prod, 08/11) : 3 064 lignes vivantes sans fiche sur 39 comptes ; 931 doublonnent une ligne rattachée à une
-- fiche vivante pour le MÊME numéro (Vinted 239, Leboncoin 449, eBay 191, Beebs 48, Opla 4) ; 12 republications sans
-- fiche « pending » (Vinted 9, Leboncoin 3).
--
-- LES RÈGLES (tous comptes) :
-- 1. supprimer_mon_stock_sans_retrait clôt, AVANT d'effacer, les lignes de ses fiches : dépôts et republications publiés,
--    publications en file ou en attente d'un geste, republications pas encore engagées (étape absente, « a_capturer »,
--    « captured » : rien n'a été retiré). Statut « cancelled », un texte qui dit pourquoi, l'état d'avant dans
--    platform_fields.reinitialisation. Jamais : un retrait (action delete), une tâche « processing » (l'extension y est),
--    une republication engagée (« deleted », « recreated » : l'annonce doit être recréée), une ligne vendue. Toujours
--    aucun retrait (garde fillsell.sans_retrait inchangée) ; les annonces relevées gardent leur ligne
--    annonces_plateforme (sans fiche) : le « Synchroniser » suivant les retrouve.
-- 2. lignes_sans_fiche_clore(compte, plateforme, numéro, ligne gardée, par) : les lignes SANS fiche, vivantes
--    (published, pending, needs_user), dépôts ou republications, qui portent EXACTEMENT ce numéro sont closes
--    (« cancelled », état d'avant dans platform_fields.ligne_sans_fiche_close). Jamais sur un titre, jamais une ligne
--    rattachée, jamais un retrait, jamais « processing ».
-- 3. Déclencheur cross_post_jobs_une_ligne_par_annonce(_maj) : quand une ligne RATTACHÉE à une fiche est (ou devient)
--    publiée ou vendue pour un numéro, la règle 2 clôt ses doubles sans fiche — à l'import, au rattachement, au
--    recâblage, sur toutes les plateformes. Index partiel cross_post_jobs_sans_fiche_vivantes (≈ 3 000 lignes).
-- Rattrapage des doubles existants : par LA MÊME fonction (scripts/reparations/20261108_lignes_sans_fiche_doublons.sql,
-- sauvegarde + inverse), sur feu vert.
-- Définition de supprimer_mon_stock_sans_retrait réécrite depuis pg_get_functiondef EN PRODUCTION (08/11, md5
-- b0ab3a21aaf15c2b11864f9650f3a86e) : chaque ligne gardée, une mise à jour ajoutée avant les deux DELETE.
-- Inverse : supabase/rollbacks/20261108143000_une_ligne_vivante_par_annonce_INVERSE.sql.
-- Preuve (Postgres jetable) : PREUVE_PG=embarque node scripts/preuve-ayadi-0811.mjs
-- ⚠ CREATE INDEX (non concurrent) : verrou d'écriture bref sur cross_post_jobs (178 631 lignes le 08/11).
-- Ni BEGIN ni COMMIT ici : l'application est une, explicite, après le feu vert.

DO $garde$
DECLARE v_d text;
BEGIN
  SELECT replace(pg_get_functiondef('public.supprimer_mon_stock_sans_retrait()'::regprocedure), chr(13), '') INTO v_d;
  IF md5(v_d) <> 'b0ab3a21aaf15c2b11864f9650f3a86e' AND position('(08/11, ayadi007)' IN v_d) = 0 THEN
    RAISE EXCEPTION 'supprimer_mon_stock_sans_retrait a changé en prod depuis le 08/11 : repartir de pg_get_functiondef';
  END IF;
END
$garde$;

-- ── 2. La règle : une ligne SANS fiche qui double une ligne rattachée (même numéro exact) est close ──
CREATE OR REPLACE FUNCTION public.lignes_sans_fiche_clore(p_user uuid, p_platform text, p_listing text, p_garde uuid, p_par text)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_n integer := 0; v_inv bigint;
BEGIN
  IF p_user IS NULL OR NULLIF(btrim(COALESCE(p_platform, '')), '') IS NULL OR NULLIF(btrim(COALESCE(p_listing, '')), '') IS NULL THEN
    RETURN 0;
  END IF;
  SELECT g.inventaire_id INTO v_inv FROM cross_post_jobs g WHERE g.id = p_garde;
  UPDATE cross_post_jobs o
     SET status = 'cancelled',
         error = 'Ligne close : cette annonce est suivie par ta fiche actuelle (l''article d''origine avait été supprimé '
              || 'du stock). Rien n''a été retiré ni publié.',
         platform_fields = COALESCE(o.platform_fields, '{}'::jsonb) || jsonb_build_object('ligne_sans_fiche_close',
           jsonb_build_object('le', now(), 'par', COALESCE(p_par, 'inconnu'), 'statut_avant', o.status, 'erreur_avant', o.error,
             'remplacee_par', p_garde, 'fiche', v_inv, 'regle', 'une_ligne_par_annonce_0811'))
   WHERE o.user_id = p_user AND o.platform = p_platform
     AND o.inventaire_id IS NULL
     AND o.status IN ('published', 'pending', 'needs_user')
     AND btrim(o.platform_listing_id) = btrim(p_listing)
     AND o.id IS DISTINCT FROM p_garde
     AND COALESCE(o.action, 'publish') IN ('publish', 'republish');
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$function$;
REVOKE ALL ON FUNCTION public.lignes_sans_fiche_clore(uuid, text, text, uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.lignes_sans_fiche_clore(uuid, text, text, uuid, text) TO service_role;

CREATE INDEX IF NOT EXISTS cross_post_jobs_sans_fiche_vivantes
  ON public.cross_post_jobs (user_id, platform, (btrim(platform_listing_id)))
  WHERE inventaire_id IS NULL AND status IN ('published', 'pending', 'needs_user');

-- ── 3. Le déclencheur : une ligne rattachée publiée ou vendue clôt ses doubles sans fiche ──
CREATE OR REPLACE FUNCTION public.cross_post_jobs_une_ligne_par_annonce()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  BEGIN
    PERFORM public.lignes_sans_fiche_clore(NEW.user_id, NEW.platform, NEW.platform_listing_id, NEW.id, 'declencheur');
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'cross_post_jobs_une_ligne_par_annonce (job %) : % — écriture poursuivie', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
REVOKE ALL ON FUNCTION public.cross_post_jobs_une_ligne_par_annonce() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS cross_post_jobs_une_ligne_par_annonce ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_une_ligne_par_annonce
  AFTER INSERT ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.inventaire_id IS NOT NULL AND NEW.status IN ('published', 'sold')
        AND COALESCE(NEW.action, 'publish') IN ('publish', 'republish')
        AND NULLIF(btrim(NEW.platform_listing_id), '') IS NOT NULL)
  EXECUTE FUNCTION public.cross_post_jobs_une_ligne_par_annonce();

DROP TRIGGER IF EXISTS cross_post_jobs_une_ligne_par_annonce_maj ON public.cross_post_jobs;
CREATE TRIGGER cross_post_jobs_une_ligne_par_annonce_maj
  AFTER UPDATE OF inventaire_id, status, platform_listing_id ON public.cross_post_jobs
  FOR EACH ROW
  WHEN (NEW.inventaire_id IS NOT NULL AND NEW.status IN ('published', 'sold')
        AND COALESCE(NEW.action, 'publish') IN ('publish', 'republish')
        AND NULLIF(btrim(NEW.platform_listing_id), '') IS NOT NULL
        AND (OLD.inventaire_id IS DISTINCT FROM NEW.inventaire_id OR OLD.status IS DISTINCT FROM NEW.status
             OR OLD.platform_listing_id IS DISTINCT FROM NEW.platform_listing_id))
  EXECUTE FUNCTION public.cross_post_jobs_une_ligne_par_annonce();

-- ── 1. « Réinitialiser » : définition de PROD du 08/11, chaque ligne gardée, une mise à jour avant les deux DELETE ──
CREATE OR REPLACE FUNCTION public.supprimer_mon_stock_sans_retrait()
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if auth.uid() is null then
    raise exception 'supprimer_mon_stock_sans_retrait : appel sans utilisateur'
      using errcode = 'insufficient_privilege';
  end if;
  perform set_config('fillsell.sans_retrait', '1', true);
  -- (08/11, ayadi007) Les lignes des fiches effacées sont closes AVANT l'effacement (sinon ON DELETE SET NULL les laisse
  -- « published » / « pending » sans fiche : doublons au « Synchroniser » suivant, publications en file qui partiraient
  -- sans fiche). Jamais : un retrait, une tâche « processing », une republication engagée (« deleted », « recreated »),
  -- une ligne vendue. Aucun retrait n'est armé (garde fillsell.sans_retrait).
  update public.cross_post_jobs j
     set status = 'cancelled',
         error = case when j.status = 'published'
                      then 'Article supprimé de ton stock (« Réinitialiser mon inventaire ») : cette annonce est restée en ligne, '
                        || 'rien n''a été retiré. « Synchroniser » la retrouve.'
                      else 'Annulé : l''article a été supprimé de ton stock (« Réinitialiser mon inventaire »). Rien n''a été '
                        || 'retiré ni publié.' end,
         platform_fields = coalesce(j.platform_fields, '{}'::jsonb) || jsonb_build_object('reinitialisation',
           jsonb_build_object('le', now(), 'statut_avant', j.status, 'erreur_avant', j.error, 'fiche', j.inventaire_id))
   where j.user_id = auth.uid()
     and j.inventaire_id is not null
     and coalesce(j.action, 'publish') in ('publish', 'republish')
     and (j.status = 'published'
          or (j.status in ('pending', 'needs_user')
              and (coalesce(j.action, 'publish') = 'publish'
                   or coalesce(nullif(j.platform_fields ->> 'republish_step', ''), 'a_capturer') in ('a_capturer', 'captured'))));
  delete from public.ventes where user_id = auth.uid();
  delete from public.inventaire where user_id = auth.uid();
end;
$function$;
