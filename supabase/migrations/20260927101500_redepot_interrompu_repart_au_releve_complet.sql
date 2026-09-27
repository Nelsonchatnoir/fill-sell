-- ═══════════════════════════════════════════════════════════════════════════
-- REDÉPÔT INTERROMPU : LE RELEVÉ COMPLET REMET LA REPUBLICATION EN FILE (27/09)
-- APPLIQUÉE le 27/09 (GO Nico, CLI db query -f), après rejeu annulé : clôture
-- rejouée du relevé 300e3b08 → seul fb358c75 repasse en file ; droits inchangés.
-- ═══════════════════════════════════════════════════════════════════════════
-- famouus-x3 (Les Petites Fioles), « Calendrier de l'Avent chaussettes »
-- (job fb358c75) : annonce Leboncoin retirée le 25/09, recréations mortes en
-- route, puis « relevé introuvable » (needs_user) posé le 26/09 08:46 — et le
-- relevé complet de 09:10 n'a rien déclenché : personne ne relit un job en
-- needs_user. releve_clos_tranche_publications (recopiée de la version EN PROD,
-- posée ce matin par 20260927091140) remet désormais ces jobs en file à la
-- clôture d'un relevé Leboncoin COMPLET commencé après le retrait et l'essai
-- suspect ; get-pending-jobs (v146) juge avec ce relevé : aucune annonce →
-- redépôt ; même annonce certaine → rattachée ; doute → question. Beebs n'est
-- pas concerné (le relevé Beebs ne prouve pas encore l'absence d'un dépôt récent).

CREATE OR REPLACE FUNCTION public.releve_clos_tranche_publications()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_vus      integer;
  v_verdicts jsonb;
BEGIN
  IF COALESCE(NEW.erreur, '') LIKE '[incomplet]%' THEN RETURN NULL; END IF;
  IF releve_hors_liste(NEW.erreur) THEN RETURN NULL; END IF;
  IF NEW.platform = 'ebay' AND releve_ebay_run_incomplet(NEW.id) THEN RETURN NULL; END IF;
  SELECT count(*) INTO v_vus FROM annonces_plateforme WHERE run_id = NEW.id;
  IF v_vus = 0 AND releve_compte_avait_annonces(NEW.user_id, NEW.platform) THEN RETURN NULL; END IF;
  BEGIN
    v_verdicts := trancher_publications_sans_lien(NEW.user_id, NEW.platform, NEW.id);
    IF COALESCE((v_verdicts->>'refusees')::int, 0) + COALESCE((v_verdicts->>'en_ligne')::int, 0) > 0 THEN
      RAISE LOG 'releve_clos_tranche_publications : run % (%) → %', NEW.id, NEW.platform, v_verdicts;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'releve_clos_tranche_publications : run % : %', NEW.id, SQLERRM;
  END;
  -- ── REDÉPÔT INTERROMPU : LA PREUVE EST ARRIVÉE (2026-09-27, famouus-x3) ──
  -- Une republication Leboncoin retirée puis recréée en vain, arrêtée
  -- « annonce peut-être déjà partie — relevé introuvable » (get-pending-jobs),
  -- ne repartait JAMAIS toute seule : la garde ne relit que les jobs pending.
  -- Un relevé COMPLET de ce compte (gardes ci-dessus), COMMENCÉ après le
  -- retrait et après l'essai suspect, la remet en file : get-pending-jobs juge
  -- alors avec CE relevé — aucune annonce apparue → redépôt depuis la copie du
  -- job ; la même annonce, certaine → rattachée, rien redéposé ; un doute →
  -- la question revient. Jamais un redépôt sans cette preuve.
  IF NEW.platform = 'leboncoin' THEN
    BEGIN
      UPDATE cross_post_jobs j SET
        status = 'pending', error = NULL,
        platform_fields = (j.platform_fields - 'needs_user_source')
          || jsonb_build_object('recreation_relancee_par_releve', jsonb_build_object('le', now(), 'releve', NEW.id))
       WHERE j.user_id = NEW.user_id AND j.platform = 'leboncoin' AND j.action = 'republish' AND j.status = 'needs_user'
         AND j.platform_fields->>'needs_user_source' = 'recreation_deja_partie'
         AND j.platform_fields#>>'{recreation_deja_partie,verdict}' = 'releve_introuvable'
         AND j.platform_fields->>'republish_step' = 'deleted'
         AND NEW.started_at > GREATEST(
               COALESCE((j.platform_fields->>'deleted_at')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_depot_parti,at}')::timestamptz, '-infinity'::timestamptz),
               COALESCE((j.platform_fields#>>'{recreation_deja_partie,le}')::timestamptz, '-infinity'::timestamptz));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_tranche_publications (redépôts) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
  RETURN NULL;
END
$function$
;
