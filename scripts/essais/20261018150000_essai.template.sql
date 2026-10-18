-- ═══════════════════════════════════════════════════════════════════════════
-- ESSAI À BLANC — migration 20261018150000_vente_declaree_beebs_rangee_beebs
-- Rien n'est écrit : ROLLBACK final (aucune vente, aucune fiche, aucun mail).
-- ═══════════════════════════════════════════════════════════════════════════
-- Compte de Nico SEULEMENT, fiches « [ESSAI 18/10 B] » à 999 € (ids 9018101850001…003),
-- trois jobs publiés SANS preuve de vente (Beebs, Leboncoin, eBay), chacun déclaré
-- vendu comme le fait la carte « Annonce plus en ligne — Vendue ? »
-- (enregistrer_vente_declaree → enregistrer_vente_atomique).
--   A. AVANT  : md5 de prod ; compteurs mails / notes de vente du compte ;
--   B. LA MIGRATION (contenu exact, inséré par 20261018150000_generer.mjs) ;
--   C. APRÈS  : Beebs → « beebs » / « Beebs », fiche « Beebs » ; Leboncoin et eBay sans
--               preuve → « ailleurs » comme avant ; email_logs inchangés ; aucune note
--               de vente « à envoyer » ; l'INVERSE rend le md5 d'avant.
-- Lancement : npx supabase db query --linked -f scripts/essais/20261018150000_essai.sql
-- Lecture : la dernière requête rend une ligne par contrôle ; tout doit être ok = true.

BEGIN;
SET LOCAL statement_timeout = '120s';
SET LOCAL lock_timeout = '5s';
CREATE TEMP TABLE _res (ordre serial, cas text, attendu text, obtenu text, ok boolean) ON COMMIT DROP;
CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes bigint) ON COMMIT DROP;
CREATE TEMP TABLE _essai (pf text PRIMARY KEY, fiche bigint, job uuid, r jsonb) ON COMMIT DROP;

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'A1 avant : md5 de prod de enregistrer_vente_atomique', 'cf93c3b660dd64b6517b1573963ab95f',
       md5(pg_get_functiondef('public.enregistrer_vente_atomique'::regproc)),
       md5(pg_get_functiondef('public.enregistrer_vente_atomique'::regproc)) = 'cf93c3b660dd64b6517b1573963ab95f';
INSERT INTO _cpt SELECT 'avant',
  (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
  (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18');

DO $donnees$
DECLARE
  u uuid := 'f44b5917-bccc-4431-ba41-f40571a2ed18';
  f bigint := 9018101850000;
  i integer := 0; p text; v_job uuid; v_titre text;
BEGIN
  IF EXISTS (SELECT 1 FROM public.inventaire WHERE id BETWEEN f AND f + 99) THEN
    RAISE EXCEPTION 'essai : des fiches 90181018500xx existent déjà — essai arrêté';
  END IF;
  FOREACH p IN ARRAY ARRAY['beebs','leboncoin','ebay'] LOOP
    i := i + 1;
    v_titre := '[ESSAI 18/10 B] Vente déclarée ' || p || ' — ne pas publier';
    INSERT INTO public.inventaire (id, user_id, titre, prix_vente, statut, quantite, plateforme, photos)
    VALUES (f + i, u, v_titre, 999, 'en_stock', 1, NULL, jsonb_build_array('https://example.invalid/essai-1810-b-' || i || '.jpg'));
    INSERT INTO public.cross_post_jobs (user_id, inventaire_id, platform, action, status, photo_option, title, price,
                                        platform_listing_id, listing_url, published_at, platform_fields)
    VALUES (u, f + i, p, 'publish', 'published', 'original', v_titre, 999, '9018101850' || i,
            'https://example.invalid/annonce-' || p || '-' || i, now() - interval '3 days',
            jsonb_build_object('essai_1810_b', true, 'sale_signal', 'unavailable'))
    RETURNING id INTO v_job;
    INSERT INTO _essai (pf, fiche, job) VALUES (p, f + i, v_job);
  END LOOP;
END $donnees$;

-- ═══ B. LA MIGRATION ══════════════════════════════════════════════════════════
--@@MIGRATION@@

-- ═══ C. APRÈS ═════════════════════════════════════════════════════════════════
UPDATE _essai e SET r = public.enregistrer_vente_declaree('f44b5917-bccc-4431-ba41-f40571a2ed18'::uuid, e.job, 999::numeric, false);

INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C1 Beebs déclarée → beebs / Beebs, fiche Beebs', 'beebs / Beebs / Beebs',
       coalesce(v.plateforme_code, '∅') || ' / ' || coalesce(v.plateforme, '∅') || ' / ' || coalesce(i.plateforme, '∅'),
       v.plateforme_code = 'beebs' AND v.plateforme = 'Beebs' AND i.plateforme = 'Beebs'
FROM _essai e JOIN public.inventaire i ON i.id = e.fiche LEFT JOIN public.ventes v ON v.inventaire_id = e.fiche
WHERE e.pf = 'beebs';
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C2 ' || e.pf || ' déclarée sans preuve → ailleurs, comme avant', 'ailleurs',
       coalesce(v.plateforme_code, '∅') || ' (' || coalesce(e.r::text, '') || ')',
       v.plateforme_code = 'ailleurs'
FROM _essai e LEFT JOIN public.ventes v ON v.inventaire_id = e.fiche WHERE e.pf IN ('leboncoin', 'ebay');
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C3 la vente est enregistrée une fois par fiche, la fiche vendue', '3 ventes, 3 fiches vendues',
       (SELECT count(*) FROM public.ventes v JOIN _essai e ON e.fiche = v.inventaire_id)::text || ' ventes, '
       || (SELECT count(*) FROM public.inventaire i JOIN _essai e ON e.fiche = i.id WHERE i.statut = 'vendu')::text || ' fiches vendues',
       (SELECT count(*) FROM public.ventes v JOIN _essai e ON e.fiche = v.inventaire_id) = 3
       AND (SELECT count(*) FROM public.inventaire i JOIN _essai e ON e.fiche = i.id WHERE i.statut = 'vendu') = 3;
INSERT INTO _cpt SELECT 'apres',
  (SELECT count(*) FROM public.email_logs WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18'),
  (SELECT count(*) FROM public.push_ventes WHERE user_id = 'f44b5917-bccc-4431-ba41-f40571a2ed18' AND statut = 'a_envoyer');
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C4 aucun mail ; aucune note de vente à envoyer', 'mails égaux, 0 à envoyer',
       (SELECT mails FROM _cpt WHERE moment = 'avant')::text || ' → ' || (SELECT mails FROM _cpt WHERE moment = 'apres')::text
       || ', à envoyer ' || (SELECT notes FROM _cpt WHERE moment = 'apres')::text,
       (SELECT mails FROM _cpt WHERE moment = 'avant') = (SELECT mails FROM _cpt WHERE moment = 'apres')
       AND (SELECT notes FROM _cpt WHERE moment = 'apres') = 0;

--@@INVERSE@@
INSERT INTO _res (cas, attendu, obtenu, ok)
SELECT 'C5 l''INVERSE rend le md5 d''avant', 'cf93c3b660dd64b6517b1573963ab95f',
       md5(pg_get_functiondef('public.enregistrer_vente_atomique'::regproc)),
       md5(pg_get_functiondef('public.enregistrer_vente_atomique'::regproc)) = 'cf93c3b660dd64b6517b1573963ab95f';

SELECT ordre, ok, cas, attendu, obtenu FROM _res ORDER BY ordre;
ROLLBACK;
