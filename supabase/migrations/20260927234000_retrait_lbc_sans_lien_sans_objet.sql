-- ═══════════════════════════════════════════════════════════════════════════
-- RETRAIT LEBONCOIN SANS LIEN : CLOS QUAND LE RELEVÉ COMPLET PROUVE QU'IL N'Y A
-- RIEN EN LIGNE (27/09 soir)
-- ═══════════════════════════════════════════════════════════════════════════
-- Trois retraits attendaient « le lien » (louis Leboncoin, meminiandmove et
-- xxewwer Beebs). louis, « Rangement Blanc pour 12 pots » (retrait de54a2b2) :
-- le dépôt 3275434644 est connu, la page publique dit « Cette annonce est
-- désactivée » (vérifié le 27/09 23:30), et aucun relevé ne l'a jamais vu.
-- Rien à retirer : il attendait un lien qui ne viendra jamais.
--  1. releve_clos_tranche_publications (définition PROD + ajout) : à la clôture
--     d'un relevé Leboncoin COMPLET, un retrait sans lien dont l'identifiant de
--     dépôt est absent du relevé (et d'aucune annonce vivante) est clos
--     « rien à retirer ». Rien n'est jamais retiré par cette règle.
--  2. Le retrait de louis est clos (preuve : page désactivée).
-- (meminiandmove : l'annonce Beebs 34010592 existe, importée ce soir comme une
--  fiche à part — traitée dans 20260927234500, qui attend le GO. xxewwer : le
--  dépôt n'est ni dans l'index public ni dans le relevé ; il reste en attente,
--  borné à 7 jours par get-pending-jobs.)

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
  -- (27/09) Ceinture : le run a lu MOINS que ce que la plateforme annonce
  -- (total_entries, écrit par l'extension 0.6.75) → aucun verdict.
  IF NEW.total_entries IS NOT NULL AND COALESCE(NEW.items_vus, 0) < NEW.total_entries THEN RETURN NULL; END IF;
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
  -- ── UN RETRAIT LEBONCOIN SANS LIEN N'ATTEND PAS UNE ANNONCE QUI N'EXISTE PLUS
  --    (27/09, louis « Rangement Blanc », 3275434644) ─────────────────────────
  -- L'identifiant du dépôt est connu (adsubmit) mais le lien, lui, ne vient
  -- jamais : l'annonce n'est plus en ligne (page « Cette annonce est
  -- désactivée »). Un relevé COMPLET de ce compte (gardes ci-dessus), commencé
  -- après la création du retrait, qui ne contient PAS cet identifiant le
  -- prouve : il n'y a rien en ligne à retirer. Le retrait est clos, sans rien
  -- toucher. Beebs n'est pas concerné (ses dépôts n'ont pas d'identifiant, et
  -- la modération ne se juge pas).
  IF NEW.platform = 'leboncoin' THEN
    BEGIN
      UPDATE cross_post_jobs d SET
        status = 'cancelled',
        error = 'Rien à retirer : cette annonce Leboncoin n''est plus en ligne (absente du relevé complet de tes annonces du '
          || to_char(COALESCE(NEW.finished_at, NEW.started_at) AT TIME ZONE 'Europe/Paris', 'DD/MM à HH24"h"MI') || '). Aucune autre annonce n''a été touchée.',
        platform_fields = COALESCE(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
          'retrait_sans_objet', jsonb_build_object('le', now(), 'releve', NEW.id, 'preuve', 'identifiant_absent_du_releve_complet'))
       WHERE d.user_id = NEW.user_id AND d.platform = 'leboncoin' AND d.action = 'delete'
         AND d.status IN ('pending', 'needs_user') AND d.listing_url IS NULL
         AND d.created_at < NEW.started_at
         AND EXISTS (
           SELECT 1 FROM cross_post_jobs p
            WHERE p.user_id = d.user_id AND p.inventaire_id = d.inventaire_id AND p.platform = 'leboncoin'
              AND p.action IN ('publish', 'republish') AND p.platform_listing_id ~ '^[0-9]{6,}$')
         AND NOT EXISTS (
           SELECT 1 FROM cross_post_jobs p
             JOIN annonces_plateforme ap ON ap.user_id = p.user_id AND ap.platform = 'leboncoin' AND ap.listing_id = p.platform_listing_id
            WHERE p.user_id = d.user_id AND p.inventaire_id = d.inventaire_id AND p.platform = 'leboncoin'
              AND p.action IN ('publish', 'republish')
              AND (ap.run_id = NEW.id OR ap.disparu_le IS NULL));
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'releve_clos_tranche_publications (retraits sans objet) : run % : %', NEW.id, SQLERRM;
    END;
  END IF;
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
$function$;

UPDATE cross_post_jobs d SET
  status = 'cancelled',
  error = 'Rien à retirer : cette annonce Leboncoin (3275434644) n''est plus en ligne — sa page publique indique « Cette annonce est désactivée » (vérifié le 27/09 à 23h30). Aucune autre annonce n''a été touchée.',
  platform_fields = COALESCE(d.platform_fields, '{}'::jsonb) || jsonb_build_object(
    'retrait_sans_objet', jsonb_build_object('le', now(), 'preuve', 'page_publique_desactivee', 'par', 'migration 20260927234000'))
 WHERE d.id = 'de54a2b2-473e-4681-ba96-e69ca4bfeb9f' AND d.status IN ('pending', 'needs_user');
