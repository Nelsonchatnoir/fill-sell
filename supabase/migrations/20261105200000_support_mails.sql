-- (05/11, point 4 — Nico) ARCHIVE DES MAILS DE support@fillsell.app — PRÉPARÉE, NON APPLIQUÉE (feu vert nommé de Nico requis).
-- Le Worker e-mail (cloudflare/email-support/worker.js) y écrit CHAQUE mail reçu avant de le transférer à Gmail ; un
-- transfert échoué y est noté. ops-digest pourra lister les mails du jour : un mail rangé en spam par Gmail (cas de Louis,
-- 01/11-03/11) reste visible. Écriture par la clé de service seulement ; aucune lecture par un client.
-- Inverse : supabase/rollbacks/20261105200000_support_mails_INVERSE.sql.
BEGIN;
CREATE TABLE IF NOT EXISTS public.support_mails (
  id            bigserial PRIMARY KEY,
  recu_le       timestamptz NOT NULL DEFAULT now(),
  de            text,
  enveloppe_de  text,
  a             text,
  sujet         text,
  message_id    text,
  taille        integer,
  extrait       text,
  transfert     text NOT NULL DEFAULT 'en_cours' CHECK (transfert IN ('en_cours', 'ok', 'echec')),
  transfere_le  timestamptz,
  erreur        text
);
CREATE INDEX IF NOT EXISTS support_mails_recu_le ON public.support_mails (recu_le DESC);
ALTER TABLE public.support_mails ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.support_mails FROM PUBLIC, anon, authenticated;
COMMIT;
