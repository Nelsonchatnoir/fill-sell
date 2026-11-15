-- INVERSE de 20261115140000_ventes_jamais_effacees_sans_le_vouloir : les corps de prod relus le 15/11 (avant la
-- migration), rendus tels quels. Le journal ventes_suppressions_journal est GARDÉ (ses lignes sont des preuves) ; seuls
-- son déclencheur et ses fonctions partent. ⚠️ Rejouer cet inverse rend à « Réinitialiser mon inventaire » l'effacement
-- de TOUTES les ventes : ne le jouer que sur décision de Nico.
DROP TRIGGER IF EXISTS ventes_suppression_journal ON public.ventes;
DROP FUNCTION IF EXISTS public.ventes_suppression_journal();

CREATE OR REPLACE FUNCTION public.ventes_suppression_trace()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- Appelée SEULEMENT pour une suppression faite par la personne : la clause
  -- WHEN du déclencheur (current_user = 'authenticated' au moment du DELETE).
  -- Un DELETE exécuté DANS une fonction SECURITY DEFINER (fusion du relevé)
  -- tourne sous le propriétaire de la fonction : pas de trace.
  IF coalesce(OLD.commande_ref, OLD.annonce_id) IS NOT NULL THEN
    INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id)
    VALUES (OLD.user_id,
            coalesce(OLD.plateforme_code, plateforme_normalisee(OLD.plateforme)),
            OLD.commande_ref, OLD.annonce_id, OLD.titre, OLD.prix_vente, OLD.vendu_le, OLD.id);
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ventes_suppression_trace (vente %) : %', OLD.id, SQLERRM;
  RETURN OLD;
END;
$function$;

DROP FUNCTION IF EXISTS public.ventes_motif_suppression();

DROP FUNCTION IF EXISTS public.supprimer_mon_stock_sans_retrait(boolean);
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
REVOKE ALL ON FUNCTION public.supprimer_mon_stock_sans_retrait() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supprimer_mon_stock_sans_retrait() TO authenticated;
