-- INVERSE de 20261012_ferreira_rattachements_nico_rejuges.sql (ferreirasab, 12/10).
-- À ne lancer qu'AVANT la passe du moteur qui a suivi (après elle, les annonces
-- ont été rangées par le moteur : défaire d'abord ses décisions). Remet les
-- annonces, jobs de suivi et lignes rapprochements tels que sauvegardés, et
-- retire les lignes « detache » de rejugement.
BEGIN;
UPDATE annonces_plateforme a SET inventaire_id = b.inventaire_id, job_id = b.job_id, source_rapprochement = b.source_rapprochement,
       proposition = b.proposition, ignoree_le = b.ignoree_le, updated_at = now()
  FROM _backup_1210_ferreira_rejuge_annonces b WHERE b.id = a.id;
UPDATE cross_post_jobs j SET status = b.status, error = b.error, platform_fields = b.platform_fields
  FROM _backup_1210_ferreira_rejuge_jobs b WHERE b.id = j.id;
UPDATE rapprochements r SET par = b.par, detail = b.detail
  FROM _backup_1210_ferreira_rejuge_rapprochements b WHERE b.id = r.id;
DELETE FROM rapprochements WHERE user_id = '18e461c1-7107-4f40-b07f-6de8fb5c2948' AND decision = 'detache' AND par = 'auto' AND detail ->> 'motif' = 'rejuge_1210';
COMMIT;
