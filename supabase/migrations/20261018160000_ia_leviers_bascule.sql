-- ═══════════════════════════════════════════════════════════════════════════
-- LES LEVIERS IA, CHAMP PAR CHAMP — BASCULE ET BILAN DES QUESTIONS
-- (18/10/2026, chantier « zéro friction » de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. ia_leviers_bascule : pour un (plateforme, champ), le levier que le BANC a
--    gagné (scripts/bancs/zero-friction/banc-ia.mjs, 563 cas, 61 comptes,
--    vérité = la valeur choisie par un humain et acceptée en ligne ;
--    docs/enquetes/zero-friction-1810/banc-ia.json). Il ne tourne qu'APRÈS
--    l'existant, sur les champs que l'existant a laissés vides (sinon une
--    question part) : generate-listing → _shared/ia-leviers-bascule.ts.
--    Lignes du banc, toutes nées « fantome » :
--      leboncoin · Produit  → L1 (Haiku 5.5, texte, liste entière) : 10 justes / 1 faux là où l'existant ne rendait rien
--      leboncoin · Support  → L1 : 4 / 0 ;  leboncoin · Univers → L1 : 1 / 0
--      beebs     · Âge      → L4 (lecture des photos, puis texte) : 4 / 0
--    Non branchés (un seul faux de plus que l'existant = le champ reste sur
--    l'ancien chemin) : paires « Univers et produit » Maison & Jardin, Genre des
--    livres, aspects eBay ; L2 (photo directe) et L3 (Sonnet) partout.
-- 2. ia_leviers_evaluer() (cron 6 h) — LES CRITÈRES, ÉCRITS ICI SEULEMENT :
--    · « fantome » → « actif » : ≥ 48 h de fantôme, ≥ 15 cas JUGÉS (réponse du
--      levier, puis annonce publiée du même article avec ce champ), précision ≥
--      seuil_precision (la précision de l'existant sur ce champ au banc) ;
--    · « actif » → « coupe » (retour arrière) : sur ≥ 10 valeurs POSÉES en 72 h,
--      moins de 95 % gardées telles quelles par la personne jusqu'à l'annonce,
--      OU des refus de la plateforme (needs_user, failed) qui dépassent de
--      15 points ceux de la semaine d'avant (≥ 10 jobs) ;
--    · chaque bascule laisse une ligne usage_logs « ia_levier_bascule ».
--    Couper à la main : update public.ia_leviers_bascule set etat = 'eteint', depuis = now(), motif = 'coupé à la main';
-- 3. questions_publication_bilan(debut, fin) : les questions de l'écran Publier
--    (usage_logs champ_requis_bloquant) par plateforme et champ — affichées,
--    levées par la PERSONNE (champ « par » depuis le 18/10 ; avant : plus de
--    20 s après l'affichage), levées par le MOTEUR, abandonnées. Lecture seule.
-- Inverse : supabase/rollbacks/20261018160000_ia_leviers_bascule.sql.
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018160000_ia_leviers_bascule.sql
--   npx supabase migration repair --linked --status applied 20261018160000

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ia_leviers_bascule (
  plateforme text NOT NULL CHECK (plateforme IN ('leboncoin', 'beebs', 'vinted')),
  champ text NOT NULL,                       -- libellé du champ tel que resolve_aspects le reçoit
  levier text NOT NULL CHECK (levier IN ('L1', 'L2', 'L3', 'L4')),
  etat text NOT NULL DEFAULT 'fantome' CHECK (etat IN ('fantome', 'actif', 'coupe', 'eteint')),
  seuil_precision numeric NOT NULL CHECK (seuil_precision > 0 AND seuil_precision <= 1),
  banc jsonb NOT NULL,                       -- ce que le banc a mesuré (preuve de la ligne)
  depuis timestamptz NOT NULL DEFAULT now(),
  motif text,
  mesure jsonb,
  PRIMARY KEY (plateforme, champ)
);
ALTER TABLE public.ia_leviers_bascule ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ia_leviers_bascule FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.ia_leviers_bascule TO service_role;

INSERT INTO public.ia_leviers_bascule (plateforme, champ, levier, seuil_precision, banc) VALUES
  ('leboncoin', 'Produit', 'L1', 0.83, '{"cascade_justes": 10, "cascade_faux": 1, "l0_justes": 103, "l0_faux": 21, "l0_rien": 20, "cas": 144}'),
  ('leboncoin', 'Support', 'L1', 1.00, '{"cascade_justes": 4, "cascade_faux": 0, "l0_justes": 13, "l0_faux": 0, "l0_rien": 5, "cas": 18}'),
  ('leboncoin', 'Univers', 'L1', 0.96, '{"cascade_justes": 1, "cascade_faux": 0, "l0_justes": 151, "l0_faux": 6, "l0_rien": 2, "cas": 159}'),
  ('beebs', 'Âge', 'L4', 0.81, '{"cascade_justes": 4, "cascade_faux": 0, "l0_justes": 13, "l0_faux": 3, "l0_rien": 30, "cas": 46}')
ON CONFLICT (plateforme, champ) DO NOTHING;

-- La valeur que l'annonce publiée porte pour ce champ (clé du formulaire, ou canal dédié).
CREATE OR REPLACE FUNCTION public.ia_levier_valeur_job(p_plateforme text, p_pf jsonb, p_cle text, p_cible text, p_champ text)
 RETURNS text LANGUAGE sql IMMUTABLE SET search_path TO 'public'
AS $function$
  SELECT nullif(lower(btrim(coalesce(
    CASE p_plateforme
      WHEN 'leboncoin' THEN coalesce(p_pf -> 'lbcAspects' ->> p_cle,
                                     CASE p_cible WHEN 'univers' THEN p_pf ->> 'univers' WHEN 'lbcProduit' THEN p_pf ->> 'lbcProduit' END)
      WHEN 'beebs' THEN coalesce(p_pf -> 'beebsAspects' ->> coalesce(p_cle, p_champ), p_pf ->> coalesce(p_cible, ''), CASE WHEN p_champ = 'Âge' THEN p_pf ->> 'age' END)
      WHEN 'vinted' THEN coalesce(p_pf -> 'vintedAspects' ->> p_cle, p_pf ->> coalesce(p_cible, ''))
    END, ''))), '');
$function$;
REVOKE ALL ON FUNCTION public.ia_levier_valeur_job(text, jsonb, text, text, text) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.ia_leviers_evaluer()
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_out jsonb := '[]'::jsonb;
  v_mesure jsonb;
  v_etat text;
  v_motif text;
BEGIN
  SET LOCAL statement_timeout = '30s';
  FOR r IN
    WITH ev AS (
      SELECT u.created_at, u.metadata ->> 'plateforme' plateforme, u.metadata ->> 'champ' champ,
             u.metadata ->> 'cle' cle, u.metadata ->> 'cible' cible, u.metadata ->> 'etat' etat_log,
             (u.metadata ->> 'posee')::boolean posee, lower(btrim(u.metadata ->> 'valeur')) valeur,
             (u.metadata ->> 'inventaire_id')::bigint inventaire_id
        FROM usage_logs u
       WHERE u.feature = 'ia_levier' AND u.created_at > now() - interval '14 days'
         AND (u.metadata ->> 'inventaire_id') ~ '^\d+$' AND coalesce(u.metadata ->> 'valeur', '') <> ''
    ), fin AS (
      SELECT ev.*, j.status job_statut, public.ia_levier_valeur_job(ev.plateforme, j.platform_fields, ev.cle, ev.cible, ev.champ) finale
        FROM ev
        LEFT JOIN LATERAL (
          SELECT j.status, j.platform_fields FROM cross_post_jobs j
           WHERE j.inventaire_id = ev.inventaire_id AND j.platform = ev.plateforme AND j.action IN ('publish', 'republish')
             AND j.created_at > ev.created_at - interval '10 minutes' AND j.created_at < ev.created_at + interval '6 hours'
           ORDER BY j.created_at LIMIT 1) j ON true
    )
    SELECT b.plateforme, b.champ, b.etat, b.depuis, b.seuil_precision,
           count(*) FILTER (WHERE f.etat_log = 'fantome' AND f.created_at >= b.depuis AND f.job_statut IN ('published', 'sold') AND f.finale IS NOT NULL) f_n,
           count(*) FILTER (WHERE f.etat_log = 'fantome' AND f.created_at >= b.depuis AND f.job_statut IN ('published', 'sold') AND f.finale = f.valeur) f_justes,
           count(*) FILTER (WHERE f.posee AND f.created_at > now() - interval '72 hours' AND f.job_statut IN ('published', 'sold') AND f.finale IS NOT NULL) p_n,
           count(*) FILTER (WHERE f.posee AND f.created_at > now() - interval '72 hours' AND f.job_statut IN ('published', 'sold') AND f.finale = f.valeur) p_gardes,
           count(*) FILTER (WHERE f.posee AND f.created_at > now() - interval '72 hours' AND f.job_statut IS NOT NULL) p_jobs,
           count(*) FILTER (WHERE f.posee AND f.created_at > now() - interval '72 hours' AND f.job_statut IN ('needs_user', 'failed')) p_refus
      FROM ia_leviers_bascule b
      LEFT JOIN fin f ON f.plateforme = b.plateforme AND f.champ = b.champ
     WHERE b.etat IN ('fantome', 'actif')
     GROUP BY b.plateforme, b.champ, b.etat, b.depuis, b.seuil_precision
  LOOP
    v_etat := r.etat; v_motif := NULL;
    v_mesure := jsonb_build_object('le', now(),
      'fantome', jsonb_build_object('n', r.f_n, 'justes', r.f_justes),
      'pose_72h', jsonb_build_object('n', r.p_n, 'gardes', r.p_gardes, 'jobs', r.p_jobs, 'refus', r.p_refus));
    IF r.etat = 'fantome' THEN
      -- ALLUMAGE : ≥ 48 h de fantôme, ≥ 15 cas jugés, précision ≥ celle de l'existant sur ce champ (banc).
      IF r.depuis < now() - interval '48 hours' AND r.f_n >= 15 AND r.f_justes::numeric / r.f_n >= r.seuil_precision THEN
        v_etat := 'actif'; v_motif := format('fantôme : %s/%s justes (seuil %s)', r.f_justes, r.f_n, r.seuil_precision);
      END IF;
    ELSE
      -- RETOUR ARRIÈRE : ce qui est posé n'est pas gardé (< 95 % sur ≥ 10 en 72 h) ou les refus remontent.
      IF r.p_n >= 10 AND r.p_gardes::numeric / r.p_n < 0.95 THEN
        v_etat := 'coupe'; v_motif := format('posé : %s/%s gardés en 72 h (< 95 %%)', r.p_gardes, r.p_n);
      ELSIF r.p_jobs >= 10 AND r.p_refus::numeric / r.p_jobs > (
              SELECT coalesce(count(*) FILTER (WHERE j.status IN ('needs_user', 'failed'))::numeric / nullif(count(*), 0), 0) + 0.15
                FROM cross_post_jobs j WHERE j.platform = r.plateforme AND j.action = 'publish'
                 AND j.created_at > now() - interval '7 days' AND j.created_at < now() - interval '72 hours') THEN
        v_etat := 'coupe'; v_motif := format('refus de la plateforme : %s/%s en 72 h (+15 points sur la semaine d''avant)', r.p_refus, r.p_jobs);
      END IF;
    END IF;
    IF v_etat IS DISTINCT FROM r.etat THEN
      UPDATE ia_leviers_bascule SET etat = v_etat, depuis = now(), motif = v_motif, mesure = v_mesure
       WHERE plateforme = r.plateforme AND champ = r.champ;
      v_out := v_out || jsonb_build_object('plateforme', r.plateforme, 'champ', r.champ, 'de', r.etat, 'a', v_etat, 'motif', v_motif);
    ELSE
      UPDATE ia_leviers_bascule SET mesure = v_mesure
       WHERE plateforme = r.plateforme AND champ = r.champ AND (mesure - 'le') IS DISTINCT FROM (v_mesure - 'le');
    END IF;
  END LOOP;
  IF jsonb_array_length(v_out) > 0 THEN
    INSERT INTO usage_logs (user_id, feature, metadata) VALUES (NULL, 'ia_levier_bascule', jsonb_build_object('changements', v_out));
  END IF;
  RETURN jsonb_build_object('changements', v_out);
END;
$function$;
REVOKE ALL ON FUNCTION public.ia_leviers_evaluer() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.ia_leviers_evaluer() TO service_role;

-- Les questions de l'écran Publier, par plateforme et champ, entre deux instants.
CREATE OR REPLACE FUNCTION public.questions_publication_bilan(p_debut timestamptz, p_fin timestamptz DEFAULT now())
 RETURNS TABLE (plateforme text, champ text, affichees bigint, levees_personne bigint, levees_moteur bigint,
                abandons bigint, articles bigint, comptes bigint)
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  WITH a AS (
    SELECT u.created_at, u.user_id, u.metadata ->> 'platform' plateforme, u.metadata -> 'champs' ->> 0 champ,
           u.metadata ->> 'inventaire_id' inv, u.metadata ->> 'issue' issue, u.metadata ->> 'par' par,
           nullif(u.metadata ->> 'delai_s', '')::numeric delai_s
      FROM usage_logs u
     WHERE u.feature = 'champ_requis_bloquant' AND u.created_at >= p_debut AND u.created_at < p_fin
  ), aff AS (SELECT * FROM a WHERE issue = 'affiche'),
  suite AS (
    SELECT aff.*, (
      SELECT jsonb_build_object('issue', c.issue, 'par', c.par, 'delai', coalesce(c.delai_s, extract(epoch FROM c.created_at - aff.created_at)))
        FROM a c
       WHERE c.user_id = aff.user_id AND c.inv IS NOT DISTINCT FROM aff.inv AND c.plateforme = aff.plateforme AND c.champ = aff.champ
         AND c.issue <> 'affiche' AND c.created_at >= aff.created_at AND c.created_at < aff.created_at + interval '2 hours'
       ORDER BY c.created_at LIMIT 1) s
      FROM aff)
  SELECT plateforme, champ, count(*),
         count(*) FILTER (WHERE s ->> 'issue' = 'complete' AND coalesce(s ->> 'par', CASE WHEN (s ->> 'delai')::numeric >= 20 THEN 'personne' ELSE 'moteur' END) = 'personne'),
         count(*) FILTER (WHERE s ->> 'issue' = 'complete' AND coalesce(s ->> 'par', CASE WHEN (s ->> 'delai')::numeric >= 20 THEN 'personne' ELSE 'moteur' END) = 'moteur'),
         count(*) FILTER (WHERE s ->> 'issue' IN ('abandonne', 'publie_sans_plateforme', 'bloque_au_clic')),
         count(DISTINCT inv), count(DISTINCT user_id)
    FROM suite GROUP BY 1, 2 ORDER BY 3 DESC;
$function$;
REVOKE ALL ON FUNCTION public.questions_publication_bilan(timestamptz, timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.questions_publication_bilan(timestamptz, timestamptz) TO service_role;

SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname = 'ia-leviers-6h';
SELECT cron.schedule('ia-leviers-6h', '47 */6 * * *', $$ SET statement_timeout = '40s'; SELECT public.ia_leviers_evaluer(); $$);

COMMIT;
