-- INVERSE de supabase/migrations/20261113224500_alertes_cloud_service_role_support.sql (13/11/2026, agent ALERTE) :
-- envoyer_mail_ponctuel remise À L'OCTET PRÈS telle que la prod l'avait le 13/11 (pg_get_functiondef, md5
-- 2c3472191b62804602bfbde4819fecd5), commentaire de prod, droits d'avant : {postgres=X/postgres} (postgres seul ;
-- PUBLIC, anon, authenticated et service_role sans droit — migration 20260923140000, l. 113-117).
-- Effet : les alertes de l'orchestrateur Cloud retombent en « permission denied for function envoyer_mail_ponctuel ».
-- À jouer : npx supabase db query --linked -f supabase/rollbacks/20261113224500_alertes_cloud_service_role_support_INVERSE.sql
--           puis npx supabase migration repair --linked --status reverted 20261113224500
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE OR REPLACE FUNCTION public.envoyer_mail_ponctuel(p_destinataires jsonb, p_sujet text, p_html text, p_type text, p_categorie text, p_simulation boolean DEFAULT false)
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'vault', 'pg_temp'
AS $function$
declare
  v_cle text;
  v_req bigint;
  v_dest jsonb;
begin
  if p_categorie is null or p_categorie not in ('marketing', 'support') then
    raise exception 'categorie obligatoire : « marketing » (campagne, de notre initiative) ou « support » (réponse à quelqu''un). Reçu : %', coalesce(p_categorie, 'NULL');
  end if;
  if coalesce(btrim(p_type), '') = '' then
    raise exception 'type obligatoire : une ligne email_logs sans type ne vaut rien';
  end if;
  if coalesce(btrim(p_sujet), '') = '' or coalesce(btrim(p_html), '') = '' then
    raise exception 'sujet et html obligatoires';
  end if;
  if p_destinataires is null or jsonb_array_length(p_destinataires) = 0 then
    raise exception 'aucun destinataire';
  end if;

  -- Chaque destinataire sans user_id (absent, null ou vide) reçoit celui du
  -- compte qui porte son adresse — s'il y en a EXACTEMENT UN. Un user_id
  -- DONNÉ n'est jamais remplacé. Une adresse seule ("qui@exemple.fr", format
  -- accepté depuis le 23/09) passe telle quelle : jsonb_set sur un scalaire
  -- échoue (« cannot set path in scalar »).
  select jsonb_agg(
           case
             when jsonb_typeof(d) = 'object'
              and nullif(btrim(coalesce(d->>'user_id', '')), '') is null then
               jsonb_set(d, '{user_id}', coalesce(
                 (select case when count(*) = 1 then to_jsonb(min(u.id::text)) end
                    from auth.users u
                   where lower(u.email) = lower(btrim(d->>'email'))),
                 'null'::jsonb))
             else d
           end
           order by ord)
    into v_dest
    from jsonb_array_elements(p_destinataires) with ordinality as t(d, ord);

  select decrypted_secret into v_cle
  from vault.decrypted_secrets where name = 'service_role_key';
  if v_cle is null then
    raise exception 'clé de service absente du vault (secret « service_role_key ») — rien n''est envoyé';
  end if;

  select net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/envoi-ponctuel',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_cle
    ),
    body    := jsonb_build_object(
      'destinataires', v_dest,
      'sujet',         p_sujet,
      'html',          p_html,
      'type',          p_type,
      'categorie',     p_categorie,
      'simulation',    coalesce(p_simulation, false)
    )
  ) into v_req;

  return v_req;
end
$function$
;

COMMENT ON FUNCTION public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) IS
  'Envoie un mail ponctuel via la fonction edge envoi-ponctuel (pg_net + clé de service lue dans le vault). Remplace les fonctions send-<prénom>-<date> supprimées le 23/09/2026.';

REVOKE ALL ON FUNCTION public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) TO postgres;
COMMIT;
