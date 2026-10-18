-- ═══════════════════════════════════════════════════════════════════════════
-- 18/10 — LOUIS : RELANCE UNIQUE DE SES DEUX DEMANDES DE BORDEREAU VINTED
-- (commandes 23283842931 « Lot 3 articles » et 23305737164 « Set de 3 carré avec poussoir »)
-- ═══════════════════════════════════════════════════════════════════════════
-- Autorisation : brief de Nico du 18/10, lot 1.4 — « tu peux relancer UNE fois la demande qu'il a
-- déjà faite, avec le correctif, et seulement celle-là. Jamais d'annulation de commande. »
-- État lu le 18/10 à 11:00 (relevé de son poste) : envoi Vinted 210 (étiquette échouée chez Vinted)
-- sur les deux commandes, rien obtenu par Louis lui-même ; demandes e5e13793 et d2b070c8 passées
-- « echec / etiquette_echouee_chez_vinted » par la règle (migration 20261018100000, 11:22).
-- Ce que fait ce script : UNE autorisation par demande dans bordereaux_relances_autorisees, valable
-- jusqu'au 26/10 00:00 Paris (Vinted : « à envoyer avant le 26 oct. 10:00 »). Rien d'autre.
-- Ce qui se passe ensuite, sans personne : la relance n'est créée que lorsqu'une extension qui sait
-- relancer ET envoyer le type d'étiquette en toutes lettres (0.6.126) prend les demandes de Louis ;
-- juste avant, la base revérifie que la commande attend toujours (a_expedier, échec ou à obtenir),
-- sans copie ni autre demande — sinon l'autorisation est consommée SANS relance (Louis l'a obtenu
-- lui-même, ou c'est expédié/annulé : on ne touche à rien). L'extension relit Vinted juste avant le
-- geste (étiquette déjà là : aucun geste, elle la récupère) et ne recommande qu'une fois, avec le
-- choix de Louis (type 1 = étiquette à imprimer) et sa phrase d'engagement d'origine.
-- Sauvegarde : _backup_1810_relance_louis (les deux demandes, lignes entières).
-- Inverse : scripts/reparations/20261018_relance_bordereaux_louis_INVERSE.sql (retire les
-- autorisations non consommées ; une relance déjà partie chez Vinted ne se défait pas).
-- Application : npx supabase db query --linked -f scripts/reparations/20261018_relance_bordereaux_louis.sql

BEGIN;
SET LOCAL statement_timeout = '30s';
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF to_regclass('public._backup_1810_relance_louis') IS NOT NULL THEN RAISE EXCEPTION 'déjà fait (sauvegarde présente) : rien n''est écrit'; END IF;
  IF to_regclass('public.bordereaux_relances_autorisees') IS NULL THEN RAISE EXCEPTION 'migration 20261018100000 absente : rien n''est écrit'; END IF;
  IF (SELECT count(*) FROM public.bordereaux_demandes d
        JOIN public.plateforme_commandes pc ON pc.id = d.commande_id AND pc.user_id = d.user_id
       WHERE d.id IN ('e5e13793-ee9a-43e3-81e3-c584ca206d97', 'd2b070c8-191b-48c5-8d0a-990d4fce510d')
         AND d.user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND d.platform = 'vinted' AND d.action = 'generer'
         AND d.statut = 'echec' AND d.motif = 'etiquette_echouee_chez_vinted'
         AND pc.commande_ref IN ('23283842931', '23305737164') AND pc.etat = 'a_expedier' AND pc.bordereau = 'indisponible') <> 2 THEN
    RAISE EXCEPTION 'les deux demandes de Louis ne sont pas dans l''état attendu (échec chez Vinted, commande à expédier) : rien n''est écrit';
  END IF;
END
$garde$;

CREATE TABLE public._backup_1810_relance_louis (id uuid, ligne jsonb);
ALTER TABLE public._backup_1810_relance_louis ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public._backup_1810_relance_louis FROM PUBLIC, anon, authenticated;
INSERT INTO public._backup_1810_relance_louis
  SELECT d.id, to_jsonb(d) FROM public.bordereaux_demandes d
   WHERE d.id IN ('e5e13793-ee9a-43e3-81e3-c584ca206d97', 'd2b070c8-191b-48c5-8d0a-990d4fce510d');

INSERT INTO public.bordereaux_relances_autorisees (demande_id, user_id, autorise_par, avant)
SELECT d.id, d.user_id,
       'Nico, brief du 18/10 (lot 1.4) : relancer UNE fois la demande déjà faite, avec le correctif (extension 0.6.126)',
       timestamp '2026-10-26 00:00:00' AT TIME ZONE 'Europe/Paris'
  FROM public.bordereaux_demandes d
 WHERE d.id IN ('e5e13793-ee9a-43e3-81e3-c584ca206d97', 'd2b070c8-191b-48c5-8d0a-990d4fce510d');

DO $controle$
BEGIN
  IF (SELECT count(*) FROM public.bordereaux_relances_autorisees WHERE user_id = 'faf5021a-479a-4bb3-b3ec-c296770739b7' AND consommee_le IS NULL) <> 2 THEN
    RAISE EXCEPTION 'contrôle : 2 autorisations attendues';
  END IF;
  IF (SELECT count(*) FROM public.bordereaux_relances_autorisees) <> 2 THEN
    RAISE EXCEPTION 'contrôle : aucune autre autorisation ne doit exister';
  END IF;
END
$controle$;

SELECT a.demande_id, a.avant AT TIME ZONE 'Europe/Paris' AS avant_paris, a.consommee_le FROM public.bordereaux_relances_autorisees a;
COMMIT;
