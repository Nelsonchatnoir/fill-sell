-- INVERSE de 20261111140000_retrait_partout_fiche_liee (11/11/2026, L1) : la migration n'a fait qu'AJOUTER un déclencheur,
-- six fonctions et une table (la marque des jumelles) — l'inverse les retire, et rien d'autre. Aucune fonction existante
-- n'avait été réécrite : rien à leur rendre. Ce qui reste, volontairement : les retraits déjà armés chez un compte relié
-- (des retraits ordinaires : ils s'exécutent ou s'annulent comme les autres), les tâches annulées (annulées), les
-- questions posées (inventaire_doublons, motif copie_non_prouvee, source retrait_partout_compte_relie : invisibles tant que
-- la jumelle est au stock ; la réponse de la vente les déclare sans objet). Ce qui part avec la table : les marques des
-- jumelles (un affichage). Après l'inverse, un retrait « partout » ne traverse plus la liaison (le défaut du 11/11 revient).
-- (Relecture B1) DDL sur inventaire (déclencheur) : jamais d'attente au-delà de 5 s derrière une écriture en cours.
SET lock_timeout = '5s';
DROP TRIGGER IF EXISTS inventaire_arme_retraits_fiche_liee ON public.inventaire;
DROP FUNCTION IF EXISTS public.inventaire_arme_retraits_fiche_liee();
DROP FUNCTION IF EXISTS public.armer_retraits_fiche_liee(uuid, bigint, text);
DROP FUNCTION IF EXISTS public.copie_retrait_partout_repondre(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.armer_retrait_copie_reliee(uuid, text, text, jsonb);
DROP FUNCTION IF EXISTS public.annonce_en_retrait_compte_relie(uuid);
DROP FUNCTION IF EXISTS public.copies_fiche_liee(uuid, bigint);
DROP TABLE IF EXISTS public.jumelles_retirees_partout;
RESET lock_timeout;
