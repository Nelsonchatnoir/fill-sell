-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- 20261106110000 — LA LECTURE FRAÎCHE D'UNE VENTE LEBONCOIN NE S'ARRÊTE PLUS SUR UN « VENDU » SANS PREUVE (06/11, Nico, point 8)
-- ════════════════════════════════════════════════════════════════════════════════════════════════════════════════════
-- Le défaut (Louis, faf5021a) : après 20261105170000, les 7 ventes en série « Achat en cours » sont passées (06/11 07:15,
-- remises en vente publiées 07:20) ; DEUX autres ventes en série ne l'ont jamais été — 3297299585 (« Rangement Noir et
-- Gris », Vendu depuis le 05/11 09:49) et 3280443604 (« Rangement Blanc », Vendu depuis le 24/10 12:10). Leur dernier
-- changement d'état a été noté AVANT la migration (« plusieurs_exemplaires », la régression du 22/10) ; depuis, l'état ne
-- change plus (« Vendu » → « Vendu ») et seule la LECTURE FRAÎCHE (24/10, décision 7) peut les rattraper. Or elle exigeait
-- un job « sans sale_signal = sold » : les deux jobs (edf17fe7, b02dca17) portent sale_signal = sold SANS sale_evidence —
-- un « Vendu » lu sur la page, qui attend la question « Vendue ? » — et la preuve exacte de la transaction n'arrivait
-- jamais (aucune trace depuis : la règle n'était même pas appelée).
-- LA RÈGLE : « déjà prouvée » se lit comme dans leboncoin_transaction_noter (branche deja_prouvee) — sale_signal = sold
-- ET sale_evidence.listing_id = CE numéro. Rien d'autre ne change (fenêtre d'une heure, annonce vue en ligne dans les 24 h,
-- fiche au stock, job publié de CE numéro exactement ; aucun mail pour une vente de plus de 24 h).
-- Corps : pg_get_functiondef de la PROD du 06/11 (scripts/essais/fixtures/prod-0611-lecture-fraiche), une condition
-- changée. Essai : scripts/essais/20261106110000_banc.mjs (Postgres jetable). Inverse :
-- supabase/rollbacks/20261106110000_lecture_fraiche_preuve_exacte_INVERSE.sql.

CREATE OR REPLACE FUNCTION public.annonces_plateforme_transaction_leboncoin()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_new text; v_old text; v_lue_new timestamptz; v_lue_old timestamptz;
BEGIN
  BEGIN
    v_new := public.leboncoin_transaction_lue(NEW.transaction_plateforme, NEW.capture);
    IF v_new IS NULL THEN RETURN NULL; END IF;
    IF TG_OP = 'UPDATE' THEN
      v_old := public.leboncoin_transaction_lue(OLD.transaction_plateforme, OLD.capture);
      IF v_new IS NOT DISTINCT FROM v_old THEN
        -- (24/10, décision 7 de Nico) LA LECTURE FRAÎCHE D'UNE VENTE NON ENREGISTRÉE. Le même état relu (« Achat en
        -- cours » ou « Vendu ») ne disait rien : une fiche importée APRÈS la première lecture, ou une lecture ancienne
        -- reprise par une extension plus récente, attendait un script. Désormais, quand un relevé relit cet état
        -- (lecture de moins d'une heure, plus récente que la précédente, annonce vue en ligne dans les 24 h) et que le
        -- job Leboncoin publié de CE numéro, exactement, porte une fiche au stock sans preuve de vente, la règle joue
        -- comme au changement d'état (le rattrapage du 22/10, par le relevé lui-même). Aucun mail pour une vente de
        -- plus de 24 h : push_trg_job (rattrapage, première lecture).
        IF v_new IN ('pending', 'sold') THEN
          v_lue_new := greatest(NEW.transaction_lue_le, NEW.capture_le);
          v_lue_old := greatest(OLD.transaction_lue_le, OLD.capture_le);
          IF v_lue_new > now() - interval '1 hour' AND v_lue_new > coalesce(v_lue_old, '-infinity'::timestamptz)
             AND NEW.statut_plateforme = 'en_ligne' AND NEW.disparu_le IS NULL AND NEW.vu_le > now() - interval '24 hours'
             AND EXISTS (SELECT 1 FROM public.cross_post_jobs c
                           JOIN public.inventaire i ON i.id = c.inventaire_id AND i.user_id = c.user_id
                          WHERE c.user_id = NEW.user_id AND c.platform = 'leboncoin' AND c.status = 'published'
                            AND coalesce(c.action, 'publish') IN ('publish', 'republish')
                            AND btrim(coalesce(c.platform_listing_id, '')) = btrim(NEW.listing_id)
                            AND i.statut = 'stock' AND i.fusionne_dans IS NULL
                            -- (06/11, Nico, point 8 — Louis 3297299585, 3280443604) « déjà prouvée » = la preuve EXACTE de CE
                            -- numéro, le test même de leboncoin_transaction_noter (deja_prouvee) ; un « sold » lu sur la page,
                            -- sans sale_evidence (la question « Vendue ? »), n'arrête plus la preuve de la transaction.
                            AND NOT (coalesce(c.platform_fields ->> 'sale_signal', '') = 'sold'
                                     AND coalesce(c.platform_fields #>> '{sale_evidence,listing_id}', '') = btrim(NEW.listing_id))) THEN
            PERFORM public.leboncoin_transaction_noter(NEW.id, v_new, v_old);
          END IF;
        END IF;
        RETURN NULL;
      END IF;
    END IF;
    -- Une annonce lue pour la première fois sans transaction n'a rien à dire.
    IF v_old IS NULL AND v_new = 'aucune' THEN RETURN NULL; END IF;
    PERFORM public.leboncoin_transaction_noter(NEW.id, v_new, v_old);
  EXCEPTION WHEN OTHERS THEN
    -- Jamais un relevé perdu à cause de la règle : la panne est dite, l'écriture passe.
    RAISE WARNING 'annonces_plateforme_transaction_leboncoin (annonce %) : %', NEW.id, SQLERRM;
  END;
  RETURN NULL;
END;
$function$;
