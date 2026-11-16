-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION 16/11/2026 — ayadi007 (cfdfda6f-d182-4974-81b2-07050fc95d37) : REMPLACER SON COMPTE LEBONCOIN
--   ancien bf460991-06f6-4460-a36f-b60393964407 (bloqué : page de connexion depuis le 16/11 10:28 ; depuis 12:44 les pages
--   publiques de ses 90 annonces publiées répondent « hors ligne ») → nouveau 23b59b14-5cde-4fff-8bcb-7c6464608a33 (relevé
--   par le Mac, 67/67 le 16/11 à 14:16).
-- Ordre de Nico (lot du 16/11 après-midi, point 7) : « Feu vert de Nico pour la migration remplacer mon compte (D1 à D10).
-- Clore proprement les 107 annonces de l'ancien compte bloqué. Ses 3 annonces vendues encore en ligne : les retirer. »
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- PRÉREQUIS : la migration 20261116200000_comptes_plateforme_remplacer APPLIQUÉE (§ 0 le vérifie et s'arrête sinon).
-- JOUER :     npx supabase db query --linked -f scripts/reparations/20261116_ayadi_remplacer_compte_lbc.sql
-- INVERSE :   scripts/reparations/20261116_ayadi_remplacer_compte_lbc_INVERSE.sql
-- (*.sql est ignoré dans scripts/reparations : git add -f.)
--
-- LA FORME DE L'APPEL — « en tant que service », sans session :
--   remplacer_compte_plateforme_pour(p_user, 'leboncoin', p_compte, p_simuler, 'script') : la fonction INTERNE de la
--   migration (exécutable par service_role et le SQL du serveur seulement ; fermée à anon et authenticated). Appelée ici
--   sans jeton, auth.role() vaut NULL : sa garde d'identité laisse passer le serveur, et refuse toute session qui
--   viserait un autre compte que le sien. decide_par = 'script' dit honnêtement que FillSell a décidé, pas ayadi.
--   Écartée : set_config('request.jwt.claims', '{"sub": "cfdfda6f…", "role": "authenticated"}') — usurper la session
--   d'ayadi ferait écrire decide_par = 'utilisateur' (faux), passerait sous le rôle authenticated (délai de 8 s) et
--   laisserait une identité simulée dans la transaction pour tout ce qui suit.
--
-- CE QUE LE GESTE FAIT (et ne fait jamais) : voir la migration. Ici : les annonces vivantes de bf460991 closes
-- (disparu_le + compte_quitte_le ; jamais retiree_le, jamais une fiche) ; leurs tâches publiées closes « Ancien compte
-- Leboncoin quitté le 16/11, ce n'est pas une vente : FillSell ne suit plus cette annonce et n'a rien retiré. » — leurs
-- questions « Vendue ? » ouvertes (et les premières lectures hors ligne) closes avec elles, signal gardé dans
-- platform_fields.compte_quitte.signal_avant ; registre : bf460991 'quitte', 23b59b14 'suivi' (decide_par 'script').
-- Jamais : une vente, un retrait créé, un retrait des copies Vinted, une fiche modifiée, un mail.
--
-- BILAN ATTENDU (prévision relue le 16/11 vers 14:55, mêmes règles en lecture seule — .tmp-terminal/p7m/prod/q20.sql) :
--   ~108 annonces closes (95 sur une fiche ; 91 fiches au stock, libérées pour Leboncoin) — l'ordre dit 107 : la 108e est
--   3309868010, retirée par FillSell le 16/11 à 08:36 mais encore « en ligne » chez nous ;
--   ~90 tâches publiées closes, dont ~33 questions « Vendue ? » ouvertes et ~57 premières lectures hors ligne (le nombre
--   de questions monte d'heure en heure : la veille relit ces pages, toutes « hors ligne » depuis 12:51) ;
--   0 republication, 0 retrait, 0 republication engagée, 0 annonce au compte inconnu ; 1 annonce du nouveau compte sans
--   fiche → rangement relancé.
--   Les objets VENDUS encore « en ligne » sur l'ancien compte (closes chez nous, listés dans le bilan) : 3303478608 Costume
--   garçon 7 ans, 3308401684 Dashcam rétroviseur, 3308403369 Lampe horticole LED (+ 3308402995 Thermomètre : achat en
--   cours sur cette annonce même). « Les retirer » SUR LEBONCOIN : impossible pour FillSell — il retire dans la session
--   Leboncoin ouverte dans Chrome sur le compte qui possède l'annonce, et cette session n'existe plus (page de connexion) ;
--   un retrait créé partirait sur le Mac (nouveau compte) et conclurait à tort « déjà absente ». Compte bloqué : Leboncoin
--   a désactivé ses annonces (elles ne s'achètent plus). Simplement déconnecté : seul ayadi peut les supprimer (appli ou
--   site Leboncoin). Vérification sans compte : ouvrir leboncoin.fr/ad/vetements/3303478608,
--   leboncoin.fr/ad/equipement_auto/3308401684, leboncoin.fr/ad/jardin_plantes/3308403369.
-- La GARDE du § 2 s'arrête (rien écrit, sauvegardes comprises) si la simulation s'écarte de ce bilan.
-- Heure de Paris partout.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ── § 0. La migration est là, le dernier relevé complet est le nouveau compte, rien n'est en cours (lecture) ────────
DO $prerequis$
BEGIN
  IF to_regprocedure('public.remplacer_compte_plateforme_pour(uuid,text,text,boolean,text)') IS NULL THEN
    RAISE EXCEPTION 'migration 20261116200000 non appliquée : rien à faire';
  END IF;
END $prerequis$;
SELECT (SELECT compte || ' (' || etat || ', ' || decide_par || ')' FROM public.comptes_plateforme_suivi
         WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND platform = 'leboncoin' AND etat = 'suivi') AS compte_suivi_actuel,
       (SELECT left(r.compte, 8) || ' · ' || to_char(r.fini_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') || ' · ' || r.lues
               || CASE WHEN r.probant THEN ' · complet' ELSE ' · INCOMPLET' END
          FROM public.compte_plateforme_dernier_releve('cfdfda6f-d182-4974-81b2-07050fc95d37', 'leboncoin') r) AS dernier_releve,
       (SELECT count(*) FROM public.cross_post_jobs j WHERE j.user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37'
           AND j.platform = 'leboncoin' AND j.status = 'processing') AS taches_en_cours;

-- ── § 1. LA SIMULATION (transaction en LECTURE SEULE : Postgres y refuserait toute écriture) ─────────────────────────
BEGIN TRANSACTION READ ONLY;
SELECT jsonb_pretty(public.remplacer_compte_plateforme_pour(
  'cfdfda6f-d182-4974-81b2-07050fc95d37'::uuid, 'leboncoin', '23b59b14-5cde-4fff-8bcb-7c6464608a33', true, 'script')) AS simulation;
COMMIT;

-- ── § 2. SAUVEGARDE + GARDE + GESTE (une seule transaction : une garde qui refuse annule tout) ──────────────────────
BEGIN;
SET LOCAL statement_timeout = '120s';
-- Sauvegarde : les annonces et les tâches Leboncoin d'ayadi telles qu'avant (en plus de la trace de la RPC).
CREATE TABLE public._backup_1611_ayadi_lbc_annonces AS
  SELECT * FROM public.annonces_plateforme WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND platform = 'leboncoin';
CREATE TABLE public._backup_1611_ayadi_lbc_taches AS
  SELECT * FROM public.cross_post_jobs WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND platform = 'leboncoin';
ALTER TABLE public._backup_1611_ayadi_lbc_annonces ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1611_ayadi_lbc_taches ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1611_ayadi_lbc_annonces FROM anon, authenticated;
REVOKE ALL ON TABLE public._backup_1611_ayadi_lbc_taches FROM anon, authenticated;
-- La garde : la simulation, juste avant le geste, doit dire ce que l'ordre a vu.
DO $garde$
DECLARE s jsonb;
BEGIN
  s := public.remplacer_compte_plateforme_pour('cfdfda6f-d182-4974-81b2-07050fc95d37'::uuid, 'leboncoin',
         '23b59b14-5cde-4fff-8bcb-7c6464608a33', true, 'script');
  IF NOT COALESCE((s ->> 'ok')::boolean, false) THEN RAISE EXCEPTION 'garde : simulation refusée : %', s; END IF;
  IF COALESCE((s ->> 'deja')::boolean, false) THEN RAISE EXCEPTION 'garde : le compte est déjà suivi, rien à faire'; END IF;
  IF s -> 'anciens' IS DISTINCT FROM '["bf460991-06f6-4460-a36f-b60393964407"]'::jsonb THEN
    RAISE EXCEPTION 'garde : anciens comptes inattendus : %', s -> 'anciens';
  END IF;
  IF (s ->> 'annonces')::int NOT BETWEEN 100 AND 115 THEN RAISE EXCEPTION 'garde : % annonces à clore (attendu ~108)', s ->> 'annonces'; END IF;
  IF (s ->> 'taches_publiees')::int > 110 THEN RAISE EXCEPTION 'garde : % tâches publiées (attendu ~90)', s ->> 'taches_publiees'; END IF;
  IF (s ->> 'republications')::int > 5 OR jsonb_array_length(s -> 'retraits') > 5 THEN
    RAISE EXCEPTION 'garde : republications % / retraits % inattendus', s ->> 'republications', jsonb_array_length(s -> 'retraits');
  END IF;
  RAISE NOTICE 'garde passée : % annonces, % tâches (% questions « Vendue ? », % premières lectures), % fiches libérées',
    s ->> 'annonces', s ->> 'taches_publiees', s ->> 'questions_vendue', s ->> 'premieres_lectures_hors_ligne', s ->> 'fiches_liberees';
END $garde$;
SELECT jsonb_pretty(public.remplacer_compte_plateforme_pour(
  'cfdfda6f-d182-4974-81b2-07050fc95d37'::uuid, 'leboncoin', '23b59b14-5cde-4fff-8bcb-7c6464608a33', false, 'script')) AS bilan;
COMMIT;

-- ── § 3. RELECTURE (lecture) ─────────────────────────────────────────────────────────────────────────────────────────
SELECT compte, etat, decide_par, to_char(decide_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS le, remplace_par
  FROM public.comptes_plateforme_suivi WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' ORDER BY etat DESC;
SELECT id AS remplacement, par, bilan ->> 'annonces_closes' AS annonces, bilan ->> 'taches_closes' AS taches,
       bilan ->> 'questions_vendue' AS questions_vendue, bilan ->> 'premieres_lectures_hors_ligne' AS premieres_lectures
  FROM public.comptes_plateforme_remplacements WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' ORDER BY le DESC;
-- Plus aucune question « Vendue ? » ouverte sur l'ancien compte, plus aucune tâche publiée dessus (attendu : 0 et 0 —
-- sauf une tâche porteuse d'un signal de VENTE, jamais touchée, nommée dans le bilan : taches_vente_en_attente_laissees).
SELECT count(*) FILTER (WHERE j.platform_fields ->> 'sale_signal' = 'unavailable') AS questions_vendue_ouvertes,
       count(*) AS taches_publiees_ancien_compte
  FROM public.cross_post_jobs j
 WHERE j.user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND j.platform = 'leboncoin' AND j.status = 'published'
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.user_id = j.user_id AND a.platform = 'leboncoin'
                 AND a.compte_plateforme = 'bf460991-06f6-4460-a36f-b60393964407'
                 AND public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id));
