-- ═══════════════════════════════════════════════════════════════════════════
-- SYNCHRONISATION DES VENTES — LOT 0 : LA TABLE, AVANT TOUTE AUTRE LIGNE
-- 2026-09-19
--
-- `ventes` ne pouvait RIEN recevoir d'un relevé : pas d'identifiant de
-- commande (donc un relevé rejoué recrée tout), pas de date-heure (`date` est
-- une DATE nue), et 18 libellés de plateforme distincts pour 5 plateformes.
--
-- ⛔ AUCUNE DESTRUCTION. La colonne `plateforme` n'est pas touchée : elle est
--    RECOPIÉE dans `plateforme_origine` et doublée d'une colonne normalisée
--    `plateforme_code`. Ce qui n'est pas reconnaissable reste NULL côté code —
--    on ne devine pas (« Vinted eBay », « Tout », « Xbox Series X »…).
-- ⛔ AUCUNE SAISIE UTILISATEUR N'EST ÉCRASÉE. prix_achat, benefice,
--    emplacement, description, marque, type ne sont touchés NULLE PART ici,
--    ni par la RPC plus bas. Un relevé ENRICHIT, il n'écrase jamais.
-- ⛔ UN RELEVÉ NE DÉCLENCHE RIEN : ni job, ni retrait, ni unité, ni e-mail, et
--    il ne fait JAMAIS basculer inventaire.statut. La preuve de vente continue
--    de passer par le bandeau.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── 1. Colonnes ────────────────────────────────────────────────────────────
ALTER TABLE public.ventes
  ADD COLUMN IF NOT EXISTS plateforme_code    text,        -- vinted|leboncoin|ebay|beebs|opla, sinon NULL
  ADD COLUMN IF NOT EXISTS plateforme_origine text,        -- copie de `plateforme` telle quelle
  ADD COLUMN IF NOT EXISTS vendu_le           timestamptz, -- date-heure RÉELLE de la vente
  ADD COLUMN IF NOT EXISTS commande_ref       text,        -- identifiant de commande CHEZ la plateforme
  ADD COLUMN IF NOT EXISTS source             text,        -- 'releve' quand la ligne vient d'un relevé
  ADD COLUMN IF NOT EXISTS releve_le          timestamptz,
  ADD COLUMN IF NOT EXISTS devise             text,
  ADD COLUMN IF NOT EXISTS frais_plateforme   numeric;     -- frais RÉELS rendus par la plateforme, sinon NULL

COMMENT ON COLUMN public.ventes.plateforme_code IS
  'Plateforme normalisée (vinted|leboncoin|ebay|beebs|opla). NULL = non reconnaissable : voir plateforme_origine, on ne devine pas.';
COMMENT ON COLUMN public.ventes.commande_ref IS
  'Identifiant de la commande CHEZ la plateforme (transaction_id Vinted, orderId eBay, purchase_id Leboncoin, id de checkout Opla). Clé de dédoublonnage d''un relevé rejoué. JAMAIS un identifiant de personne.';
COMMENT ON COLUMN public.ventes.frais_plateforme IS
  'Frais RÉELS prélevés au VENDEUR, quand la plateforme les rend. NULL = inconnu, jamais 0 par défaut. ⛔ Le service_fee de Vinted est la protection ACHETEUR : il ne va PAS ici.';
COMMENT ON COLUMN public.ventes.vendu_le IS
  'Date-heure réelle de la vente. `date` (DATE) reste la colonne historique et n''est pas touchée.';

-- ── 2. Reprise de l'existant, sans rien détruire ───────────────────────────
UPDATE public.ventes
   SET plateforme_origine = plateforme
 WHERE plateforme_origine IS NULL AND plateforme IS NOT NULL;

UPDATE public.ventes
   SET plateforme_code = CASE lower(btrim(plateforme))
         WHEN 'vinted'    THEN 'vinted'
         WHEN 'vintee'    THEN 'vinted'
         WHEN 'leboncoin' THEN 'leboncoin'
         WHEN 'le bon coin' THEN 'leboncoin'
         WHEN 'lbc'       THEN 'leboncoin'
         WHEN 'ebay'      THEN 'ebay'
         WHEN 'beebs'     THEN 'beebs'
         WHEN 'opla'      THEN 'opla'
         ELSE NULL END
 WHERE plateforme_code IS NULL AND plateforme IS NOT NULL;

-- `date` est une DATE : on la relit à midi (12:00) heure de Paris plutôt qu'à
-- minuit — minuit bascule de jour au moindre changement de fuseau, et on ne
-- connaît pas l'heure réelle. `vendu_le` reste NULL quand `date` est NULL :
-- created_at est la date d'ENREGISTREMENT, pas celle de la vente.
UPDATE public.ventes
   SET vendu_le = (("date"::text || ' 12:00:00')::timestamp AT TIME ZONE 'Europe/Paris')
 WHERE vendu_le IS NULL AND "date" IS NOT NULL;

UPDATE public.ventes SET source = 'manuel' WHERE source IS NULL;

-- ── 3. Index ───────────────────────────────────────────────────────────────
-- Un relevé rejoué n'écrit rien deux fois : c'est CET index qui le garantit.
CREATE UNIQUE INDEX IF NOT EXISTS ventes_commande_unique
  ON public.ventes (user_id, plateforme_code, commande_ref)
  WHERE commande_ref IS NOT NULL AND plateforme_code IS NOT NULL;

-- La table n'avait QUE sa clé primaire : chaque ouverture de l'app la scannait.
CREATE INDEX IF NOT EXISTS ventes_user_idx ON public.ventes (user_id);
CREATE INDEX IF NOT EXISTS ventes_user_inventaire_idx
  ON public.ventes (user_id, inventaire_id) WHERE inventaire_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.ventes TO authenticated;
