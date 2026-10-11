-- REJEU EN TRANSACTION ANNULÉE — migration 20261012100000 (A8). Rien n'est écrit : ROLLBACK final.
BEGIN;
-- ═══════════════════════════════════════════════════════════════════════════
-- LE JOURNAL DES NOTIFICATIONS D'APPLE ET DE GOOGLE (12/10, A8 — demande de Nico)
-- ═══════════════════════════════════════════════════════════════════════════
-- Cause : le 07/10 à 20:54, le passage Premium → Pro de Ciddjy (payé chez
-- Apple, DID_CHANGE_RENEWAL_PREF / UPGRADE) a été jeté par apple-iap-webhook
-- (« Unhandled type ») sans aucune trace exploitable : quatre jours payé Pro,
-- resté Premium, découvert à la main. Nico (11/10) : « Un sous-type inconnu ne
-- doit plus jamais être jeté en silence : il doit être enregistré et signalé. »
-- Ce que ça change : une table, écrite par apple-iap-webhook et
-- google-play-webhook (clé de service), une ligne par notification reçue —
-- type, sous-type, la décision de la table (_shared/notifications-stores.js),
-- l'effet réellement appliqué. Une ligne `connu = false` = une notification
-- que la table ne connaît pas : rien d'appliqué, alerte envoyée à support@.
-- Aucune donnée de carte, aucun montant, aucun JWS complet : de quoi retrouver
-- le client et la transaction, rien d'autre.
-- Aucune lecture côté app (RLS sans politique) ; ops-digest et l'audit la lisent
-- en clé de service.
CREATE TABLE IF NOT EXISTS public.stores_notifications_journal (
  id                    bigserial PRIMARY KEY,
  recu_le               timestamptz NOT NULL DEFAULT now(),
  canal                 text NOT NULL CHECK (canal IN ('apple', 'google')),
  type                  text NOT NULL,
  sous_type             text,
  effet                 text,
  connu                 boolean NOT NULL,
  effet_applique        text,
  produit               text,
  user_id               uuid,
  transaction_id        text,
  transaction_originale text,
  detail                jsonb
);

CREATE INDEX IF NOT EXISTS stores_notifications_journal_recu_le
  ON public.stores_notifications_journal (recu_le DESC);
CREATE INDEX IF NOT EXISTS stores_notifications_journal_inconnues
  ON public.stores_notifications_journal (recu_le DESC) WHERE NOT connu;
CREATE INDEX IF NOT EXISTS stores_notifications_journal_user
  ON public.stores_notifications_journal (user_id, recu_le DESC);

ALTER TABLE public.stores_notifications_journal ENABLE ROW LEVEL SECURITY;
-- Règle du dépôt (toute nouvelle table) ; sans politique, RLS ne laisse rien
-- passer pour authenticated : seule la clé de service lit et écrit.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.stores_notifications_journal TO authenticated;
CREATE TEMP TABLE _res (ordre serial, t text, j jsonb) ON COMMIT DROP;
INSERT INTO public.stores_notifications_journal (canal, type, sous_type, effet, connu, produit, user_id, transaction_id, transaction_originale)
VALUES ('apple', 'DID_CHANGE_RENEWAL_PREF', 'UPGRADE', 'on', true, 'app.fillsell.pro2.sub', 'eacbe32c-1929-41a8-927d-7f3cff621f5a', '530003145798413', '530003136046575'),
       ('google', 'abonnement', 'type_99', null, false, 'app.fillsell.pro.sub', null, null, null);
INSERT INTO _res (t, j) SELECT 'lignes', jsonb_agg(to_jsonb(x) - 'recu_le') FROM public.stores_notifications_journal x;
INSERT INTO _res (t, j) SELECT 'inconnues', jsonb_build_object('n', count(*)) FROM public.stores_notifications_journal WHERE NOT connu;
INSERT INTO _res (t, j) SELECT 'rls', jsonb_build_object('rls', relrowsecurity, 'politiques', (SELECT count(*) FROM pg_policies WHERE tablename = 'stores_notifications_journal')) FROM pg_class WHERE relname = 'stores_notifications_journal';
INSERT INTO _res (t, j) SELECT 'droits', jsonb_agg(privilege_type) FROM information_schema.role_table_grants WHERE table_name = 'stores_notifications_journal' AND grantee = 'authenticated';
SELECT t, j FROM _res ORDER BY ordre;
ROLLBACK;
