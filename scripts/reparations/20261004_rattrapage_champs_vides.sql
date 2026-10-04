SET lock_timeout = '10s';
-- ═══════════════════════════════════════════════════════════════════════════
-- RATTRAPAGE : LES CHAMPS VIDES DES FICHES, COMPLÉTÉS DEPUIS LEURS ANNONCES
-- EN LIGNE (04/10, Louis — point 1, « Louis et tous les comptes »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Règle de Nico : le relevé reprend tout ce que l'annonce affiche ; pour les
-- fiches DÉJÀ importées, on ne remplit QUE les champs vides, jamais une
-- valeur saisie. Le déclencheur annonce_vers_fiche (20261004093000) le fait à
-- chaque nouvelle capture ; ceci le fait UNE FOIS pour les captures déjà en
-- base : fiche_completer_depuis_annonce sur chaque annonce rattachée encore
-- en ligne, la plus récemment vue d'abord (une fiche à plusieurs annonces
-- prend la plus fraîche, les suivantes ne trouvent plus de vide).
-- Chaque champ complété est écrit dans inventaire_journal (motif
-- champ_vide_complete) : c'est la sauvegarde. Fenêtre du passage :
-- sauvegarde_rattrapage_20261004 (debut, fin). Le poids ne vient jamais de
-- l'estimation Leboncoin (20261004095000).
-- Inverse : 20261004_rattrapage_champs_vides_INVERSE.sql.
CREATE TABLE IF NOT EXISTS public.sauvegarde_rattrapage_20261004 (debut timestamptz, fin timestamptz);
INSERT INTO public.sauvegarde_rattrapage_20261004 (debut) VALUES (now() - interval '1 second');  -- now() : même horloge que le journal, transaction unique ou non
SELECT count(*) AS annonces_passees
  FROM (SELECT public.fiche_completer_depuis_annonce(a.id) AS r
          FROM public.annonces_plateforme a
         WHERE a.inventaire_id IS NOT NULL AND a.disparu_le IS NULL
           AND (a.capture IS NOT NULL OR a.donnees_index IS NOT NULL)
         ORDER BY a.vu_le DESC NULLS LAST) x;
UPDATE public.sauvegarde_rattrapage_20261004 SET fin = clock_timestamp() WHERE fin IS NULL;
-- Le bilan, par compte et par champ.
SELECT u.email, j.champ, count(*) n
  FROM public.inventaire_journal j JOIN auth.users u ON u.id = j.user_id, public.sauvegarde_rattrapage_20261004 s
 WHERE j.motif = 'champ_vide_complete' AND j.created_at BETWEEN s.debut AND s.fin
 GROUP BY 1, 2 ORDER BY 1, 3 DESC;
