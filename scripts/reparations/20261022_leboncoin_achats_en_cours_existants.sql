-- ═══════════════════════════════════════════════════════════════════════════
-- RÉPARATION 22/10 — les achats Leboncoin DÉJÀ lus avant la règle (migration 20261022110000)
-- ═══════════════════════════════════════════════════════════════════════════
-- La règle n'agit qu'à une TRANSITION de la transaction lue : une annonce déjà lue « Achat en cours » ou « Vendu »
-- avant la règle ne bouge pas toute seule (relire la même valeur ne refait rien). Ce script passe ces annonces par
-- LE MÊME CIRCUIT (leboncoin_transaction_noter → preuve exacte → enregistrer_vente_prouvee → retraits ailleurs),
-- avec ses gardes (job publié au numéro exact, fiche en stock, un exemplaire, une annonce vivante), et :
--   · seulement une lecture FRAÎCHE (capture ou colonne de moins de :heures heures, annonce vue en ligne par un
--     relevé de moins de 24 h) — une capture ancienne a pu être annulée depuis : elle attend le prochain relevé ;
--   · AUCUN mail ni notification : les notes de vente nées dans la transaction sont classées 'ignoree'
--     (motif rattrapage_2210) avant le COMMIT ;
--   · sauvegarde : _backup_2210_lbc_achats (jobs, fiches avant) ; trace usage_logs vente_leboncoin_transaction.
-- Inverse : 20261022_leboncoin_achats_en_cours_existants_INVERSE.sql (vente_transaction_annulee_leboncoin sur
-- chaque vente créée ici — même chemin qu'un achat annulé : fiche au stock, retraits arrêtés, copies remises).
-- ⛔ À lancer SEULEMENT sur feu vert de Nico. Essai : remplacer COMMIT par ROLLBACK (la dernière requête liste tout).
-- EXÉCUTÉ le 22/10 à 11:22:43 (feu vert de Nico) : 18 ventes, 8 retraits. ⚠ UN mail est parti (note 3550, vincent.
-- marie.1316n, « Jeu d'échecs en verre ») : la note était née AVANT le script (21/10 16:40, en attente de sa vente)
-- et le classement ne visait que les notes nées dans la transaction ; la vente enregistrée l'a décidée et
-- push-ventes l'a envoyée à 11:22:47. Vraie vente (« Achat en cours » lu le 19/10). Le classement ci-dessous vise
-- désormais AUSSI les notes en attente des fiches touchées.
BEGIN;
SET LOCAL statement_timeout = '170s';
CREATE TABLE IF NOT EXISTS public._backup_2210_lbc_achats (
  le timestamptz DEFAULT now(), annonce uuid, listing_id text, user_id uuid, job uuid, inventaire_id bigint,
  transaction text, job_avant jsonb, fiche_avant jsonb, resultat jsonb);
ALTER TABLE public._backup_2210_lbc_achats ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2210_lbc_achats FROM anon, authenticated;

CREATE TEMP TABLE _cibles AS
SELECT a.id annonce, a.listing_id, a.user_id, j.id job, i.id inv, leboncoin_transaction_lue(a.transaction_plateforme, a.capture) tx
  FROM annonces_plateforme a
  JOIN cross_post_jobs j ON j.user_id = a.user_id AND j.platform = 'leboncoin' AND j.status = 'published'
   AND j.action IN ('publish', 'republish') AND btrim(j.platform_listing_id) = a.listing_id
  JOIN inventaire i ON i.id = j.inventaire_id AND i.user_id = j.user_id AND i.statut = 'stock' AND i.fusionne_dans IS NULL
 WHERE a.platform = 'leboncoin' AND a.statut_plateforme = 'en_ligne' AND a.disparu_le IS NULL
   AND a.vu_le > now() - interval '24 hours'
   AND greatest(a.capture_le, a.transaction_lue_le) > now() - interval '72 hours'   -- :heures
   AND leboncoin_transaction_lue(a.transaction_plateforme, a.capture) IN ('pending', 'sold')
   -- Un relevé en cours écrit l'inventaire : la vente attendrait le cron (et sa note partirait) — ce compte attend.
   AND NOT EXISTS (SELECT 1 FROM vinted_sync_runs r WHERE r.user_id = a.user_id AND r.status = 'running');

INSERT INTO public._backup_2210_lbc_achats (annonce, listing_id, user_id, job, inventaire_id, transaction, job_avant, fiche_avant)
SELECT c.annonce, c.listing_id, c.user_id, c.job, c.inv, c.tx, to_jsonb(j), to_jsonb(i)
  FROM _cibles c JOIN cross_post_jobs j ON j.id = c.job JOIN inventaire i ON i.id = c.inv;

CREATE TEMP TABLE _notes_avant AS SELECT id FROM push_ventes WHERE cree_le > now() - interval '1 day';
DO $$ DECLARE c record; r jsonb; v jsonb; BEGIN
  FOR c IN SELECT * FROM _cibles LOOP
    r := public.leboncoin_transaction_noter(c.annonce, c.tx, 'aucune');
    v := CASE WHEN r ->> 'issue' = 'prouvee' THEN public.enregistrer_vente_prouvee(c.job) END;
    UPDATE public._backup_2210_lbc_achats SET resultat = jsonb_build_object('regle', r, 'vente', v)
     WHERE annonce = c.annonce AND le = now();
  END LOOP;
END $$;
-- Zéro mail, zéro notification : les notes nées ici sont classées.
UPDATE push_ventes SET statut = 'ignoree', motif = 'rattrapage_2210', traite_le = now()
 WHERE part_le IS NULL AND statut NOT IN ('ignoree', 'doublon')
   AND ((id NOT IN (SELECT id FROM _notes_avant) AND cree_le >= now())
        OR inventaire_id IN (SELECT inv FROM _cibles));

SELECT b.listing_id, b.transaction, b.inventaire_id, b.resultat #>> '{regle,issue}' issue, b.resultat #>> '{vente,issue}' vente,
       (SELECT string_agg(d.platform || ':' || d.status, ',') FROM cross_post_jobs d WHERE d.inventaire_id = b.inventaire_id
          AND d.action = 'delete' AND d.created_at = now()) retraits,
       (SELECT count(*) FROM push_ventes p WHERE p.cree_le = now() AND p.statut = 'a_envoyer') notes_a_envoyer
  FROM public._backup_2210_lbc_achats b WHERE b.le = now() ORDER BY b.transaction, b.listing_id;
COMMIT;
