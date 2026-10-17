-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — NOTE 2348 DE LOUIS (puzzle Vilainous, annonce Vinted 10378308608) :
-- MONTANT CORRIGÉ À 12 € (décision de Nico, 18/10 : « son montant »)
-- ═══════════════════════════════════════════════════════════════════════════
-- État lu le 18/10 : push_ventes 2348 (origine job, mail déjà envoyé le 16/10 12:56,
-- prix NULL — exclue de la réparation C1 du 17/10 en attendant la décision) ; la vente
-- 181210 (fiche 1789889098202002) porte 14 € = le prix de l'annonce, pas le montant du
-- vendeur. Le geste : vente 181210 prix_vente 14 → 12 (bénéfice : prix d'achat inconnu,
-- reste NULL) ; note 2348 prix NULL → 12. Le prix de la fiche (14, prix d'annonce) ne
-- bouge pas. Aucun déclencheur n'écrit un mail sur un UPDATE de ventes ni de
-- push_ventes (relu le 18/10 : déclencheurs de ventes = INSERT / DELETE seulement ;
-- push_ventes : aucun) ; la note a déjà son mail (mail_statut = envoye) — rien ne
-- repart. Sauvegarde : _backup_1810_note_2348 (lignes entières).
-- Inverse : scripts/reparations/20261018_note_2348_louis_12_euros_INVERSE.sql.
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_note_2348_louis_12_euros.sql

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';
SET LOCAL fillsell.push_relance = '1';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1810_note_2348') IS NOT NULL THEN RAISE EXCEPTION 'déjà fait (sauvegarde présente) : rien n''est écrit'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.push_ventes WHERE id = 2348 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND prix IS NULL AND mail_statut = 'envoye') THEN
    RAISE EXCEPTION 'note 2348 pas dans l''état attendu (Louis, prix NULL, mail envoyé) : rien n''est écrit';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.ventes WHERE id = 181210 AND user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND inventaire_id = 1789889098202002 AND prix_vente = 14) THEN
    RAISE EXCEPTION 'vente 181210 pas dans l''état attendu (Louis, fiche 1789889098202002, 14 €) : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1810_note_2348 (quoi text, id bigint, ligne jsonb);
ALTER TABLE public._backup_1810_note_2348 ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1810_note_2348 FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_1810_note_2348 SELECT 'push_ventes', id, to_jsonb(p) FROM public.push_ventes p WHERE id = 2348;
INSERT INTO public._backup_1810_note_2348 SELECT 'ventes', id, to_jsonb(v) FROM public.ventes v WHERE id = 181210;

CREATE TEMP TABLE _cpt (moment text PRIMARY KEY, mails bigint, notes bigint) ON COMMIT DROP;
INSERT INTO _cpt SELECT 'avant', (SELECT count(*) FROM public.email_logs WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'),
  (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND statut = 'a_envoyer');

UPDATE public.ventes SET prix_vente = 12 WHERE id = 181210 AND prix_vente = 14;
UPDATE public.push_ventes SET prix = 12 WHERE id = 2348 AND prix IS NULL;

INSERT INTO _cpt SELECT 'apres', (SELECT count(*) FROM public.email_logs WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7'),
  (SELECT count(*) FROM public.push_ventes WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND statut = 'a_envoyer');
DO $verif$
DECLARE a record; b record;
BEGIN
  SELECT * INTO a FROM _cpt WHERE moment = 'avant'; SELECT * INTO b FROM _cpt WHERE moment = 'apres';
  IF a.mails <> b.mails OR a.notes <> b.notes THEN RAISE EXCEPTION 'un mail ou une note serait parti : tout est annulé'; END IF;
  IF (SELECT prix_vente FROM public.ventes WHERE id = 181210) <> 12 OR (SELECT prix FROM public.push_ventes WHERE id = 2348) <> 12 THEN
    RAISE EXCEPTION 'le montant n''est pas 12 : tout est annulé';
  END IF;
END
$verif$;

SELECT 'vente' AS quoi, id, prix_vente::text AS montant, NULL::text AS mail FROM public.ventes WHERE id = 181210
UNION ALL SELECT 'note', id, prix::text, mail_statut FROM public.push_ventes WHERE id = 2348;

COMMIT;
