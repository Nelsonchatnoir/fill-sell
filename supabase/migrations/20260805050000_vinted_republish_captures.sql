-- ── É1 republication : persistance des captures (2026-08-05, schéma validé) ──
-- Une capture = tout ce qu'il faut pour recréer une annonce Vinted à
-- l'identique via le handler publish (voie 2) : payload natif complet,
-- résolutions id→libellé, photos re-hébergées chez nous, et un VERDICT.
--
-- Décisions actées par Nico :
--   · table DÉDIÉE (payloads de dizaines de Ko, cycle de vie indépendant de
--     l'inventaire, purge séparée) ;
--   · IMMUABLE : SELECT + INSERT seulement côté client, jamais
--     d'UPDATE/DELETE — la capture la plus récente fait foi ;
--   · inventaire_id en ON DELETE **SET NULL**, PAS CASCADE (retouche 1) : si
--     l'utilisateur supprime son article FillSell pendant une republication
--     (annonce déjà supprimée sur Vinted, pas encore recréée), un CASCADE
--     effacerait le SEUL moyen de recréer l'annonce — exactement la perte que
--     l'architecture doit rendre impossible. vinted_item_id suffit à
--     retrouver la capture. Le CASCADE sur user_id reste (compte supprimé =
--     tout part).
--   · LA GARDE (posée en É2 dans le flux republish, rappelée ici pour
--     mémoire) : aucune suppression Vinted sans une capture verdict='valide'
--     récente pour ce vinted_item_id. Un verdict 'incomplet' ne l'autorise
--     JAMAIS.
-- Idempotent.

CREATE TABLE IF NOT EXISTS public.vinted_republish_captures (
  id               bigserial PRIMARY KEY,
  user_id          uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  inventaire_id    bigint REFERENCES public.inventaire(id) ON DELETE SET NULL,
  vinted_item_id   text NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  verdict          text NOT NULL CHECK (verdict IN ('valide','incomplet')),
  champs_manquants text[] NOT NULL DEFAULT '{}',
  payload          jsonb NOT NULL,   -- natif + dto_public : rien n'est jeté
  libelles         jsonb,            -- categoryPath, etat, taille, marque, couleurs, colis
  photos_urls      text[] NOT NULL DEFAULT '{}'  -- NOS URLs (bucket listing-photos)
);

CREATE INDEX IF NOT EXISTS vinted_republish_captures_lookup
  ON public.vinted_republish_captures (user_id, vinted_item_id, captured_at DESC);

ALTER TABLE public.vinted_republish_captures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own captures" ON public.vinted_republish_captures;
CREATE POLICY "Users read own captures"
  ON public.vinted_republish_captures FOR SELECT
  TO authenticated USING ((SELECT auth.uid()) = user_id);

DROP POLICY IF EXISTS "Users insert own captures" ON public.vinted_republish_captures;
CREATE POLICY "Users insert own captures"
  ON public.vinted_republish_captures FOR INSERT
  TO authenticated WITH CHECK ((SELECT auth.uid()) = user_id);

-- SELECT + INSERT seulement — immuabilité voulue (écart assumé avec la règle
-- générale des grants CLAUDE.md, même logique que coin_reservations).
GRANT SELECT, INSERT ON public.vinted_republish_captures TO authenticated;
GRANT USAGE ON SEQUENCE public.vinted_republish_captures_id_seq TO authenticated;
