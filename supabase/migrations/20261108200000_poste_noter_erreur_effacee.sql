-- 08/11/2026 soir (urgence Leboncoin, point 4 de Nico) — PRÉPARÉE, NON APPLIQUÉE (essai sur base jetable + feu vert nommé).
-- Constat : le poste du client wtk8jnmnnf disait encore « CDP : connexion fermée » après son retour « actif » de 19:26 :
-- cloud_poste_noter n'écrit derniere_erreur que sur un état « erreur » et ne l'efface JAMAIS (ni la clé details.erreur,
-- ni details.raison d'un arrêt passé, fusionnées pour toujours). Un reste, pas une nouvelle panne — mais un reste qui ment
-- (cloud_executant_moi le rend à l'app, l'équipe le lit en base).
-- Règle : un poste qui repasse « actif » efface derniere_erreur et les clés « erreur » / « raison » de ses détails.
-- Réécrite depuis pg_get_functiondef de la prod (08/11 20:0x) ; seules les deux lignes marquées changent.
-- Inverse : supabase/rollbacks/20261108200000_poste_noter_erreur_effacee_INVERSE.sql.
CREATE OR REPLACE FUNCTION public.cloud_poste_noter(p_user uuid, p_etat text, p_details jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE d jsonb := COALESCE(p_details, '{}'::jsonb);
BEGIN
  INSERT INTO public.cloud_postes AS po (user_id, etat, serveur, conteneur, session_fillsell_id,
                                         demarre_le, arrete_le, derniere_activite, prochain_reveil, derniere_erreur, details, maj_le)
  VALUES (p_user, p_etat, d ->> 'serveur', d ->> 'conteneur', NULLIF(d ->> 'session_fillsell_id', '')::uuid,
          CASE WHEN p_etat = 'demarrage' THEN now() END, CASE WHEN p_etat = 'eteint' THEN now() END,
          now(), public.cloud_ts(d ->> 'prochain_reveil'), d ->> 'erreur', d - 'session_fillsell_id', now())
  ON CONFLICT (user_id) DO UPDATE SET
    etat = EXCLUDED.etat,
    serveur = COALESCE(EXCLUDED.serveur, po.serveur),
    conteneur = COALESCE(EXCLUDED.conteneur, po.conteneur),
    session_fillsell_id = CASE WHEN d ? 'session_fillsell_id' THEN NULLIF(d ->> 'session_fillsell_id', '')::uuid ELSE po.session_fillsell_id END,
    demarre_le = CASE WHEN p_etat = 'demarrage' THEN now() ELSE po.demarre_le END,
    arrete_le = CASE WHEN p_etat = 'eteint' THEN now() ELSE po.arrete_le END,
    derniere_activite = now(),
    prochain_reveil = COALESCE(public.cloud_ts(d ->> 'prochain_reveil'), po.prochain_reveil),
    -- (08/11 soir) CHANGÉ : un poste qui repasse « actif » n'a plus d'erreur.
    derniere_erreur = CASE WHEN p_etat = 'erreur' THEN d ->> 'erreur' WHEN p_etat = 'actif' THEN NULL ELSE po.derniere_erreur END,
    -- (08/11 soir) CHANGÉ : « actif » efface l'erreur et la raison d'arrêt d'avant dans les détails.
    details = CASE WHEN p_etat = 'actif' THEN (po.details - 'erreur' - 'raison') ELSE po.details END || (d - 'session_fillsell_id'),
    maj_le = now();
END;
$function$;
