-- ============================================================================
-- LA PORTE UNIQUE D'ENVOI — ce dont elle a besoin en base. 19/09/2026.
--
-- ⛔ NON APPLIQUÉE À L'ÉCRITURE DE CE FICHIER. Le code déployé avec elle
--    fonctionne AVANT comme APRÈS : _shared/desinscription.ts détecte la
--    colonne absente (42703 / PGRST204) et repose sa ligne sans elle. Cette
--    migration n'est donc jamais dans le chemin critique d'un envoi — elle
--    ajoute de la traçabilité, elle n'en débloque pas.
--
-- CE QU'ELLE FAIT, ET POURQUOI
--
-- 1. email_logs.email / email_log_echecs.email
--    Jusqu'ici la seule identité d'une ligne était `user_id`, clé étrangère
--    vers auth.users. Conséquence : un envoi à une adresse SANS COMPTE ne
--    pouvait pas être tracé du tout — et il y en a (business@depop.com,
--    contact@opla.co, les alertes internes). `user_id` était déjà nullable ;
--    il manquait de quoi dire À QUI on a écrit quand il n'y a pas de compte.
--
-- 2. Rattrapage des SIX opt-out historiques
--    Les six lignes email_logs 'marketing_optout' (14/08 → 04/09) sont les
--    seules traces de désinscription One-Click. Elles vivaient dans un
--    registre que send-relance ne lisait pas. La porte lit désormais LES DEUX
--    registres, donc ces six personnes sont déjà protégées par le code — ce
--    rattrapage aligne simplement le registre canonique pour qu'un futur
--    lecteur n'ait plus à connaître l'histoire.
--
-- 3. Index sur email_destinataires(user_id)
--    estDesinscrit() interroge désormais aussi par compte (quelqu'un a pu
--    changer d'adresse). Sans index, c'est un seq scan à chaque envoi.
--
-- ⛔ AUCUN NOUVEAU TYPE ONE-SHOT dans ce lot : welcome, how_it_works,
--    extension_link, job_pending_relaunch, resiliation_ar, marketing_optout et
--    payment_failed:<facture> existent tous déjà et gardent leur nom exact (la
--    dédup historique en dépend). email_logs_one_shot_unique n'est donc PAS
--    touché. Si un type naît plus tard, il entre dans l'index DANS SA PROPRE
--    migration — règle CLAUDE.md, payée par le bug welcome du 03/08.
-- ============================================================================

-- ── 1. À QUI a-t-on écrit, même sans compte ────────────────────────────────
ALTER TABLE public.email_logs
  ADD COLUMN IF NOT EXISTS email text;

ALTER TABLE public.email_log_echecs
  ADD COLUMN IF NOT EXISTS email text;

COMMENT ON COLUMN public.email_logs.email IS
  'Adresse réellement servie, en minuscules. Renseignée par envoyerEmail() '
  '(_shared/desinscription.ts). Seule identité disponible quand user_id est '
  'NULL (adresse sans compte, alerte interne).';

-- Relecture d''un envoi par adresse : « a-t-on déjà écrit à cette boîte ? »
CREATE INDEX IF NOT EXISTS email_logs_email_type
  ON public.email_logs (email, email_type);

-- ── 2. Les six opt-out historiques rejoignent le registre canonique ────────
-- Idempotent : ON CONFLICT sur la clé primaire (email), puis un UPDATE qui ne
-- fait que poser desinscrit sur les lignes concernées. Rejouer la migration
-- ne recrée rien et ne désinscrit personne de plus.
-- Le jeton est un aléa de 32 octets en base64url, comme celui que génère
-- nouveauJeton() côté Deno : même forme, même longueur.
INSERT INTO public.email_destinataires (email, jeton, user_id, desinscrit, desinscrit_le, origine)
SELECT
  lower(u.email),
  translate(encode(gen_random_bytes(32), 'base64'), '+/=', '-_'),
  l.user_id,
  true,
  min(l.sent_at),
  'one_click_rattrapage'
FROM public.email_logs l
JOIN auth.users u ON u.id = l.user_id
WHERE l.email_type = 'marketing_optout'
  AND u.email IS NOT NULL
GROUP BY lower(u.email), l.user_id
ON CONFLICT (email) DO NOTHING;

-- Les adresses qui avaient DÉJÀ une ligne (créée par un envoi précédent, donc
-- desinscrit = false) : on pose l'opt-out sans écraser une réinscription
-- ultérieure explicite.
UPDATE public.email_destinataires d
SET desinscrit    = true,
    desinscrit_le = COALESCE(d.desinscrit_le, o.premier),
    user_id       = COALESCE(d.user_id, o.user_id),
    origine       = COALESCE(d.origine, 'one_click_rattrapage')
FROM (
  SELECT lower(u.email) AS email, l.user_id, min(l.sent_at) AS premier
  FROM public.email_logs l
  JOIN auth.users u ON u.id = l.user_id
  WHERE l.email_type = 'marketing_optout' AND u.email IS NOT NULL
  GROUP BY lower(u.email), l.user_id
) o
WHERE d.email = o.email
  AND d.desinscrit = false
  AND d.reinscrit_le IS NULL;

-- ── 3. Reconnaître un désinscrit par son COMPTE, pas que par son adresse ──
CREATE INDEX IF NOT EXISTS email_destinataires_user_id_idx
  ON public.email_destinataires (user_id)
  WHERE user_id IS NOT NULL;
