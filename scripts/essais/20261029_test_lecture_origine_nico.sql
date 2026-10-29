-- Essai réel (lot C partie 1, 29/10) : la demande de lecture d'un TÉLÉPHONE, rejouée telle quelle sous les claims de
-- Nico (le geste exact de l'app : rpc demander_lecture_origine, « Réessayer » = p_relancer). Fiche Vinted sans
-- description 1793009407689014 (annonce 9872357762) ; l'ordinateur de Nico (extension 0.6.159) doit la voir au signal
-- de 30 s, la prendre (prise_le), puis la conclure (faite_le, motif). Rien d'autre n'est écrit.
set local role authenticated;
select set_config('request.jwt.claims', '{"sub":"f44b5917-bccc-4431-ba41-f40571a2ed18","role":"authenticated"}', true);
select now() at time zone 'Europe/Paris' as demandee_a, public.demander_lecture_origine(1793009407689014, true) as reponse;
