-- ═══════════════════════════════════════════════════════════════════════════
-- 20261025040000_push_vente_annulee   ⛔ PROPOSÉE — NON APPLIQUÉE (feu vert NOMMÉ de Nico requis)
-- (25/10, point 3 de Nico) NOTIFICATION PUSH « VENTE ANNULÉE — <titre> : REMETTRE EN VENTE ? »
-- Quand une vente est annulée (Vinted : vente_commande_annulee_vinted, relevé des commandes ou des ventes ; Leboncoin :
-- vente_transaction_annulee_leboncoin), la fiche revient au stock et la remise en vente est PROPOSÉE
-- (remises_en_vente « proposee », dépôt vendu marqué platform_fields.vente_annulee_remise = {vente, commande|source,
-- le}) : carte « Vente annulée — Remettre en vente ? » dans « À régler ». Ici, en plus : UNE notification push au
-- vendeur, par push-ventes (v14), jamais un mail.
-- LA RÈGLE (tous les comptes) :
--   · une note par annulation : push_annulations, clé unique (user_id, cle) — cle = « commande:<plateforme>:<n°> »
--     (les articles d'une même commande = UNE notification), sinon « vente:<id> » ;
--   · seulement une annulation NEUVE : marque « le » ≥ armement (coin_config.push_annulations_depuis, epoch posé à
--     l'application ; 0 = interrupteur coupé), de moins de 24 h, et vieille d'au moins 6 min (un passage de
--     remises_en_vente_tick — toutes les 5 min — ferme d'abord « déjà en vente » ce que le vendeur a remis en ligne) ;
--   · avant l'envoi, la proposition est relue : acceptée, close, article plus en stock → « ignoree » (plus_proposee),
--     rien ne part ; aucun téléphone (appareils_push) → « sans_appareil », rien ne part ;
--   · le texte et l'envoi : push-ventes (_shared/push-annulation.js, APNs/FCM) ; le verdict : push_annulations_resultat
--     (3 essais au plus ; jetons morts oubliés par push_ventes_resultat, comme pour une vente).
-- Rien d'autre n'est touché : ni push_ventes (les notes et les mails de vente), ni remises_en_vente, ni les fiches, ni les
-- dépôts ; le cron des ventes (34, push-ventes-1min) est inchangé — un cron À PART réveille push-ventes quand une
-- annulation attend (push_annulations_en_attente, qui ne lève jamais d'erreur).
-- Mesuré le 25/10 vers 00:20 (lecture seule) : 0 appareil push dans le parc, aucun secret APNs/FCM (push-ventes v13) →
-- chaque note finira « sans_appareil » tant que le binaire avec le module push n'est pas sur un téléphone. 6
-- propositions ouvertes (2 annulations d'un compte, vues le 24/10 à 22:40) : AVANT l'armement, jamais notifiées.
-- Application (feu vert NOMMÉ de Nico seulement) :
--   npx supabase db query --linked -f supabase/migrations/20261025040000_push_vente_annulee.sql
--   npx supabase migration repair --linked --status applied 20261025040000
--   puis push-ventes v14 (--no-verify-jwt ; version et verify_jwt lus avant et après).
-- Essai à blanc (ROLLBACK) : scripts/essais/20261025040000_essai.sql
-- Inverse : supabase/rollbacks/20261025040000_push_vente_annulee_INVERSE.sql (ou interrupteur : value = 0)
-- ═══════════════════════════════════════════════════════════════════════════
-- ═══ CORPS DE LA MIGRATION
BEGIN;
SET LOCAL lock_timeout = '5s';   -- l'index des propositions : jamais une attente derrière un passage en cours

-- 1. Le journal : une ligne par annulation, jamais deux.
CREATE TABLE IF NOT EXISTS public.push_annulations (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  cle           text NOT NULL,
  plateforme    text,
  vente_id      bigint,
  commande_ref  text,
  inventaire_id bigint,
  titre         text,
  annulee_le    timestamptz NOT NULL,
  statut        text NOT NULL DEFAULT 'a_envoyer',
  motif         text,
  essais        integer NOT NULL DEFAULT 0,
  resultat      jsonb,
  cree_le       timestamptz NOT NULL DEFAULT now(),
  traite_le     timestamptz,
  CONSTRAINT push_annulations_statut_check
    CHECK (statut IN ('a_envoyer', 'en_envoi', 'envoyee', 'sans_appareil', 'ignoree', 'echec')),
  CONSTRAINT push_annulations_une_par_annulation UNIQUE (user_id, cle)
);
CREATE INDEX IF NOT EXISTS push_annulations_a_traiter ON public.push_annulations (cree_le)
  WHERE statut IN ('a_envoyer', 'en_envoi');
ALTER TABLE public.push_annulations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS push_annulations_lecture ON public.push_annulations;
CREATE POLICY push_annulations_lecture ON public.push_annulations FOR SELECT USING (user_id = auth.uid());
-- droits : serveur seulement — push_annulations : l'app ne la lit pas (tout passe par les fonctions SECURITY DEFINER de push-ventes) ; aucun droit anon/authenticated, service_role en lecture (régime du 30/10)
REVOKE ALL ON TABLE public.push_annulations FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.push_annulations TO service_role;
-- (fillsell_table_nait_protegee donne aussi INSERT, UPDATE, DELETE à service_role : retirés, seules les fonctions écrivent.)
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER ON TABLE public.push_annulations FROM service_role;

-- 2. Les propositions encore ouvertes, lues vite (6 lignes sur 1 389 le 25/10).
CREATE INDEX IF NOT EXISTS remises_en_vente_proposees ON public.remises_en_vente (user_id) WHERE statut = 'proposee';

-- 3. La marque d'annulation du dépôt vendu → plateforme, clé, date (lectures pures ; une marque mal formée = NULL).
CREATE OR REPLACE FUNCTION public.push_annulation_plateforme(p_marque jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE WHEN p_marque ->> 'source' = 'transaction_leboncoin' THEN 'leboncoin'
              ELSE coalesce(nullif(btrim(p_marque ->> 'plateforme'), ''), 'vinted') END
$function$;

CREATE OR REPLACE FUNCTION public.push_annulation_cle(p_marque jsonb)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
           WHEN jsonb_typeof(p_marque) IS DISTINCT FROM 'object' THEN NULL
           WHEN nullif(btrim(p_marque ->> 'commande'), '') IS NOT NULL
             THEN 'commande:' || public.push_annulation_plateforme(p_marque) || ':' || btrim(p_marque ->> 'commande')
           WHEN (p_marque ->> 'vente') ~ '^[0-9]{1,18}$' THEN 'vente:' || (p_marque ->> 'vente')
         END
$function$;

CREATE OR REPLACE FUNCTION public.push_annulation_le(p_marque jsonb)
 RETURNS timestamptz
 LANGUAGE sql
 STABLE
AS $function$
  SELECT CASE WHEN jsonb_typeof(p_marque) = 'object'
               AND (p_marque ->> 'le') ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}[ T][0-9]{2}:[0-9]{2}(:[0-9]{2}(\.[0-9]+)?)?(Z|[+-][0-9]{2}(:?[0-9]{2})?)$'
              THEN (p_marque ->> 'le')::timestamptz END
$function$;

-- 4. Les annulations NEUVES encore proposées, une ligne par annulation — LA lecture commune au cron et à l'envoi.
CREATE OR REPLACE FUNCTION public.push_annulations_neuves(p_depuis timestamptz)
 RETURNS TABLE(user_id uuid, cle text, plateforme text, vente_id bigint, commande_ref text, inventaire_id bigint, annulee_le timestamptz)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT DISTINCT ON (r.user_id, public.push_annulation_cle(j.platform_fields -> 'vente_annulee_remise'))
         r.user_id,
         public.push_annulation_cle(j.platform_fields -> 'vente_annulee_remise'),
         public.push_annulation_plateforme(j.platform_fields -> 'vente_annulee_remise'),
         CASE WHEN (j.platform_fields #>> '{vente_annulee_remise,vente}') ~ '^[0-9]{1,18}$'
              THEN (j.platform_fields #>> '{vente_annulee_remise,vente}')::bigint END,
         nullif(btrim(j.platform_fields #>> '{vente_annulee_remise,commande}'), ''),
         r.inventaire_id,
         public.push_annulation_le(j.platform_fields -> 'vente_annulee_remise')
    FROM remises_en_vente r
    JOIN cross_post_jobs j ON j.id = r.job_vendu AND j.user_id = r.user_id
   WHERE r.statut = 'proposee'
     AND coalesce(j.platform_fields, '{}'::jsonb) ? 'vente_annulee_remise'
     AND public.push_annulation_cle(j.platform_fields -> 'vente_annulee_remise') IS NOT NULL
     AND public.push_annulation_le(j.platform_fields -> 'vente_annulee_remise') >= p_depuis
     AND public.push_annulation_le(j.platform_fields -> 'vente_annulee_remise') > now() - interval '24 hours'
     AND public.push_annulation_le(j.platform_fields -> 'vente_annulee_remise') <= now() - interval '6 minutes'
   ORDER BY r.user_id, public.push_annulation_cle(j.platform_fields -> 'vente_annulee_remise'), r.inventaire_id
$function$;

-- 5. Le réveil du cron : une annulation attend-elle ? (jamais d'erreur : au pire, la notification attend)
CREATE OR REPLACE FUNCTION public.push_annulations_en_attente()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_depuis integer;
BEGIN
  SELECT value INTO v_depuis FROM coin_config WHERE key = 'push_annulations_depuis';
  IF coalesce(v_depuis, 0) <= 0 THEN RETURN false; END IF;
  RETURN EXISTS (SELECT 1 FROM push_annulations a
                  WHERE a.statut = 'a_envoyer' OR (a.statut = 'en_envoi' AND a.traite_le < now() - interval '3 minutes'))
      OR EXISTS (SELECT 1 FROM push_annulations_neuves(to_timestamp(v_depuis)) c
                  WHERE NOT EXISTS (SELECT 1 FROM push_annulations a WHERE a.user_id = c.user_id AND a.cle = c.cle));
EXCEPTION WHEN OTHERS THEN
  RETURN false;
END;
$function$;

-- 6. La décision et la réservation (appelée par push-ventes, rôle de service) : naissance des notes, relecture,
--    passage « en_envoi » sous verrou. Renvoie les notes à envoyer avec appareils et langue — jamais un mail.
CREATE OR REPLACE FUNCTION public.push_annulations_a_envoyer(p_limite integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET statement_timeout TO '10s'
 SET lock_timeout TO '2s'
AS $function$
DECLARE
  v_depuis integer;
  v_user   uuid;
  r        record;
  v_app    jsonb;
  v_lang   text;
  v_nb     integer;
  v_inv    bigint;
  v_titre  text;
  v_out    jsonb := '[]'::jsonb;
  v_n      integer := 0;
BEGIN
  SELECT value INTO v_depuis FROM coin_config WHERE key = 'push_annulations_depuis';
  IF coalesce(v_depuis, 0) <= 0 THEN
    RETURN jsonb_build_object('notes', '[]'::jsonb, 'arme', false);
  END IF;
  -- Un envoi interrompu (fonction tuée) repart, trois essais au plus ; une note jamais partie en 24 h n'apprend plus
  -- rien à personne ; le journal garde 90 jours (borné : 500 lignes par passage).
  UPDATE push_annulations
     SET statut = CASE WHEN essais >= 3 THEN 'echec' ELSE 'a_envoyer' END,
         motif  = CASE WHEN essais >= 3 THEN 'envoi_interrompu' ELSE motif END
   WHERE statut = 'en_envoi' AND traite_le < now() - interval '3 minutes';
  UPDATE push_annulations SET statut = 'ignoree', motif = 'trop_tard', traite_le = now()
   WHERE statut = 'a_envoyer' AND annulee_le < now() - interval '24 hours';
  DELETE FROM push_annulations WHERE id IN (
    SELECT id FROM push_annulations WHERE cree_le < now() - interval '90 days' LIMIT 500);

  -- Naissance : une note par annulation neuve (clé unique : jamais deux, même avec deux appels simultanés).
  INSERT INTO push_annulations (user_id, cle, plateforme, vente_id, commande_ref, inventaire_id, titre, annulee_le)
  SELECT c.user_id, c.cle, c.plateforme, c.vente_id, c.commande_ref, c.inventaire_id, left(i.titre, 200), c.annulee_le
    FROM push_annulations_neuves(to_timestamp(v_depuis)) c
    LEFT JOIN inventaire i ON i.id = c.inventaire_id AND i.user_id = c.user_id
  ON CONFLICT (user_id, cle) DO NOTHING;

  FOR v_user IN
    SELECT a.user_id FROM push_annulations a WHERE a.statut = 'a_envoyer'
     GROUP BY a.user_id ORDER BY min(a.cree_le) LIMIT 20
  LOOP
    -- Un seul appel décide pour un compte ; l'autre passe (il reviendra).
    IF NOT pg_try_advisory_xact_lock(hashtextextended('push_annulations:' || v_user::text, 0)) THEN
      CONTINUE;
    END IF;
    SELECT coalesce(jsonb_agg(jsonb_build_object('id', a.id, 'plateforme', a.plateforme,
                                                 'jeton', a.jeton, 'apns_env', a.apns_env)), '[]'::jsonb)
      INTO v_app FROM appareils_push a WHERE a.user_id = v_user;
    SELECT coalesce(p.lang, 'fr') INTO v_lang FROM profiles p WHERE p.id = v_user;

    FOR r IN
      SELECT * FROM push_annulations
       WHERE user_id = v_user AND statut = 'a_envoyer'
       ORDER BY id
       FOR UPDATE SKIP LOCKED
    LOOP
      IF r.cle LIKE 'essai:%' THEN
        -- Note d'ESSAI (scripts/push/essai-notification-annulation.mjs, compte de Nico) : aucune proposition à relire.
        v_nb := 1; v_inv := r.inventaire_id; v_titre := r.titre;
      ELSE
        -- La proposition tient-elle encore ? (appui déjà fait, « déjà en vente », plus en stock → rien ne part)
        SELECT count(DISTINCT x.inventaire_id), min(x.inventaire_id)
          INTO v_nb, v_inv
          FROM remises_en_vente x
          JOIN cross_post_jobs jx ON jx.id = x.job_vendu AND jx.user_id = x.user_id
          JOIN inventaire ix ON ix.id = x.inventaire_id AND ix.user_id = x.user_id
         WHERE x.user_id = v_user AND x.statut = 'proposee'
           AND public.push_annulation_cle(jx.platform_fields -> 'vente_annulee_remise') = r.cle
           AND ix.statut = 'stock' AND ix.fusionne_dans IS NULL AND coalesce(ix.quantite, 1) > 0;
        IF coalesce(v_nb, 0) = 0 THEN
          UPDATE push_annulations SET statut = 'ignoree', motif = 'plus_proposee', traite_le = now() WHERE id = r.id;
          CONTINUE;
        END IF;
        SELECT left(i.titre, 200) INTO v_titre FROM inventaire i WHERE i.id = v_inv AND i.user_id = v_user;
      END IF;
      IF jsonb_array_length(v_app) = 0 THEN
        UPDATE push_annulations SET statut = 'sans_appareil', traite_le = now() WHERE id = r.id;
        CONTINUE;
      END IF;
      UPDATE push_annulations SET statut = 'en_envoi', essais = essais + 1, traite_le = now() WHERE id = r.id;
      v_out := v_out || jsonb_build_object(
        'id', r.id, 'user_id', v_user, 'plateforme', r.plateforme, 'titre', coalesce(v_titre, r.titre),
        'inventaire_id', coalesce(v_inv, r.inventaire_id), 'vente_id', r.vente_id, 'nb_articles', v_nb,
        'appareils', v_app, 'lang', v_lang);
      v_n := v_n + 1;
      EXIT WHEN v_n >= p_limite;
    END LOOP;
    EXIT WHEN v_n >= p_limite;
  END LOOP;
  RETURN jsonb_build_object('notes', v_out, 'arme', true);
END;
$function$;

-- 7. Le verdict (push-ventes) : la note, puis les appareils — même tenue que les ventes (push_ventes_resultat, notes
--    vides : jetons morts oubliés, derniers envois, bascule sandbox), sans toucher à une note de vente.
CREATE OR REPLACE FUNCTION public.push_annulations_resultat(p jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  x jsonb;
  v jsonb;
BEGIN
  FOR x IN SELECT value FROM jsonb_array_elements(coalesce(p -> 'notes', '[]'::jsonb)) LOOP
    UPDATE push_annulations SET
      statut = CASE x ->> 'statut'
                 WHEN 'envoyee' THEN 'envoyee'
                 WHEN 'a_reessayer' THEN CASE WHEN essais >= 3 THEN 'echec' ELSE 'a_envoyer' END
                 ELSE 'echec' END,
      motif = nullif(x ->> 'motif', ''),
      resultat = x -> 'resultat',
      traite_le = now()
    WHERE id = (x ->> 'id')::bigint AND statut = 'en_envoi';
  END LOOP;
  v := public.push_ventes_resultat(jsonb_build_object(
         'notes', '[]'::jsonb,
         'invalides', coalesce(p -> 'invalides', '[]'::jsonb), 'ok', coalesce(p -> 'ok', '[]'::jsonb),
         'sandbox', coalesce(p -> 'sandbox', '[]'::jsonb), 'echecs', coalesce(p -> 'echecs', '[]'::jsonb)));
  RETURN jsonb_build_object('ok', true, 'appareils_oublies', coalesce((v ->> 'appareils_oublies')::integer, 0));
END;
$function$;

-- 8. La SIMULATION (push-ventes, corps {"simulation":"annulations","user":"<uuid>"}) : ce qui partirait — lecture seule,
--    aucun jeton rendu (le nombre d'appareils seulement). Interrupteur coupé : les annulations des dernières 24 h.
CREATE OR REPLACE FUNCTION public.push_annulations_apercu(p_user uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_depuis integer;
  v_out    jsonb;
BEGIN
  SELECT value INTO v_depuis FROM coin_config WHERE key = 'push_annulations_depuis';
  SELECT coalesce(jsonb_agg(jsonb_build_object(
           'user_id', c.user_id, 'cle', c.cle, 'plateforme', c.plateforme, 'vente_id', c.vente_id,
           'commande_ref', c.commande_ref, 'inventaire_id', c.inventaire_id, 'annulee_le', c.annulee_le,
           'titre', (SELECT left(i.titre, 200) FROM inventaire i WHERE i.id = c.inventaire_id AND i.user_id = c.user_id),
           'deja_notee', EXISTS (SELECT 1 FROM push_annulations a WHERE a.user_id = c.user_id AND a.cle = c.cle),
           'appareils', (SELECT count(*) FROM appareils_push ap WHERE ap.user_id = c.user_id),
           'lang', (SELECT coalesce(p.lang, 'fr') FROM profiles p WHERE p.id = c.user_id))
           ORDER BY c.annulee_le), '[]'::jsonb)
    INTO v_out
    FROM push_annulations_neuves(CASE WHEN coalesce(v_depuis, 0) > 0 THEN to_timestamp(v_depuis)
                                      ELSE now() - interval '24 hours' END) c
   WHERE p_user IS NULL OR c.user_id = p_user;
  RETURN jsonb_build_object('arme', coalesce(v_depuis, 0) > 0,
                            'depuis', CASE WHEN coalesce(v_depuis, 0) > 0 THEN to_timestamp(v_depuis) END,
                            'candidates', v_out);
END;
$function$;

REVOKE ALL ON FUNCTION public.push_annulations_neuves(timestamptz) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_annulations_en_attente() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_annulations_a_envoyer(integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_annulations_resultat(jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.push_annulations_apercu(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.push_annulations_neuves(timestamptz) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_annulations_en_attente() TO service_role;
GRANT EXECUTE ON FUNCTION public.push_annulations_a_envoyer(integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_annulations_resultat(jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.push_annulations_apercu(uuid) TO service_role;

-- 9. L'armement : seules les annulations vues APRÈS l'application de cette migration seront notifiées.
INSERT INTO public.coin_config (key, value) VALUES ('push_annulations_depuis', extract(epoch FROM now())::integer)
ON CONFLICT (key) DO NOTHING;

-- 10. Le réveil : un cron À PART (le 34 des ventes est inchangé), une requête par minute, rien si rien n'attend.
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'push-annulations-1min';
SELECT cron.schedule('push-annulations-1min', '* * * * *', $cron$
  SELECT net.http_post(
    url     := 'https://tojihnuawsoohlolangc.supabase.co/functions/v1/push-ventes',
    headers := ('{"Content-Type":"application/json"}'::jsonb || jsonb_build_object('x-cron-secret', public.cron_secret())),
    body    := '{"trigger":"push_annulations_cron"}'::jsonb,
    timeout_milliseconds := 60000
  )
  WHERE public.push_annulations_en_attente();
$cron$);

COMMIT;

-- ═══ VÉRIFICATIONS (après application, lecture seule)
-- select key, value, to_timestamp(value) at time zone 'Europe/Paris' from coin_config where key = 'push_annulations_depuis';
-- select jobid, jobname, schedule, active from cron.job where jobname in ('push-ventes-1min', 'push-annulations-1min');
-- select public.push_annulations_en_attente();                    -- false tant qu'aucune annulation neuve
-- select statut, motif, count(*) from push_annulations group by 1, 2;
