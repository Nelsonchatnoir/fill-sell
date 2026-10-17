-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 (nuit) — LA MÉMOIRE « COMPTE × CATÉGORIE » DES RÉPONSES (point 1)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (usage_logs champ_requis_bloquant, 7 jours au 17/10 23:59 Paris) :
-- 73 questions « Univers » Leboncoin sur « Mode > Vêtements » pour 3 comptes,
-- alors que la réponse précédente du même compte, sur le même rayon, était la
-- bonne 68 fois sur 68 (rejeu sur 60 jours, valeur lue sur le job publié).
--
-- LA RÈGLE : quand la personne répond ELLE-MÊME à un champ requis qui dépend du
-- rayon (et non de l'article), l'app retient sa réponse pour
--   utilisateur × compte plateforme × plateforme × catégorie cible × champ
-- et la repose seule sur le prochain article du même rayon (champ VIDE et
-- REQUIS seulement, jamais par-dessus une saisie, Lens ou le texte du vendeur ;
-- valeur sortie de la grille de la plateforme = ignorée, la question revient).
--
-- LA LISTE EXACTE DES CHAMPS est gravée ici (contrainte CHECK) : la base refuse
-- de retenir autre chose. Mesures et justification champ par champ :
-- docs/enquetes/session-nuit-1810-memoire-ia/RAPPORT.md.
--   · leboncoin clothing_type       (« Univers » de Mode > Vêtements : Femme / Maternité / Homme / Enfant)
--   · leboncoin shoe_type           (« Univers » de Mode > Chaussures : Femme / Homme / Enfant)
--   · leboncoin accessories_univers (« Univers » des accessoires / montres et bijoux : Femme / Homme / Enfant / Mixte)
--   · ebay      Département         (public du rayon eBay : la catégorie eBay est déjà genrée)
-- Ajouter un champ = une décision de Nico + une migration qui élargit ce CHECK.
--
-- `compte` : la boutique quand FillSell la connaît (Vinted multi-boutiques) ;
-- « principal » sinon (Leboncoin, eBay : un compte connecté par plateforme et
-- par utilisateur, aucun identifiant de compte lisible par l'app).
--
-- Écrite et lue par l'app (RLS : chacun ses lignes) ; vidée depuis Réglages ›
-- Préférences. Aucune fonction, aucun cron. Inverse :
-- supabase/rollbacks/20261018030000_memoire_champs_categorie.sql.
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018030000_memoire_champs_categorie.sql
--   npx supabase migration repair --linked --status applied 20261018030000

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.memoire_champs_categorie (
  user_id       uuid        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plateforme    text        NOT NULL,
  compte        text        NOT NULL DEFAULT 'principal',
  categorie     text        NOT NULL,
  champ         text        NOT NULL,
  valeur        text        NOT NULL,
  inventaire_id bigint,
  repondu_le    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, plateforme, compte, categorie, champ),
  CONSTRAINT memoire_champs_categorie_champ_du_rayon CHECK ((plateforme, champ) IN (
    ('leboncoin', 'clothing_type'),
    ('leboncoin', 'shoe_type'),
    ('leboncoin', 'accessories_univers'),
    ('ebay', 'Département')
  )),
  CONSTRAINT memoire_champs_categorie_compte_borne CHECK (length(compte) BETWEEN 1 AND 120),
  CONSTRAINT memoire_champs_categorie_categorie_bornee CHECK (length(categorie) BETWEEN 1 AND 400),
  CONSTRAINT memoire_champs_categorie_valeur_bornee CHECK (length(btrim(valeur)) BETWEEN 1 AND 200)
);

COMMENT ON TABLE public.memoire_champs_categorie IS
  'Réponses données par la personne aux champs requis qui dépendent du rayon (pas de l''article), reposées seules sur le même rayon. Liste des champs : CHECK memoire_champs_categorie_champ_du_rayon. 18/10, point 1.';

-- L'heure de la réponse est celle du serveur (jamais l'horloge du poste).
CREATE OR REPLACE FUNCTION public.memoire_champs_categorie_horodater()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
  NEW.repondu_le := now();
  RETURN NEW;
END;
$function$;
REVOKE ALL ON FUNCTION public.memoire_champs_categorie_horodater() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS memoire_champs_categorie_horodater ON public.memoire_champs_categorie;
CREATE TRIGGER memoire_champs_categorie_horodater
  BEFORE INSERT OR UPDATE ON public.memoire_champs_categorie
  FOR EACH ROW EXECUTE FUNCTION public.memoire_champs_categorie_horodater();

ALTER TABLE public.memoire_champs_categorie ENABLE ROW LEVEL SECURITY;

CREATE POLICY memoire_champs_categorie_lire ON public.memoire_champs_categorie
  FOR SELECT TO authenticated USING (user_id = (SELECT auth.uid()));
CREATE POLICY memoire_champs_categorie_ajouter ON public.memoire_champs_categorie
  FOR INSERT TO authenticated WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY memoire_champs_categorie_remplacer ON public.memoire_champs_categorie
  FOR UPDATE TO authenticated USING (user_id = (SELECT auth.uid())) WITH CHECK (user_id = (SELECT auth.uid()));
CREATE POLICY memoire_champs_categorie_oublier ON public.memoire_champs_categorie
  FOR DELETE TO authenticated USING (user_id = (SELECT auth.uid()));

REVOKE ALL ON public.memoire_champs_categorie FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.memoire_champs_categorie TO authenticated;
GRANT ALL ON public.memoire_champs_categorie TO service_role;

COMMIT;
