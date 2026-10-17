-- INVERSE de supabase/migrations/20261018000000_commande_annulee_jamais_une_vente.sql :
-- les trois définitions de prod d'AVANT la migration (vente_commande_annulee_vinted,
-- remises_en_vente_tick, ventes_statut_classe), gardées MOT POUR MOT par la migration
-- dans public._backup_1810_fonctions_commande_annulee (pg_get_functiondef + md5 lus
-- juste avant la réécriture), sont rejouées telles quelles ; le md5 de chaque fonction
-- est relu après coup et doit être celui gardé — sinon tout est annulé.
-- Garde : l'inverse ne part que si la prod porte la version de la migration (marqueur
-- vente_annulee_remise) et si la sauvegarde a bien ses 3 lignes.
-- Aucune donnée ne bouge : les ventes déjà retirées, les lignes remises_en_vente et les
-- marqueurs posés restent (c'est la règle d'AVANT qui revient pour les annulations
-- suivantes) ; l'inverse des DONNÉES est celui de la réparation
-- (scripts/reparations/20261018_ventes_commandes_failed_INVERSE.sql).
-- Application : npx supabase db query --linked -f supabase/rollbacks/20261018000000_commande_annulee_jamais_une_vente.sql

BEGIN;
SET LOCAL statement_timeout = '60s';
SET LOCAL lock_timeout = '5s';

DO $garde$
BEGIN
  IF position('vente_annulee_remise' IN pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure)) = 0 THEN
    RAISE EXCEPTION 'la prod ne porte pas la version de la migration 20261018000000 : inverse arrêté, rien n''est écrit';
  END IF;
  IF (SELECT count(*) FROM public._backup_1810_fonctions_commande_annulee) <> 3 THEN
    RAISE EXCEPTION 'sauvegarde _backup_1810_fonctions_commande_annulee incomplète (% ligne(s) sur 3) : inverse arrêté, rien n''est écrit',
      (SELECT count(*) FROM public._backup_1810_fonctions_commande_annulee);
  END IF;
END
$garde$;

-- ═══ CORPS DE L'INVERSE (repris à l'octet par l'essai à blanc) ══════════════
DO $inverse$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM public._backup_1810_fonctions_commande_annulee ORDER BY ordre LOOP
    EXECUTE r.def;
  END LOOP;
END
$inverse$;

REVOKE ALL ON FUNCTION public.vente_commande_annulee_vinted(bigint, text, text, timestamptz) FROM PUBLIC, anon, authenticated;

DO $verif$
DECLARE r record; v_md5 text;
BEGIN
  FOR r IN SELECT * FROM public._backup_1810_fonctions_commande_annulee ORDER BY ordre LOOP
    v_md5 := CASE r.nom
      WHEN 'vente_commande_annulee_vinted' THEN md5(pg_get_functiondef('public.vente_commande_annulee_vinted(bigint,text,text,timestamptz)'::regprocedure))
      WHEN 'remises_en_vente_tick' THEN md5(pg_get_functiondef('public.remises_en_vente_tick(integer,uuid)'::regprocedure))
      WHEN 'ventes_statut_classe' THEN md5(pg_get_functiondef('public.ventes_statut_classe(text,text)'::regprocedure))
    END;
    IF v_md5 IS DISTINCT FROM r.md5 THEN
      RAISE EXCEPTION 'inverse : % relue avec le md5 % au lieu de % — tout est annulé', r.nom, v_md5, r.md5;
    END IF;
  END LOOP;
END
$verif$;
-- ═══ FIN DU CORPS DE L'INVERSE ══════════════════════════════════════════════

COMMIT;
