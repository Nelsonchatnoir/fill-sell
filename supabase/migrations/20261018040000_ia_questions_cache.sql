-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 (nuit) — LE CACHE DES QUESTIONS POSÉES À L'IA (point 5)
-- ═══════════════════════════════════════════════════════════════════════════
-- CONSTAT (usage_logs + categorie_journal, 7 jours au 17/10 23:50 Paris) :
-- la déduction (catégorie + champs) coûte ≈ 4,3 $ / 7 j, dont resolve-categorie
-- ≈ 92 % (3 177 appels) ; la MÊME question (compte, titre, plateforme, nombre de
-- candidates) revient jusqu'à 70 fois en 6 minutes : 2 515 lignes en trop sur
-- 3 244 (borne haute). Aucun cache nulle part (seul lens_identify_cache existe).
--
-- LA RÈGLE : une question posée à l'IA est rangée sous l'empreinte EXACTE de ce
-- qui part chez Anthropic (modèle, consigne, message, réglages) ; la même
-- question reçoit la réponse déjà payée, relue par les MÊMES contrôles qu'une
-- réponse neuve. Le message contient le contenu de l'article (titre,
-- description, attributs), la plateforme et la liste des champs / candidates :
-- l'article change → l'empreinte change → nouvelle question. Un article déjà
-- déduit n'est jamais redemandé. 30 jours au plus (une réponse plus vieille
-- n'est pas relue ; la ligne est remplacée à la question suivante).
--
-- Écrite et lue par les fonctions edge (service_role) SEULEMENT : RLS active,
-- aucune règle d'accès, rien pour anon ni authenticated. Interrupteurs par
-- fonction (0 = éteint, 1 = allumé), posés à 0 ici.
-- Inverse : supabase/rollbacks/20261018040000_ia_questions_cache.sql.
-- Application :
--   npx supabase db query --linked -f supabase/migrations/20261018040000_ia_questions_cache.sql
--   npx supabase migration repair --linked --status applied 20261018040000

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

CREATE TABLE IF NOT EXISTS public.ia_questions_cache (
  cle              text        PRIMARY KEY,
  fonction         text        NOT NULL,
  modele           text        NOT NULL,
  reponse          text        NOT NULL,
  tokens_entree    integer,
  tokens_sortie    integer,
  cree_le          timestamptz NOT NULL DEFAULT now(),
  dernier_usage_le timestamptz NOT NULL DEFAULT now(),
  usages           integer     NOT NULL DEFAULT 0,
  CONSTRAINT ia_questions_cache_cle_empreinte CHECK (cle ~ '^[0-9a-f]{64}$'),
  CONSTRAINT ia_questions_cache_reponse_bornee CHECK (length(reponse) <= 20000)
);
COMMENT ON TABLE public.ia_questions_cache IS
  'Réponses de l''IA déjà payées, rangées sous l''empreinte sha256 exacte de la question (modèle + consigne + message + réglages). Relues par les mêmes contrôles qu''une réponse neuve. service_role seulement. 18/10, point 5.';

CREATE INDEX IF NOT EXISTS ia_questions_cache_cree_le ON public.ia_questions_cache (cree_le);

ALTER TABLE public.ia_questions_cache ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ia_questions_cache FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ia_questions_cache TO service_role;

-- Interrupteurs, ÉTEINTS tant que la comparaison n'a pas été faite :
--   ia_cache_categorie : le cache, pour resolve-categorie (température 0 :
--                        même question → même réponse, déjà payée) ;
--   ia_cache_aspects   : le cache, pour les aspects (generate-listing) ;
--   ia_aspects_groupes : les aspects eBay d'un article en UN appel (au lieu
--                        d'une première passe + un appel par aspect resté vide).
INSERT INTO public.coin_config(key, value) VALUES ('ia_cache_categorie', 0), ('ia_cache_aspects', 0), ('ia_aspects_groupes', 0)
ON CONFLICT (key) DO NOTHING;

COMMIT;
