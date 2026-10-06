-- 06/10 soir — geronimo0550 : retrait Vinted « Official Overwatch 2 fleece hoodie size L NWT » ANNULÉ (décision de Nico)
-- Job 94bf96fe-e1f2-4205-85a0-b4acc25b639a (delete, vinted, annonce 10205785002), armé le 03/10 par une suppression
-- d'article ratée (500 corrigé par les index du 06/10). La fiche 1790966515750000 est
-- restée en stock (quantité 1), aucune vente : l'annonce Vinted ne doit pas être touchée.
-- 'cancelled' : get-pending-jobs ne le sert plus, retraitsBloques.js (« Annonces à
-- retirer ») ne le compte plus (il ne lit que pending + attente / needs_user).
-- Inverse : 20261006_geronimo_annule_retrait_overwatch_INVERSE.sql (état exact d'avant).
BEGIN;
UPDATE cross_post_jobs
   SET status = 'cancelled',
       error = 'Retrait annulé : l''article est toujours en stock et n''a pas été vendu. Ton annonce Vinted reste en ligne, elle n''a pas été touchée.',
       platform_fields = platform_fields - 'next_action_after' - 'attente_connexion'
         || jsonb_build_object('retrait_annule', jsonb_build_object('le', now(), 'par', 'décision de Nico (06/10) — fiche en stock, aucune vente'))
 WHERE id = '94bf96fe-e1f2-4205-85a0-b4acc25b639a' AND action = 'delete' AND status = 'pending';
SELECT id, status, error FROM cross_post_jobs WHERE id = '94bf96fe-e1f2-4205-85a0-b4acc25b639a';
COMMIT;
