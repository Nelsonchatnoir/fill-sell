-- ═══════════════════════════════════════════════════════════════════════════
-- republish_maintenance_guard : comparaison de version EN TEXTE → SEMVER
-- Incident du 2026-08-30, mesuré le 2026-08-31.
--
-- Le trigger BEFORE INSERT sur cross_post_jobs comparait la version de
-- l'extension comme du TEXTE :
--
--     if v is null or v < '0.6.2' then raise exception 'REPUBLISH_MAINTENANCE…'
--
-- Or en texte, '0.6.11' < '0.6.2' est VRAI ('1' vient avant '2'). Toute
-- extension à jour — 0.6.10, 0.6.11, 0.6.12, 0.6.13 — était donc refusée par
-- la garde censée écarter les extensions TROP ANCIENNES. Le raise annulait la
-- transaction entière de spend_coins_and_republish : ni job, ni ligne de
-- coin_ledger, ni usage_logs, ni marqueur d'erreur — un refus rigoureusement
-- invisible côté application.
--
-- Constaté en production : 172 refus REPUBLISH_MAINTENANCE dans les logs
-- Postgres sur 24 h, 53 comptes actifs sur 48 h en 0.6.10/0.6.11, et une
-- utilisatrice Pro (josephinecerni) à 0 republication depuis 38 heures, dont
-- l'extension recapturait le même article toutes les 2 minutes.
--
-- Correctif : version_cle() — déjà utilisée par spend_coins_and_republish pour
-- exactement la même garde, et qui rend un int[] ([0,6,11] > [0,6,2]). Le
-- seuil métier (0.6.2) et le comportement pour une version illisible ou nulle
-- (refus) ne changent pas.
--
-- ⚠️ Migration NON appliquée automatiquement : à jouer explicitement (cf.
-- CLAUDE.md — les historiques de migrations divergent, `supabase db push` est
-- interdit). Idempotente, sans effet de bord : seul le corps de la fonction
-- change, le trigger qui l'appelle n'est pas retouché.
-- ═══════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.republish_maintenance_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
declare v text; cle int;
begin
  if coalesce(new.action,'') <> 'republish' then return new; end if;

  select coalesce(value,0) into cle from coin_config where key = 'republish_maintenance';
  cle := coalesce(cle, 0);

  -- 1 = coupure TOTALE (interrupteur d'urgence, tout le monde)
  if cle = 1 then
    raise exception 'REPUBLISH_MAINTENANCE: La republication est temporairement en maintenance. Tes annonces sont protegees et aucune Pepite n''est debitee. On te previent des que c''est retabli.';
  end if;

  -- 0 = ouvert, MAIS toujours interdit sous 0.6.2 (garde permanente de version).
  -- ⚠️ COMPARAISON PAR version_cle() ET JAMAIS EN TEXTE : '0.6.11' < '0.6.2'
  -- est vrai en texte, ce qui refusait tout le parc à jour (incident 30/08).
  -- version_cle() rend NULL sur une version illisible → refus, comme avant.
  select extension_version into v from profiles where id = new.user_id;
  if public.version_cle(v) is null or public.version_cle(v) < public.version_cle('0.6.2') then
    raise exception 'REPUBLISH_MAINTENANCE: Ta version de l''extension doit etre mise a jour avant de republier. Chrome installe la nouvelle version automatiquement, elle arrivera d''ici quelques heures. Tes annonces sont protegees et aucune Pepite n''est debitee.';
  end if;

  return new;
end;
$function$;
