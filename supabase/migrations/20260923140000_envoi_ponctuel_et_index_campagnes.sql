-- ══════════════════════════════════════════════════════════════════════════════
-- UNE PORTE D'ENVOI, PLUS JAMAIS TRENTE-DEUX (2026-09-23)
-- ══════════════════════════════════════════════════════════════════════════════
-- CE QUI A ÉTÉ RÉPARÉ AUJOURD'HUI. Chaque mail de support ou de campagne se
-- soldait par une NOUVELLE fonction edge : destinataire en dur, verify_jwt à
-- false, jeton maison, jamais commitée, jamais supprimée. Les portes d'envoi
-- sont passées de 19 à 35 en trois jours. Trente et une ont été supprimées le
-- 23/09 après vérification (0 cron, 0 fonction SQL, 0 trigger, 0 ligne de code
-- dans l'app, l'extension ou les autres fonctions edge ne les nommait).
--
-- CE FICHIER POSE LE REMPLACEMENT, EN DEUX MORCEAUX :
--   1. `envoyer_mail_ponctuel()` — la porte SQL. Claude (ou n'importe quel
--      script) envoie un mail DEPUIS LA BASE, sans déployer quoi que ce soit.
--   2. l'index anti-doublon des campagnes, élargi aux deux types du jour.
--
-- ── 1. LA PORTE SQL ────────────────────────────────────────────────────────
-- Elle appelle la fonction edge `envoi-ponctuel` par pg_net, avec la clé de
-- service LUE DANS LE VAULT (`vault.decrypted_secrets`, secret
-- « service_role_key »). Elle n'est JAMAIS écrite en clair : ni ici, ni dans
-- un cron, ni dans le dépôt. C'est toute la différence avec `fs-cron-2026-tunnel`,
-- qui est en clair dans l'historique git et le restera après rotation.
--
-- ⛔ AUCUN JETON EN DUR. C'est la règle qui a fait naître ce fichier.
--
-- La fonction edge, elle, refait TOUS les contrôles de son côté (clé de
-- service exigée, type et catégorie obligatoires, plafond, porte unique
-- envoyerEmail) : cette fonction SQL est un CONFORT d'appel, pas la sécurité.
-- La sécurité ne dépend jamais de l'appelant.
--
-- SECURITY DEFINER : indispensable ici, et pour une raison précise — le vault
-- n'est pas lisible par un rôle ordinaire, et c'est très bien ainsi. Le
-- definer est le seul moyen de lire le secret sans l'ouvrir à qui que ce soit.
-- Droits : REVOKE de PUBLIC / anon / authenticated, GRANT du seul postgres.
--
-- ── 2. L'INDEX ANTI-DOUBLON ────────────────────────────────────────────────
-- `email_logs_one_shot_unique` est un index PARTIEL sur (user_id, email_type),
-- limité à une liste FERMÉE de types. Un type one-shot absent de cette liste
-- repart en doublon sans que rien ne le signale — c'est le bug du welcome du
-- 03/08. Deux campagnes du 23/09 y manquaient :
--   · `extension_link_rattrapage` (97 envois)
--   · `stock_pret_2309` (96 envois)
-- Vérifié AVANT : 0 doublon sur ces deux types, l'index peut donc être créé.
-- Créé CONCURRENTLY (hors transaction) : la table dépasse le millier de lignes
-- et sert en permanence — on ne la verrouille pas pour un index.
-- ⚠️ Les deux étapes CONCURRENTLY vivent hors de ce fichier (elles ne peuvent
--    pas tourner dans une transaction) ; elles sont rejouées ici en IF NOT
--    EXISTS pour qu'un `db reset` sur une base neuve reproduise le même état.

-- ── LA PORTE SQL ────────────────────────────────────────────────────────────
create or replace function public.envoyer_mail_ponctuel(
  p_destinataires jsonb,
  p_sujet         text,
  p_html          text,
  p_type          text,
  p_categorie     text,
  p_simulation    boolean default false
)
returns bigint
language plpgsql
security definer
set search_path = public, vault, pg_temp
as $fn$
declare
  v_cle text;
  v_req bigint;
begin
  -- Les mêmes exigences que la fonction edge, dites tôt : une erreur ici est
  -- lisible tout de suite, au lieu d'attendre la réponse asynchrone de pg_net.
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
      'destinataires', p_destinataires,
      'sujet',         p_sujet,
      'html',          p_html,
      'type',          p_type,
      'categorie',     p_categorie,
      'simulation',    coalesce(p_simulation, false)
    )
  ) into v_req;

  -- L'identifiant de requête pg_net. La réponse se lit ensuite dans
  -- net._http_response (qui se purge tout seul : on la lit TOUT DE SUITE).
  return v_req;
end
$fn$;

comment on function public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) is
  'Envoie un mail ponctuel via la fonction edge envoi-ponctuel (pg_net + clé de service lue dans le vault). Remplace les fonctions send-<prénom>-<date> supprimées le 23/09/2026.';

revoke all on function public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) from public;
revoke all on function public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) from anon;
revoke all on function public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) from authenticated;
revoke all on function public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) from service_role;
grant execute on function public.envoyer_mail_ponctuel(jsonb, text, text, text, text, boolean) to postgres;

-- ── L'INDEX ANTI-DOUBLON, LISTE ÉLARGIE ────────────────────────────────────
-- Rejouable : sur une base neuve, cette forme suffit. En prod, la bascule a
-- été faite CONCURRENTLY (création v2, drop de l'ancien, rename).
create unique index if not exists email_logs_one_shot_unique
  on public.email_logs (user_id, email_type)
  where email_type = any (array[
    'welcome', 'how_it_works', 'blast_relaunch_aout', 'blast_founder',
    'founder_plan', 'voice_conversion', 'blast_sync_dressing',
    'reactiv_1409_a', 'reactiv_1409_b', 'reactiv_1409_c', 'reactiv_1409_d',
    'extension_link_rattrapage', 'stock_pret_2309'
  ]);
