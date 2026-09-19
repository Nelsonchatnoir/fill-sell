-- ═══════════════════════════════════════════════════════════════════════════
-- LE POIDS DES PHOTOS PAR COMPTE — LA MESURE ET L'ALERTE (2026-09-19)
--
-- Aucun quota de stockage n'existait, et personne n'avait jamais regardé.
-- Relevé du jour : listing-photos pèse 13 Go pour 32 858 fichiers, 513 comptes,
-- depuis le 29/06 — soit ~4,8 Go par mois. La charge est très concentrée :
-- médiane 2,4 Mo, p90 45 Mo, p99 608 Mo, plus gros compte 1,5 Go, et 25 comptes
-- (4,9 %) portent 72 % du poids.
--
-- ⛔ CE LOT NE COUPE RIEN. Pas de plafond bloquant, aucun refus de
--    téléversement, aucune suppression, aucune compression rétroactive, aucun
--    fichier migré. On POSE LA MESURE et on ALERTE, c'est tout. Le chiffre
--    commercial (à partir de quand on agit, et ce qu'on fait) est une décision
--    de Nico, pas une décision technique.
--
-- ⛔ LA LIMITE DU PLAN SUPABASE N'EST PAS LISIBLE depuis le projet : elle n'est
--    PAS présumée ici. À confirmer côté facturation avant d'en faire quoi que
--    ce soit.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. LES SEUILS, EN DONNÉE ET NON EN DUR ─────────────────────────────────
-- Modifiables par un UPDATE, sans migration ni déploiement. Ce sont des seuils
-- d'ALERTE : les franchir ne bloque personne.
CREATE TABLE IF NOT EXISTS public.stockage_photos_seuils (
  palier       text PRIMARY KEY CHECK (palier IN ('free','premium','pro','business')),
  seuil_octets bigint NOT NULL CHECK (seuil_octets > 0),
  maj_le       timestamptz NOT NULL DEFAULT now()
);

-- Valeurs de départ, choisies pour que l'alerte reste EXCEPTIONNELLE — mesuré
-- le 19/09, elles désignent 2 comptes sur 512 :
--   free     200 Mo → 1 compte   (médiane du palier : 2,2 Mo ; p95 : 54 Mo)
--   premium    1 Go → 1 compte   (médiane 100 Mo ; p95 681 Mo)
--   pro        2 Go → 0 compte   (médiane 112 Mo ; le plus gros 1,5 Go)
--   business   5 Go → 0 compte   (médiane 26 Mo ; le plus gros 52 Mo)
-- Un jeu plus sensible (free 100 Mo · premium 500 Mo · pro 1 Go · business 2 Go)
-- désignerait 16 comptes — c'est l'autre option, à trancher.
INSERT INTO public.stockage_photos_seuils (palier, seuil_octets) VALUES
  ('free',      200::bigint * 1024 * 1024),
  ('premium',  1024::bigint * 1024 * 1024),
  ('pro',      2048::bigint * 1024 * 1024),
  ('business', 5120::bigint * 1024 * 1024)
ON CONFLICT (palier) DO NOTHING;

-- ── 2. LA LECTURE, RÉUTILISABLE ────────────────────────────────────────────
-- Ce n'est pas un script jetable : c'est LA source du poids par compte, pour
-- le digest, pour une enquête, pour n'importe quelle décision à venir.
-- ⚠️ Les deux anomalies d'arborescence du bucket (un dossier nommé par un
--    timestamp, un uid imbriqué dans un uid) sont ÉCARTÉES par le filtre de
--    forme d'uid — pas rangées, pas corrigées, juste ignorées proprement.
CREATE OR REPLACE VIEW public.v_stockage_photos_par_compte AS
WITH par AS (
  SELECT (storage.foldername(o.name))[1] AS uid,
         sum(COALESCE((o.metadata->>'size')::bigint, 0)) AS octets,
         count(*) AS fichiers,
         max(o.created_at) AS dernier_ajout
  FROM storage.objects o
  WHERE o.bucket_id = 'listing-photos'
    AND (storage.foldername(o.name))[1] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  GROUP BY 1
)
SELECT par.uid::uuid                                   AS user_id,
       par.octets,
       par.fichiers,
       par.dernier_ajout,
       CASE WHEN p.is_business THEN 'business'
            WHEN p.is_pro      THEN 'pro'
            WHEN p.is_premium OR p.is_comped THEN 'premium'
            ELSE 'free' END                            AS palier,
       s.seuil_octets,
       (par.octets > s.seuil_octets)                   AS depasse
FROM par
LEFT JOIN public.profiles p ON p.id = par.uid::uuid
LEFT JOIN public.stockage_photos_seuils s
       ON s.palier = CASE WHEN p.is_business THEN 'business'
                          WHEN p.is_pro      THEN 'pro'
                          WHEN p.is_premium OR p.is_comped THEN 'premium'
                          ELSE 'free' END;

-- ── 3. LE JOURNAL ──────────────────────────────────────────────────────────
-- Une ligne par compte et par JOUR : on garde la trace du franchissement et de
-- sa progression, sans empiler un enregistrement par passage.
CREATE TABLE IF NOT EXISTS public.stockage_photos_alertes (
  user_id      uuid        NOT NULL,
  jour         date        NOT NULL DEFAULT (now() AT TIME ZONE 'Europe/Paris')::date,
  palier       text        NOT NULL,
  octets       bigint      NOT NULL,
  fichiers     integer     NOT NULL,
  seuil_octets bigint      NOT NULL,
  releve_le    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, jour)
);

CREATE INDEX IF NOT EXISTS stockage_photos_alertes_jour_idx
  ON public.stockage_photos_alertes (jour DESC);

-- ── 4. LE RELEVÉ, IDEMPOTENT ───────────────────────────────────────────────
-- Journalise les comptes au-dessus de leur seuil. Rejouable dans la journée
-- sans doublon : la clé (user_id, jour) absorbe, et on remet à jour les
-- chiffres pour que la dernière valeur du jour fasse foi.
-- ⛔ N'agit sur RIEN d'autre : ne bloque pas, ne supprime pas, ne notifie pas
--    l'utilisateur. Elle écrit une ligne, et c'est tout.
CREATE OR REPLACE FUNCTION public.releve_stockage_photos()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, storage, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  INSERT INTO public.stockage_photos_alertes (user_id, palier, octets, fichiers, seuil_octets)
  SELECT v.user_id, v.palier, v.octets, v.fichiers, v.seuil_octets
  FROM public.v_stockage_photos_par_compte v
  WHERE v.depasse
  ON CONFLICT (user_id, jour) DO UPDATE
    SET octets = EXCLUDED.octets,
        fichiers = EXCLUDED.fichiers,
        seuil_octets = EXCLUDED.seuil_octets,
        palier = EXCLUDED.palier,
        releve_le = now();
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END $$;

-- ── 5. LES DROITS ──────────────────────────────────────────────────────────
-- ⚠️ ÉCART ASSUMÉ À LA RÈGLE « toute nouvelle table → GRANT … TO authenticated »
--    de CLAUDE.md : cette règle existe pour que l'APP puisse lire ses tables.
--    Ici l'app ne lit rien — ce sont des tables d'exploitation, et accorder la
--    lecture à `authenticated` exposerait le poids de stockage de TOUS les
--    comptes à N'IMPORTE QUEL utilisateur connecté. Même choix que la
--    migration du 16/09 (photos_raw_orphelines_20260916) : RLS active, REVOKE
--    pour anon et authenticated, service_role seul.
ALTER TABLE public.stockage_photos_seuils  ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stockage_photos_alertes ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stockage_photos_seuils  FROM anon, authenticated;
REVOKE ALL ON TABLE public.stockage_photos_alertes FROM anon, authenticated;
REVOKE ALL ON public.v_stockage_photos_par_compte  FROM anon, authenticated;
GRANT SELECT ON public.v_stockage_photos_par_compte TO service_role;

-- ⛔ `anon` a l'EXECUTE par défaut sur toute fonction : on le retire
--    explicitement (règle apprise le 19/09).
REVOKE ALL ON FUNCTION public.releve_stockage_photos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.releve_stockage_photos() TO service_role;

COMMENT ON VIEW public.v_stockage_photos_par_compte IS
  'Poids du bucket listing-photos par compte, avec son palier et son seuil d''alerte. Lecture de référence, réutilisable.';
COMMENT ON FUNCTION public.releve_stockage_photos() IS
  'Journalise dans stockage_photos_alertes les comptes au-dessus de leur seuil. Idempotent par jour. Ne bloque et ne supprime rien.';
