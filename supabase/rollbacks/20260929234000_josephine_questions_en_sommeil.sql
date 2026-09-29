-- Inverse de 20260929234000 : rouvre les 21 questions de josephinecerni,
-- à l'identique (seules les lignes portant le marqueur de mise en sommeil).
-- ⚠️ Sans objet une fois les fiches en double supprimées (geste 3) : la
-- question pointerait une fiche absente et l'app ne l'afficherait pas.
SET statement_timeout = '10s';
SET lock_timeout = '1s';
UPDATE inventaire_doublons
   SET statut = preuves -> 'en_sommeil_incident_beebs_2909' ->> 'statut_avant',
       preuves = preuves - 'en_sommeil_incident_beebs_2909'
 WHERE preuves ? 'en_sommeil_incident_beebs_2909' AND statut = 'caduque';
