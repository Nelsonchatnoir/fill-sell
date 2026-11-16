-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- RÉPARATION 16/11/2026 soir — le compte cfdfda6f (cfdfda6f-d182-4974-81b2-07050fc95d37) : LES QUESTIONS « VENDUE ? » RESTÉES
-- OUVERTES SUR SON ANCIEN COMPTE LEBONCOIN (bf460991-06f6-4460-a36f-b60393964407, 'quitte' depuis le 16/11 15:22)
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- LE FAIT (lecture seule, 16/11 vers 15:40) : 91 tâches Leboncoin « published » portent une question « Vendue ? »
-- (sale_signal 'unavailable', unavailable_since) sur des annonces de bf460991 DÉJÀ datées disparues par les relevés de
-- ce compte (constat absence_releves, 13/11 13:53 → 15/11 19:32), donc hors du remplacement de 15:22 (il ne prend que
-- les annonces vivantes). L'app les montre (App.jsx : published + fiche + unavailable_since, pas « sold », ni masquée ni
-- reportée — 2 sont « reportées »). Aucune transaction « vendue » lue sur ces annonces ; 51 des 60 du 13/11 ont une autre
-- annonce sur leur fiche (objet remis en ligne). La règle est corrigée pour tous par la migration 20261116210000 ; ce
-- script fait la même chose pour cfdfda6f, déjà remplacé.
-- CE QU'IL FAIT : ces tâches → 'cancelled', même texte que le remplacement (« Ancien compte Leboncoin quitté le 16/11, ce
-- n'est pas une vente : FillSell ne suit plus cette annonce et n'a rien retiré. »), même marque compte_quitte (le
-- remplacement de 15:22, statut et texte d'avant, signal gardé dans signal_avant ; par = 'reparation_questions_restantes').
-- JAMAIS : une tâche porteuse d'un signal de VENTE (« sold »), la fiche d'une republication engagée, une vente, un retrait
-- (aucune copie retirée), une fiche, une annonce (déjà disparue, laissée telle quelle).
-- Risque accepté (décision D1) : si l'une de ces annonces avait été vendue en main propre sur l'ancien compte entre le
-- 13/11 et le 15/11, FillSell ne le demandera plus — 31 ont disparu le 15/11 entre 12 h et 19:32, dont 21 sans autre
-- annonce sur leur fiche.
-- JOUER : npx supabase db query --linked -f scripts/reparations/20261116_ayadi_ancien_compte_questions_restantes.sql
-- INVERSE : scripts/reparations/20261116_ayadi_ancien_compte_questions_restantes_INVERSE.sql  (git add -f : *.sql ignoré)
-- La GARDE s'arrête (rien écrit, sauvegarde comprise) si le nombre de tâches s'écarte de ~91 ou si le compte n'est pas
-- 'quitte'. Heure de Paris.
-- ═══════════════════════════════════════════════════════════════════════════════════════════════════════════════════

-- ── § 0. Combien, lesquelles (lecture) ──────────────────────────────────────────────────────────────────────────────
SELECT count(*) AS taches, count(*) FILTER (WHERE j.platform_fields ->> 'sale_signal' = 'unavailable') AS questions_vendue,
       count(*) FILTER (WHERE j.platform_fields ? 'unavailable_pending_since' AND NOT j.platform_fields ? 'unavailable_since') AS premieres_lectures
  FROM public.cross_post_jobs j
 WHERE j.user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND j.platform = 'leboncoin' AND j.status = 'published'
   AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
   AND (j.platform_fields ? 'unavailable_since' OR j.platform_fields ? 'unavailable_pending_since')
   AND (j.platform_fields ->> 'sale_signal') IS DISTINCT FROM 'sold'
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                WHERE a.user_id = j.user_id AND a.platform = 'leboncoin' AND a.disparu_le IS NOT NULL
                  AND a.compte_plateforme = 'bf460991-06f6-4460-a36f-b60393964407'
                  AND public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id));

-- ── § 1. SAUVEGARDE + GARDE + CLÔTURE (une seule transaction) ───────────────────────────────────────────────────────
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE public._backup_1611_cfdfda6f_questions_restantes AS
SELECT j.* FROM public.cross_post_jobs j
 WHERE j.user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND j.platform = 'leboncoin' AND j.status = 'published'
   AND COALESCE(j.action, 'publish') IN ('publish', 'republish')
   AND (j.platform_fields ? 'unavailable_since' OR j.platform_fields ? 'unavailable_pending_since')
   AND (j.platform_fields ->> 'sale_signal') IS DISTINCT FROM 'sold'
   AND EXISTS (SELECT 1 FROM public.annonces_plateforme a
                WHERE a.user_id = j.user_id AND a.platform = 'leboncoin' AND a.disparu_le IS NOT NULL
                  AND a.compte_plateforme = 'bf460991-06f6-4460-a36f-b60393964407'
                  AND public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id))
   AND NOT EXISTS (SELECT 1 FROM public.cross_post_jobs r
                    WHERE r.user_id = j.user_id AND r.platform = j.platform AND r.inventaire_id = j.inventaire_id
                      AND r.action = 'republish' AND r.status IN ('pending', 'processing', 'needs_user')
                      AND (COALESCE(r.platform_fields ->> 'republish_step', '') NOT IN ('', 'a_capturer', 'captured')
                           OR public.republication_retrait_engage(r.platform_fields)));
ALTER TABLE public._backup_1611_cfdfda6f_questions_restantes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public._backup_1611_cfdfda6f_questions_restantes FROM anon, authenticated;
DO $garde$
DECLARE n int; v_etat text;
BEGIN
  SELECT etat INTO v_etat FROM public.comptes_plateforme_suivi
   WHERE user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND platform = 'leboncoin' AND compte = 'bf460991-06f6-4460-a36f-b60393964407';
  IF v_etat IS DISTINCT FROM 'quitte' THEN RAISE EXCEPTION 'garde : bf460991 n''est pas « quitte » (%) : rien à faire', v_etat; END IF;
  SELECT count(*) INTO n FROM public._backup_1611_cfdfda6f_questions_restantes;
  IF n NOT BETWEEN 80 AND 100 THEN RAISE EXCEPTION 'garde : % tâches (attendu ~91) : relire avant de clore', n; END IF;
  IF EXISTS (SELECT 1 FROM public._backup_1611_cfdfda6f_questions_restantes WHERE platform_fields ->> 'sale_signal' = 'sold') THEN
    RAISE EXCEPTION 'garde : une tâche porte un signal de vente';
  END IF;
  RAISE NOTICE 'garde passée : % tâches à clore', n;
END $garde$;
UPDATE public.cross_post_jobs j
   SET status = 'cancelled',
       error = 'Ancien compte Leboncoin quitté le 16/11, ce n''est pas une vente : FillSell ne suit plus cette annonce et n''a rien retiré.',
       platform_fields = (COALESCE(j.platform_fields, '{}'::jsonb)
                            - ARRAY['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'])
         || jsonb_build_object('compte_quitte', jsonb_build_object(
              'remplacement', (SELECT r.id FROM public.comptes_plateforme_remplacements r
                                WHERE r.user_id = j.user_id AND r.platform = 'leboncoin' ORDER BY r.le DESC LIMIT 1),
              'nouveau', '23b59b14-5cde-4fff-8bcb-7c6464608a33', 'le', now(), 'par', 'reparation_questions_restantes',
              'statut_avant', j.status, 'erreur_avant', j.error,
              'signal_avant', jsonb_build_object('sale_signal', j.platform_fields -> 'sale_signal',
                                'unavailable_since', j.platform_fields -> 'unavailable_since',
                                'unavailable_pending_since', j.platform_fields -> 'unavailable_pending_since')))
 WHERE j.id IN (SELECT b.id FROM public._backup_1611_cfdfda6f_questions_restantes b)
   AND j.status = 'published' AND (j.platform_fields ->> 'sale_signal') IS DISTINCT FROM 'sold';
COMMIT;

-- ── § 2. RELECTURE (lecture ; attendu : 0 question ouverte sur l'ancien compte) ──────────────────────────────────────
SELECT (SELECT count(*) FROM public._backup_1611_cfdfda6f_questions_restantes) AS sauvegardees,
       (SELECT count(*) FROM public.cross_post_jobs j WHERE j.platform_fields #>> '{compte_quitte,par}' = 'reparation_questions_restantes'
           AND j.user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND j.status = 'cancelled') AS closes,
       (SELECT count(*) FROM public.cross_post_jobs j
         WHERE j.user_id = 'cfdfda6f-d182-4974-81b2-07050fc95d37' AND j.platform = 'leboncoin' AND j.status = 'published'
           AND j.platform_fields ->> 'sale_signal' = 'unavailable'
           AND EXISTS (SELECT 1 FROM public.annonces_plateforme a WHERE a.user_id = j.user_id AND a.platform = 'leboncoin'
                         AND a.compte_plateforme = 'bf460991-06f6-4460-a36f-b60393964407'
                         AND public.listing_designe(a.listing_id, j.listing_url, j.platform_listing_id))) AS questions_ancien_compte_restantes;
