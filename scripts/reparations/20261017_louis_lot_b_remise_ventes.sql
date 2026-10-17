-- ═══════════════════════════════════════════════════════════════════════════
-- 17/10 — LOT B DE LOUIS (Amiral) : C'ÉTAIT UNE VRAIE VENTE. REMISE EXACTE DE L'ÉTAT
-- D'AVANT LA RÉPARATION DE 11:37 / 11:38 (vérification et feu vert de Nico, 17/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le 17/10 à 11:37:07, vente_commande_annulee_vinted a été appelée à la main sur les
-- ventes 144011 à 144014 (compte faf5021a…) comme si leur commande Vinted était annulée ;
-- à 11:38:06, vinted_status a été passé à « closed » (inventaire_journal, source
-- claude_sql). Nico a vérifié sur Vinted : c'était une VRAIE vente. Ce script remet
-- EXACTEMENT l'état d'avant ces deux gestes :
--   1. ventes 144011 à 144014 réinsérées à l'identique (mêmes id, les 26 colonnes) depuis
--      la ligne complète que la fonction a gardée dans usage_logs « vente_retiree » du
--      17/10 11:37:07.990731 (to_jsonb de la vente lue juste avant son DELETE), recoupée
--      avec ventes_supprimees 1364 à 1367 (vente, annonce, fiche, prix, titre) ; contrôle
--      final : chaque vente est égale, colonne pour colonne, à la ligne gardée ;
--   2. ventes_supprimees 1364 à 1367 supprimées (sinon : « cette vente ne revient jamais ») ;
--   3. les 4 fiches : statut 'vendu', quantité 0, vinted_status 'sold' — les seules
--      colonnes que les gestes de 11:37 (statut 'stock', quantité 1) et de 11:38
--      (vinted_status 'closed') ont changées ; la vente du 13/10 (enregistrer_vente_atomique,
--      avec un job) avait posé quantité 0 ;
--   4. inventaire_journal : les 8 lignes 38424 à 38431 (11:37 statut vendu → stock, source
--      releve_vinted ; 11:38 vinted_status sold → closed, source claude_sql) SUPPRIMÉES,
--      pas « neutralisées » : la table n'a aucune colonne d'annulation — neutraliser
--      voudrait dire écrire 8 lignes inverses, donc un journal qui n'est plus celui
--      d'avant ; rien ne s'appuie sur ces lignes (l'app ne lit pas inventaire_journal,
--      aucune fonction ne décide dessus) ; elles restent entières dans
--      _backup_1710_louis_lot_b_journal et l'inverse les réinsère (mêmes id) ;
--   5. les 4 jobs Vinted : status 'sold' ; platform_fields d'avant = ceux d'aujourd'hui
--      SANS la clé 'vente_annulee' (la fonction n'a fait qu'AJOUTER cette clé, par « || ») ;
--      error NULL. ⚠️ L'error d'avant 11:37 n'est lisible NULLE PART : la fonction l'a
--      écrasée sans la garder (ni journal, ni trace, ni sauvegarde) et la vente du 13/10
--      ne touche pas error. NULL est la valeur la plus probable, pas une preuve : 51 des
--      56 jobs Vinted vendus du compte sur 20 jours ont error NULL (5 gardent un
--      « Impossible de vérifier… » d'une vérification antérieure), et les 4 annonces ont été
--      lues EN LIGNE avec succès juste avant la vente (09:39 à 10:30). sold_at
--      (13/10 11:07:00.182085), last_checked_at et le reste : jamais touchés à 11:37 ;
--   6. les 4 reçus ventes_operations « annonce:vinted:<n°> » (effacés à 11:37 sans
--      sauvegarde) recréés tels que enregistrer_vente_atomique les écrit : clé, fiche,
--      job, cree_le = created_at de la vente (même transaction au 13/10), résultat
--      { ok, venteCreated, inventaireUpdated, venteNotee : true ; emailSent, rejouee :
--      false ; siblingsCancelled, pendingRemoval, retraitsArmes, restant : 0 ;
--      ventes_ids : [n°] } — forme relue sur les 12 reçus Vinted du compte depuis le
--      11/10 (retraitsArmes vaut 0 même quand la copie Leboncoin a été retirée : c'est le
--      déclencheur de la fiche qui arme ce retrait, pas la vente) ;
--   7. remises_en_vente 822 à 825 : NON touchées à 11:37 (déjà 'abandonnee' /
--      'plus_de_stock' depuis le 13/10 11:10 ; la fonction ne vise que 'a_faire') ; le
--      retour des jobs en 'sold' n'en crée pas d'autre (ON CONFLICT (job_vendu) DO
--      NOTHING) — contrôlé : identiques avant / après, aucune née.
-- AUCUN MAIL, AUCUNE NOTE, AUCUN RETRAIT, AUCUNE REMISE EN VENTE :
--   · fillsell.sans_retrait = 1 (cette transaction seulement) : inventaire_vendu_retire_ses_copies
--     et push_trg_inventaire_vinted ne font rien ;
--   · fillsell.push_relance = 1 : push_noter n'appelle jamais la fonction push-ventes ;
--   · ⛔ PAS fillsell.vente_declaree : push_declaration_en_cours le lit — il ferait NAÎTRE
--     des notes « declaree » (push_trg_ventes branche serveur, push_trg_job) ;
--   · push_trg_ventes (vente insérée par le serveur, source NULL) : rien sans déclaration
--     en cours ; push_trg_job (job → sold) sort de lui-même : signal du 13/10 vieux de plus
--     de 24 h, et annonce déjà relevée « sold » un jour précédent ;
--   · filet du rattrapage du 08/10 : toute note « a_envoyer » née dans la transaction pour
--     ces fiches, ventes ou jobs est classée « ignoree » avant la validation ;
--   · compteurs DANS la transaction : email_logs du compte et push_ventes « a_envoyer » du
--     compte, avant / après — écart non nul → RAISE EXCEPTION, rien n'est écrit.
-- Sauvegarde (état AVANT ce script, lignes entières) : _backup_1710_louis_lot_b_ventes,
-- _supprimees, _fiches, _journal, _jobs, _recus, _remises (RLS active, fermées à l'app).
-- Une deuxième exécution s'arrête d'elle-même (tables de sauvegarde déjà là).
-- Inverse : scripts/reparations/20261017_louis_lot_b_remise_ventes_INVERSE.sql.
-- Essai à blanc : ce fichier avec sa dernière ligne COMMIT remplacée par ROLLBACK —
--   copie prête : scripts/essais/20261017_louis_lot_b_remise_ventes_essai.sql.
-- ⛔ Feu vert de Nico. Lancement :
--   npx supabase db query --linked -f scripts/reparations/20261017_louis_lot_b_remise_ventes.sql
-- ⚠️ Quand la commande Vinted de ce lot passera « completed », le relevé des ventes ACTUEL
--    créera EN PLUS une vente « Lot 4 articles » sans fiche (double compte) — à éviter par la
--    règle du point 11 (la commande en lot adopte les ventes prouvées que ses numéros
--    d'annonce désignent, au lieu de créer une vente de plus).

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.sans_retrait = '1';
SET LOCAL fillsell.push_relance = '1';

-- ── Le lot : vente, ligne gardée, ventes_supprimees, fiche, job, annonce, journal, remise ──
CREATE TEMP TABLE _lot (
  vente bigint PRIMARY KEY, trace uuid NOT NULL, supprimee bigint NOT NULL, fiche bigint NOT NULL,
  job uuid NOT NULL, annonce text NOT NULL, journal_statut bigint NOT NULL, journal_annonce bigint NOT NULL,
  remise bigint NOT NULL
) ON COMMIT DROP;
INSERT INTO _lot VALUES
  (144011, '1783382e-2a83-4c38-a8f5-c1206c413047', 1364, 1789889100417003, '6ca95104-9d02-40d6-996a-0e7196ac3119', '10354759821', 38424, 38431, 822),
  (144012, 'e1180aff-6a93-444f-881a-4db57ee831d6', 1365, 1789889100417002, '30e772cc-0939-4f0e-8236-b0a9e5dced92', '5856871807',  38425, 38430, 823),
  (144013, '9ba05ab7-e508-48b8-8cd8-7aab5ed73ede', 1366, 1789889100063004, '6d2b7125-da73-4319-b194-902b531ffa1a', '5857209396',  38426, 38428, 824),
  (144014, 'd9ec2c2b-c8b8-482f-b72e-6f3ae0842449', 1367, 1789889100063006, '399a0380-80ee-450b-8d02-1eea61287d5b', '5856970608',  38427, 38429, 825);

-- ── 0. Préconditions : sinon arrêt, rien n'est écrit ─────────────────────────
DO $pre$
DECLARE
  u uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  n integer;
BEGIN
  IF EXISTS (SELECT 1 FROM public.ventes v JOIN _lot l ON l.vente = v.id) THEN
    RAISE EXCEPTION 'lot B : une des ventes 144011-144014 existe déjà — rien n''est fait';
  END IF;

  SELECT count(*) INTO n
    FROM _lot l
    JOIN public.usage_logs t ON t.id = l.trace AND t.user_id = u AND t.feature = 'vente_retiree'
                            AND t.metadata ->> 'motif' = 'commande_cancelled'
                            AND (t.metadata -> 'vente' ->> 'id')::bigint = l.vente
                            AND t.metadata -> 'vente' ->> 'user_id' = u::text
                            AND (t.metadata -> 'vente' ->> 'inventaire_id')::bigint = l.fiche
                            AND t.metadata -> 'vente' ->> 'annonce_id' = l.annonce
    JOIN public.ventes_supprimees s ON s.id = l.supprimee AND s.user_id = u AND s.vente_id = l.vente
                            AND s.plateforme_code = 'vinted' AND s.source = 'releve_vinted' AND s.motif = 'commande_cancelled'
                            AND s.annonce_id = l.annonce
                            AND s.prix_vente IS NOT DISTINCT FROM (t.metadata -> 'vente' ->> 'prix_vente')::numeric
                            AND s.titre IS NOT DISTINCT FROM (t.metadata -> 'vente' ->> 'titre');
  IF n <> 4 THEN
    RAISE EXCEPTION 'lot B : % ligne(s) gardée(s) sur 4 recoupée(s) avec ventes_supprimees — rien n''est fait', n;
  END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.inventaire i ON i.id = l.fiche
   WHERE i.user_id = u AND i.fusionne_dans IS NULL AND i.vinted_item_id = l.annonce
     AND i.statut IN ('stock', 'vendu') AND i.vinted_status IN ('closed', 'sold');
  IF n <> 4 THEN
    RAISE EXCEPTION 'lot B : % fiche(s) sur 4 dans l''état attendu (stock/closed, ou déjà vendu/sold par un dressing) — rien n''est fait', n;
  END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.inventaire_journal ij ON ij.user_id = u AND ij.inventaire_id = l.fiche
   WHERE (ij.id = l.journal_statut AND ij.champ = 'statut' AND ij.avant = 'vendu' AND ij.apres = 'stock'
          AND ij.source = 'releve_vinted' AND ij.motif = 'commande_annulee')
      OR (ij.id = l.journal_annonce AND ij.champ = 'vinted_status' AND ij.avant = 'sold' AND ij.apres = 'closed'
          AND ij.source = 'claude_sql' AND ij.motif = 'commande_annulee');
  IF n <> 8 THEN
    RAISE EXCEPTION 'lot B : % ligne(s) de journal sur 8 attendues (38424-38431) — rien n''est fait', n;
  END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.cross_post_jobs j ON j.id = l.job
   WHERE j.user_id = u AND j.inventaire_id = l.fiche AND j.platform = 'vinted' AND j.status = 'cancelled'
     AND j.platform_listing_id = l.annonce
     AND (j.platform_fields -> 'vente_annulee' ->> 'vente')::bigint = l.vente
     AND j.platform_fields ->> 'vente_operation_cle' = 'annonce:vinted:' || l.annonce
     AND j.sold_at = timestamptz '2026-10-13 09:07:00.182085+00';
  IF n <> 4 THEN
    RAISE EXCEPTION 'lot B : % job(s) sur 4 clos par la réparation de 11:37 — rien n''est fait', n;
  END IF;

  IF EXISTS (SELECT 1 FROM public.ventes_operations o JOIN _lot l ON o.user_id = u AND o.cle = 'annonce:vinted:' || l.annonce)
     OR EXISTS (SELECT 1 FROM public.ventes v JOIN _lot l ON v.user_id = u AND (v.inventaire_id = l.fiche OR v.annonce_id = l.annonce)) THEN
    RAISE EXCEPTION 'lot B : un reçu ou une vente existe déjà sur ces fiches / annonces — rien n''est fait';
  END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.remises_en_vente r ON r.id = l.remise
   WHERE r.user_id = u AND r.job_vendu = l.job AND r.statut = 'abandonnee' AND r.motif = 'plus_de_stock';
  IF n <> 4 THEN
    RAISE EXCEPTION 'lot B : % remise(s) sur 4 dans l''état attendu (822-825) — rien n''est fait', n;
  END IF;
END
$pre$;

-- ── 1. Sauvegarde de tout ce que le script touche (lignes entières, AVANT) ──
CREATE TABLE public._backup_1710_louis_lot_b_ventes AS
  SELECT now() AS sauve_le, v.* FROM public.ventes v WHERE v.id IN (SELECT vente FROM _lot);
CREATE TABLE public._backup_1710_louis_lot_b_supprimees AS
  SELECT now() AS sauve_le, s.* FROM public.ventes_supprimees s WHERE s.id IN (SELECT supprimee FROM _lot);
CREATE TABLE public._backup_1710_louis_lot_b_fiches AS
  SELECT now() AS sauve_le, i.* FROM public.inventaire i WHERE i.id IN (SELECT fiche FROM _lot);
CREATE TABLE public._backup_1710_louis_lot_b_journal AS
  SELECT now() AS sauve_le, ij.* FROM public.inventaire_journal ij
   WHERE ij.id IN (SELECT journal_statut FROM _lot UNION ALL SELECT journal_annonce FROM _lot);
CREATE TABLE public._backup_1710_louis_lot_b_jobs AS
  SELECT now() AS sauve_le, j.* FROM public.cross_post_jobs j WHERE j.id IN (SELECT job FROM _lot);
CREATE TABLE public._backup_1710_louis_lot_b_recus AS
  SELECT now() AS sauve_le, o.* FROM public.ventes_operations o
   WHERE o.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND o.cle IN (SELECT 'annonce:vinted:' || annonce FROM _lot);
CREATE TABLE public._backup_1710_louis_lot_b_remises AS
  SELECT now() AS sauve_le, r.* FROM public.remises_en_vente r WHERE r.id IN (SELECT remise FROM _lot);
ALTER TABLE public._backup_1710_louis_lot_b_ventes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1710_louis_lot_b_supprimees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1710_louis_lot_b_fiches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1710_louis_lot_b_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1710_louis_lot_b_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1710_louis_lot_b_recus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public._backup_1710_louis_lot_b_remises ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1710_louis_lot_b_ventes, public._backup_1710_louis_lot_b_supprimees,
              public._backup_1710_louis_lot_b_fiches, public._backup_1710_louis_lot_b_journal,
              public._backup_1710_louis_lot_b_jobs, public._backup_1710_louis_lot_b_recus,
              public._backup_1710_louis_lot_b_remises FROM anon, authenticated;

-- ── 2. Compteurs du compte AVANT toute écriture (mails, notes à envoyer) ──
CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes_a_envoyer bigint, notes bigint) ON COMMIT DROP;
INSERT INTO _cpt
SELECT 'avant',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND statut = 'a_envoyer'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7');

-- ── 3. Les ventes, à l'identique (mêmes id, toutes colonnes) ──
INSERT INTO public.ventes
SELECT (jsonb_populate_record(NULL::public.ventes, t.metadata -> 'vente')).*
  FROM _lot l JOIN public.usage_logs t ON t.id = l.trace
 ORDER BY l.vente;

-- ── 4. Les lignes « cette vente ne revient jamais » ──
DELETE FROM public.ventes_supprimees s USING _lot l
 WHERE s.id = l.supprimee AND s.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7';

-- ── 5. Les fiches : vendu, quantité 0, annonce « sold » ──
UPDATE public.inventaire i SET statut = 'vendu', quantite = 0, vinted_status = 'sold'
  FROM _lot l
 WHERE i.id = l.fiche AND i.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'
   AND (i.statut, i.quantite, i.vinted_status) IS DISTINCT FROM ('vendu'::text, 0, 'sold'::text);

-- ── 6. Le journal : les 8 lignes des gestes de 11:37 et 11:38 ──
DELETE FROM public.inventaire_journal ij USING _lot l
 WHERE ij.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND ij.inventaire_id = l.fiche
   AND ij.id IN (l.journal_statut, l.journal_annonce);

-- ── 7. Les jobs : vendus, sans la marque de l'annulation ──
UPDATE public.cross_post_jobs j SET status = 'sold', error = NULL, platform_fields = j.platform_fields - 'vente_annulee'
  FROM _lot l
 WHERE j.id = l.job AND j.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND j.status = 'cancelled';

-- ── 8. Les reçus, tels que enregistrer_vente_atomique les écrit ──
INSERT INTO public.ventes_operations (user_id, cle, inventaire_id, job_id, resultat, cree_le)
SELECT v.user_id, 'annonce:vinted:' || l.annonce, l.fiche, l.job,
       jsonb_build_object('ok', true, 'venteCreated', true, 'inventaireUpdated', true,
                          'siblingsCancelled', 0, 'pendingRemoval', 0, 'retraitsArmes', 0,
                          'emailSent', false, 'venteNotee', true,
                          'ventes_ids', jsonb_build_array(l.vente), 'restant', 0, 'rejouee', false),
       v.created_at
  FROM _lot l JOIN public.ventes v ON v.id = l.vente;

-- ── 9. Filet du 08/10 : une note « a_envoyer » née ici est classée avant la validation ──
UPDATE public.push_ventes p SET statut = 'ignoree', motif = 'reparation_1710_louis_lot_b', traite_le = now()
 WHERE p.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND p.statut = 'a_envoyer' AND p.cree_le >= now()
   AND (p.inventaire_id IN (SELECT fiche FROM _lot) OR p.vente_id IN (SELECT vente FROM _lot) OR p.job_id IN (SELECT job FROM _lot));

-- ── 10. La trace de la remise ──
INSERT INTO public.usage_logs (user_id, feature, metadata)
SELECT 'faf5021a-479a-4bb3-b3ec-c296770739b7'::uuid, 'vente_restauree',
       jsonb_build_object('vente', l.vente, 'fiche', l.fiche, 'job', l.job, 'annonce', l.annonce,
                          'motif', 'vraie_vente_verifiee_par_nico_1710',
                          'annule', 'vente_commande_annulee_vinted du 17/10 11:37:07 et vinted_status closed du 17/10 11:38:06',
                          'ligne_gardee', l.trace, 'sauvegarde', '_backup_1710_louis_lot_b_*',
                          'script', 'scripts/reparations/20261017_louis_lot_b_remise_ventes.sql')
  FROM _lot l;

-- ── 11. Contrôles après écriture : sinon RAISE, tout est annulé ──
INSERT INTO _cpt
SELECT 'apres',
       (SELECT count(*) FROM public.email_logs WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND statut = 'a_envoyer'),
       (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7');

DO $post$
DECLARE
  u uuid := 'faf5021a-479a-4bb3-b3ec-c296770739b7';
  n integer;
  a record; b record;
BEGIN
  SELECT count(*) INTO n
    FROM _lot l JOIN public.ventes v ON v.id = l.vente
    JOIN public.usage_logs t ON t.id = l.trace
   WHERE to_jsonb(v) = to_jsonb(jsonb_populate_record(NULL::public.ventes, t.metadata -> 'vente'));
  IF n <> 4 THEN RAISE EXCEPTION 'lot B : % vente(s) sur 4 identique(s) à la ligne gardée — tout est annulé', n; END IF;

  IF EXISTS (SELECT 1 FROM public.ventes_supprimees s JOIN _lot l ON s.id = l.supprimee) THEN
    RAISE EXCEPTION 'lot B : une ligne ventes_supprimees 1364-1367 reste — tout est annulé';
  END IF;

  SELECT count(*) INTO n FROM _lot l JOIN public.inventaire i ON i.id = l.fiche
   WHERE i.statut = 'vendu' AND i.quantite = 0 AND i.vinted_status = 'sold';
  IF n <> 4 THEN RAISE EXCEPTION 'lot B : % fiche(s) sur 4 vendu / 0 / sold — tout est annulé', n; END IF;

  IF EXISTS (SELECT 1 FROM public.inventaire_journal ij JOIN _lot l ON ij.id IN (l.journal_statut, l.journal_annonce)) THEN
    RAISE EXCEPTION 'lot B : une ligne de journal 38424-38431 reste — tout est annulé';
  END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.cross_post_jobs j ON j.id = l.job
    JOIN public._backup_1710_louis_lot_b_jobs bj ON bj.id = l.job
   WHERE j.status = 'sold' AND j.error IS NULL AND NOT (j.platform_fields ? 'vente_annulee')
     AND j.platform_fields = bj.platform_fields - 'vente_annulee'
     AND j.sold_at = bj.sold_at AND j.last_checked_at IS NOT DISTINCT FROM bj.last_checked_at;
  IF n <> 4 THEN RAISE EXCEPTION 'lot B : % job(s) sur 4 remis sold à l''identique — tout est annulé', n; END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.ventes_operations o ON o.user_id = u AND o.cle = 'annonce:vinted:' || l.annonce
   WHERE o.inventaire_id = l.fiche AND o.job_id = l.job AND o.resultat -> 'ventes_ids' = jsonb_build_array(l.vente)
     AND o.cree_le = (SELECT v.created_at FROM public.ventes v WHERE v.id = l.vente);
  IF n <> 4 THEN RAISE EXCEPTION 'lot B : % reçu(s) sur 4 — tout est annulé', n; END IF;

  SELECT count(*) INTO n
    FROM _lot l JOIN public.remises_en_vente r ON r.id = l.remise
    JOIN public._backup_1710_louis_lot_b_remises br ON br.id = r.id
   WHERE to_jsonb(r) = to_jsonb(br) - 'sauve_le';
  IF n <> 4 THEN RAISE EXCEPTION 'lot B : % remise(s) sur 4 inchangée(s) — tout est annulé', n; END IF;
  IF EXISTS (SELECT 1 FROM public.remises_en_vente r WHERE r.inventaire_id IN (SELECT fiche FROM _lot) AND r.cree_le >= now()) THEN
    RAISE EXCEPTION 'lot B : une remise en vente est née — tout est annulé';
  END IF;

  IF EXISTS (SELECT 1 FROM public.cross_post_jobs d
              WHERE d.inventaire_id IN (SELECT fiche FROM _lot) AND d.action = 'delete' AND d.created_at >= now()) THEN
    RAISE EXCEPTION 'lot B : un retrait a été armé — tout est annulé';
  END IF;

  SELECT * INTO a FROM _cpt WHERE moment = 'avant';
  SELECT * INTO b FROM _cpt WHERE moment = 'apres';
  IF b.mails <> a.mails THEN
    RAISE EXCEPTION 'lot B : email_logs du compte % → % — un mail partirait, tout est annulé', a.mails, b.mails;
  END IF;
  IF b.notes_a_envoyer <> a.notes_a_envoyer THEN
    RAISE EXCEPTION 'lot B : notes « a_envoyer » du compte % → % — tout est annulé', a.notes_a_envoyer, b.notes_a_envoyer;
  END IF;
END
$post$;

-- ── 12. Lecture ──
SELECT l.vente,
       v.prix_vente,
       to_char(v.created_at AT TIME ZONE 'Europe/Paris', 'DD/MM HH24:MI') AS vente_du,
       i.statut || ' ×' || i.quantite || ' ' || coalesce(i.vinted_status, '∅') AS fiche,
       j.status || CASE WHEN j.error IS NULL THEN '' ELSE ' — ' || left(j.error, 40) END
         || CASE WHEN j.platform_fields ? 'vente_annulee' THEN ' (marque d''annulation restée !)' ELSE '' END AS job,
       coalesce(o.cle, 'SANS reçu') AS recu,
       (SELECT count(*) FROM public.ventes_supprimees s WHERE s.id = l.supprimee) AS ventes_supprimees_restantes,
       (SELECT count(*) FROM public.inventaire_journal ij WHERE ij.id IN (l.journal_statut, l.journal_annonce)) AS lignes_journal_restantes,
       r.statut || ' / ' || r.motif AS remise,
       (SELECT a.mails || ' → ' || b.mails || ' mails ; ' || a.notes_a_envoyer || ' → ' || b.notes_a_envoyer || ' notes à envoyer ; '
               || a.notes || ' → ' || b.notes || ' notes'
          FROM _cpt a, _cpt b WHERE a.moment = 'avant' AND b.moment = 'apres') AS mails_et_notes
  FROM _lot l
  JOIN public.ventes v ON v.id = l.vente
  JOIN public.inventaire i ON i.id = l.fiche
  JOIN public.cross_post_jobs j ON j.id = l.job
  JOIN public.remises_en_vente r ON r.id = l.remise
  LEFT JOIN public.ventes_operations o ON o.user_id = v.user_id AND o.cle = 'annonce:vinted:' || l.annonce
 ORDER BY l.vente;

COMMIT;
