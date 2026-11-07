-- INVERSE de 20261108090000_cloud_mails_registre.sql (registre des mails d'événement FillSell Cloud).
-- Effet : les fonctions edge qui l'utilisent n'envoient plus AUCUN mail Cloud d'événement (réservation illisible =
-- échec fermé, journalisé) ; aucun paiement n'est bloqué. À jouer APRÈS avoir redéployé les fonctions d'avant si l'on
-- veut revenir à l'état exact d'avant le jour J.
DROP TABLE IF EXISTS public.cloud_mails;
