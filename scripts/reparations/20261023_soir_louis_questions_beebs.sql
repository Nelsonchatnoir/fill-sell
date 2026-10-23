-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 23/10 soir (décision 2 de Nico) — LOUIS : SES QUESTIONS « VENDUE ? » BEEBS, TRANCHÉES PAR LES RELEVÉS
-- ═══════════════════════════════════════════════════════════════════════════
-- Décision de Nico (23/10) : « on ne lui demande rien […] si l'article est en vente sur l'autre compte, l'ancienne
-- annonce est remplacée, ferme la question sans message ni retrait. Ne laisse ouverts que les cas impossibles à trancher. »
-- Constat (relevés) : louis@ et louis-seller@ sont deux comptes reliés (comptes_lies, 18/10) avec DEUX boutiques Beebs.
-- Les 16 annonces de louis@ ont quitté sa boutique entre le 18/10 21:21 et le 19/10 00:42 (113 → 97 annonces ; absentes
-- de chaque relevé complet depuis : 18/10 23:35, 20/10, 21/10, 22/10, 23/10 17:15 — 107/107). Le même article (fiche
-- jumelle, lien `fiches_liees_comptes` posé par le transfert du 18/10, jamais un titre) a été publié sur la boutique
-- de louis-seller du 19/10 13:22 au 20/10 13:37, et y est vu en ligne au relevé du 23/10 14:08.
-- Le geste : celui de la règle « copie remplacée par le compte relié » (cross_post_jobs_alerte_tenue, branche 3) —
-- le dépôt mort est clos (cancelled), sa question levée, l'annonce qui le remplace nommée. Aucune vente écrite,
-- aucune fiche touchée, aucun retrait posé, aucune annonce de louis-seller touchée. Aucun mail, aucune notification.
-- Gardes (sinon LAISSÉE OUVERTE et dite) : dépôt Beebs publié de louis@ portant la question, sans preuve de vente ;
-- fiche au stock ; jumelle (lien structurel) de louis-seller au stock ; annonce Beebs de la jumelle en ligne au relevé
-- (vue après la question) ET son dépôt publié sans alerte, publié APRÈS la disparition ; aucun retrait ni tâche en file.
-- Sauvegarde : _backup_2310_soir_louis_questions. Essai : COMMIT → ROLLBACK.
-- Inverse :
--   UPDATE cross_post_jobs j SET status = b.status_avant, error = b.error_avant, platform_fields = b.pf_avant
--     FROM public._backup_2310_soir_louis_questions b WHERE j.id = b.job AND b.resultat = 'close';
BEGIN;
SET LOCAL statement_timeout = '120s';
CREATE TABLE IF NOT EXISTS public._backup_2310_soir_louis_questions (
  le timestamptz DEFAULT now(), job uuid PRIMARY KEY, annonce text, inventaire_id bigint, status_avant text, error_avant text,
  pf_avant jsonb, jumelle bigint, annonce_remplacante text, publiee_le timestamptz, garde text, resultat text);
ALTER TABLE public._backup_2310_soir_louis_questions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2310_soir_louis_questions FROM anon, authenticated;

CREATE TEMP TABLE _q AS
SELECT j.id, j.user_id, j.inventaire_id, j.status, j.error, j.platform_fields pf, j.listing_url, j.platform_listing_id,
       coalesce(public.annonce_id_de_job(j.platform_listing_id, j.listing_url), substring(j.listing_url from '/([0-9]{6,})')) AS annonce,
       (j.platform_fields ->> 'unavailable_since')::timestamptz AS depuis
  FROM cross_post_jobs j
 WHERE j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'            -- louis@ttfamily.fr
   AND j.platform = 'beebs' AND j.status = 'published' AND j.action IN ('publish', 'republish')
   AND j.inventaire_id IS NOT NULL AND j.platform_fields ? 'unavailable_since';

CREATE TEMP TABLE _jugees AS
SELECT q.*, t.jumelle, t.user_j, v.listing_id AS remplacante, v.publie AS publiee_le,
  CASE
    WHEN coalesce(q.pf ->> 'sale_signal', '') NOT IN ('', 'unavailable') OR q.pf ? 'sale_evidence' THEN 'preuve ou signal de vente'
    WHEN NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = q.inventaire_id AND i.statut = 'stock' AND i.fusionne_dans IS NULL) THEN 'fiche hors stock'
    WHEN t.jumelle IS NULL THEN 'aucune fiche jumelle sur le compte relié'
    WHEN NOT public.comptes_sont_lies(q.user_id, t.user_j) THEN 'comptes non reliés'
    WHEN NOT EXISTS (SELECT 1 FROM inventaire i WHERE i.id = t.jumelle AND i.user_id = t.user_j AND i.statut = 'stock' AND i.fusionne_dans IS NULL) THEN 'jumelle hors stock'
    WHEN v.listing_id IS NULL THEN 'article pas en vente sur Beebs chez le compte relié'
    WHEN v.publie <= q.depuis - interval '6 hours' THEN 'annonce du compte relié antérieure à la disparition (deux exemplaires ?)'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs d WHERE d.user_id = q.user_id AND d.platform = 'beebs' AND d.action = 'delete'
                   AND d.status IN ('pending', 'processing', 'needs_user', 'failed')
                   AND public.retrait_meme_annonce('beebs', d.platform_listing_id, d.listing_url, q.platform_listing_id, q.listing_url)) THEN 'un retrait est ouvert'
    WHEN EXISTS (SELECT 1 FROM cross_post_jobs r WHERE r.user_id = q.user_id AND r.inventaire_id = q.inventaire_id AND r.platform = 'beebs'
                   AND r.status IN ('pending', 'processing', 'needs_user')) THEN 'une tâche est en file'
    ELSE 'ok'
  END AS garde
  FROM _q q
  LEFT JOIN LATERAL (
    SELECT CASE WHEN l.fiche_a = q.inventaire_id THEN l.fiche_b ELSE l.fiche_a END AS jumelle,
           CASE WHEN l.fiche_a = q.inventaire_id THEN l.user_b ELSE l.user_a END AS user_j
      FROM fiches_liees_comptes l
     WHERE (l.fiche_a = q.inventaire_id AND l.user_a = q.user_id) OR (l.fiche_b = q.inventaire_id AND l.user_b = q.user_id)
     LIMIT 1) t ON true
  LEFT JOIN LATERAL (
    SELECT a.listing_id, coalesce(c.published_at, c.created_at) AS publie
      FROM annonces_plateforme a
      JOIN cross_post_jobs c ON c.user_id = a.user_id AND c.inventaire_id = a.inventaire_id AND c.platform = 'beebs'
       AND c.action IN ('publish', 'republish') AND c.status = 'published'
       AND public.annonce_id_de_job(c.platform_listing_id, c.listing_url) = a.listing_id
       AND NOT (coalesce(c.platform_fields, '{}'::jsonb) ?| ARRAY['unavailable_since', 'unavailable_pending_since'])
       AND coalesce(c.platform_fields ->> 'sale_signal', '') = ''
     WHERE a.user_id = t.user_j AND a.platform = 'beebs' AND a.inventaire_id = t.jumelle
       AND a.disparu_le IS NULL AND a.statut_plateforme = 'en_ligne' AND a.vu_le > q.depuis
     ORDER BY a.vu_le DESC LIMIT 1) v ON true;

INSERT INTO public._backup_2310_soir_louis_questions (job, annonce, inventaire_id, status_avant, error_avant, pf_avant, jumelle,
       annonce_remplacante, publiee_le, garde, resultat)
SELECT id, annonce, inventaire_id, status, error, pf, jumelle, remplacante, publiee_le, garde,
       CASE WHEN garde = 'ok' THEN 'close' ELSE 'laissee_ouverte' END
  FROM _jugees
ON CONFLICT (job) DO NOTHING;

UPDATE cross_post_jobs j
   SET status = 'cancelled',
       platform_fields = (coalesce(j.platform_fields, '{}'::jsonb)
                           - ARRAY['unavailable_since', 'sale_signal', 'unavailable_pending_since', 'detected_price'])
         || jsonb_build_object('copie_remplacee_par_compte_relie', jsonb_build_object('le', now(), 'annonce', g.remplacante,
              'compte', g.user_j, 'fiche', g.jumelle, 'question_depuis', g.depuis,
              'motif', 'article en vente sur le compte relié (décision de Nico, 23/10)',
              'pose_par', 'scripts/reparations/20261023_soir_louis_questions_beebs.sql')),
       error = 'Cette annonce Beebs n''est plus en ligne ; ton article est en vente sur Beebs sous l''annonce ' || g.remplacante
               || ' de ton compte FillSell relié. Ce n''est pas une vente — rien à refaire.'
  FROM _jugees g
 WHERE j.id = g.id AND g.garde = 'ok' AND j.status = 'published' AND j.platform_fields ? 'unavailable_since';

SELECT b.annonce, b.resultat, b.garde, coalesce(b.annonce_remplacante, '-') remplacante,
       to_char(b.publiee_le AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') publiee, j.status statut_apres,
       (j.platform_fields ? 'unavailable_since') question_apres
  FROM public._backup_2310_soir_louis_questions b JOIN cross_post_jobs j ON j.id = b.job ORDER BY b.annonce;
COMMIT;
