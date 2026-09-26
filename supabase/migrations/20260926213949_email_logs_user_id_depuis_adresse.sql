-- ═══════════════════════════════════════════════════════════════════════════
-- email_logs : LE user_id SE RETROUVE TOUJOURS DEPUIS L'ADRESSE (24/09)
-- (révisée le 26/09 avant application, GO Nico : « un seul compte », garde
--  générique des index uniques, base = envoyer_mail_ponctuel EN PROD)
-- APPLIQUÉE le 26/09 (version distante 20260926213949), après rejeu en
-- transaction annulée : 236 lignes rattachées, 11 restent sans compte, 0 autre
-- colonne modifiée, 0 user_id existant modifié, 0 adresse ambiguë.
-- ═══════════════════════════════════════════════════════════════════════════
-- Le mail à Louis Thonet du 24/09 09:34 (support_louis_multicomptes_2409) est
-- journalisé SANS user_id : envoyer_mail_ponctuel transmet les destinataires
-- tels quels, et un `"user_id": null` passé à la main arrive nul en base.
-- Le plafond marketing de 2 mails / 24 h (envoi-ponctuel) compte par user_id
-- quand il en a un : une ligne sans user_id est INVISIBLE pour lui.
-- Relevé du 26/09 : 247 lignes sans user_id, dont 236 dont l'adresse est celle
-- d'UN SEUL compte, 0 ambiguë (aucune adresse partagée par deux comptes).
-- Mesure du plafond marketing (2 / 24 h) au 26/09 : 24 comptes au plafond avec
-- le comptage actuel, 27 avec le nouveau (+3).
--
-- Trois gestes, idempotents :
--   1. envoyer_mail_ponctuel complète chaque destinataire sans user_id depuis
--      auth.users (adresse comparée en minuscules) AVANT l'appel : la porte
--      compte alors le plafond par compte, comme pour les autres. Recopiée de
--      la version EN PROD (pg_get_functiondef du 26/09) — seul le bloc
--      d'enrichissement est ajouté.
--   2. un trigger BEFORE INSERT sur email_logs fait de même pour TOUT
--      expéditeur (email-tunnel, envoyerEmail, SQL) — le journal ne dépend
--      plus de la discipline de chaque appelant.
--   3. rattrapage des lignes existantes.
-- ⛔ UN SEUL COMPTE : l'adresse doit désigner EXACTEMENT un compte ; zéro ou
--    plusieurs → user_id reste vide (jamais un rattachement arbitraire).
-- ⛔ SEULE LA COLONNE user_id est écrite, et seulement quand elle est vide.
-- ⛔ LE PLAFOND NE CHANGE PAS DE RÈGLE : il vit dans envoi-ponctuel et ne
--    s'applique qu'au « marketing » ; une réponse « support » n'est jamais
--    bloquée. Seul le comptage devient complet.
-- Une adresse sans compte (partenaire, contact@…) reste sans user_id : c'est
-- vrai, il n'y a personne à rattacher.

-- ── 1. La porte ─────────────────────────────────────────────────────────────
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
  -- DONNÉ n'est jamais remplacé.
  select jsonb_agg(
           case
             when nullif(btrim(coalesce(d->>'user_id', '')), '') is null then
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
$function$;

-- ── 2. Le journal, quel que soit l'expéditeur ───────────────────────────────
-- Jamais bloquant : une lecture impossible laisse la ligne telle quelle.
CREATE OR REPLACE FUNCTION public.email_logs_user_id_depuis_adresse()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
begin
  if new.user_id is null and coalesce(btrim(new.email), '') <> '' then
    begin
      select case when count(*) = 1 then min(u.id::text)::uuid end into new.user_id
        from auth.users u
       where lower(u.email) = lower(btrim(new.email));
    exception when others then
      new.user_id := null;
    end;
  end if;
  return new;
end
$function$;
REVOKE ALL ON FUNCTION public.email_logs_user_id_depuis_adresse() FROM public, anon, authenticated;

DROP TRIGGER IF EXISTS email_logs_user_id_depuis_adresse ON public.email_logs;
CREATE TRIGGER email_logs_user_id_depuis_adresse
  BEFORE INSERT ON public.email_logs
  FOR EACH ROW EXECUTE FUNCTION public.email_logs_user_id_depuis_adresse();

-- ── 3. Rattrapage ───────────────────────────────────────────────────────────
-- Adresse d'UN SEUL compte uniquement ; seule la colonne user_id est écrite.
-- Ligne par ligne : une ligne qui ferait un doublon sur N'IMPORTE QUEL index
-- unique partiel (one-shot, payment_failed, extension_link…) est laissée
-- telle quelle au lieu d'annuler le rattrapage entier.
DO $rattrapage$
DECLARE
  r record;
  n_ok int := 0;
  n_doublon int := 0;
BEGIN
  FOR r IN
    SELECT l.id, u.uid
      FROM public.email_logs l
      JOIN (SELECT lower(email) AS em, min(id::text)::uuid AS uid
              FROM auth.users WHERE email IS NOT NULL
             GROUP BY lower(email) HAVING count(*) = 1) u
        ON u.em = lower(btrim(l.email))
     WHERE l.user_id IS NULL
       AND coalesce(btrim(l.email), '') <> ''
     ORDER BY l.id
  LOOP
    BEGIN
      UPDATE public.email_logs SET user_id = r.uid WHERE id = r.id AND user_id IS NULL;
      n_ok := n_ok + 1;
    EXCEPTION WHEN unique_violation THEN
      n_doublon := n_doublon + 1;
    END;
  END LOOP;
  RAISE NOTICE 'email_logs rattachés : %, laissés sans user_id (doublon d''index) : %', n_ok, n_doublon;
END
$rattrapage$;
