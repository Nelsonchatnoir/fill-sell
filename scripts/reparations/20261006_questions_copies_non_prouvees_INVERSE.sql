-- Inverse du rattrapage du 06/10 : retire les questions encore ouvertes qu'il a posées
-- (une question déjà tranchée par la personne est gardée : sa réponse est définitive).
delete from public.inventaire_doublons
 where motif = 'copie_non_prouvee' and source = 'rattrapage_0610' and statut = 'proposee';
