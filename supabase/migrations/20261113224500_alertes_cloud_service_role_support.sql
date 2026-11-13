-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261113224500_alertes_cloud_service_role_support — LES ALERTES DE L'ORCHESTRATEUR CLOUD PARTENT À SUPPORT@, ET À RIEN
-- D'AUTRE (13/11/2026, agent ALERTE ; feu vert de Nico donné pour « la migration de droits »)
-- NON APPLIQUÉE : le coordinateur l'applique.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- CONSTAT (journal de l'orchestrateur du 13/11 ; prod, lecture seule, 13/11) : serveur-cloud/src/alertes.js appelle
-- envoyer_mail_ponctuel par PostgREST avec la clé de service (destinataire config.alertesDestinataire = support@,
-- catégorie « support », type cloud_alerte). En prod la fonction n'est exécutable que par postgres
-- ({postgres=X/postgres} : migration 20260923140000 l. 113-117, REVOKE de PUBLIC / anon / authenticated / service_role
-- VOULU — aucun code serveur n'écrit à un client) → « permission denied for function envoyer_mail_ponctuel » à chaque
-- alerte : 178 alertes dans cloud_pool_alertes depuis le 01/11 (dernière 13/11 16:04 Paris), 0 ligne email_logs
-- « cloud_alerte » depuis toujours.
-- LA RÈGLE (étroite ; l'orchestrateur n'est PAS redéployé — ses navigateurs clients ne redémarrent pas) :
--   · une garde EN TÊTE du corps : appel par l'API — role des claims PostgREST (request.jwt.claims) = service_role, ou
--     session ouverte par « authenticator » (la connexion de PostgREST : pg_stat_activity « postgrest / authenticator »,
--     LOGIN NOINHERIT, membre de anon, authenticated, service_role — lu le 13/11) — n'envoie QUE si p_categorie =
--     'support' ET si CHAQUE destinataire est support@fillsell.app (adresse seule ou objet ; « email », à défaut « to »,
--     comme la porte edge envoi-ponctuel les lit ; casse et espaces ignorés, comme elle) ; sinon exception
--     « service_role : alertes à support@ seulement — rien n'est envoyé », AVANT toute requête pg_net ;
--   · current_user ne peut pas servir : dans une fonction SECURITY DEFINER il vaut le propriétaire (postgres) — banc,
--     étape G. Les claims sont celles que lit auth.role() de Supabase (pg_get_functiondef du 13/11) et que lisent déjà
--     inventaire_arme_retraits_avant_suppression / _fiche_liee (même expression, SECURITY DEFINER) ;
--   · postgres (l'opérateur, aucune claims, session postgres) : RIEN ne change — même corps envoyé, octet pour octet ;
--   · GRANT EXECUTE à service_role, et à lui seul ; PUBLIC / anon / authenticated : REVOKE redit, toujours sans droit.
-- Ce que la clé de service gagne : rien qu'elle n'avait déjà (elle appelle envoi-ponctuel directement, à toute adresse) ;
-- par cette porte, elle est plus étroite que la porte edge.
-- L'adresse n'a AUCUNE source en base (coin_config ne porte que des entiers ; aucune fonction ne la nomme — lu le 13/11) :
-- elle est écrite UNE fois ici (v_support), égale à ALERTES_DESTINATAIRE (serveur-cloud/src/config.js, relu sur cloud-2 le
-- 08/11) et à ALERTE_CLOUD_DESTINATAIRE (_shared/cloud-alerte-nico.js) — verrou selftest:alertes-cloud-service-role.
-- ⛔ Tout le reste à l'octet près : la définition est celle de la prod lue le 13/11 (pg_get_functiondef, md5
--    2c3472191b62804602bfbde4819fecd5) + 2 déclarations + la garde ; commentaire, propriétaire, SECURITY DEFINER et
--    search_path gardés par CREATE OR REPLACE. Garde ci-dessous : md5 et droits relus, sinon ON S'ARRÊTE.
-- Banc : node scripts/essais/20261113224500_banc.mjs (Postgres jetable, PostgREST rejoué : avant / migration / inverse /
--   rejouée / gardes / sonde). Verrou : npm run selftest:alertes-cloud-service-role.
-- Inverse : supabase/rollbacks/20261113224500_alertes_cloud_service_role_support_INVERSE.sql (la prod du 13/11).
-- À jouer : relire pg_get_functiondef (md5 ci-dessus) et proacl ({postgres=X/postgres}), puis
--   npx supabase db query --linked -f supabase/migrations/20261113224500_alertes_cloud_service_role_support.sql
--   puis npx supabase migration repair --linked --status applied 20261113224500
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $verif$
DECLARE
  v_md5 text := md5(pg_get_functiondef('public.envoyer_mail_ponctuel(jsonb,text,text,text,text,boolean)'::regprocedure));
  v_acl text := (SELECT p.proacl::text FROM pg_proc p WHERE p.oid = 'public.envoyer_mail_ponctuel(jsonb,text,text,text,text,boolean)'::regprocedure);
BEGIN
  -- La prod lue le 13/11, ou la définition de cette migration (rejeu) avec ses droits.
  IF NOT ((v_md5 = '2c3472191b62804602bfbde4819fecd5' AND v_acl = '{postgres=X/postgres}')
       OR (v_md5 = '9de0aadea7ece71a2a6baf984e299cd7' AND v_acl = '{postgres=X/postgres,service_role=X/postgres}')) THEN
    RAISE EXCEPTION 'envoyer_mail_ponctuel a changé en prod depuis la lecture du 13/11 (md5 %, droits %) — ON S''ARRÊTE, rien n''est changé', v_md5, v_acl;
  END IF;
END
$verif$;
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
  v_role_api text;
  v_support constant text := 'support@fillsell.app';
begin
  -- (13/11/2026, migration 20261113224500, feu vert de Nico : « la migration de droits ») LA CLÉ DE SERVICE N'ÉCRIT
  -- QU'À SUPPORT@. Un appel par l'API (role des claims PostgREST = service_role, ou session ouverte par authenticator,
  -- la connexion de PostgREST) n'envoie QUE la catégorie « support » à support@ (chaque destinataire), sinon rien ne
  -- part. C'est l'appel des alertes de l'orchestrateur Cloud (serveur-cloud/src/alertes.js, clé de service).
  -- L'opérateur (postgres, sans claims) : rien ne change. anon / authenticated : aucun droit (REVOKE).
  -- Adresse = ALERTES_DESTINATAIRE de l'orchestrateur = ALERTE_CLOUD_DESTINATAIRE (_shared/cloud-alerte-nico.js) ;
  -- aucune source en base : selftest:alertes-cloud-service-role les garde égales.
  v_role_api := nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
  if v_role_api = 'service_role' or session_user = 'authenticator' then
    if p_categorie is distinct from 'support'
       or (case when jsonb_typeof(p_destinataires) = 'array'
                then jsonb_array_length(p_destinataires) = 0
                  or exists (select 1 from jsonb_array_elements(p_destinataires) as e(d)
                              where lower(btrim(coalesce(case jsonb_typeof(d)
                                                           when 'string' then d #>> '{}'
                                                           when 'object' then coalesce(d->>'email', d->>'to')
                                                         end, ''))) <> v_support)
                else true end) then
      raise exception 'service_role : alertes à support@ seulement — rien n''est envoyé';
    end if;
  end if;

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

REVOKE ALL ON FUNCTION public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) TO service_role;
COMMIT;
