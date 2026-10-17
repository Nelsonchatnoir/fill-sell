-- ═══════════════════════════════════════════════════════════════════════════
-- INVERSE de scripts/reparations/20261017_louis_lot_b_remise_ventes.sql
-- ═══════════════════════════════════════════════════════════════════════════
-- Remet l'état d'APRÈS la réparation du 17/10 11:37 / 11:38 (comme si la remise
-- n'avait pas eu lieu), depuis les sauvegardes _backup_1710_louis_lot_b_* :
--   · les 4 reçus « annonce:vinted:<n°> » recréés par la remise : effacés ;
--   · les ventes 144011 à 144014 : effacées (seulement si elles sont encore EXACTEMENT
--     celles que la remise a posées — une vente complétée depuis, par exemple par le
--     relevé des commandes, arrête l'inverse) ;
--   · ventes_supprimees 1364 à 1367 : réinsérées (mêmes id, mêmes valeurs) ;
--   · les 4 fiches : statut, quantité et vinted_status de la sauvegarde (stock, 1, closed) ;
--   · inventaire_journal 38424 à 38431 : réinsérées (mêmes id, mêmes valeurs, mêmes dates) ;
--   · les 4 jobs : status, error et platform_fields de la sauvegarde (cancelled, message,
--     marque 'vente_annulee') ;
--   · remises_en_vente : la remise n'en a touché aucune — rien à remettre (contrôlé).
-- Seulement si rien n'a bougé depuis la remise (contrôles ci-dessous) ; sinon arrêt,
-- rien n'est écrit. Aucun mail, aucune note, aucun retrait : mêmes interrupteurs de
-- session que la remise, compteurs email_logs / push_ventes « a_envoyer » du compte avant
-- / après dans la transaction (écart → RAISE EXCEPTION). Les tables de sauvegarde restent.
-- Lancement :
--   npx supabase db query --linked -f scripts/reparations/20261017_louis_lot_b_remise_ventes_INVERSE.sql

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.sans_retrait = '1';
SET LOCAL fillsell.push_relance = '1';

CREATE TEMP TABLE _lot (
  vente bigint PRIMARY KEY, trace uuid NOT NULL, fiche bigint NOT NULL, job uuid NOT NULL, annonce text NOT NULL
) ON COMMIT DROP;
INSERT INTO _lot VALUES
  (144011, '1783382e-2a83-4c38-a8f5-c1206c413047', 1789889100417003, '6ca95104-9d02-40d6-996a-0e7196ac3119', '10354759821'),
  (144012, 'e1180aff-6a93-444f-881a-4db57ee831d6', 1789889100417002, '30e772cc-0939-4f0e-8236-b0a9e5dced92', '5856871807'),
  (144013, '9ba05ab7-e508-48b8-8cd8-7aab5ed73ede', 1789889100063004, '6d2b7125-da73-4319-b194-902b531ffa1a', '5857209396'),
  (144014, 'd9ec2c2b-c8b8-482f-b72e-6f3ae0842449', 1789889100063006, '399a0380-80ee-450b-8d02-1eea61287d5b', '5856970608');

-- ── 0. Préconditions : la remise a eu lieu et rien n'a bougé depuis ──
DO $pre$
DECLARE
  u uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  n integer;
BEGIN
  IF to_regclass('public._backup_1710_louis_lot_b_jobs') IS NULL THEN
    RAISE EXCEPTION 'inverse : la remise n''a pas été appliquée (sauvegardes absentes) — rien n''est fait';
  END IF;
  IF (SELECT count(*) FROM public._backup_1710_louis_lot_b_supprimees) <> 4
     OR (SELECT count(*) FROM public._backup_1710_louis_lot_b_fiches) <> 4
     OR (SELECT count(*) FROM public._backup_1710_louis_lot_b_journal) <> 8
     OR (SELECT count(*) FROM public._backup_1710_louis_lot_b_jobs) <> 4 THEN
    RAISE EXCEPTION 'inverse : sauvegardes incomplètes — rien n''est fait';
  END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.ventes v ON v.id = l.vente
    JOIN public.usage_logs t ON t.id = l.trace
   WHERE to_jsonb(v) = to_jsonb(jsonb_populate_record(NULL::public.ventes, t.metadata -> 'vente'));
  IF n <> 4 THEN
    RAISE EXCEPTION 'inverse : % vente(s) sur 4 encore telles que la remise les a posées — rien n''est fait', n;
  END IF;
  IF EXISTS (SELECT 1 FROM public.ventes v JOIN _lot l ON v.user_id = u AND (v.inventaire_id = l.fiche OR v.annonce_id = l.annonce)
              WHERE v.id NOT IN (SELECT vente FROM _lot)) THEN
    RAISE EXCEPTION 'inverse : une autre vente est née sur ces fiches / annonces — rien n''est fait';
  END IF;

  SELECT count(*) INTO n FROM _lot l JOIN public.inventaire i ON i.id = l.fiche
   WHERE i.statut = 'vendu' AND i.quantite = 0 AND i.vinted_status = 'sold';
  IF n <> 4 THEN RAISE EXCEPTION 'inverse : % fiche(s) sur 4 encore vendu / 0 / sold — rien n''est fait', n; END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.cross_post_jobs j ON j.id = l.job
    JOIN public._backup_1710_louis_lot_b_jobs bj ON bj.id = l.job
   WHERE j.status = 'sold' AND j.platform_fields = bj.platform_fields - 'vente_annulee';
  IF n <> 4 THEN RAISE EXCEPTION 'inverse : % job(s) sur 4 encore tels que la remise les a posés — rien n''est fait', n; END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.ventes_operations o ON o.user_id = u AND o.cle = 'annonce:vinted:' || l.annonce
   WHERE o.resultat -> 'ventes_ids' = jsonb_build_array(l.vente);
  IF n <> 4 THEN RAISE EXCEPTION 'inverse : % reçu(s) sur 4 — rien n''est fait', n; END IF;

  IF EXISTS (SELECT 1 FROM public.ventes_supprimees s WHERE s.id IN (SELECT id FROM public._backup_1710_louis_lot_b_supprimees))
     OR EXISTS (SELECT 1 FROM public.inventaire_journal ij WHERE ij.id IN (SELECT id FROM public._backup_1710_louis_lot_b_journal)) THEN
    RAISE EXCEPTION 'inverse : une ligne ventes_supprimees ou de journal est déjà là — rien n''est fait';
  END IF;
END
$pre$;

CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes_a_envoyer bigint) ON COMMIT DROP;
INSERT INTO _cpt
SELECT 'avant',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND statut = 'a_envoyer');

-- ── 1. Les reçus recréés, puis les ventes remises ──
DELETE FROM public.ventes_operations o USING _lot l
 WHERE o.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND o.cle = 'annonce:vinted:' || l.annonce
   AND o.resultat -> 'ventes_ids' = jsonb_build_array(l.vente);
DELETE FROM public.ventes v USING _lot l
 WHERE v.id = l.vente AND v.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';

-- ── 2. ventes_supprimees, telles qu'elles étaient ──
INSERT INTO public.ventes_supprimees (id, user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le,
                                      vente_id, supprimee_le, source, motif)
SELECT id, user_id, plateforme_code, commande_ref, annonce_id, titre, prix_vente, vendu_le, vente_id, supprimee_le, source, motif
  FROM public._backup_1710_louis_lot_b_supprimees;

-- ── 3. Les fiches : statut, quantité, état d'annonce de la sauvegarde ──
UPDATE public.inventaire i SET statut = b.statut, quantite = b.quantite, vinted_status = b.vinted_status
  FROM public._backup_1710_louis_lot_b_fiches b
 WHERE i.id = b.id AND i.user_id = b.user_id;

-- ── 4. Le journal, tel qu'il était ──
INSERT INTO public.inventaire_journal (id, user_id, inventaire_id, champ, avant, apres, source, motif, detail, created_at)
SELECT id, user_id, inventaire_id, champ, avant, apres, source, motif, detail, created_at
  FROM public._backup_1710_louis_lot_b_journal;

-- ── 5. Les jobs : status, error, platform_fields de la sauvegarde ──
UPDATE public.cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM public._backup_1710_louis_lot_b_jobs b
 WHERE j.id = b.id AND j.user_id = b.user_id;

-- ── 6. Filet : une note « a_envoyer » née ici est classée ──
UPDATE public.push_ventes p SET statut = 'ignoree', motif = 'reparation_1710_louis_lot_b_inverse', traite_le = now()
 WHERE p.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND p.statut = 'a_envoyer' AND p.cree_le >= now()
   AND (p.inventaire_id IN (SELECT fiche FROM _lot) OR p.vente_id IN (SELECT vente FROM _lot) OR p.job_id IN (SELECT job FROM _lot));

INSERT INTO public.usage_logs (user_id, feature, metadata)
SELECT 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid, 'vente_restauree_annulee',
       jsonb_build_object('vente', l.vente, 'fiche', l.fiche, 'job', l.job,
                          'script', 'scripts/reparations/20261017_louis_lot_b_remise_ventes_INVERSE.sql')
  FROM _lot l;

-- ── 7. Contrôles : l'état d'après 11:38, sinon tout est annulé ──
INSERT INTO _cpt
SELECT 'apres',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND statut = 'a_envoyer');

DO $post$
DECLARE
  n integer;
  a record; b record;
BEGIN
  IF EXISTS (SELECT 1 FROM public.ventes v WHERE v.id IN (SELECT vente FROM _lot)) THEN
    RAISE EXCEPTION 'inverse : une vente 144011-144014 reste — tout est annulé';
  END IF;
  SELECT count(*) INTO n FROM public.ventes_supprimees s JOIN public._backup_1710_louis_lot_b_supprimees b ON b.id = s.id
   WHERE to_jsonb(s) = to_jsonb(b) - 'sauve_le';
  IF n <> 4 THEN RAISE EXCEPTION 'inverse : % ligne(s) ventes_supprimees sur 4 — tout est annulé', n; END IF;
  SELECT count(*) INTO n FROM public.inventaire i JOIN public._backup_1710_louis_lot_b_fiches b ON b.id = i.id
   WHERE (i.statut, i.quantite, i.vinted_status) IS NOT DISTINCT FROM (b.statut, b.quantite, b.vinted_status);
  IF n <> 4 THEN RAISE EXCEPTION 'inverse : % fiche(s) sur 4 — tout est annulé', n; END IF;
  SELECT count(*) INTO n FROM public.inventaire_journal ij JOIN public._backup_1710_louis_lot_b_journal b ON b.id = ij.id
   WHERE to_jsonb(ij) = to_jsonb(b) - 'sauve_le';
  IF n <> 8 THEN RAISE EXCEPTION 'inverse : % ligne(s) de journal sur 8 — tout est annulé', n; END IF;
  SELECT count(*) INTO n FROM public.cross_post_jobs j JOIN public._backup_1710_louis_lot_b_jobs b ON b.id = j.id
   WHERE j.status = b.status AND j.error IS NOT DISTINCT FROM b.error AND j.platform_fields = b.platform_fields;
  IF n <> 4 THEN RAISE EXCEPTION 'inverse : % job(s) sur 4 — tout est annulé', n; END IF;
  IF EXISTS (SELECT 1 FROM public.ventes_operations o JOIN _lot l
              ON o.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND o.cle = 'annonce:vinted:' || l.annonce) THEN
    RAISE EXCEPTION 'inverse : un reçu reste — tout est annulé';
  END IF;
  SELECT count(*) INTO n FROM public.remises_en_vente r JOIN public._backup_1710_louis_lot_b_remises br ON br.id = r.id
   WHERE to_jsonb(r) = to_jsonb(br) - 'sauve_le';
  IF n <> 4 THEN RAISE EXCEPTION 'inverse : % remise(s) sur 4 inchangée(s) — tout est annulé', n; END IF;
  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d
              WHERE d.inventaire_id IN (SELECT fiche FROM _lot) AND d.action = 'delete' AND d.created_at >= now()) THEN
    RAISE EXCEPTION 'inverse : un retrait a été armé — tout est annulé';
  END IF;
  SELECT * INTO a FROM _cpt WHERE moment = 'avant';
  SELECT * INTO b FROM _cpt WHERE moment = 'apres';
  IF b.mails <> a.mails OR b.notes_a_envoyer <> a.notes_a_envoyer THEN
    RAISE EXCEPTION 'inverse : mails % → %, notes à envoyer % → % — tout est annulé', a.mails, b.mails, a.notes_a_envoyer, b.notes_a_envoyer;
  END IF;
END
$post$;

SELECT l.vente,
       (SELECT count(*) FROM public.ventes v WHERE v.id = l.vente) AS vente_presente,
       i.statut || ' ×' || i.quantite || ' ' || coalesce(i.vinted_status, '∅') AS fiche,
       j.status AS job,
       (SELECT count(*) FROM public.ventes_supprimees s WHERE s.vente_id = l.vente) AS ventes_supprimees,
       (SELECT count(*) FROM public.inventaire_journal ij WHERE ij.inventaire_id = l.fiche AND ij.motif = 'commande_annulee') AS lignes_journal,
       (SELECT a.mails || ' → ' || b.mails || ' mails ; ' || a.notes_a_envoyer || ' → ' || b.notes_a_envoyer || ' notes à envoyer'
          FROM _cpt a, _cpt b WHERE a.moment = 'avant' AND b.moment = 'apres') AS mails_et_notes
  FROM _lot l
  JOIN public.inventaire i ON i.id = l.fiche
  JOIN public.cross_post_jobs j ON j.id = l.job
 ORDER BY l.vente;

COMMIT;
