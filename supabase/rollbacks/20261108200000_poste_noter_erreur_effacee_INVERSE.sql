-- INVERSE de 20261108200000_poste_noter_erreur_effacee.sql : cloud_poste_noter telle que relue en prod le 08/11 (20:0x).
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
    derniere_erreur = CASE WHEN p_etat = 'erreur' THEN d ->> 'erreur' ELSE po.derniere_erreur END,
    details = po.details || (d - 'session_fillsell_id'),
    maj_le = now();
END;
$function$;
