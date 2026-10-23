-- ═══════════════════════════════════════════════════════════════════════════
-- DROITS EXPLICITES DES TABLES CRÉÉES DEPUIS LE 01/10 (24/10, point 10 — régime Supabase du 30/10)
-- ═══════════════════════════════════════════════════════════════════════════
-- 58 tables ont été créées par les migrations d'octobre. 34 écrivaient leurs droits ; 24 comptaient sur les droits
-- par défaut de `public`, qui disparaissent le 30/10 (et dès le 24/10 ici, migration 20261024110000). En prod, leurs
-- droits sont DÉJÀ ceux-ci (relus le 23/10 à 21:35 : postgres + service_role, et authenticated pour
-- lectures_origine_demandees) : cette migration les ÉCRIT, sans rien changer en prod, pour qu'une re-création de ces
-- tables depuis le dépôt donne exactement les mêmes droits. Aucune table n'est ouverte à anon.
BEGIN;
SET LOCAL lock_timeout = '5s';

-- Tables serveur seulement (fonctions edge, crons) : service_role, aucun accès client.
GRANT ALL ON TABLE public.releve_index_passages TO service_role;
GRANT ALL ON TABLE public.veille_cpu TO service_role;
GRANT ALL ON TABLE public.veille_cpu_alertes TO service_role;
GRANT ALL ON TABLE public.rattrapage_photos_ebay_journal TO service_role;
GRANT ALL ON TABLE public.cloud_attente TO service_role;
GRANT ALL ON TABLE public.cloud_coffre TO service_role;
GRANT ALL ON TABLE public.cloud_connexions TO service_role;
GRANT ALL ON TABLE public.cloud_essai_demandes TO service_role;
GRANT ALL ON TABLE public.cloud_essai_empreintes TO service_role;
GRANT ALL ON TABLE public.cloud_ip_commandes TO service_role;
GRANT ALL ON TABLE public.cloud_ip_evenements TO service_role;
GRANT ALL ON TABLE public.cloud_ips TO service_role;
GRANT ALL ON TABLE public.cloud_pool_alertes TO service_role;
GRANT ALL ON TABLE public.cloud_postes TO service_role;
GRANT ALL ON TABLE public.departs_compte TO service_role;
GRANT ALL ON TABLE public.departs_compte_garde TO service_role;
GRANT ALL ON TABLE public.ventes_prouvees_alertes TO service_role;
GRANT ALL ON TABLE public.ventes_prouvees_passages TO service_role;
GRANT ALL ON TABLE public.ventes_prouvees_refus TO service_role;
GRANT ALL ON TABLE public.quotas_par_compte TO service_role;
GRANT ALL ON TABLE public.boutiques_plateforme TO service_role;
GRANT ALL ON TABLE public.comptes_lies TO service_role;
GRANT ALL ON TABLE public.fiches_liees_comptes TO service_role;
REVOKE ALL ON TABLE public.releve_index_passages, public.veille_cpu, public.veille_cpu_alertes,
  public.rattrapage_photos_ebay_journal, public.cloud_attente, public.cloud_coffre, public.cloud_connexions,
  public.cloud_essai_demandes, public.cloud_essai_empreintes, public.cloud_ip_commandes, public.cloud_ip_evenements,
  public.cloud_ips, public.cloud_pool_alertes, public.cloud_postes, public.departs_compte, public.departs_compte_garde,
  public.ventes_prouvees_alertes, public.ventes_prouvees_passages, public.ventes_prouvees_refus, public.quotas_par_compte,
  public.boutiques_plateforme, public.comptes_lies, public.fiches_liees_comptes
  FROM anon, authenticated;

-- Lue par l'app sous la session de la personne (politique lectures_origine_demandees_proprio).
GRANT ALL ON TABLE public.lectures_origine_demandees TO authenticated, service_role;
REVOKE ALL ON TABLE public.lectures_origine_demandees FROM anon;

COMMIT;
