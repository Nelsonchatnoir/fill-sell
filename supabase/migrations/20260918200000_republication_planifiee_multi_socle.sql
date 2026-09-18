-- ═════════════════════════════════════════════════════════════════════════════
-- REPUBLICATION PLANIFIÉE MULTIPLATEFORME — 1/5 : le socle
-- 2026-09-18. Décision Nico : Vinted, Leboncoin, Beebs, Opla. eBay hors
-- périmètre (voie API, on ne republie pas).
-- ═════════════════════════════════════════════════════════════════════════════
-- CE QUE CETTE MIGRATION FAIT, ET RIEN D'AUTRE : elle donne une PLATEFORME à
-- l'historique des créneaux, et pose les clés de réglage du parc. Aucune
-- fonction n'est touchée ici (2/5), aucun réglage utilisateur n'est écrit.
--
-- ── LA CLÉ D'UNICITÉ, AVANT / APRÈS (relevée par pg_constraint le 18/09,
--    jamais recopiée de mémoire) ────────────────────────────────────────────
--   AVANT : republish_creneaux_unique  UNIQUE (user_id, debut)
--   APRÈS : republish_creneaux_unique  UNIQUE (user_id, platform, debut)
--   L'index republish_creneaux_user_debut_idx (user_id, debut DESC) est
--   CONSERVÉ tel quel — c'est lui que lit l'écran Historique, qui déroule les
--   créneaux par date, toutes plateformes mêlées. Un second index, par
--   plateforme, sert le sweep et l'état.
--
-- ⛔ `boutique` N'ENTRE PAS DANS LA CLÉ, et c'est un refus argumenté (la
--    consigne demandait (user_id, jour, platform, boutique)) :
--    · la colonne est NULLABLE et posée APRÈS COUP — le sweep crée la ligne au
--      premier passage, puis fait COALESCE(boutique, connectée) au suivant. En
--      Postgres deux NULL sont DISTINCTS : une clé qui la contient n'interdit
--      plus rien, elle AUTORISERAIT les doublons qu'on veut empêcher ;
--    · elle ne bouche pas le trou d'Ornella (deux boutiques Vinted, tous les
--      créneaux sur "257364012"). Ce trou n'est pas dans la clé : le sweep ne
--      sert QUE la boutique à laquelle Chrome est connecté, la 472079 n'est
--      jamais planifiée parce qu'aucun passage ne la voit — pas parce qu'une
--      ligne manque. Mettre boutique dans la clé créerait une seconde ligne
--      que rien ne viendrait remplir : un « créneau manqué » de plus dans
--      l'historique, et le défaut resterait entier.
--    Le correctif multi-boutiques est un lot à part (il faut trancher : servir
--    la boutique déconnectée au créneau suivant, ou deux créneaux distincts).
--    Il n'est pas patché en passant.
--
-- ── LES CLÉS DE PARC ────────────────────────────────────────────────────────
-- `republish_planifiee_pf_<plateforme>` : l'interrupteur PAR PLATEFORME. Posé
-- à 1 pour les quatre (décision Nico du 18/09 : « on ouvre à tout sauf eBay »).
-- Fermer une plateforme sans déploiement :
--   update coin_config set value = 0 where key = 'republish_planifiee_pf_leboncoin';
-- L'interrupteur GLOBAL republish_planifiee_actif (déjà à 1) prime : à 0, plus
-- rien ne part, toutes plateformes confondues.
--
-- `republish_espacement_min_<plateforme>_sec` : le PLANCHER de cadence. Sur
-- Vinted la médiane du compte fait foi (354 s de repli parc, mesure du 12/09).
-- Sur les autres il n'y a RIEN à mesurer — 8 republications Leboncoin et 7
-- Beebs dans toute l'histoire de la table, zéro Opla. On ne fabrique pas une
-- médiane avec ça. Ce qu'on a mesuré, en revanche, c'est la DURÉE DE BOUT EN
-- BOUT d'un cycle, et comme l'invariant « une seule annonce hors ligne à la
-- fois par plateforme » le SÉRIALISE, c'est elle qui borne :
--   Leboncoin : médiane 2 311 s, max 2 654 s (n = 3)
--   Beebs     : médiane 1 633 s, max 3 051 s (n = 5)
--   Opla      : aucune donnée (cycle jamais exécuté en production)
-- → 900 s posés pour Leboncoin et Beebs : en dessous du pire mesuré, au-dessus
--   du meilleur, soit ~12 republications sur un créneau de 3 h. Dès qu'un
--   compte aura 10 intervalles réels, sa médiane prendra le relais, exactement
--   comme sur Vinted. Opla : 1 200 s, borne prudente sur zéro donnée.
--
-- `republish_disjoncteur_echecs` = 2 : le nombre d'échecs de retrait
-- CONSÉCUTIFS (sans réussite intercalée) qui arrête le créneau d'UNE
-- plateforme pour la journée. Valeur tirée des données, pas choisie :
-- suppressions Leboncoin sur 30 jours, jour par jour —
--   17 jours sans aucun échec · 12/09 : 1 réussie / 1 échouée (bruit normal)
--   17/09 : 0 RÉUSSIE, 5 ÉCHOUÉES (la modale « Valider », corrigée 6bafafa)
--   18/09 : 7 réussies, 0 échouée (après correctif)
-- La signature d'une vraie panne n'est pas un taux, c'est une SÉRIE SANS
-- AUCUNE RÉUSSITE. Hors 17/09, 1 échec sur 57 tentatives (1,8 %) : deux
-- consécutifs par hasard = 0,03 %, une fois tous les quatre ans au rythme
-- actuel. N = 2 se serait déclenché UNE fois en 30 jours — le 17/09, le seul
-- jour réellement cassé — et jamais le 12/09.
--
-- `republish_palier_perdu_grace_h` = 48 : cf. 3/5 (Pro perdu puis retrouvé).
--
-- ⛔ LES TROIS PREMIÈRES MIGRATIONS VONT ENSEMBLE, DANS CET ORDRE, À LA SUITE.
--    Entre celle-ci et la 3/5, le sweep encore en place (version du 17/09)
--    insère avec `ON CONFLICT (user_id, debut)` — une contrainte qui n'existe
--    plus après cette migration. Il lèvera donc une exception, ATTRAPÉE par
--    republish_auto_sweep_serveur (« jamais un point de panne pour la voie
--    témoin ») : le cron continue, rien n'est perdu, mais AUCUNE republication
--    planifiée ne part tant que la 3/5 n'est pas appliquée. L'exception tombe
--    à l'INSERT, après la clôture d'historique et avant toute création de job :
--    aucun état partiel, aucune annonce touchée.
--    Ordre d'application : 1/5 → 2/5 → 3/5 → 4/5 → 5/5.
--
-- Idempotente. Retour arrière :
--   ALTER TABLE public.republish_creneaux DROP CONSTRAINT republish_creneaux_unique;
--   ALTER TABLE public.republish_creneaux ADD CONSTRAINT republish_creneaux_unique UNIQUE (user_id, debut);
--   ALTER TABLE public.republish_creneaux DROP COLUMN platform;
-- (à ne faire qu'après avoir remis les fonctions du 17/09 : elles écrivent la
--  colonne.)
-- ═════════════════════════════════════════════════════════════════════════════

-- ── 1. LA COLONNE ───────────────────────────────────────────────────────────
-- NOT NULL DEFAULT 'vinted' : les lignes existantes valent 'vinted' en une
-- passe, sans UPDATE et sans jamais passer par NULL.
ALTER TABLE public.republish_creneaux
  ADD COLUMN IF NOT EXISTS platform text NOT NULL DEFAULT 'vinted';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.republish_creneaux'::regclass
      AND conname = 'republish_creneaux_platform_chk'
  ) THEN
    ALTER TABLE public.republish_creneaux
      ADD CONSTRAINT republish_creneaux_platform_chk
      CHECK (platform IN ('vinted', 'leboncoin', 'beebs', 'opla'));
  END IF;
END $$;

-- ── 2. LA CLÉ D'UNICITÉ ─────────────────────────────────────────────────────
-- Remplacée EXPLICITEMENT, jamais en silence : on ne touche que si la
-- définition en place est encore celle d'avant.
DO $$
DECLARE v_def text;
BEGIN
  SELECT pg_get_constraintdef(oid) INTO v_def
  FROM pg_constraint
  WHERE conrelid = 'public.republish_creneaux'::regclass
    AND conname = 'republish_creneaux_unique';

  IF v_def IS NULL THEN
    ALTER TABLE public.republish_creneaux
      ADD CONSTRAINT republish_creneaux_unique UNIQUE (user_id, platform, debut);
    RAISE NOTICE 'republish_creneaux_unique : posée (user_id, platform, debut)';
  ELSIF v_def = 'UNIQUE (user_id, debut)' THEN
    ALTER TABLE public.republish_creneaux DROP CONSTRAINT republish_creneaux_unique;
    ALTER TABLE public.republish_creneaux
      ADD CONSTRAINT republish_creneaux_unique UNIQUE (user_id, platform, debut);
    RAISE NOTICE 'republish_creneaux_unique : (user_id, debut) → (user_id, platform, debut)';
  ELSE
    RAISE NOTICE 'republish_creneaux_unique : déjà « % » — inchangée', v_def;
  END IF;
END $$;

-- L'index de l'écran Historique : CONSERVÉ (lecture par date, toutes
-- plateformes). Celui du sweep et de l'état : par plateforme.
CREATE INDEX IF NOT EXISTS republish_creneaux_user_pf_debut_idx
  ON public.republish_creneaux (user_id, platform, debut DESC);

-- ── 3. LES CLÉS DE PARC ─────────────────────────────────────────────────────
INSERT INTO public.coin_config (key, value) VALUES
  ('republish_planifiee_pf_vinted',    1),
  ('republish_planifiee_pf_leboncoin', 1),
  ('republish_planifiee_pf_beebs',     1),
  ('republish_planifiee_pf_opla',      1),
  ('republish_espacement_min_vinted_sec',      0),
  ('republish_espacement_min_leboncoin_sec', 900),
  ('republish_espacement_min_beebs_sec',     900),
  ('republish_espacement_min_opla_sec',     1200),
  ('republish_disjoncteur_echecs',      2),
  ('republish_palier_perdu_grace_h',   48)
ON CONFLICT (key) DO NOTHING;

-- Contrôle :
--   SELECT conname, pg_get_constraintdef(oid) FROM pg_constraint
--   WHERE conrelid = 'public.republish_creneaux'::regclass ORDER BY 1;
--   → republish_creneaux_unique  UNIQUE (user_id, platform, debut)
--   SELECT platform, count(*) FROM public.republish_creneaux GROUP BY 1;
--   → vinted uniquement, aucun NULL
--   SELECT key, value FROM coin_config WHERE key LIKE 'republish_planifiee_pf_%';
--   → les quatre à 1
