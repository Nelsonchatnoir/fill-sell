-- INVERSE des migrations 20261005120000 (socle Cloud) PUIS 20261004233000 (option
-- Cloud, paiements), appliquées le 05/10/2026. Repris des en-têtes des deux
-- fichiers ; état d'avant : 20261005_cloud_socle_SAUVEGARDE.json.
-- ⛔ Seulement si aucun client n'a encore payé l'option (sinon on garde les
--    colonnes) et après avoir coupé l'orchestrateur du serveur Cloud.
-- Ensuite : migration repair --linked --status reverted 20261005120000 20261004233000.
BEGIN;
-- ── 20261005120000 ─────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS profiles_cloud_pool ON public.profiles;
DROP FUNCTION IF EXISTS public.profiles_cloud_pool(), public.cloud_pool_entretien(), public.cloud_pool_etat(),
  public.cloud_compte_synchroniser(uuid), public.cloud_comptes_a_servir(), public.cloud_poste_noter(uuid, text, jsonb),
  public.cloud_coffre_ecrire(uuid, text, text, text, integer, boolean), public.cloud_coffre_lire(uuid),
  public.cloud_coffre_vider(uuid), public.cloud_coffre_etat_moi(), public.cloud_session_revoquer(uuid, uuid),
  public.cloud_essai_preparer_moi(text), public.cloud_essai_moi(), public.cloud_essai_permis(uuid),
  public.cloud_essai_noter_carte(uuid, text), public.cloud_essai_noter_compte_plateforme(uuid, text, text),
  public.cloud_empreintes_engager(uuid),
  public.cloud_ip_ajouter(text, inet, integer, text, text, text, timestamptz), public.cloud_ip_controle_entree(bigint, jsonb),
  public.cloud_ip_reserver(uuid), public.cloud_ip_attribuer(uuid, text), public.cloud_ip_liberer(uuid, text),
  public.cloud_ip_signaler(bigint, text, jsonb), public.cloud_ip_noter_purge(bigint, jsonb),
  public.cloud_ip_remettre_en_pool(bigint, jsonb), public.cloud_ip_renouvelee(bigint, timestamptz),
  public.cloud_ip_identifiants_changes(bigint, text), public.cloud_ip_attribuable(public.cloud_ips, uuid, text),
  public.cloud_proxy_identifiants(bigint), public.cloud_controle_manques(jsonb, inet, timestamptz),
  public.cloud_purge_manques(jsonb, timestamptz), public.cloud_journal(bigint, text, uuid, jsonb),
  public.cloud_hacher(text, text), public.cloud_sel(), public.cloud_param(text, integer),
  public.cloud_ts(text), public.cloud_texte_non_vide(jsonb), public.cloud_zero(jsonb);
DROP TABLE IF EXISTS public.cloud_connexions, public.cloud_postes, public.cloud_coffre, public.cloud_attente,
  public.cloud_pool_alertes, public.cloud_essai_empreintes, public.cloud_essai_demandes,
  public.cloud_ip_evenements, public.cloud_ip_commandes, public.cloud_ips;
DELETE FROM public.coin_config WHERE key LIKE 'cloud\_%';
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_cloud_essai_refus_connu, DROP COLUMN IF EXISTS cloud_essai_refus;
-- L'index des mails one-shot, tel qu'il était (relu le 05/10 15:48) — seulement
-- si aucun mail cloud_essai_veille n'est parti :
--   SELECT count(*) FROM public.email_logs WHERE email_type = 'cloud_essai_veille';   -- doit rendre 0
DROP INDEX IF EXISTS public.email_logs_one_shot_unique;
CREATE UNIQUE INDEX email_logs_one_shot_unique ON public.email_logs USING btree (user_id, email_type) WHERE (email_type = ANY (ARRAY['welcome'::text, 'how_it_works'::text, 'blast_relaunch_aout'::text, 'blast_founder'::text, 'founder_plan'::text, 'voice_conversion'::text, 'blast_sync_dressing'::text, 'reactiv_1409_a'::text, 'reactiv_1409_b'::text, 'reactiv_1409_c'::text, 'reactiv_1409_d'::text, 'extension_link_rattrapage'::text, 'stock_pret_2309'::text, 'blast_rentree_fillsell50_2609'::text]));
-- ── 20261004233000 ─────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.cloud_etat_moi();
DROP FUNCTION IF EXISTS public.cloud_etat(uuid, timestamptz);
DROP INDEX IF EXISTS public.profiles_is_cloud_idx;
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_cloud_canal_connu,
  DROP CONSTRAINT IF EXISTS profiles_cloud_essai_coherent,
  DROP COLUMN IF EXISTS cloud_canal, DROP COLUMN IF EXISTS cloud_ref,
  DROP COLUMN IF EXISTS cloud_periode_fin, DROP COLUMN IF EXISTS cloud_arret_fin_periode,
  DROP COLUMN IF EXISTS cloud_essai_arrete,
  DROP COLUMN IF EXISTS is_cloud, DROP COLUMN IF EXISTS cloud_essai_debut, DROP COLUMN IF EXISTS cloud_essai_fin;
COMMIT;
-- Vault, à la main : secrets cloud_proxy_* (après avoir coupé les commandes IPRoyal)
-- et cloud_empreinte_sel (efface toute la mémoire anti-abus).
