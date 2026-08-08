-- coin_reservations.unit_price accepte 0 (2026-08-08) — HOTFIX publication Pro.
--
-- La publication offerte en Pro (migration 20260808111536) insérait des
-- réservations à unit_price = 0, rejetées par la contrainte historique
-- CHECK (unit_price > 0) écrite avant l'existence du cas gratuit : exception
-- 23514 → transaction annulée → AUCUN job créé pour AUCUN Pro, front sur
-- « Une erreur est survenue ». Même piège que coin_ledger.kind le 04/08 :
-- une contrainte fermée d'avant le nouveau cas.
--
-- Les autres contraintes de la table ont été relues une à une : elles
-- tiennent toutes à 0 (amount >= 0 ; from_included + from_purchased = amount
-- → 0+0=0 ; captured + released_included + released_purchased <= amount →
-- 0 <= 0 ; status inchangé). Seule unit_price_check rejetait.
--
-- Idempotent : DROP IF EXISTS + ADD sous le même nom.

alter table public.coin_reservations
  drop constraint if exists coin_reservations_unit_price_check;

alter table public.coin_reservations
  add constraint coin_reservations_unit_price_check check (unit_price >= 0);
