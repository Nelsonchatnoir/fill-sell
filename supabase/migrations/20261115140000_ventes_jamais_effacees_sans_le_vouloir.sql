-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261115140000 — UNE VENTE N'EST JAMAIS EFFACÉE SANS QUE LA PERSONNE L'AIT CHOISI, ET TOUTE SUPPRESSION EST TRACÉE
-- (15/11/2026, complément du lot (2) de Nico, point 4 — rapport docs/enquetes/lot-1511-3-ventes-effacees/RAPPORT.md)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CE QUI S'EST PASSÉ : « Réinitialiser mon inventaire » (Réglages › Mon compte) appelait supprimer_mon_stock_sans_retrait(),
-- qui faisait `delete from ventes where user_id = auth.uid()` avant de vider le stock : tout l'historique des ventes,
-- en une transaction, sans trace de geste (ni usage_logs, ni motif dans ventes_supprimees). Six comptes l'ont utilisée
-- pour repartir d'un stock propre (resynchroniser, changer de boutique) et ont perdu 4 685 ventes (1 732 pour
-- noubliejamais le 13/11 19:14) — que le relevé ne ramenait plus (ventes_supprimees = « supprimée par la personne »).
--
-- LA RÈGLE :
--   1. supprimer_mon_stock_sans_retrait(p_avec_ventes boolean DEFAULT false) : par défaut le stock seulement — les ventes
--      restent, détachées de leurs fiches (inventaire_id NULL ; la FK NO ACTION l'exige). Les ventes ne partent que sur
--      p_avec_ventes = true, que l'app ne pose que sur une case cochée par la personne (« Supprimer aussi mes N ventes »).
--      Une app d'avant ce correctif (appel sans argument) garde donc les ventes. Le geste est tracé dans usage_logs
--      (« reinitialisation_inventaire » : ventes gardées / effacées, articles).
--   2. TOUTE suppression d'une vente, quel que soit son auteur (personne, fonction du serveur, clé de service), est
--      journalisée dans ventes_suppressions_journal avec la ligne ENTIÈRE (prix d'achat, frais, marque… : de quoi la
--      rendre), le rôle, le motif posé par le code (fillsell.motif_suppression_ventes) et la requête qui l'a faite.
--   3. ventes_supprimees (« supprimée par la personne, ne revient jamais ») porte désormais son motif et le code qui l'a
--      faite (source, motif) — elle reste réservée aux suppressions faites par la personne (même clause WHEN).
-- Verrou : scripts/ventes-jamais-effacees-selftest.mjs (et sa preuve sur une base jetable).
-- Inverse : supabase/rollbacks/20261115140000_ventes_jamais_effacees_sans_le_vouloir_INVERSE.sql.

-- ── 2. Le journal de toute suppression ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ventes_suppressions_journal (
  id         bigserial PRIMARY KEY,
  le         timestamptz NOT NULL DEFAULT now(),
  user_id    uuid,
  vente_id   bigint,
  role       text,
  motif      text,
  requete    text,
  ligne      jsonb
);
CREATE INDEX IF NOT EXISTS ventes_suppressions_journal_user ON public.ventes_suppressions_journal (user_id, le DESC);
ALTER TABLE public.ventes_suppressions_journal ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ventes_suppressions_journal FROM PUBLIC, anon, authenticated;
-- droits : serveur seulement ventes_suppressions_journal (aucun client, la clé de service lit le journal)
GRANT ALL ON TABLE public.ventes_suppressions_journal TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.ventes_suppressions_journal_id_seq TO service_role;

-- Le motif d'une suppression : celui que le code a posé, sinon reconnu à la requête (jamais vide).
CREATE OR REPLACE FUNCTION public.ventes_motif_suppression()
 RETURNS text
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(
    nullif(current_setting('fillsell.motif_suppression_ventes', true), ''),
    -- Les formes de PostgREST : DELETE FROM "public"."ventes" WHERE "public"."ventes"."<colonne>" = $1 …
    CASE
      WHEN current_query() ~* 'supprimer_mon_stock_sans_retrait' THEN 'reinitialisation_inventaire'
      WHEN current_query() ~* '"ventes"\."inventaire_id"\s*=' THEN 'suppression_article_et_vente'
      WHEN current_query() ~* '"ventes"\."id"\s*=' THEN 'suppression_vente'
      WHEN current_query() ~* '"ventes"\."user_id"\s*=' THEN 'suppression_toutes_ventes_du_compte'
      -- Le rôle de la SESSION (le GUC « role », posé par PostgREST) : à l'intérieur d'une fonction SECURITY DEFINER,
      -- current_user est le propriétaire, jamais l'appelant.
      WHEN coalesce(nullif(current_setting('role', true), 'none'), session_user::text) <> 'authenticated'
        THEN 'fonction:' || coalesce(substring(current_query() from '(?i)(?:select|perform)\s+(?:"?public"?\.)?"?([a-z_]+)"?\s*\('), 'serveur')
      ELSE 'requete_directe'
    END)
$function$;

CREATE OR REPLACE FUNCTION public.ventes_suppression_journal()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  INSERT INTO ventes_suppressions_journal (user_id, vente_id, role, motif, requete, ligne)
  -- Le rôle de l'appelant : le GUC « role » (PostgREST : authenticated, service_role), jamais current_user (le propriétaire ici).
  VALUES (OLD.user_id, OLD.id, coalesce(nullif(current_setting('role', true), 'none'), session_user::text), ventes_motif_suppression(),
          left(current_query(), 500), to_jsonb(OLD));
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  -- Le journal ne retient jamais une suppression.
  RAISE WARNING 'ventes_suppression_journal (vente %) : %', OLD.id, SQLERRM;
  RETURN OLD;
END;
$function$;
REVOKE ALL ON FUNCTION public.ventes_suppression_journal() FROM PUBLIC;

DROP TRIGGER IF EXISTS ventes_suppression_journal ON public.ventes;
CREATE TRIGGER ventes_suppression_journal BEFORE DELETE ON public.ventes
  FOR EACH ROW EXECUTE FUNCTION public.ventes_suppression_journal();

-- ── 3. ventes_supprimees porte son motif et le code qui l'a faite (corps de prod relu le 15/11 + source, motif) ──────
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
  -- (15/11/2026) source = le motif (posé par le code, ou reconnu à la requête) ; motif = la requête qui l'a faite.
  IF coalesce(OLD.commande_ref, OLD.annonce_id) IS NOT NULL THEN
    INSERT INTO ventes_supprimees (user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, source, motif)
    VALUES (OLD.user_id,
            coalesce(OLD.plateforme_code, plateforme_normalisee(OLD.plateforme)),
            OLD.commande_ref, OLD.annonce_id, OLD.titre, OLD.prix_vente, OLD.vendu_le, OLD.id,
            ventes_motif_suppression(), left(current_query(), 300));
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'ventes_suppression_trace (vente %) : %', OLD.id, SQLERRM;
  RETURN OLD;
END;
$function$;

-- ── 1. « Réinitialiser mon inventaire » : le stock, jamais les ventes sans la case cochée ──────────────────────────────
DROP FUNCTION IF EXISTS public.supprimer_mon_stock_sans_retrait();
CREATE OR REPLACE FUNCTION public.supprimer_mon_stock_sans_retrait(p_avec_ventes boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
declare
  v_ventes integer := 0;
  v_detachees integer := 0;
  v_articles integer := 0;
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
  -- (15/11/2026) Les ventes ne partent QUE sur la case cochée par la personne ; sinon elles restent, détachées.
  if p_avec_ventes is true then
    perform set_config('fillsell.motif_suppression_ventes', 'reinitialisation_inventaire_avec_ventes', true);
    delete from public.ventes where user_id = auth.uid();
    get diagnostics v_ventes = row_count;
  else
    update public.ventes set inventaire_id = null where user_id = auth.uid() and inventaire_id is not null;
    get diagnostics v_detachees = row_count;
  end if;
  delete from public.inventaire where user_id = auth.uid();
  get diagnostics v_articles = row_count;
  insert into public.usage_logs (user_id, feature, metadata)
  values (auth.uid(), 'reinitialisation_inventaire', jsonb_build_object('avec_ventes', p_avec_ventes is true,
    'ventes_effacees', v_ventes, 'ventes_gardees_detachees', v_detachees, 'articles', v_articles));
  return jsonb_build_object('avec_ventes', p_avec_ventes is true, 'ventes_effacees', v_ventes,
    'ventes_gardees_detachees', v_detachees, 'articles', v_articles);
end;
$function$;
REVOKE ALL ON FUNCTION public.supprimer_mon_stock_sans_retrait(boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.supprimer_mon_stock_sans_retrait(boolean) TO authenticated;
