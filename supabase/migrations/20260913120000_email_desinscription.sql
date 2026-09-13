-- ============================================================================
-- DÉSINSCRIPTION DES EMAILS MARKETING — 13/09/2026
--
-- Sans elle, aucune campagne ne peut partir légalement : un lien de
-- désinscription fonctionnel est obligatoire sur tout envoi marketing.
--
-- POURQUOI UNE TABLE ET PAS UNE COLONNE SUR profiles
-- send-relance écrit à des adresses qui N'ONT PAS de compte (partenaires,
-- prospects, adresses de contact d'entreprises). Une colonne sur profiles
-- laisserait ces adresses-là sans moyen de se désinscrire.
--
-- POURQUOI email_destinataires ET PAS email_desinscriptions
-- La table contient AUSSI des destinataires toujours abonnés : une ligne ne
-- vaut PAS désinscription. Un nom en « désinscriptions » invitait au bug
-- « SELECT * FROM email_desinscriptions » lu comme la liste des désinscrits.
-- Ici c'est la COLONNE `desinscrit` qui porte l'état, et elle seule.
--
-- Le jeton est créé au moment de l'envoi, pour la seule raison de fabriquer
-- le lien : d'où `desinscrit` à FALSE par défaut. Poser une ligne n'a jamais
-- désinscrit personne.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.email_destinataires (
  -- Adresse NORMALISÉE (minuscules, sans espaces). C'est la clé : une adresse
  -- désinscrite l'est quelle que soit la casse utilisée à l'envoi.
  email          text        PRIMARY KEY,

  -- Jeton opaque de 32 octets (base64url). C'est le SEUL élément qui voyage
  -- dans l'URL de désinscription : ni l'adresse en clair, ni un id devinable.
  jeton          text        NOT NULL UNIQUE,

  -- L'état, et lui seul. TRUE = ne plus jamais envoyer de marketing.
  desinscrit     boolean     NOT NULL DEFAULT false,
  desinscrit_le  timestamptz,
  reinscrit_le   timestamptz,

  -- D'où vient le geste : 'lien_email', 'manuel', 'plainte'…
  origine        text,

  -- Indicatif : renseigné si l'adresse correspond à un compte. Volontairement
  -- SANS clé étrangère — une adresse sans compte doit pouvoir se désinscrire,
  -- et la suppression d'un compte ne doit pas effacer sa désinscription.
  user_id        uuid,

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now()
);

-- Lecture par jeton à chaque ouverture de la page de désinscription.
CREATE INDEX IF NOT EXISTS email_destinataires_jeton_idx
  ON public.email_destinataires (jeton);

-- Liste des désinscrits : index partiel, la grande majorité des lignes sont
-- des abonnés et n'ont pas à être parcourues.
CREATE INDEX IF NOT EXISTS email_destinataires_desinscrits_idx
  ON public.email_destinataires (email) WHERE desinscrit;

COMMENT ON TABLE public.email_destinataires IS
  'Destinataires connus des emails FillSell et leur état marketing. Une ligne ne vaut PAS désinscription : seule la colonne desinscrit fait foi. Contient des adresses sans compte.';
COMMENT ON COLUMN public.email_destinataires.desinscrit IS
  'TRUE = plus aucun email de catégorie marketing. Les emails de catégorie support ne sont JAMAIS filtrés par cette colonne.';
COMMENT ON COLUMN public.email_destinataires.jeton IS
  'Secret : quiconque le détient peut désinscrire cette adresse. Ne jamais l''exposer via PostgREST ni le journaliser.';

-- ── Accès ───────────────────────────────────────────────────────────────────
-- RLS activée SANS AUCUNE POLICY : personne ne lit ni n'écrit cette table via
-- PostgREST. Seules les Edge Functions y touchent, en service_role (qui
-- contourne la RLS). C'est délibéré : la table contient les jetons, et un
-- utilisateur qui pourrait les lire désinscrirait n'importe qui.
--
-- Le GRANT exigé par CLAUDE.md pour toute nouvelle table publique est bien
-- posé, mais il reste INOPÉRANT tant qu'aucune policy n'existe : les deux
-- règles tiennent ensemble, le grant ne rouvre rien.
ALTER TABLE public.email_destinataires ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_destinataires TO authenticated;

-- ── updated_at ──────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.email_destinataires_touch()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS email_destinataires_touch_trg ON public.email_destinataires;
CREATE TRIGGER email_destinataires_touch_trg
  BEFORE UPDATE ON public.email_destinataires
  FOR EACH ROW EXECUTE FUNCTION public.email_destinataires_touch();
