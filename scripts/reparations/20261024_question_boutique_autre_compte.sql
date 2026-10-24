-- ═══════════════════════════════════════════════════════════════════════════
-- 24/10 — LA QUESTION « REMISE EN LIGNE » POSÉE SUR LA BOUTIQUE D'UN AUTRE COMPTE, CLOSE (compte 0a24c951)
-- ═══════════════════════════════════════════════════════════════════════════
-- Le rattrapage du 24/10 (11:59:50, heure de Paris) a posé UNE question « Est-ce le même article ? » sur deux fiches de
-- la boutique Vinted 137708392, inscrite au registre du 18/10 (« une boutique = un compte FillSell ») au nom d'un autre
-- compte. Une réponse « oui » n'aurait rien pu fondre (inventaire_ecarte_import_sync refuse la fusion). La règle est
-- corrigée pour tous les comptes (migration 20261024180000 : ni fusion, ni question sur une boutique inscrite ailleurs) ;
-- cette question, née avant, est close « caduque » par le moteur, comme toute question devenue sans objet. Rien d'autre
-- n'est touché : aucune fiche, aucune annonce, aucun mail, aucun push.
-- Sauvegarde : _backup_2410_question_boutique_autre_compte (RLS, aucun accès client).
-- Inverse : scripts/reparations/20261024_question_boutique_autre_compte_INVERSE.sql.
BEGIN;
SET LOCAL statement_timeout = '60s';
CREATE TABLE IF NOT EXISTS public._backup_2410_question_boutique_autre_compte
  (LIKE public.inventaire_doublons, sauvegarde_le timestamptz NOT NULL DEFAULT now());
ALTER TABLE public._backup_2410_question_boutique_autre_compte ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_2410_question_boutique_autre_compte FROM PUBLIC, anon, authenticated;
DO $rep$
DECLARE d record; n integer;
BEGIN
  SELECT * INTO d FROM public.inventaire_doublons WHERE id = 'f6904c8e-e006-4e43-a4eb-3d98057ada39' FOR UPDATE;
  IF d.id IS NULL OR d.user_id <> '0a24c951-4612-455a-aba2-47bb8f05fff1'::uuid OR d.statut <> 'proposee'
     OR d.preuves ->> 'portee' IS DISTINCT FROM 'remise_en_ligne' THEN
    RAISE EXCEPTION 'la question n''est plus dans l''état lu (proposée, remise en ligne, 0a24c951) — ON S''ARRÊTE';
  END IF;
  IF public.rapprochement_v3_remise_possible(d.user_id, d.garde, d.absorbe) IS DISTINCT FROM 'boutiques_differentes'
     OR NOT public.boutique_vinted_autre_compte(d.user_id, (SELECT i.vinted_account_id FROM public.inventaire i WHERE i.id = d.garde)) THEN
    RAISE EXCEPTION 'la règle ne dit pas « boutique d''un autre compte » pour cette paire — ON S''ARRÊTE';
  END IF;
  INSERT INTO public._backup_2410_question_boutique_autre_compte SELECT q.*, now() FROM public.inventaire_doublons q WHERE q.id = d.id;
  UPDATE public.inventaire_doublons SET statut = 'caduque', decide_le = now(), decide_par = 'rapprochement_v3'
   WHERE id = d.id AND statut = 'proposee';
  GET DIAGNOSTICS n = ROW_COUNT;
  IF n <> 1 THEN RAISE EXCEPTION 'attendu 1 question close, % — ON S''ARRÊTE', n; END IF;
END
$rep$;
COMMIT;
