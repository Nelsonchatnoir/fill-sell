SET lock_timeout = '8s';
-- ═══════════════════════════════════════════════════════════════════════════
-- LE POIDS DE LA FICHE, ET QUI A CHANGÉ LE PRIX OU LE POIDS, ET QUAND
-- (04/10, Louis — points 2 et 3)
-- ═══════════════════════════════════════════════════════════════════════════
-- 1. `inventaire.poids_g` — LE champ « Poids » de la fiche, facultatif, en
--    grammes. Un seul champ pour toutes les plateformes : chacune le traduit
--    dans sa langue au moment du dépôt (tranche Beebs « Poids jusqu'à 500g
--    max », poids Leboncoin, format Vinted, poids eBay). Avant lui, le poids
--    n'existait que par plateforme, sur chaque tâche (`lbcPoidsGrammes`,
--    `format_colis`, `packageSizeId`) : la republication Beebs de Louis a
--    reposé « 1 kg » sur des rangements de 200 g faute de le connaître.
--    Unité : le gramme, entier. Une tranche lue sur une annonce (« jusqu'à
--    500 g ») s'écrit par sa borne haute (500).
-- 2. LES TRACES DE CHANGEMENT — `prix_vente_change_le/_par`,
--    `poids_change_le/_par` : le dernier changement de la valeur, et sa
--    source. C'est ce qui permet la règle de Nico (04/10) : « quand le relevé
--    voit qu'un prix ou un poids a changé sur la plateforme, et que
--    l'utilisateur ne l'a pas changé dans FillSell entre-temps, FillSell
--    reprend la valeur de la plateforme ; si les deux ont changé, la plus
--    récente gagne, et c'est noté ». Avant ce lot, rien ne disait si un prix
--    venait de la personne ou d'un relevé.
--    Source, par ordre de confiance :
--      · le réglage de transaction `fillsell.source_changement` posé par une
--        fonction du serveur (« plateforme:beebs », « import:leboncoin »…) ;
--      · une requête de l'EXTENSION (en-tête Origin chrome-extension://…,
--        même lecture que inventaire_releve_garde_textes) → « extension » ;
--      · une requête d'un utilisateur connecté (l'app) → « app » ;
--      · sinon → « serveur ».
--    Les traces ne s'écrivent pas à la main : un client qui les envoie voit
--    sa valeur remplacée par celle du déclencheur.
-- 3. `inventaire_journal` — ce que les relevés font aux fiches (champ vide
--    complété, prix ou poids repris de la plateforme, conflit tranché), une
--    ligne par champ. Lecture par la personne (RLS), écriture par les
--    fonctions du serveur seulement.
-- Idempotente (IF NOT EXISTS / CREATE OR REPLACE / DROP … IF EXISTS).

ALTER TABLE public.inventaire
  ADD COLUMN IF NOT EXISTS poids_g integer,
  ADD COLUMN IF NOT EXISTS poids_change_le timestamptz,
  ADD COLUMN IF NOT EXISTS poids_change_par text,
  ADD COLUMN IF NOT EXISTS prix_vente_change_le timestamptz,
  ADD COLUMN IF NOT EXISTS prix_vente_change_par text;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'inventaire_poids_g_plausible') THEN
    ALTER TABLE public.inventaire
      ADD CONSTRAINT inventaire_poids_g_plausible CHECK (poids_g IS NULL OR poids_g BETWEEN 1 AND 200000) NOT VALID;
    ALTER TABLE public.inventaire VALIDATE CONSTRAINT inventaire_poids_g_plausible;
  END IF;
END $$;

COMMENT ON COLUMN public.inventaire.poids_g IS
  'Poids de l''article emballé, en grammes (facultatif). Un seul champ, traduit par plateforme au dépôt. 04/10/2026.';

-- ── La source d'un changement, telle que le serveur la connaît ─────────────
CREATE OR REPLACE FUNCTION public.source_changement_courante()
 RETURNS text
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v text := NULLIF(current_setting('fillsell.source_changement', true), '');
  v_h jsonb;
  v_role text;
BEGIN
  IF v IS NOT NULL THEN RETURN v; END IF;
  BEGIN
    v_h := NULLIF(current_setting('request.headers', true), '')::jsonb;
    IF COALESCE(v_h ->> 'origin', '') LIKE 'chrome-extension://%' THEN RETURN 'extension'; END IF;
    v_role := NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role';
    IF v_role = 'authenticated' THEN RETURN 'app'; END IF;
  EXCEPTION WHEN OTHERS THEN
    RETURN 'inconnu';
  END;
  RETURN 'serveur';
END;
$function$;

CREATE OR REPLACE FUNCTION public.inventaire_trace_changements()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_par text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.prix_vente IS NOT NULL OR NEW.poids_g IS NOT NULL THEN v_par := public.source_changement_courante(); END IF;
    NEW.prix_vente_change_le := CASE WHEN NEW.prix_vente IS NOT NULL THEN now() END;
    NEW.prix_vente_change_par := CASE WHEN NEW.prix_vente IS NOT NULL THEN v_par END;
    NEW.poids_change_le := CASE WHEN NEW.poids_g IS NOT NULL THEN now() END;
    NEW.poids_change_par := CASE WHEN NEW.poids_g IS NOT NULL THEN v_par END;
    RETURN NEW;
  END IF;
  IF NEW.prix_vente IS DISTINCT FROM OLD.prix_vente THEN
    v_par := public.source_changement_courante();
    NEW.prix_vente_change_le := now();
    NEW.prix_vente_change_par := v_par;
  ELSE
    NEW.prix_vente_change_le := OLD.prix_vente_change_le;
    NEW.prix_vente_change_par := OLD.prix_vente_change_par;
  END IF;
  IF NEW.poids_g IS DISTINCT FROM OLD.poids_g THEN
    v_par := COALESCE(v_par, public.source_changement_courante());
    NEW.poids_change_le := now();
    NEW.poids_change_par := v_par;
  ELSE
    NEW.poids_change_le := OLD.poids_change_le;
    NEW.poids_change_par := OLD.poids_change_par;
  END IF;
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS inventaire_trace_changements ON public.inventaire;
CREATE TRIGGER inventaire_trace_changements
  BEFORE INSERT OR UPDATE OF prix_vente, poids_g, prix_vente_change_le, prix_vente_change_par, poids_change_le, poids_change_par
  ON public.inventaire
  FOR EACH ROW EXECUTE FUNCTION public.inventaire_trace_changements();

-- ── Le journal de ce que les relevés font aux fiches ───────────────────────
CREATE TABLE IF NOT EXISTS public.inventaire_journal (
  id            bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  user_id       uuid NOT NULL,
  inventaire_id bigint NOT NULL,
  champ         text NOT NULL,
  avant         text,
  apres         text,
  source        text NOT NULL,
  motif         text NOT NULL,
  detail        jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS inventaire_journal_fiche ON public.inventaire_journal (inventaire_id, created_at DESC);
CREATE INDEX IF NOT EXISTS inventaire_journal_compte ON public.inventaire_journal (user_id, created_at DESC);

ALTER TABLE public.inventaire_journal ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "journal lu par son compte" ON public.inventaire_journal;
CREATE POLICY "journal lu par son compte" ON public.inventaire_journal
  FOR SELECT TO authenticated USING ((SELECT auth.uid()) = user_id);
-- (CLAUDE.md : toute table publique reçoit ses droits ; l'écriture reste
-- réservée aux fonctions du serveur, faute de politique d'écriture.)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventaire_journal TO authenticated;
GRANT ALL ON public.inventaire_journal TO service_role;

COMMENT ON TABLE public.inventaire_journal IS
  'Ce que les relevés font aux fiches : champ vide complété, prix/poids repris de la plateforme, conflit tranché. 04/10/2026.';

CREATE OR REPLACE FUNCTION public.journaliser_fiche(p_user uuid, p_inventaire bigint, p_champ text, p_avant text, p_apres text,
                                                    p_source text, p_motif text, p_detail jsonb DEFAULT '{}'::jsonb)
 RETURNS void
 LANGUAGE sql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  INSERT INTO inventaire_journal (user_id, inventaire_id, champ, avant, apres, source, motif, detail)
  VALUES (p_user, p_inventaire, p_champ, left(p_avant, 500), left(p_apres, 500), p_source, p_motif, COALESCE(p_detail, '{}'::jsonb));
$function$;
REVOKE ALL ON FUNCTION public.journaliser_fiche(uuid, bigint, text, text, text, text, text, jsonb) FROM PUBLIC, anon, authenticated;
