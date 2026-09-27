-- ═══════════════════════════════════════════════════════════════════════════
-- envoyer_mail_ponctuel : L'ADRESSE SEULE EST DE NOUVEAU ACCEPTÉE (27/09)
-- APPLIQUÉE le 27/09 à 10:50 (GO Nico, CLI db query -f), après rejeu en
-- transaction annulée : format objet identique avant/après, adresse seule et
-- mélange acceptés, droits identiques ({postgres=X/postgres}), 0 requête pg_net.
-- ═══════════════════════════════════════════════════════════════════════════
-- Régression de 20260926213949 : le bloc qui complète le user_id faisait un
-- jsonb_set sur CHAQUE destinataire. Un destinataire écrit en adresse seule
-- ('["qui@exemple.fr"]', format accepté depuis le 23/09 — envoi-ponctuel lit
-- `typeof d === "string"`) est un scalaire JSON → « cannot set path in
-- scalar », et plus rien ne part. Seul le format [{"email": …}] passait.
--
-- Correctif, UN SEUL : l'enrichissement ne touche que les destinataires
-- OBJETS. Une adresse seule est transmise telle quelle, exactement comme avant
-- le 26/09 (et le trigger email_logs_user_id_depuis_adresse rattache toujours
-- la ligne du journal à son compte). Rien d'autre ne change.
--
-- Recopiée de la version EN PROD (pg_get_functiondef du 27/09) — seule la
-- condition du `case` gagne `jsonb_typeof(d) = 'object' and`.
-- CREATE OR REPLACE conserve les droits (postgres seul, cf. 20260923140000).

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
