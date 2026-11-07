-- Déclencheurs de public.profiles relus en PROD le 07/11/2026 ~19:30 (pg_get_triggerdef, lecture seule), les 8 :
--   BEFORE UPDATE  profiles_acquisition_immuable_trg          (toute mise à jour)            → rejoué ici
--   AFTER  UPDATE  profiles_cloud_pool  OF is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete
--                  WHEN (OLD … IS DISTINCT FROM NEW …) → cloud_compte_synchroniser (IP, place)  → rejoué ici
--   AFTER  UPDATE  profiles_compte_signal OF beta_flags, is_premium, is_pro, is_business, is_comped (palier, hors Cloud)
--   BEFORE UPDATE  profiles_identite_vinted_du_poste OF extension_sessions
--   BEFORE DELETE  profiles_origine_survit_trg
--   BEFORE UPDATE  profiles_pin_une_boutique_un_compte OF vinted_sync_pin
--   BEFORE UPDATE  profiles_platform_settings_garde OF platform_settings
--   AFTER  UPDATE  profiles_session_revue_bonne OF extension_sessions
-- Aucun autre BEFORE ne touche une colonne Cloud (corps relus) : seuls les deux premiers comptent pour la garde.
CREATE TRIGGER profiles_acquisition_immuable_trg BEFORE UPDATE ON public.profiles FOR EACH ROW EXECUTE FUNCTION profiles_acquisition_immuable();
CREATE TRIGGER profiles_cloud_pool AFTER UPDATE OF is_cloud, cloud_essai_debut, cloud_essai_fin, cloud_essai_arrete ON public.profiles FOR EACH ROW WHEN (((old.is_cloud IS DISTINCT FROM new.is_cloud) OR (old.cloud_essai_debut IS DISTINCT FROM new.cloud_essai_debut) OR (old.cloud_essai_fin IS DISTINCT FROM new.cloud_essai_fin) OR (old.cloud_essai_arrete IS DISTINCT FROM new.cloud_essai_arrete))) EXECUTE FUNCTION profiles_cloud_pool();
