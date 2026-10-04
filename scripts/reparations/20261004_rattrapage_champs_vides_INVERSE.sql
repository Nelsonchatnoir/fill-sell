-- Inverse de 20261004_rattrapage_champs_vides.sql : chaque champ complété
-- pendant la fenêtre du passage redevient vide, SEULEMENT s'il porte encore la
-- valeur posée (une retouche faite depuis par la personne n'est jamais touchée).
-- Lu dans inventaire_journal (motif champ_vide_complete, fenêtre
-- sauvegarde_rattrapage_20261004).
-- ⚠️ La fusion des attributs (inventaire_attributs_fusion_trg) n'enlève jamais
--    une clé : elle est coupée le temps de CETTE transaction (verrou exclusif
--    sur inventaire : aucune autre écriture ne passe à côté), puis remise.
BEGIN;
SET LOCAL lock_timeout = '10s';
ALTER TABLE public.inventaire DISABLE TRIGGER inventaire_attributs_fusion_trg;
WITH f AS (SELECT debut, fin FROM public.sauvegarde_rattrapage_20261004 WHERE fin IS NOT NULL ORDER BY debut DESC LIMIT 1),
     j AS (SELECT jj.* FROM public.inventaire_journal jj, f WHERE jj.motif = 'champ_vide_complete' AND jj.created_at BETWEEN f.debut AND f.fin)
UPDATE public.inventaire i SET
  description = CASE WHEN EXISTS (SELECT 1 FROM j WHERE j.inventaire_id = i.id AND j.champ = 'description') AND left(i.description, 120) = (SELECT j.apres FROM j WHERE j.inventaire_id = i.id AND j.champ = 'description' LIMIT 1) THEN NULL ELSE i.description END,
  marque = CASE WHEN EXISTS (SELECT 1 FROM j WHERE j.inventaire_id = i.id AND j.champ = 'marque' AND j.apres = i.marque) THEN NULL ELSE i.marque END,
  type = CASE WHEN EXISTS (SELECT 1 FROM j WHERE j.inventaire_id = i.id AND j.champ = 'type' AND j.apres = i.type) THEN NULL ELSE i.type END,
  prix_vente = CASE WHEN EXISTS (SELECT 1 FROM j WHERE j.inventaire_id = i.id AND j.champ = 'prix_vente' AND j.apres = i.prix_vente::text) THEN NULL ELSE i.prix_vente END,
  poids_g = CASE WHEN EXISTS (SELECT 1 FROM j WHERE j.inventaire_id = i.id AND j.champ = 'poids_g' AND j.apres = i.poids_g::text) THEN NULL ELSE i.poids_g END,
  attributs = (SELECT COALESCE(i.attributs, '{}'::jsonb) - COALESCE(array_agg(substr(j.champ, 11)) FILTER (WHERE j.champ LIKE 'attributs.%' AND (i.attributs -> substr(j.champ, 11) ->> 'v') = j.apres), ARRAY[]::text[]) FROM j WHERE j.inventaire_id = i.id)
WHERE i.id IN (SELECT inventaire_id FROM j);
ALTER TABLE public.inventaire ENABLE TRIGGER inventaire_attributs_fusion_trg;
COMMIT;
SELECT count(*) AS fiches_rendues FROM public.inventaire_journal jj, public.sauvegarde_rattrapage_20261004 s
 WHERE jj.motif = 'champ_vide_complete' AND jj.created_at BETWEEN s.debut AND s.fin;
