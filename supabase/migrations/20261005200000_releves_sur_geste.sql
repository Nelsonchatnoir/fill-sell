-- ═══════════════════════════════════════════════════════════════════════════
-- UN RELEVÉ D'IMPORT NE DÉMARRE QUE SUR « SYNCHRONISER » (05/10, règle de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cas qui l'ouvre : Marine (inscrite à 18:28, compte supprimé à 19:13). Le
-- serveur a posé SEUL son premier relevé Vinted (« serveur:premier_releve »)
-- dès la première visite de son extension ; il a attendu derrière le relevé
-- Beebs, posé seul lui aussi, puis le chien de garde l'a arrêté en écrivant
-- « le défaut est chez nous ». Rapport : docs/enquetes/marine-0510/RAPPORT.md.
--
-- CE QUI EST COUPÉ (relevés qui importent ou relèvent le stock sans geste) :
--   · serveur:premier_releve      trigger profiles_premiers_releves_trg → SUPPRIMÉ
--   · reprise                     trigger releve_incomplet_reprise      → SUPPRIMÉ
--   · serveur:reprise_absente     reprendre_releves_absents (gpj, à chaque poll) → ne pose plus rien
--   · reprise_connexion           handler-watch → coupé dans le code (v84+) ET refusé ici
--   · serveur:levee_antirobot     get-pending-jobs → refusé ici
--   · toute « :redemande » d'une demande automatique → refusée ici
-- CE QUI RESTE (ne sert qu'à voir les ventes et les retraits, n'importe RIEN) :
--   · cron (veille quotidienne de l'extension), veilleur (annonce qui paraît
--     hors ligne), serveur:retrait_introuvable, serveur:retrait_sans_numero,
--     serveur:verif_redepot, serveur:quotidien_api (eBay relié, par l'API).
--   Leur séparation de l'import : rapprocher_releve n'importe que pour un
--   relevé demandé par la personne (releve_est_geste) ; la sync du dressing
--   Vinted ne crée aucune fiche pendant un relevé automatique (extension
--   0.6.99, et inventaire_ecarte_import_sync pour les versions d'avant).
-- LES GESTES : bouton, bouton_distant, app, et leur « :redemande » (la même
-- demande reposée au retour de l'extension).
--
-- ⛔ AUCUNE DONNÉE TOUCHÉE. Inverse : supabase/rollbacks/20261005200000_releves_sur_geste_INVERSE.sql
--    (définitions lues EN PROD avant application).
-- Mesure : aucun travail automatique ajouté ; deux triggers en moins (l'un
-- tournait à chaque sonde de l'extension, l'autre à chaque fin de relevé),
-- une lecture indexée de plus par fiche Vinted NEUVE seulement.
BEGIN;

-- ── 1. Qui a lancé le relevé ? ─────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.releve_est_geste(p_declencheur text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_declencheur, '') ~ '^(bouton|bouton_distant|app)(:redemande)?$'
$$;
COMMENT ON FUNCTION public.releve_est_geste(text) IS
  'Relevé demandé par la personne (« Synchroniser ») — 05/10. Miroir : DECLENCHEURS_GESTE_RE (extension), declencheursReleve.js (app).';

CREATE OR REPLACE FUNCTION public.releve_est_veille(p_declencheur text)
RETURNS boolean LANGUAGE sql IMMUTABLE AS $$
  SELECT COALESCE(p_declencheur, '') IN ('cron', 'veilleur', 'serveur:retrait_introuvable',
    'serveur:retrait_sans_numero', 'serveur:verif_redepot', 'serveur:quotidien_api')
$$;
COMMENT ON FUNCTION public.releve_est_veille(text) IS
  'Relevé automatique qui ne sert qu''à voir ventes, disparitions et retraits — il n''importe rien (05/10).';

-- ── 2. La garde : un relevé sans geste ni rôle de veille n'entre pas ───────
CREATE OR REPLACE FUNCTION public.garde_releve_sans_geste()
RETURNS trigger LANGUAGE plpgsql SET search_path TO 'public', 'pg_temp' AS $$
BEGIN
  IF NEW.kind NOT IN ('dressing', 'annonces') THEN RETURN NEW; END IF;
  IF releve_est_geste(NEW.declencheur) OR releve_est_veille(NEW.declencheur) THEN RETURN NEW; END IF;
  RAISE LOG 'garde_releve_sans_geste : relevé % % refusé (user %, déclencheur %) — un relevé d''import ne part que sur « Synchroniser »',
    NEW.kind, COALESCE(NEW.platform, 'vinted'), NEW.user_id, COALESCE(NEW.declencheur, '(aucun)');
  RETURN NULL;
END;
$$;
DROP TRIGGER IF EXISTS garde_releve_sans_geste ON public.vinted_sync_runs;
CREATE TRIGGER garde_releve_sans_geste BEFORE INSERT ON public.vinted_sync_runs
  FOR EACH ROW EXECUTE FUNCTION public.garde_releve_sans_geste();

-- ── 3. Plus de premier relevé posé par le serveur ──────────────────────────
DROP TRIGGER IF EXISTS profiles_premiers_releves_trg ON public.profiles;

-- ── 4. Plus de reprise automatique d'un relevé incomplet ou raté ───────────
DROP TRIGGER IF EXISTS releve_incomplet_reprise ON public.vinted_sync_runs;

-- ── 5. Plus de reprise des relevés « absente » à chaque poll ──────────────
-- Même signature, même forme de réponse (get-pending-jobs lit `plateformes`) :
-- la fonction ne pose plus rien.
CREATE OR REPLACE FUNCTION public.reprendre_releves_absents(p_user uuid, p_simulation boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  -- (05/10, règle de Nico) Un relevé ne démarre que sur « Synchroniser ».
  RETURN jsonb_build_object('ok', true, 'plateformes', '{}'::jsonb, 'coupe', 'releve_sur_geste_0510');
END;
$function$;

-- ── 6. Seul un relevé demandé par la personne importe (LBC, Beebs, eBay, Opla)
DO $migration$
DECLARE
  v_def text;
  v_avant constant text := $a$v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1;$a$;
  v_apres constant text := $b$v_import_ouvert := COALESCE((SELECT value FROM coin_config WHERE key = 'import_auto_ouvert'), 0) = 1
    -- (05/10, règle de Nico) Un relevé automatique (veille, vérification
    -- d'un retrait ou d'un redépôt) voit, date et tranche — il n'importe rien.
    AND releve_est_geste(v_run.declencheur);$b$;
BEGIN
  v_def := pg_get_functiondef('public.rapprocher_releve(uuid)'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant) <> 1 THEN
    RAISE EXCEPTION 'rapprocher_releve : la ligne d''import attendue n''est pas là une fois et une seule — la prod a changé, rien n''est appliqué';
  END IF;
  EXECUTE replace(v_def, v_avant, v_apres);
END;
$migration$;

-- ── 7. Vinted, extensions d'avant la 0.6.99 : aucune fiche NEUVE pendant un
--      relevé automatique. Même place que les refus existants : APRÈS le
--      test « l'article existe déjà » (un RETURN NULL avant figerait l'upsert
--      des fiches connues, cf. le resserrage du 28/08).
DO $migration$
DECLARE
  v_def text;
  v_avant constant text := $a$  if exists (
    select 1 from inventaire i
    where i.user_id = new.user_id
      and i.vinted_item_id is not distinct from new.vinted_item_id
  ) then
    return new;
  end if;
$a$;
  v_apres constant text := $b$  if exists (
    select 1 from inventaire i
    where i.user_id = new.user_id
      and i.vinted_item_id is not distinct from new.vinted_item_id
  ) then
    return new;
  end if;

  -- (05/10, règle de Nico) Un relevé AUTOMATIQUE du dressing (veille, retrait)
  -- n'importe rien : l'article neuf attend le prochain « Synchroniser ».
  if exists (
    select 1 from vinted_sync_runs r
    where r.user_id = new.user_id and r.kind = 'dressing' and r.status = 'running'
      and not releve_est_geste(r.declencheur)
  ) then
    raise log 'inventaire_ecarte_import_sync : article % non importé (relevé automatique en cours, user %)', new.vinted_item_id, new.user_id;
    return null;
  end if;
$b$;
BEGIN
  v_def := pg_get_functiondef('public.inventaire_ecarte_import_sync()'::regprocedure);
  IF (length(v_def) - length(replace(v_def, v_avant, ''))) / length(v_avant) <> 1 THEN
    RAISE EXCEPTION 'inventaire_ecarte_import_sync : le test « déjà là » attendu n''est pas là une fois et une seule — la prod a changé, rien n''est appliqué';
  END IF;
  EXECUTE replace(v_def, v_avant, v_apres);
END;
$migration$;

COMMIT;
