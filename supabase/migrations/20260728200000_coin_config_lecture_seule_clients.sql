-- ═══════════════════════════════════════════════════════════════════════════
-- coin_config : les rôles clients repassent en LECTURE SEULE
-- ═══════════════════════════════════════════════════════════════════════════
-- Constaté le 2026-07-28 : anon et authenticated disposaient de DELETE,
-- INSERT, UPDATE, TRUNCATE et REFERENCES au niveau TABLE sur coin_config —
-- héritage des privilèges par défaut de Supabase sur le schéma public, jamais
-- restreints depuis la création de la table (20260706100000).
--
-- Seule la RLS empêchait un porteur de la clé anon (publique par nature, elle
-- vit dans le bundle front) de réécrire la grille tarifaire : prix de
-- publication, prix du scan Lens, montants des grants mensuels. Une policy
-- oubliée ou trop permissive lors d'une évolution suffisait à ouvrir la porte.
-- On ne laisse pas la RLS être l'unique rempart sur la table qui fixe les
-- prix : GRANT et RLS doivent dire la même chose.
--
-- SELECT est conservé — la landing (rôle anon) et l'app (authenticated) lisent
-- coin_config au runtime pour afficher grants et tarifs. La policy de lecture
-- existante n'est pas touchée.
--
-- Écritures : service_role uniquement (webhooks, RPC SECURITY DEFINER, et les
-- migrations comme celle-ci). Aucun chemin applicatif légitime n'écrivait dans
-- cette table depuis un rôle client.

revoke insert, update, delete, truncate, references
  on table public.coin_config
  from anon, authenticated;

-- Volontairement PAS d'ALTER DEFAULT PRIVILEGES sur le schéma : ça changerait
-- le défaut de TOUTES les futures tables, bien au-delà de coin_config, et
-- casserait silencieusement la première table créée en comptant sur le GRANT
-- par défaut (cf. la consigne CLAUDE.md qui prévoit un GRANT explicite par
-- nouvelle table). Le durcissement reste ciblé sur la table des prix.
