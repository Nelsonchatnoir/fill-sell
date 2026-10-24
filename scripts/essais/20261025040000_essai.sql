-- Essai à blanc de 20261025040000_push_vente_annulee : ROLLBACK, rien ne reste (ni table, ni cron, ni note).
-- Généré par scripts/essais/20261025040000_generer.mjs — ne pas modifier à la main.
begin;
set local statement_timeout = '120s';
set local lock_timeout = '5s';
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

-- ═══ TESTS
-- Essai à blanc de 20261025040000 (notification « Vente annulée ») — joué APRÈS le corps de la migration, puis ROLLBACK.
-- Fiches, dépôts, propositions et UN appareil FICTIFS du compte de Nico (créés et effacés dans la transaction) ; aucun
-- appel réseau (le cron n'est pas déclenché, push-ventes n'est pas appelé) ; aucun mail possible (aucune fonction ici
-- n'écrit email_logs — E14 le relit).
create temp table _r (essai text, ok boolean, detail text) on commit drop;
create temp table _avant on commit drop as
  select (select count(*) from email_logs) as mails, (select count(*) from push_ventes) as notes_ventes,
         (select count(*) from remises_en_vente where statut = 'proposee') as proposees;

-- Armement une heure avant (la migration l'a posé à « maintenant ») ; tout se lit dans CETTE transaction.
update coin_config set value = extract(epoch from now() - interval '1 hour')::integer where key = 'push_annulations_depuis';

-- Marques comme les pose vente_commande_annulee_vinted (dépôt Vinted : 'plateforme' ; copies : sans) et
-- vente_transaction_annulee_leboncoin ('source').
create function pg_temp.marque(p_vente bigint, p_commande text, p_le timestamptz, p_pf text default null, p_source text default null)
returns jsonb language sql as $$
  select jsonb_build_object('vente_annulee_remise',
    jsonb_strip_nulls(jsonb_build_object('vente', p_vente, 'commande', p_commande, 'statut', 'annulee', 'le', p_le,
                                         'plateforme', p_pf, 'source', p_source)))
$$;
-- Fiches FICTIVES (stock, un exemplaire).
insert into inventaire (id, user_id, titre, description, prix_vente, photos, statut, quantite)
select 999000000000000 + n, 'f44b5917-bccc-4431-ba41-f40571a2ed18', 'essai annulation ' || n, 'essai', 999, '[]'::jsonb, 'stock', 1
  from unnest(array[881, 882, 883, 884, 885, 886, 887, 888, 889, 890]) n;
-- Dépôts vendus FICTIFS (fermés) portant la marque, et leurs propositions.
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values
  -- A : annulation Vinted d'il y a 7 min — dépôt Vinted + copie Beebs → UNE note
  ('00000000-0000-4000-8000-000000000881', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000881, 'vinted', 'publish', 'cancelled', 'A', 999, '[]', pg_temp.marque(999881, 'ESSAI-881', now() - interval '7 minutes', 'vinted')),
  ('00000000-0000-4000-8000-000000000981', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000881, 'beebs', 'publish', 'cancelled', 'A', 999, '[]', pg_temp.marque(999881, 'ESSAI-881', now() - interval '7 minutes')),
  -- B : il y a 2 min (calme de 6 min pas écoulé)
  ('00000000-0000-4000-8000-000000000882', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000882, 'vinted', 'publish', 'cancelled', 'B', 999, '[]', pg_temp.marque(999882, 'ESSAI-882', now() - interval '2 minutes', 'vinted')),
  -- C : AVANT l'armement (il y a 2 h)
  ('00000000-0000-4000-8000-000000000883', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000883, 'vinted', 'publish', 'cancelled', 'C', 999, '[]', pg_temp.marque(999883, 'ESSAI-883', now() - interval '2 hours', 'vinted')),
  -- D : déjà acceptée (a_faire)
  ('00000000-0000-4000-8000-000000000884', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000884, 'vinted', 'publish', 'cancelled', 'D', 999, '[]', pg_temp.marque(999884, 'ESSAI-884', now() - interval '7 minutes', 'vinted')),
  -- E : achat Leboncoin annulé (copie Vinted proposée, marque « source »)
  ('00000000-0000-4000-8000-000000000885', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000885, 'vinted', 'publish', 'cancelled', 'E', 999, '[]', pg_temp.marque(999885, null, now() - interval '7 minutes', null, 'transaction_leboncoin')),
  -- F : commande en LOT (2 articles, 2 ventes, une commande) → UNE note, 2 articles
  ('00000000-0000-4000-8000-000000000886', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000886, 'vinted', 'publish', 'cancelled', 'F1', 999, '[]', pg_temp.marque(999886, 'ESSAI-886', now() - interval '7 minutes', 'vinted')),
  ('00000000-0000-4000-8000-000000000887', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000887, 'vinted', 'publish', 'cancelled', 'F2', 999, '[]', pg_temp.marque(999887, 'ESSAI-886', now() - interval '7 minutes', 'vinted')),
  -- G : proposition close « déjà en vente » ENTRE la naissance de la note et l'envoi
  ('00000000-0000-4000-8000-000000000888', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000888, 'vinted', 'publish', 'cancelled', 'G', 999, '[]', pg_temp.marque(999888, 'ESSAI-888', now() - interval '7 minutes', 'vinted')),
  -- H : marque illisible (« le » n'est pas une date) → jamais une note, jamais une erreur
  ('00000000-0000-4000-8000-000000000889', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000889, 'vinted', 'publish', 'cancelled', 'H', 999, '[]', jsonb_build_object('vente_annulee_remise', jsonb_build_object('vente', 999889, 'le', 'pas une date')));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
select 'f44b5917-bccc-4431-ba41-f40571a2ed18', j.inventaire_id, j.platform, j.id,
       case when j.id = '00000000-0000-4000-8000-000000000884' then 'a_faire' else 'proposee' end, now()
  from cross_post_jobs j where j.id::text like '00000000-0000-4000-8000-000000000%' and j.inventaire_id between 999000000000881 and 999000000000889;

-- ── Sans téléphone : rien ne part, la note le dit (« sans_appareil »)
delete from appareils_push where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18';   -- (0 ligne en prod le 25/10)
insert into _r select 'E01 le cron se réveille (une annulation neuve attend)', public.push_annulations_en_attente(), null;
insert into _r select 'E02 aperçu (simulation) : A, E, F, G — ni B (calme), ni C (avant l''armement), ni D (acceptée), ni H (illisible)',
  string_agg(c ->> 'cle', ',' order by c ->> 'cle') = 'commande:vinted:ESSAI-881,commande:vinted:ESSAI-886,commande:vinted:ESSAI-888,vente:999885',
  string_agg(c ->> 'cle', ',' order by c ->> 'cle')
  from jsonb_array_elements(public.push_annulations_apercu('f44b5917-bccc-4431-ba41-f40571a2ed18') -> 'candidates') c;
insert into _r select 'E03 l''aperçu n''écrit rien', count(*) = 0, count(*)::text from push_annulations;
-- G : sa note naît (passage où le compte n'a pas de téléphone), puis la proposition se ferme avant un autre essai.
create temp table _p1 on commit drop as select public.push_annulations_a_envoyer(20) as r;
insert into _r select 'E04 sans appareil : aucune note servie à push-ventes', jsonb_array_length(r -> 'notes') = 0, r::text from _p1;
insert into _r select 'E05 une note par annulation, toutes « sans_appareil »',
  count(*) = 4 and bool_and(statut = 'sans_appareil'), string_agg(cle || '=' || statut, ' ; ' order by cle) from push_annulations;
insert into _r select 'E06 la commande en lot : UNE note (le premier article)',
  count(*) = 1 and min(inventaire_id) = 999000000000886, string_agg(cle || ' inv ' || inventaire_id, ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-886';
insert into _r select 'E07 achat Leboncoin annulé : clé de la vente, plateforme leboncoin',
  count(*) = 1 and bool_and(plateforme = 'leboncoin'), string_agg(cle || ' ' || plateforme, ' ; ')
  from push_annulations where cle = 'vente:999885';
insert into _r select 'E08 le cron se rendort (plus rien à faire)', not public.push_annulations_en_attente(), null;

-- ── Avec un téléphone (FICTIF) : seules les annulations NEUVES partent ; les notes déjà nées ne repartent jamais.
insert into appareils_push (user_id, plateforme, jeton) values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 'android', 'essai-annulation-' || repeat('x', 40));
create temp table _p2 on commit drop as select public.push_annulations_a_envoyer(20) as r;
insert into _r select 'E09 une annulation déjà notée ne repart JAMAIS (même avec un téléphone arrivé depuis)',
  jsonb_array_length(r -> 'notes') = 0, r::text from _p2;
-- Une annulation NEUVE (I : il y a 6 min 30 s) sur la fiche 890, et la note G remise « à envoyer » à la main pour la relecture.
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values ('00000000-0000-4000-8000-000000000890', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'vinted', 'publish', 'cancelled', 'I', 999, '[]', pg_temp.marque(999890, 'ESSAI-890', now() - interval '390 seconds', 'vinted'));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'vinted', '00000000-0000-4000-8000-000000000890', 'proposee', now());
update push_annulations set statut = 'a_envoyer' where cle = 'commande:vinted:ESSAI-888';
update remises_en_vente set statut = 'abandonnee', motif = 'deja_en_vente', traite_le = now() where job_vendu = '00000000-0000-4000-8000-000000000888';
create temp table _p3 on commit drop as select public.push_annulations_a_envoyer(20) as r;
insert into _r select 'E10 l''annulation neuve part : texte servi (titre de la fiche, plateforme, langue, 1 appareil)',
  jsonb_array_length(r -> 'notes') = 1
  and (r -> 'notes' -> 0 ->> 'titre') = 'essai annulation 890' and (r -> 'notes' -> 0 ->> 'plateforme') = 'vinted'
  and (r -> 'notes' -> 0 ->> 'lang') = 'fr' and jsonb_array_length(r -> 'notes' -> 0 -> 'appareils') = 1
  and (r -> 'notes' -> 0 ->> 'inventaire_id') = '999000000000890' and (r -> 'notes' -> 0 ->> 'nb_articles') = '1',
  ((r -> 'notes' -> 0) - 'appareils') #>> '{}' from _p3;
insert into _r select 'E11 proposition close avant l''envoi → « ignoree / plus_proposee », rien ne part',
  bool_and(statut = 'ignoree' and motif = 'plus_proposee'), string_agg(statut || '/' || coalesce(motif, '∅'), ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-888';
insert into _r select 'E12 en_envoi, un essai compté', bool_and(statut = 'en_envoi' and essais = 1), string_agg(statut || ' ' || essais, ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-890';

-- ── Le verdict : à réessayer (3 fois au plus), puis envoyée ; un jeton refusé est oublié.
select public.push_annulations_resultat(jsonb_build_object('notes', jsonb_build_array(jsonb_build_object(
  'id', (select id from push_annulations where cle = 'commande:vinted:ESSAI-890'), 'statut', 'a_reessayer', 'motif', 'transitoire: HTTP 503', 'resultat', '[]'::jsonb))));
insert into _r select 'E13 à réessayer → « a_envoyer » (essai 1 sur 3)', bool_and(statut = 'a_envoyer'), string_agg(statut || ' ' || essais, ' ; ')
  from push_annulations where cle = 'commande:vinted:ESSAI-890';
create temp table _p4 on commit drop as select public.push_annulations_a_envoyer(20) as r;
select public.push_annulations_resultat(jsonb_build_object(
  'notes', jsonb_build_array(jsonb_build_object('id', (select id from push_annulations where cle = 'commande:vinted:ESSAI-890'), 'statut', 'envoyee', 'resultat', '[]'::jsonb)),
  'invalides', jsonb_build_array('essai-annulation-' || repeat('x', 40))));
insert into _r select 'E14 envoyée (2e essai), et le jeton refusé est oublié',
  (select bool_and(statut = 'envoyee' and essais = 2) from push_annulations where cle = 'commande:vinted:ESSAI-890')
  and not exists (select 1 from appareils_push where user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
  (select string_agg(statut || ' ' || essais, ' ; ') from push_annulations where cle = 'commande:vinted:ESSAI-890');
insert into _r select 'E15 la reprise a servi la même note (jamais une seconde note)', jsonb_array_length(r -> 'notes') = 1
  and (select count(*) from push_annulations where cle = 'commande:vinted:ESSAI-890') = 1, null from _p4;

-- ── Trop tard, interrupteur coupé.
update push_annulations set statut = 'a_envoyer', annulee_le = now() - interval '25 hours' where cle = 'vente:999885';
select public.push_annulations_a_envoyer(20);
insert into _r select 'E16 une note de plus de 24 h ne part plus (« ignoree / trop_tard »)',
  bool_and(statut = 'ignoree' and motif = 'trop_tard'), string_agg(statut || '/' || coalesce(motif, '∅'), ' ; ')
  from push_annulations where cle = 'vente:999885';
update coin_config set value = 0 where key = 'push_annulations_depuis';
insert into cross_post_jobs (id, user_id, inventaire_id, platform, action, status, title, price, photos, platform_fields)
values ('00000000-0000-4000-8000-000000000990', 'f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'beebs', 'publish', 'cancelled', 'J', 999, '[]', pg_temp.marque(999990, 'ESSAI-990', now() - interval '7 minutes'));
insert into remises_en_vente (user_id, inventaire_id, platform, job_vendu, statut, prochain_essai)
values ('f44b5917-bccc-4431-ba41-f40571a2ed18', 999000000000890, 'beebs', '00000000-0000-4000-8000-000000000990', 'proposee', now());
insert into _r select 'E17 interrupteur à 0 : rien ne naît, le cron dort',
  (public.push_annulations_a_envoyer(20) ->> 'arme') = 'false' and not public.push_annulations_en_attente()
  and not exists (select 1 from push_annulations where cle = 'commande:vinted:ESSAI-990'), null;

-- ── Rien d'autre n'est touché.
insert into _r select 'E18 0 mail, 0 note de vente, propositions jamais modifiées par la notification',
  (select count(*) from email_logs) = a.mails and (select count(*) from push_ventes) = a.notes_ventes
  and (select count(*) from remises_en_vente where statut = 'proposee' and inventaire_id not between 999000000000000 and 999000000000999) = a.proposees,
  format('mails %s→%s, notes %s→%s', a.mails, (select count(*) from email_logs), a.notes_ventes, (select count(*) from push_ventes)) from _avant a;
insert into _r select 'E19 les annulations réelles d''avant l''armement ne sont jamais notées', count(*) = 0, count(*)::text
  from push_annulations where inventaire_id not between 999000000000000 and 999000000000999;
select essai, ok, left(detail, 300) detail from _r order by essai;

rollback;
